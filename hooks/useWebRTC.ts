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
    processedMsgIdsRef: React.MutableRefObject<Set<string>>;
    currentVideoTrackRef?: React.MutableRefObject<MediaStreamTrack | null>;
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
    activeTabRef,
    processedMsgIdsRef,
    currentVideoTrackRef
}: UseWebRTCProps) => {
    const { showToast } = useToast();

    const pcRef = useRef<Record<string, RTCPeerConnection>>({});
    const iceQueue = useRef<Record<string, RTCIceCandidateInit[]>>({});
    const dataChannelsRef = useRef<Record<string, RTCDataChannel>>({});

    // Helper to setup Data Channel
    const setupDataChannel = useCallback((dc: RTCDataChannel, remoteId: string, remoteName: string) => {
        dc.onopen = () => {
            console.log(`Secure DataChannel open with ${remoteName} (${remoteId})`);
            dataChannelsRef.current[remoteId] = dc;
        };
        dc.onclose = () => {
            delete dataChannelsRef.current[remoteId];
        };
        dc.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'chat') {
                    if (msg.id && processedMsgIdsRef.current.has(msg.id)) return;
                    if (msg.id) processedMsgIdsRef.current.add(msg.id);

                    setMessages(prev => {
                        const exists = prev.some(m => m.id === msg.id || (String(m.sender) === String(remoteId) && m.text === msg.text && Math.abs(new Date().getTime() - new Date(m.timestamp).getTime()) < 2000));
                        if (exists) return prev;
                        return [...prev, {
                            id: msg.id || Math.random().toString(),
                            sender: remoteId,
                            text: msg.text || "",
                            timestamp: new Date(msg.timestamp),
                            fileUrl: msg.fileUrl,
                            fileName: msg.fileName,
                            fileSize: msg.fileSize,
                            isImage: msg.isImage,
                            replyTo: msg.replyTo
                        }];
                    });
                    transcriptRef.current.push(`${remoteName}: ${msg.fileUrl ? '[File: ' + msg.fileName + ']' : msg.text}`);
                    if (!isSidebarOpenRef.current || activeTabRef.current !== 'chat') {
                        setUnreadCount(prev => prev + 1);
                    }
                }
            } catch (e) {
                console.error("Failed to parse DataChannel message", e);
            }
        };
    }, [setMessages, transcriptRef, isSidebarOpenRef, activeTabRef, setUnreadCount, processedMsgIdsRef]);

    const iceServersRef = useRef<RTCIceServer[]>([
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        // Fallback Metered credentials (from user request)
        { urls: "stun:stun.relay.metered.ca:80" },
        {
            urls: "turn:global.relay.metered.ca:80",
            username: "ced9c97d1117ab8c44246147",
            credential: "EGcsAepJdb+9jDuq",
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "ced9c97d1117ab8c44246147",
            credential: "EGcsAepJdb+9jDuq",
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: "ced9c97d1117ab8c44246147",
            credential: "EGcsAepJdb+9jDuq",
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "ced9c97d1117ab8c44246147",
            credential: "EGcsAepJdb+9jDuq",
        },
    ]);

    useEffect(() => {
        const fetchIceServers = async () => {
            try {
                const response = await fetch("https://avosever.metered.live/api/v1/turn/credentials?apiKey=4797b3f8047f005a91e9c717623a98d7f695");
                const data = await response.json();
                if (Array.isArray(data)) {
                    console.log("[WebRTC] Dynamic TURN credentials loaded successfully");
                    iceServersRef.current = data;
                }
            } catch (e) {
                console.error("[WebRTC] Failed to fetch dynamic TURN credentials, using defaults:", e);
            }
        };
        fetchIceServers();
    }, []);

    const createPeerConnection = useCallback((remoteId: string, remoteName: string, isOfferer: boolean) => {
        if (pcRef.current[remoteId] && pcRef.current[remoteId].signalingState !== 'closed') {
            return pcRef.current[remoteId];
        }

        // Config STUN/TURN Servers for NAT Traversal
        const pc = new RTCPeerConnection({
            iceServers: iceServersRef.current
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
                console.log(`[ICE] Sending candidate to ${remoteId}:`, event.candidate.candidate);
                signaling.send('candidate', user.id, remoteId, roomId, { candidate: event.candidate });
            } else {
                console.log(`[ICE] Finished gathering local candidates for ${remoteId}`);
            }
        };

        pc.ontrack = (event) => {
            console.log(`Received remote track from ${remoteId}`);
            setPeers(prev => {
                const existing = prev.find(p => p.userId === remoteId);
                if (existing) {
                    if (existing.stream?.id === event.streams[0].id) return prev;
                    console.log(`Updating stream for existing peer ${remoteId}, avatar: ${existing.avatar ? 'YES' : 'NO'}`);
                    return prev.map(p => p.userId === remoteId ? { ...p, stream: event.streams[0] } : p);
                }
                // Create peer if not exists (fallback), but avatar will be updated later from signaling
                console.log(`Creating new peer ${remoteId} from ontrack (avatar will be updated from signaling)`);
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
            console.log(`[WebRTC ICE State] ${remoteName} (${remoteId}) changed to: ${pc.iceConnectionState}`);

            if (pc.iceConnectionState === 'failed') {
                console.error("ICE Connection Failed with", remoteId, " - NAT Traversal (TURN) is likely blocked or unavailable.");
                showToast(`Video connection with ${remoteName} failed (Encountered firewall/hard NAT).`, 'error');
            } else if (pc.iceConnectionState === 'connected') {
                console.log(`ICE Connection Established directly with ${remoteName}`);
            } else if (pc.iceConnectionState === 'disconnected') {
                console.warn(`ICE Connection Disconnected with ${remoteName} - Network may be unstable.`);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WebRTC Peer State] ${remoteName} (${remoteId}) connection state: ${pc.connectionState}`);
        };

        // Add local tracks
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) pc.addTrack(audioTrack, localStream);

        const videoTrack = currentVideoTrackRef?.current || localStream.getVideoTracks()[0];
        if (videoTrack) pc.addTrack(videoTrack, localStream);

        pcRef.current[remoteId] = pc;
        return pc;
    }, [user.id, roomId, localStream, setupDataChannel, setPeers, showToast]);

    const processIceQueue = async (remoteId: string) => {
        const pc = pcRef.current[remoteId];
        if (pc && pc.remoteDescription && iceQueue.current[remoteId]) {
            while (iceQueue.current[remoteId].length > 0) {
                const candidate = iceQueue.current[remoteId].shift();
                if (candidate) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) {
                        console.error("Error adding queued ICE Candidate:", e);
                    }
                }
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
