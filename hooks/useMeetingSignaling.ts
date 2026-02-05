import { useEffect, useState, useRef } from 'react';
import { User, MeetingSettings, ReactionItem } from '../types';
import { signaling } from '../services/signaling';
import { useToast } from '../components/ui/Toast';

// Imported types from hooks for dependency injection
interface UseMeetingSignalingProps {
    user: User;
    roomId: string;
    isCurrentUserHost: boolean;

    // State Setters
    setPeers: any;
    setJoinRequests: any;
    setMessages: any;
    setReactions: React.Dispatch<React.SetStateAction<ReactionItem[]>>;
    setRoomSettings: any;
    setMediaRequestModal: any;
    setLogs: any;
    setUnreadCount: any;

    // Refs
    isVerified: boolean;
    setIsVerified: any;
    isVerifiedRef: React.MutableRefObject<boolean>;
    isMutedRef: React.MutableRefObject<boolean>;
    isVideoOffRef: React.MutableRefObject<boolean>;
    roomSettingsRef: React.MutableRefObject<MeetingSettings>;
    transcriptRef: React.MutableRefObject<string[]>;
    isSidebarOpenRef: React.MutableRefObject<boolean>;
    activeTabRef: React.MutableRefObject<string>;

    // WebRTC Functions
    createPeerConnection: any;
    processIceQueue: any;
    pcRef: any;
    iceQueue: any;

    // Functions
    onLeave: () => void;
    toggleMute: () => void;
    toggleVideo: () => void;
    settings?: MeetingSettings;
}

export const useMeetingSignaling = ({
    user, roomId, isCurrentUserHost,
    setPeers, setJoinRequests, setMessages, setReactions, setRoomSettings, setMediaRequestModal, setLogs, setUnreadCount,
    isVerified, setIsVerified, isVerifiedRef,
    isMutedRef, isVideoOffRef, roomSettingsRef, transcriptRef, isSidebarOpenRef, activeTabRef,
    createPeerConnection, processIceQueue, pcRef, iceQueue,
    onLeave, toggleMute, toggleVideo, settings
}: UseMeetingSignalingProps) => {

    const { showToast } = useToast();
    const [pendingOffer, setPendingOffer] = useState<{ from: string, payload: any } | null>(null);
    const isCurrentUserHostRef = useRef(isCurrentUserHost);
    useEffect(() => { isCurrentUserHostRef.current = isCurrentUserHost; }, [isCurrentUserHost]);

    // handleMediaResponse removed - moved inline to useEffect to avoid stale closures

    const handleOffer = async (fromId: string, payload: any) => {
        const pcAnswer = createPeerConnection(fromId, payload.userName, false);

        if (payload.muted !== undefined || payload.videoOff !== undefined) {
            setPeers((prev: any) => prev.map((p: any) => p.userId === fromId ? { ...p, muted: payload.muted, videoOff: payload.videoOff } : p));
        }

        await pcAnswer.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await pcAnswer.createAnswer();
        await pcAnswer.setLocalDescription(answer);

        signaling.send('answer', user.id, fromId, roomId, {
            answer,
            userName: user.name,
            muted: isMutedRef.current,
            videoOff: isVideoOffRef.current
        });
        await processIceQueue(fromId);
    };

    useEffect(() => {
        const handleSignaling = async (msg: any) => {
            // Filter irrelevant messages
            if (msg.roomId !== roomId || msg.from === user.id) return;
            if (msg.to && msg.to !== user.id) return;

            switch (msg.type) {
                case 'user-update':
                    setPeers((prev: any) => prev.map((p: any) => p.userId === msg.from ? { ...p, ...msg.payload } : p));
                    break;

                case 'request-join':
                    if (isCurrentUserHost) {
                        console.log(`📥 Join request from ${msg.payload.userName}. LockRoom = ${roomSettingsRef.current.lockRoom}`);
                        // Auto-reject if room is locked
                        if (roomSettingsRef.current.lockRoom) {
                            signaling.send('reject-join', user.id, msg.from, roomId, {});
                            console.log(`🚫 Auto-rejected ${msg.payload.userName} (${msg.from}) - Room is LOCKED`);
                        } else {
                            setJoinRequests((prev: any) => [...prev.filter((u: any) => u.id !== msg.from), { id: msg.from, name: msg.payload.userName }]);
                            console.log(`✅ Added ${msg.payload.userName} to waiting room`);
                        }
                    }
                    break;

                case 'approve-join':
                    // Wait for offer to confirm entry
                    if (!isVerified) {
                        console.log("Join Approved. Sending Join signal...");
                        signaling.send('join', user.id, undefined, roomId, { userName: user.name, password: settings?.password });
                    }
                    break;

                case 'reject-join':
                    if (!isVerified) {
                        showToast("Yêu cầu tham gia của bạn đã bị từ chối.", 'error');
                        onLeave();
                    }
                    break;

                case 'join':
                    // Password check (only host needs to verify)
                    if (roomSettingsRef.current?.password && msg.payload.password !== roomSettingsRef.current.password) {
                        if (isCurrentUserHost) (signaling as any).send('kick', user.id, msg.from, roomId, { reason: "Mật khẩu phòng không đúng." });
                        return;
                    }

                    // Clean up existing connection if any
                    if (pcRef.current[msg.from]) {
                        pcRef.current[msg.from].close();
                        delete pcRef.current[msg.from];
                        delete iceQueue.current[msg.from];
                    }

                    console.log(`🔗 Creating offer for new joiner: ${msg.payload.userName} (${msg.from})`);
                    const pcOffer = createPeerConnection(msg.from, msg.payload.userName, true);
                    const offer = await pcOffer.createOffer();
                    await pcOffer.setLocalDescription(offer);

                    signaling.send('offer', user.id, msg.from, roomId, {
                        offer,
                        userName: user.name,
                        muted: isMutedRef.current,
                        videoOff: isVideoOffRef.current,
                        settings: roomSettingsRef.current
                    });
                    break;

                case 'kick':
                    signaling.send('leave', user.id, undefined, roomId, {});
                    onLeave();
                    setTimeout(() => {
                        signaling.send('leave', user.id, undefined, roomId, {}); // Redundancy
                        onLeave();
                        showToast(msg.payload.reason || "Bạn đã bị mời ra khỏi phòng.", 'error');
                    }, 100);
                    break;

                case 'media-request':
                    const { kind, action } = msg.payload;
                    if (kind === 'audio') {
                        if (action === 'off') {
                            if (!isMutedRef.current) toggleMute();
                        } else {
                            setMediaRequestModal({ isOpen: true, type: 'audio', message: `Chủ phòng muốn bạn bật Micro. Bạn có đồng ý không?`, requesterId: msg.from });
                        }
                    } else if (kind === 'video') {
                        if (action === 'off') {
                            if (!isVideoOffRef.current) toggleVideo();
                        } else {
                            setMediaRequestModal({ isOpen: true, type: 'video', message: `Chủ phòng muốn bạn bật Camera. Bạn có đồng ý không?`, requesterId: msg.from });
                        }
                    }
                    break;

                case 'media-response':
                    // Removed Host Check to ensure visibility for debugging
                    if (msg.payload.status === 'denied') {
                        const requesterName = msg.payload.userName || "Thành viên";
                        const actionText = msg.payload.kind === 'join_requirement' ? 'tham gia phòng' : msg.payload.kind === 'audio' ? 'bật Micro' : 'bật Camera';
                        const logMsg = `❌ ${requesterName} đã từ chối yêu cầu ${actionText}.`;

                        console.log(`[Signaling] Media Request Denied: ${logMsg}`);
                        showToast(logMsg, 'error');
                        setLogs((prev: any) => [{ id: Math.random().toString(), time: new Date().toLocaleTimeString(), message: logMsg, type: 'error' }, ...prev]);
                    }
                    break;

                case 'settings':
                    const newSettings = msg.payload;
                    console.log('📢 Settings event received:', {
                        newSettings,
                        isVerified: isVerifiedRef.current,
                        isMuted: isMutedRef.current,
                        isVideoOff: isVideoOffRef.current
                    });

                    if (isVerifiedRef.current) {
                        // Send individual requests for already-joined users
                        if (newSettings.requireMic && isMutedRef.current) {
                            console.log('🎤 Showing mic request modal');
                            setMediaRequestModal({ isOpen: true, type: 'audio', message: `Chủ phòng yêu cầu bật Micro. Bạn có đồng ý không?`, requesterId: msg.from });
                        } else if (newSettings.requireCamera && isVideoOffRef.current) {
                            console.log('📷 Showing camera request modal');
                            setMediaRequestModal({ isOpen: true, type: 'video', message: `Chủ phòng yêu cầu bật Camera. Bạn có đồng ý không?`, requesterId: msg.from });
                        } else {
                            console.log('⏭️ No modal needed (requirements already met)');
                        }
                    } else {
                        console.log('⚠️ User not verified yet, skipping modal');
                    }
                    setRoomSettings(newSettings);
                    break;

                case 'offer':
                    if (msg.payload.settings) setRoomSettings(msg.payload.settings);

                    if (!isVerified) {
                        const s = msg.payload.settings;
                        if (s && (s.requireMic || s.requireCamera)) {
                            const reqs = [];
                            if (s.requireMic) reqs.push("Bật Micro");
                            if (s.requireCamera) reqs.push("Bật Camera");
                            setMediaRequestModal({ isOpen: true, type: 'join_requirement', message: `Phòng yêu cầu: ${reqs.join(" và ")}. Tham gia?`, payload: { settings: s } });
                            setPendingOffer({ from: msg.from, payload: msg.payload });
                            return;
                        }
                    }

                    await handleOffer(msg.from, msg.payload);

                    // Always verify after successfully handling offer
                    if (!isVerified) {
                        console.log('✅ User verified after handling offer');
                        setIsVerified(true);
                    }
                    break;

                case 'answer':
                    const pc = pcRef.current[msg.from];
                    if (pc) {
                        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.answer));
                        // Add peer ONLY on Answer
                        setPeers((prev: any) => {
                            const existing = prev.find((p: any) => p.userId === msg.from);
                            if (existing) {
                                if (msg.payload.muted !== undefined || msg.payload.videoOff !== undefined) {
                                    return prev.map((p: any) => p.userId === msg.from ? { ...p, muted: msg.payload.muted ?? p.muted, videoOff: msg.payload.videoOff ?? p.videoOff } : p);
                                }
                                return prev;
                            }
                            return [...prev, { userId: msg.from, stream: undefined, userName: msg.payload.userName || "Guest", isLocal: false, muted: msg.payload.muted ?? false, videoOff: msg.payload.videoOff ?? false }];
                        });
                        await processIceQueue(msg.from);
                    }
                    break;

                case 'candidate':
                    const targetPc = pcRef.current[msg.from];
                    if (targetPc && targetPc.remoteDescription) {
                        await targetPc.addIceCandidate(new RTCIceCandidate(msg.payload.candidate));
                    } else {
                        if (!iceQueue.current[msg.from]) iceQueue.current[msg.from] = [];
                        iceQueue.current[msg.from].push(msg.payload.candidate);
                    }
                    break;

                case 'leave':
                    setPeers((prev: any) => prev.filter((p: any) => p.userId !== msg.from));
                    setJoinRequests((prev: any) => prev.filter((u: any) => u.id !== msg.from));
                    if (pcRef.current[msg.from]) {
                        pcRef.current[msg.from].close();
                        delete pcRef.current[msg.from];
                    }
                    delete iceQueue.current[msg.from];
                    break;

                case 'chat':
                    if (String(msg.from) === String(user.id)) return;
                    setMessages((prev: any) => {
                        const exists = prev.some((m: any) => String(m.sender) === String(msg.from) && m.text === msg.payload.text && (new Date().getTime() - new Date(m.timestamp).getTime() < 2000));
                        if (exists) return prev;
                        return [...prev, { id: Math.random().toString(), sender: msg.from, text: msg.payload.text, timestamp: new Date(msg.payload.timestamp) }];
                    });
                    transcriptRef.current.push(`${msg.from}: ${msg.payload.text}`);
                    if (!isSidebarOpenRef.current || activeTabRef.current !== 'chat') setUnreadCount((prev: any) => prev + 1);
                    break;

                case 'reaction':
                    const newR = { id: Math.random().toString(), emoji: msg.payload.emoji, senderId: msg.from, senderName: msg.payload.senderName, timestamp: Date.now(), index: msg.payload.index };
                    setReactions(prev => [...prev, newR]);
                    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== newR.id)), 6000);
                    break;
            }
        };

        const unsub = signaling.onMessage(handleSignaling);

        // Join logic
        signaling.joinRoom(roomId, user.id, user.name, settings?.password, user.isHost, settings);
        if (!user.isHost) {
            console.log("Sending join request...");
            signaling.send('request-join', user.id, undefined, roomId, { userName: user.name });
        } else {
            signaling.send('join', user.id, undefined, roomId, { userName: user.name, password: settings?.password });
        }

        return () => {
            unsub();
            Object.keys(pcRef.current).forEach(k => { pcRef.current[k].close(); delete pcRef.current[k]; });
        };
    }, [roomId, user.id]); // Minimize deps

    return {
        pendingOffer,
        setPendingOffer,
        handleOffer // Export for Manual Trigger (Modal Confirm)
    };
};
