import { useEffect, useState, useRef } from 'react';
import { User, MeetingSettings, ReactionItem, PeerStream, Message } from '../types';
import { signaling } from '../services/signaling';
import { useToast } from '../components/ui/Toast';

// Imported types from hooks for dependency injection
interface UseMeetingSignalingProps {
    user: User;
    roomId: string;
    isCurrentUserHost: boolean;

    // State Setters
    setPeers: React.Dispatch<React.SetStateAction<PeerStream[]>>;
    setJoinRequests: React.Dispatch<React.SetStateAction<User[]>>;
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    setReactions: React.Dispatch<React.SetStateAction<ReactionItem[]>>;

    setRoomSettings: React.Dispatch<React.SetStateAction<MeetingSettings>>;
    setMediaRequestModal: React.Dispatch<React.SetStateAction<any>>;
    setLogs: React.Dispatch<React.SetStateAction<any>>;
    setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
    setUnreadLogsCount: React.Dispatch<React.SetStateAction<number>>;

    // State & Refs
    isVerified: boolean;
    setIsVerified: (v: boolean) => void;
    isVerifiedRef: React.MutableRefObject<boolean>;
    isMutedRef: React.MutableRefObject<boolean>;
    isVideoOffRef: React.MutableRefObject<boolean>;
    roomSettingsRef: React.MutableRefObject<MeetingSettings>;
    transcriptRef: React.MutableRefObject<string[]>;
    isSidebarOpenRef: React.MutableRefObject<boolean>;
    activeTabRef: React.MutableRefObject<string>;
    isSettingsModalOpenRef: React.MutableRefObject<boolean>;
    processedMsgIdsRef: React.MutableRefObject<Set<string>>;

    // WebRTC
    createPeerConnection: (id: string, name: string, isOfferer: boolean) => RTCPeerConnection;
    processIceQueue: (id: string) => Promise<void>;
    pcRef: React.MutableRefObject<Record<string, RTCPeerConnection>>;
    iceQueue: React.MutableRefObject<Record<string, RTCIceCandidateInit[]>>;

    // Actions
    onLeave: () => void;
    toggleMute: () => void;
    toggleVideo: () => void;
    settings?: MeetingSettings;
}

export const useMeetingSignaling = ({
    user, roomId, isCurrentUserHost,
    setPeers, setJoinRequests, setMessages, setReactions, setRoomSettings, setMediaRequestModal, setLogs, setUnreadCount, setUnreadLogsCount,
    isVerified, setIsVerified, isVerifiedRef,
    isMutedRef, isVideoOffRef, roomSettingsRef, transcriptRef, isSidebarOpenRef, activeTabRef, isSettingsModalOpenRef, processedMsgIdsRef,
    createPeerConnection, processIceQueue, pcRef, iceQueue,
    onLeave, toggleMute, toggleVideo, settings
}: UseMeetingSignalingProps) => {

    const { showToast } = useToast();
    const [pendingOffer, setPendingOffer] = useState<{ from: string, payload: any } | null>(null);
    const isCurrentUserHostRef = useRef(isCurrentUserHost);
    const userRef = useRef(user);
    useEffect(() => { isCurrentUserHostRef.current = isCurrentUserHost; }, [isCurrentUserHost]);
    useEffect(() => { userRef.current = user; }, [user]);

    // handleMediaResponse removed - moved inline to useEffect to avoid stale closures

    const handleOffer = async (fromId: string, payload: any) => {
        console.log(`Received offer from ${fromId} (${payload.userName}) with avatar:`, payload.avatar ? 'YES' : 'NO', payload.avatar?.substring(0, 50));
        const pcAnswer = createPeerConnection(fromId, payload.userName, false);

        if (payload.muted !== undefined || payload.videoOff !== undefined || payload.avatar !== undefined) {
            setPeers((prev: any) => {
                const existing = prev.find((p: any) => p.userId === fromId);
                if (existing) {
                    return prev.map((p: any) => p.userId === fromId ? {
                        ...p,
                        muted: payload.muted ?? p.muted,
                        videoOff: payload.videoOff ?? p.videoOff,
                        avatar: payload.avatar !== undefined ? payload.avatar : p.avatar
                    } : p);
                }
                // Pre-add peer with metadata if not exists
                return [...prev, {
                    userId: fromId,
                    stream: undefined,
                    userName: payload.userName || "Guest",
                    isLocal: false,
                    muted: payload.muted ?? false,
                    videoOff: payload.videoOff ?? false,
                    avatar: payload.avatar || ''
                }];
            });
        }

        await pcAnswer.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer = await pcAnswer.createAnswer();
        await pcAnswer.setLocalDescription(answer);

        signaling.send('answer', userRef.current.id, fromId, roomId, {
            answer,
            userName: userRef.current.name,
            muted: isMutedRef.current,
            videoOff: isVideoOffRef.current,
            avatar: userRef.current.avatar
        });
        await processIceQueue(fromId);
    };

    useEffect(() => {
        const handleSignaling = async (msg: any) => {
            // Filter irrelevant messages
            if (msg.roomId !== roomId || msg.from === userRef.current.id) return;
            if (msg.to && msg.to !== userRef.current.id) return;

            switch (msg.type) {
                case 'user-update':
                    setPeers((prev: any) => prev.map((p: any) => p.userId === msg.from ? { ...p, ...msg.payload } : p));
                    break;

                case 'request-join':
                    if (isCurrentUserHostRef.current) {
                        console.log(`Join request from ${msg.payload.userName}. LockRoom = ${roomSettingsRef.current.lockRoom}, WaitingRoom = ${roomSettingsRef.current.waitingRoom}`);
                        // 1. Auto-reject if room is locked
                        if (roomSettingsRef.current.lockRoom) {
                            signaling.send('reject-join', userRef.current.id, msg.from, roomId, {});
                            console.log(`Auto-rejected ${msg.payload.userName} (${msg.from}) - Room is LOCKED`);
                        } 
                        // 2. Auto-approve if waiting room is DISABLED
                        else if (!roomSettingsRef.current.waitingRoom) {
                            signaling.send('approve-join', userRef.current.id, msg.from, roomId, {});
                            console.log(`Auto-approved ${msg.payload.userName} (${msg.from}) - Waiting Room is DISABLED`);
                        }
                        // 3. Put in waiting room
                        else {
                            setJoinRequests((prev: any) => [...prev.filter((u: any) => u.id !== msg.from), { id: msg.from, name: msg.payload.userName, avatar: msg.payload.avatar }]);
                            console.log(`Added ${msg.payload.userName} to waiting room`);
                        }
                    }
                    break;

                case 'approve-join':
                    // Wait for offer to confirm entry
                    if (!isVerifiedRef.current) {
                        console.log("Join Approved. Sending Join signal...");
                        signaling.send('join', userRef.current.id, undefined, roomId, { userName: userRef.current.name, avatar: userRef.current.avatar, password: settings?.password });
                    }
                    break;

                case 'reject-join':
                    if (!isVerified) {
                        showToast("Your request to join has been rejected.", 'error');
                        onLeave();
                    }
                    break;

                case 'join':
                    // Password check (only host needs to verify)
                    if (roomSettingsRef.current?.password && msg.payload.password !== roomSettingsRef.current.password) {
                        if (isCurrentUserHostRef.current) (signaling as any).send('kick', userRef.current.id, msg.from, roomId, { reason: "Incorrect room password." });
                        return;
                    }

                    // Guests must wait to be verified before initiating WebRTC handshakes
                    if (!isVerifiedRef.current) {
                        console.log("Guest waiting for verification. Syncing request-join with potential host.");
                        signaling.send('request-join', userRef.current.id, undefined, roomId, { userName: userRef.current.name, avatar: userRef.current.avatar });
                        return;
                    }

                    // Clean up existing connection if any
                    if (pcRef.current[msg.from]) {
                        pcRef.current[msg.from].close();
                        delete pcRef.current[msg.from];
                        delete iceQueue.current[msg.from];
                    }

                    console.log(`Creating offer for new joiner: ${msg.payload.userName} (${msg.from})`);

                    // Capture metadata (Avatar) immediately
                    setPeers((prev: any) => {
                        const existing = prev.find((p: any) => p.userId === msg.from);
                        if (existing) {
                            return prev.map((p: any) => p.userId === msg.from ? { ...p, avatar: msg.payload.avatar || p.avatar } : p);
                        }
                        return [...prev, {
                            userId: msg.from,
                            stream: undefined,
                            userName: msg.payload.userName || "Guest",
                            isLocal: false,
                            muted: msg.payload.muted ?? false,
                            videoOff: msg.payload.videoOff ?? false,
                            avatar: msg.payload.avatar || ''
                        }];
                    });

                    const pcOffer = createPeerConnection(msg.from, msg.payload.userName, true);
                    const offer = await pcOffer.createOffer();
                    await pcOffer.setLocalDescription(offer);

                    console.log(`Sending offer to ${msg.from} with avatar:`, userRef.current.avatar ? 'YES' : 'NO', userRef.current.avatar?.substring(0, 50));
                    signaling.send('offer', userRef.current.id, msg.from, roomId, {
                        offer,
                        userName: userRef.current.name,
                        muted: isMutedRef.current,
                        videoOff: isVideoOffRef.current,
                        settings: roomSettingsRef.current,
                        avatar: userRef.current.avatar
                    });
                    break;

                case 'kick':
                    signaling.send('leave', userRef.current.id, undefined, roomId, {});
                    onLeave();
                    setTimeout(() => {
                        signaling.send('leave', userRef.current.id, undefined, roomId, {}); // Redundancy
                        onLeave();
                        showToast(msg.payload.reason || "You have been kicked out of the room.", 'error');
                    }, 100);
                    break;

                case 'media-request':
                    const { kind, action } = msg.payload;
                    if (kind === 'audio') {
                        if (action === 'off') {
                            if (!isMutedRef.current) toggleMute();
                        } else {
                            setMediaRequestModal({ isOpen: true, type: 'audio', message: `The host wants you to turn on the microphone. Do you agree?`, requesterId: msg.from });
                        }
                    } else if (kind === 'video') {
                        if (action === 'off') {
                            if (!isVideoOffRef.current) toggleVideo();
                        } else {
                            setMediaRequestModal({ isOpen: true, type: 'video', message: `The host wants you to turn on the camera. Do you agree?`, requesterId: msg.from });
                        }
                    }
                    break;

                case 'media-response':
                    // Removed Host Check to ensure visibility for debugging
                    if (msg.payload.status === 'denied') {
                        const requesterName = msg.payload.userName || "Member";
                        const actionText = msg.payload.kind === 'join_requirement' ? 'join room' : msg.payload.kind === 'audio' ? 'turn on microphone' : 'turn on camera';
                        const logMsg = `${requesterName} has rejected the request to ${actionText}.`;

                        console.log(`[Signaling] Media Request Denied: ${logMsg}`);
                        showToast(logMsg, 'error');
                        setLogs((prev: any) => [{ id: Math.random().toString(), time: new Date().toLocaleTimeString(), message: logMsg, type: 'error' }, ...prev]);

                        // Handle Log Unread Count
                        if (!isSettingsModalOpenRef.current) {
                            setUnreadLogsCount((prev: any) => prev + 1);
                        }
                    }
                    break;

                case 'settings':
                    const newSettings = msg.payload;
                    console.log('Settings event received:', {
                        newSettings,
                        isVerified: isVerifiedRef.current,
                        isMuted: isMutedRef.current,
                        isVideoOff: isVideoOffRef.current
                    });

                    if (isVerifiedRef.current) {
                        // Send individual requests for already-joined users
                        if (newSettings.requireMic && isMutedRef.current) {
                            console.log('Showing mic request modal');
                            setMediaRequestModal({ isOpen: true, type: 'audio', message: `The host wants you to turn on the microphone. Do you agree?`, requesterId: msg.from });
                        } else if (newSettings.requireCamera && isVideoOffRef.current) {
                            console.log('Showing camera request modal');
                            setMediaRequestModal({ isOpen: true, type: 'video', message: `The host wants you to turn on the camera. Do you agree?`, requesterId: msg.from });
                        } else {
                            console.log('No modal needed (requirements already met)');
                        }
                    } else {
                        console.log('User not verified yet, skipping modal');
                    }
                    setRoomSettings(newSettings);
                    break;

                case 'offer':
                    if (msg.payload.settings) setRoomSettings(msg.payload.settings);

                    if (!isVerifiedRef.current) {
                        const s = msg.payload.settings;
                        if (s && (s.requireMic || s.requireCamera)) {
                            const reqs = [];
                            if (s.requireMic) reqs.push("Turn on Microphone");
                            if (s.requireCamera) reqs.push("Turn on Camera");
                            setMediaRequestModal({ isOpen: true, type: 'join_requirement', message: `The room requires: ${reqs.join(" and ")}. Join?`, payload: { settings: s } });
                            setPendingOffer({ from: msg.from, payload: msg.payload });
                            return;
                        }
                    }

                    await handleOffer(msg.from, msg.payload);

                    // Always verify after successfully handling offer
                    if (!isVerifiedRef.current) {
                        console.log('User verified after handling offer');
                        setIsVerified(true);
                    }
                    break;

                case 'answer':
                    const pc2 = pcRef.current[msg.from];
                    if (pc2) {
                        try {
                            await pc2.setRemoteDescription(new RTCSessionDescription(msg.payload.answer));
                            // Process Ice Queue Right after setting description
                            setTimeout(async () => {
                                await processIceQueue(msg.from);
                            }, 500);
                        } catch (e) { console.error(e) }

                        // Add peer ONLY on Answer
                        setPeers((prev: any) => {
                            const existing = prev.find((p: any) => p.userId === msg.from);
                            if (existing) {
                                return prev.map((p: any) => p.userId === msg.from ? {
                                    ...p,
                                    muted: msg.payload.muted ?? p.muted,
                                    videoOff: msg.payload.videoOff ?? p.videoOff,
                                    avatar: msg.payload.avatar !== undefined ? msg.payload.avatar : p.avatar
                                } : p);
                            }
                            return [...prev, {
                                userId: msg.from,
                                stream: undefined,
                                userName: msg.payload.userName || "Guest",
                                isLocal: false,
                                muted: msg.payload.muted ?? false,
                                videoOff: msg.payload.videoOff ?? false,
                                avatar: msg.payload.avatar || ''
                            }];
                        });
                        await processIceQueue(msg.from);
                    }
                    break;

                case 'candidate':
                    // console.log(`[ICE] Received candidate from ${msg.from}:`, msg.payload.candidate?.candidate);
                    const targetPc = pcRef.current[msg.from];
                    if (targetPc && targetPc.remoteDescription) {
                        try {
                            await targetPc.addIceCandidate(new RTCIceCandidate(msg.payload.candidate));
                            console.log(`[ICE] Candidate added to PC for ${msg.from}`);
                        } catch (e) {
                            console.error("Direct ICE Candidate Error:", e);
                        }
                    } else {
                        if (!iceQueue.current[msg.from]) iceQueue.current[msg.from] = [];
                        iceQueue.current[msg.from].push(msg.payload.candidate);
                        console.log(`[ICE] Candidate queued for ${msg.from}`);
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
                    if (String(msg.from) === String(userRef.current.id)) return;
                    if (msg.payload.id && processedMsgIdsRef.current.has(msg.payload.id)) return;
                    if (msg.payload.id) processedMsgIdsRef.current.add(msg.payload.id);

                    setMessages((prev: any) => {
                        const exists = prev.some((m: any) => m.id === msg.payload.id || (String(m.sender) === String(msg.from) && m.text === msg.payload.text && Math.abs(new Date().getTime() - new Date(m.timestamp).getTime()) < 2000));
                        if (exists) return prev;
                        return [...prev, {
                            id: msg.payload.id || Math.random().toString(),
                            sender: msg.from,
                            userName: msg.payload.userName,
                            text: msg.payload.text || "",
                            timestamp: new Date(msg.payload.timestamp || new Date()),
                            fileUrl: msg.payload.fileUrl,
                            fileName: msg.payload.fileName,
                            fileSize: msg.payload.fileSize,
                            isImage: msg.payload.isImage,
                            replyTo: msg.payload.replyTo
                        }];
                    });
                    transcriptRef.current.push(`${msg.from}: ${msg.payload.fileUrl ? '[File: ' + msg.payload.fileName + ']' : msg.payload.text}`);
                    if (!isSidebarOpenRef.current || activeTabRef.current !== 'chat') setUnreadCount((prev: any) => prev + 1);
                    break;

                case 'reaction':
                    const newR = { id: Math.random().toString(), emoji: msg.payload.emoji, senderId: msg.from, senderName: msg.payload.senderName, timestamp: Date.now(), index: msg.payload.index };
                    setReactions(prev => [...prev, newR]);
                    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== newR.id)), 6000);
                    break;

                case 'transcript-chunk':
                    if (transcriptRef.current) transcriptRef.current.push(`${msg.payload.userName}: ${msg.payload.text}`);
                    break;

                case 'announcement':
                    showToast(msg.payload.message, 'info');
                    if ('speechSynthesis' in window) {
                        const utterance = new SpeechSynthesisUtterance(msg.payload.message);
                        utterance.lang = msg.payload.lang || 'en-US';
                        window.speechSynthesis.speak(utterance);
                    }
                    break;


            }
        };

        const unsub = signaling.onMessage(handleSignaling);

        // Join logic
        const initJoin = async () => {
            try {
                await signaling.joinRoom(roomId, userRef.current.id, userRef.current.name, settings?.password, userRef.current.isHost, settings, userRef.current.avatar);
                if (!userRef.current.isHost) {
                    console.log("Sending join request...");
                    signaling.send('request-join', userRef.current.id, undefined, roomId, { userName: userRef.current.name, avatar: userRef.current.avatar });
                } else {
                    signaling.send('join', userRef.current.id, undefined, roomId, { userName: userRef.current.name, avatar: userRef.current.avatar, password: settings?.password });
                }
            } catch (err) {
                console.error("Failed to connect room signaling:", err);
            }
        };
        initJoin();

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
