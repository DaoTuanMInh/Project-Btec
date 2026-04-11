import { useState, useRef, useEffect, useCallback } from 'react';
import { PeerStream } from '../types';
import { useToast } from '../components/ui/Toast';
import { signaling } from '../services/signaling';

interface UseMediaProcessingProps {
    localStream: MediaStream;
    user: { id: string };
    roomId: string;
    pcRef: React.MutableRefObject<Record<string, RTCPeerConnection>>;
    setPeers: React.Dispatch<React.SetStateAction<PeerStream[]>>;
    currentVideoTrackRef: React.MutableRefObject<MediaStreamTrack | null>;
    settings: any;
}

export const useMediaProcessing = ({
    localStream,
    user,
    roomId,
    pcRef,
    setPeers,
    currentVideoTrackRef,
    settings
}: UseMediaProcessingProps) => {
    const { showToast } = useToast();

    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isBlurred, setIsBlurred] = useState(false);

    // Blur Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sourceVideoRef = useRef<HTMLVideoElement>(null);
    const rafRef = useRef<number | null>(null);
    const processedStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);

    // Helper to update peers with new stream track
    const updateStreamForPeers = useCallback((stream: MediaStream, isScreenShareUpdate = false) => {
        // 1. Update Local Peer UI
        setPeers(prev => prev.map(p => p.isLocal ? { ...p, stream: stream, isScreenShare: isScreenShareUpdate } : p));

        // Notify others about screen share status
        signaling.send('user-update', user.id, undefined, roomId, { isScreenShare: isScreenShareUpdate });

        // 2. Update Remote Sendings
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            currentVideoTrackRef.current = videoTrack;
            Object.values(pcRef.current).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    sender.replaceTrack(videoTrack).catch(err => console.error("ReplaceTrack failed", err));
                }
            });
        }
    }, [setPeers, pcRef, user.id, roomId, currentVideoTrackRef]);

    // Cleanup Screen Share on Unmount
    useEffect(() => {
        return () => {
            if (screenStreamRef.current) {
                console.log("[useMediaProcessing] Cleaning up screen share on unmount");
                screenStreamRef.current.getTracks().forEach(t => t.stop());
                screenStreamRef.current = null;
            }
        };
    }, []);

    // Effect to evaluate Stream Priorities
    useEffect(() => {
        const stopBlur = () => {
            if (rafRef.current) window.clearTimeout(rafRef.current);
            if (sourceVideoRef.current) {
                sourceVideoRef.current.pause();
                sourceVideoRef.current.srcObject = null;
            }
            processedStreamRef.current = null;
        };

        const startBlur = async (streamToBlur: MediaStream, isScreenShareUpdate: boolean) => {
            const canvas = canvasRef.current;
            const video = sourceVideoRef.current;
            if (!canvas || !video) return;

            video.srcObject = streamToBlur;
            
            // Wait for metadata so video dimensions are known
            await new Promise((resolve) => {
                if (video.readyState >= 1) return resolve(true);
                video.onloadedmetadata = () => resolve(true);
                setTimeout(() => resolve(true), 1500); // 1.5s timeout fallback
            });

            await video.play().catch(e => console.error("Blur source play failed", e));

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Set canvas size statically ONCE before captureStream to prevent WebRTC track corruption
            const scaleDown = 10;
            canvas.width = Math.max(1, Math.floor((video.videoWidth || 1280) / scaleDown));
            canvas.height = Math.max(1, Math.floor((video.videoHeight || 720) / scaleDown));

            const draw = () => {
                if (!video || !ctx || !canvas) return;

                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    ctx.filter = 'blur(4px)';
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                }
                
                // Use setTimeout (15 FPS = ~66ms) instead of requestAnimationFrame.
                // rAF will completely stop or heavily pause if the tab is hidden or canvas is invisible,
                // which causes permanent stream freezing over WebRTC.
                rafRef.current = window.setTimeout(draw, 66);
            };
            draw();

            const canvasStream = canvas.captureStream(30);
            
            // Re-attach audio if needed
            if (localStream.getAudioTracks()[0]) {
                canvasStream.addTrack(localStream.getAudioTracks()[0]);
            } else if (streamToBlur.getAudioTracks()[0]) {
                canvasStream.addTrack(streamToBlur.getAudioTracks()[0]);
            }

            processedStreamRef.current = canvasStream;
            updateStreamForPeers(canvasStream, isScreenShareUpdate);
        };

        // Re-evaluate what should be streamed based on Priority
        if (isScreenSharing && screenStreamRef.current) {
            if (isBlurred) {
                // Blur the screen share stream
                startBlur(screenStreamRef.current, true);
            } else {
                stopBlur();
                updateStreamForPeers(screenStreamRef.current, true);
            }
        } else if (isBlurred) {
            // Blur the camera stream
            startBlur(localStream, false);
        } else {
            // Normal camera stream
            stopBlur();
            updateStreamForPeers(localStream, false);
        }

        return () => stopBlur();
    }, [isBlurred, isScreenSharing, localStream, updateStreamForPeers]);

    const stopScreenShare = () => {
        console.log("Stopping Screen Share");
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
        }
        setIsScreenSharing(false); // This will trigger the useEffect above to revert to Blur or LocalStream safely
    };

    const shareScreen = async () => {
        if (isScreenSharing) {
            stopScreenShare();
            return;
        }

        // Check Settings
        if (settings?.allowScreenShare === false) {
            showToast("The room settings require Screen Share to be turned on!", 'warning');
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            showToast("Your browser does not support screen sharing.", 'warning');
            return;
        }

        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            screenStreamRef.current = screenStream;
            const videoTrack = screenStream.getVideoTracks()[0];

            // Update with Screen Stream
            updateStreamForPeers(screenStream, true);
            setIsScreenSharing(true);

            videoTrack.onended = () => {
                console.log("Screen Share Ended by System");
                stopScreenShare();
            };
        } catch (err) {
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
                // User cancelled
            } else {
                showToast("Unable to share screen: " + err, 'error');
            }
        }
    };

    return {
        isScreenSharing,
        isBlurred, setIsBlurred,
        shareScreen,
        stopScreenShare, 
        canvasRef,
        sourceVideoRef
    };

};
