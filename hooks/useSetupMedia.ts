import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../components/ui/Toast';

export const useSetupMedia = () => {
    const { showToast } = useToast();
    // 1. Stable Toast Ref
    const showToastRef = useRef(showToast);
    useEffect(() => { showToastRef.current = showToast; }, [showToast]);

    // 2. Initialize State from LocalStorage
    // (LocalStorage Sync Disabled temporarily as per previous debugging step, keeping disabled for stability)
    const [isMicOn, setIsMicOn] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('avo-mic-enabled');
            return saved === null ? true : saved === 'true';
        }
        return true;
    });

    const [isCameraOn, setIsCameraOn] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('avo-camera-enabled');
            return saved === null ? true : saved === 'true';
        }
        return true;
    });

    const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
    // audioLevel state removed as requested
    // const [audioLevel, setAudioLevel] = useState(0);

    // Internal Refs
    const isStartingRef = useRef(false);
    const isCameraOnRef = useRef(isCameraOn);
    const isMicOnRef = useRef(isMicOn);
    const previewStreamRef = useRef<MediaStream | null>(null);

    // Sync Refs (Storage sync disabled)
    useEffect(() => {
        isCameraOnRef.current = isCameraOn;
        // localStorage.setItem('avo-camera-enabled', String(isCameraOn));
    }, [isCameraOn]);

    useEffect(() => {
        isMicOnRef.current = isMicOn;
        // localStorage.setItem('avo-mic-enabled', String(isMicOn));
    }, [isMicOn]);

    useEffect(() => { previewStreamRef.current = previewStream; }, [previewStream]);

    // START CAMERA
    const startCamera = useCallback(async (manual = false) => {
        if (isStartingRef.current) return;

        if (!manual && previewStreamRef.current?.active) return;

        isStartingRef.current = true;

        console.log(`[useSetupMedia] startCamera. Manual: ${manual}, Intent(Cam/Mic): ${isCameraOnRef.current}/${isMicOnRef.current}`);

        try {
            if (previewStreamRef.current) {
                previewStreamRef.current.getTracks().forEach(t => t.stop());
            }

            console.log("Requesting camera access with noise suppression...");
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 48000,
                    channelCount: 1
                }
            });

            // Apply Hardware Intent
            const intentCamera = manual || isCameraOnRef.current;
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = intentCamera;

                if (manual && videoTrack.muted) showToastRef.current("Camera may be turned off by a physical key!", 'warning');

                videoTrack.onended = () => {
                    // Auto-restart logic disabled
                };
            }

            const intentMic = isMicOnRef.current;
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = intentMic;
            }

            setPreviewStream(stream);

            if (manual) {
                setIsCameraOn(true);
            }

            // connectAudioSource(stream); // Removed

        } catch (e) {
            console.warn("Could not get preview stream:", e);
            if (manual) showToastRef.current("Could not turn on Camera. Check permissions!", 'error');
        } finally {
            setTimeout(() => { isStartingRef.current = false; }, 1000);
        }
    }, []);

    const toggleMic = () => {
        if (previewStream) {
            const newStatus = !isMicOn;
            previewStream.getAudioTracks().forEach(t => t.enabled = newStatus);
            setIsMicOn(newStatus);
        }
    };

    const toggleCamera = async () => {
        if (!isCameraOn) {
            // Turning ON
            const vTrack = previewStream?.getVideoTracks()[0];
            if (!previewStream || !vTrack || vTrack.readyState === 'ended' || vTrack.muted) {
                await startCamera(true);
                return;
            }
        }
        if (previewStream) {
            const newStatus = !isCameraOn;
            previewStream.getVideoTracks().forEach(t => t.enabled = newStatus);
            setIsCameraOn(newStatus);
        }
    };

    return {
        previewStream,
        isMicOn, toggleMic,
        isCameraOn, toggleCamera,
        audioLevel: 0, // Stubbed to 0 to prevent breaking props interface
        startCamera,
        videoRef: null as any
    };
};
