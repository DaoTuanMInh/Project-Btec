import { useRef, useCallback, useEffect } from 'react';
import { User, PeerStream, Message } from '../types';
import { signaling } from '../services/signaling';
import { useToast } from '../components/ui/Toast';

interface UseWebRTCProps {
    user: User;
    roomId: string;
    localStream: MediaStream;
    setPeers: React.Dispatch<React.SetStateAction<PeerStream[]>>;
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
    transcriptRef: React.MutableRefObject<string[]>;
    isSidebarOpenRef: React.MutableRefObject<boolean>;
    activeTabRef: React.MutableRefObject<'chat' | 'participants' | 'requests'>;
}

export const useWebRTC = ({
    user,
    roomId,
    localStream,
    setPeers,
    setMessages,
    setUnreadCount,
    transcriptRef,
    isSidebarOpenRef,
    activeTabRef
}: UseWebRTCProps) => {
    const { showToast } = useToast();

    const pcRef = useRef<Record<string, RTCPeerConnection>>({});
    const iceQueue = useRef<Record<string, RTCIceCandidateInit[]>>({});
    const dataChannelsRef = useRef<Record<string, RTCDataChannel>>({});

    // Helper to setup Data Channel
    const setupDataChannel = useCallback((dc: RTCDataChannel, remoteId: string, remoteName: string) => {
        dc.onopen = () => {
            console.log(`🔒 Secure DataChannel open with ${remoteName} (${remoteId})`);
            dataChannelsRef.current[remoteId] = dc;
        };
        dc.onclose = () => {
            delete dataChannelsRef.current[remoteId];
        };
        dc.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'chat') {
                    setMessages(prev => {
                        const exists = prev.some(m => m.id === msg.id);
                        if (exists) return prev;
                        return [...prev, {
                            id: msg.id || Math.random().toString(),
                            sender: remoteId,
                            text: msg.text,
                            timestamp: new Date(msg.timestamp)
                        }];
                    });
                    transcriptRef.current.push(`${remoteName}: ${msg.text}`);
                    if (!isSidebarOpenRef.current || activeTabRef.current !== 'chat') {
                        setUnreadCount(prev => prev + 1);
                    }
                }
            } catch (e) {
                console.error("Failed to parse DataChannel message", e);
            }
        };
    }, [setMessages, transcriptRef, isSidebarOpenRef, activeTabRef, setUnreadCount]);

    const createPeerConnection = useCallback((remoteId: string, remoteName: string, isOfferer: boolean) => {
        if (pcRef.current[remoteId] && pcRef.current[remoteId].signalingState !== 'closed') {
            return pcRef.current[remoteId];
        }

        // Config STUN Servers
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        if (isOfferer) {
            const dc = pc.createDataChannel("chat");
            setupDataChannel(dc, remoteId, remoteName);
        }

        pc.ondatachannel = (event) => {
            setupDataChannel(event.channel, remoteId, remoteName);
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                signaling.send('candidate', user.id, remoteId, roomId, { candidate: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            console.log(`Received remote track from ${remoteId}`);
            setPeers(prev => {
                const existing = prev.find(p => p.userId === remoteId);
                if (existing) {
                    if (existing.stream?.id === event.streams[0].id) return prev;
                    return prev.map(p => p.userId === remoteId ? { ...p, stream: event.streams[0] } : p);
                }
                return [...prev, {
                    userId: remoteId,
                    stream: event.streams[0],
                    userName: remoteName,
                    isLocal: false,
                    muted: false,
                    videoOff: false
                }];
            });
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed') {
                console.error("ICE Connection Failed with", remoteId);
                showToast(`Mất kết nối với ${remoteName}. Đang thử lại...`, 'error');
                pc.restartIce();
            }
        };

        // Add local tracks
        const tracks = localStream.getTracks();
        tracks.forEach(track => pc.addTrack(track, localStream));

        pcRef.current[remoteId] = pc;
        return pc;
    }, [user.id, roomId, localStream, setupDataChannel, setPeers, showToast]);

    const processIceQueue = async (remoteId: string) => {
        const pc = pcRef.current[remoteId];
        if (pc && pc.remoteDescription && iceQueue.current[remoteId]) {
            while (iceQueue.current[remoteId].length > 0) {
                const candidate = iceQueue.current[remoteId].shift();
                if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            Object.keys(pcRef.current).forEach(key => {
                pcRef.current[key].close();
                delete pcRef.current[key];
            });
        };
    }, []);

    return {
        pcRef,
        iceQueue,
        dataChannelsRef,
        createPeerConnection,
        processIceQueue
    };
};
