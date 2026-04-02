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

    // Effect to handle Blur Logic
    useEffect(() => {
        const stopBlur = () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (sourceVideoRef.current) {
                sourceVideoRef.current.pause();
                sourceVideoRef.current.srcObject = null;
            }
            processedStreamRef.current = null;
        };

        const startBlur = async () => {
            const canvas = canvasRef.current;
            const video = sourceVideoRef.current;
            if (!canvas || !video) return;

            video.srcObject = localStream;
            await video.play().catch(e => console.error("Blur source play failed", e));

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const draw = () => {
                if (!video || !ctx || !canvas) return;
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    ctx.filter = 'blur(20px)';
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                }
                rafRef.current = requestAnimationFrame(draw);
            };
            draw();

            const canvasStream = canvas.captureStream(30);
            if (localStream.getAudioTracks()[0]) {
                canvasStream.addTrack(localStream.getAudioTracks()[0]);
            }

            processedStreamRef.current = canvasStream;
            updateStreamForPeers(canvasStream);
        };

        if (isBlurred) {
            startBlur();
        } else {
            stopBlur();
            // Only revert to localStream if we're not currently screen sharing
            if (!isScreenSharing) {
                updateStreamForPeers(localStream);
            }
        }

        return () => stopBlur();
    }, [isBlurred, localStream, updateStreamForPeers]);

    const stopScreenShare = () => {
        // Revert to Local Camera Stream
        console.log("Stopping Screen Share - Reverting to Camera");
        if (localStream && localStream.getVideoTracks().length > 0) {
            updateStreamForPeers(localStream, false);
        } else {
            console.warn("Local stream missing on stopScreenShare!");
        }
        setIsScreenSharing(false);
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
        canvasRef,
        sourceVideoRef
    };
};
