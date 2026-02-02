
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, PeerStream, Message, SignalingMessage, MeetingSettings } from '../types';
import { signaling } from '../services/signaling';
import { getMeetingSummary } from '../services/aiService';
import VideoGrid from './VideoGrid';
import Sidebar from './Sidebar';
import SecurityBadge from './SecurityBadge';
import MeetingSettingsModal from './MeetingSettingsModal';
import WaitRoom from './WaitRoom';
import ReactionFloating, { ReactionItem } from './ReactionFloating';
import { Settings, Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Sparkles, Eye, EyeOff, Users, Smile, Heart, ThumbsUp, Copy, Maximize } from 'lucide-react';
import { useToast } from './ui/Toast';
import ConfirmModal from './ui/ConfirmModal';

interface Props {
  user: User;
  roomId: string;
  localStream: MediaStream;
  onLeave: () => void;
  settings?: MeetingSettings;
}

interface MediaRequestState {
  isOpen: boolean;
  type: 'audio' | 'video' | 'join_requirement';
  message: string;
  requesterId?: string;
  payload?: any;
}

const MeetingRoom: React.FC<Props> = ({ user, roomId, localStream, onLeave, settings }) => {
  /* --- STATE --- */
  const { showToast } = useToast();

  // 1. Core State
  // user.isHost is fixed from initialization
  const isCurrentUserHost = user.isHost;

  const [joinRequests, setJoinRequests] = useState<User[]>([]);
  const [logs, setLogs] = useState<{ id: string, time: string, message: string, type: 'info' | 'warning' | 'error' }[]>([]);
  const [peers, setPeers] = useState<PeerStream[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  // 2. UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'participants' | 'requests'>(user.isHost ? 'requests' : 'participants');

  // 3. Modals
  const [mediaRequestModal, setMediaRequestModal] = useState<MediaRequestState>({ isOpen: false, type: 'audio', message: '' });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Update active tab if becoming host and have requests
  useEffect(() => {
    if (isCurrentUserHost && joinRequests.length > 0) {
      // Optional: Auto switch? Maybe too intrusive. 
      // Just let the UI indicator show.
    }
  }, [isCurrentUserHost, joinRequests.length]);

  // Room Settings State (Host has initial, others receive it)
  const [roomSettings, setRoomSettings] = useState<MeetingSettings>(settings || {
    waitingRoom: false,
    requireMic: false,
    requireCamera: false,
    lockRoom: false,
    allowScreenShare: false,
    allowReactions: true,
    password: ''
  });

  // Access Control
  const [isVerified, setIsVerified] = useState(user.isHost);

  // Media State
  const [isMuted, setIsMuted] = useState(() => {
    const audioTrack = localStream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : false;
  });
  const [isVideoOff, setIsVideoOff] = useState(() => {
    const videoTrack = localStream.getVideoTracks()[0];
    return videoTrack ? !videoTrack.enabled : false;
  });
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [isReactionMenuOpen, setIsReactionMenuOpen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const handleFullScreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullScreen(isFull);
      if (!isFull) setShowControls(true);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullScreenChange);
  }, []);

  const toggleControls = useCallback(() => {
    if (document.fullscreenElement) {
      setShowControls(prev => !prev);
    }
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(e => console.error(e));
    } else {
      document.exitFullscreen();
    }
  };

  const pcRef = useRef<Record<string, RTCPeerConnection>>({});
  const iceQueue = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const transcriptRef = useRef<string[]>([]);

  // Refs for State to avoid Stale Closures in Event Handlers
  const isMutedRef = useRef(isMuted);
  const isVideoOffRef = useRef(isVideoOff);
  const roomSettingsRef = useRef(roomSettings);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isVideoOffRef.current = isVideoOff; }, [isVideoOff]);
  useEffect(() => { roomSettingsRef.current = roomSettings; }, [roomSettings]);



  // Ensure local peer is always up to date in the list
  useEffect(() => {
    setPeers(prev => {
      const existingLocal = prev.find(p => p.isLocal);
      const newLocalPeer: PeerStream = {
        userId: user.id,
        stream: localStream,
        userName: user.name,
        isLocal: true,
        muted: isMutedRef.current, // Use Ref for stability/latest
        videoOff: isVideoOffRef.current
      };

      if (existingLocal) {
        // Only update if something changed (stream ref, or properties)
        // Note: muted/videoOff might be updated by toggle functions independently,
        // but updating stream here is crucial.
        return prev.map(p => p.isLocal ? { ...p, ...newLocalPeer } : p);
      }
      return [...prev, newLocalPeer];
    });
  }, [localStream, user.id, user.name]); // removed isMuted/isVideoOff deps to avoid flicker loop, relying on Refs/Toggle actions for state, but localStream is key.

  const createPeerConnection = useCallback((remoteId: string, remoteName: string) => {
    if (pcRef.current[remoteId] && pcRef.current[remoteId].signalingState !== 'closed') {
      return pcRef.current[remoteId];
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.send('candidate', user.id, remoteId, roomId, { candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      console.log(`Received remote track from ${remoteId}:`, event.streams[0].id, event.track.kind);
      setPeers(prev => {
        const existing = prev.find(p => p.userId === remoteId);
        if (existing) {
          // If stream is different or missing, update it
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
      console.log(`ICE State for ${remoteId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.error("ICE Connection Failed with", remoteId, "Restarting...");
        showToast(`Mất kết nối với ${remoteName}. Đang thử lại...`, 'error');
        pc.restartIce();
      }
    };

    const tracks = localStream.getTracks();
    console.log(`Adding ${tracks.length} local tracks to ${remoteId}`);
    tracks.forEach(track => pc.addTrack(track, localStream));

    pcRef.current[remoteId] = pc;
    return pc;
  }, [user.id, roomId, localStream]);

  const processIceQueue = async (remoteId: string) => {
    const pc = pcRef.current[remoteId];
    if (pc && pc.remoteDescription && iceQueue.current[remoteId]) {
      while (iceQueue.current[remoteId].length > 0) {
        const candidate = iceQueue.current[remoteId].shift();
        if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }
  };

  // Callbacks for toggling media - wrapped in useCallback with Ref usage
  const toggleMute = useCallback((force: boolean = false) => {
    // If forced, bypass check.
    // If not forced, check restriction:
    // Only block if Room Requires Mic AND User is trying to MUTE (currentMuted=false -> newMuted=true)
    // If User is trying to UNMUTE (currentMuted=true -> newMuted=false), allow it (compliance).
    if (!force && roomSettingsRef.current?.requireMic && !isMutedRef.current) {
      showToast("Chủ phòng yêu cầu bắt buộc bật Mic. Bạn không thể tắt!", 'warning');
      return;
    }

    const currentMuted = isMutedRef.current;
    const newMutedState = !currentMuted;

    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !newMutedState);
    }

    setIsMuted(newMutedState);
    isMutedRef.current = newMutedState;

    setPeers(prev => prev.map(p => p.isLocal ? { ...p, muted: newMutedState } : p));
    signaling.send('user-update', user.id, undefined, roomId, { muted: newMutedState });
  }, [localStream, roomId, user.id, showToast]);

  const toggleVideo = useCallback((force: boolean = false) => {
    // Only block if Room Requires Camera AND User is trying to TURN OFF (currentVideoOff=false -> newVideoOff=true)
    if (!force && roomSettingsRef.current?.requireCamera && !isVideoOffRef.current) {
      showToast("Chủ phòng yêu cầu bắt buộc bật Camera. Bạn không thể tắt!", 'warning');
      return;
    }

    const currentVideoOff = isVideoOffRef.current;
    const newVideoOffState = !currentVideoOff;

    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !newVideoOffState);
    }

    setIsVideoOff(newVideoOffState);
    isVideoOffRef.current = newVideoOffState;

    setPeers(prev => prev.map(p => p.isLocal ? { ...p, videoOff: newVideoOffState } : p));
    signaling.send('user-update', user.id, undefined, roomId, { videoOff: newVideoOffState });
  }, [localStream, roomId, user.id, showToast]);

  const handleSignaling = useCallback(async (msg: any) => {
    // Chỉ xử lý tin nhắn trong cùng 1 phòng và không phải từ chính mình
    if (msg.roomId !== roomId || msg.from === user.id) return;

    // Nếu tin nhắn có đích danh, chỉ xử lý nếu gửi cho mình
    if (msg.to && msg.to !== user.id) return;

    switch (msg.type) {
      case 'user-update':
        setPeers(prev => prev.map(p => {
          if (p.userId === msg.from) {
            return { ...p, ...msg.payload };
          }
          return p;
        }));
        break;



      case 'request-join':
        if (isCurrentUserHost) {
          console.log("Received join request from", msg.from);
          setJoinRequests(prev => [...prev.filter(u => u.id !== msg.from), { id: msg.from, name: msg.payload.userName }]);
        }
        break;

      case 'approve-join':
        if (!isVerified) {
          // Do NOT set isVerified(true) here. 
          // Wait for 'offer' or 'settings' to confirm entry and check restrictions.
          console.log("Join Approved. Sending Join signal to Host...");
          signaling.send('join', user.id, undefined, roomId, { userName: user.name, password: settings?.password });
        }
        break;

      case 'reject-join':
        if (!isVerified) {
          if (!isVerified) {
            showToast("Yêu cầu tham gia của bạn đã bị từ chối.", 'error');
            onLeave();
          }
        }
        break;

      case 'join':
        if (!isVerified) return;

        if (roomSettingsRef.current?.password) {
          const guestPassword = msg.payload.password;
          if (guestPassword !== roomSettingsRef.current.password) {
            console.log("Rejecting user due to invalid password");
            if (isCurrentUserHost) {
              (signaling as any).send('kick', user.id, msg.from, roomId, { reason: "Mật khẩu phòng không đúng." });
            }
            return;
          }
        }

        console.log(`[P2P] User ${msg.from} joined. Creating Offer.`);
        // Note: We DO NOT add peer to UI here anymore. 
        // We wait for 'answer' (User confirmed) or 'ontrack'.


        if (pcRef.current[msg.from]) {
          console.warn(`PC for ${msg.from} existed. Closing to reset.`);
          pcRef.current[msg.from].close();
          delete pcRef.current[msg.from];
          delete iceQueue.current[msg.from];
        }

        const pcOffer = createPeerConnection(msg.from, msg.payload.userName);
        const offer = await pcOffer.createOffer();
        await pcOffer.setLocalDescription(offer);

        // Include settings in Offer payload to let Guest know restrictions immediately
        console.log("HOST SENDING OFFER. Settings:", roomSettingsRef.current);
        signaling.send('offer', user.id, msg.from, roomId, {
          offer,
          userName: user.name,
          muted: isMutedRef.current,
          videoOff: isVideoOffRef.current,
          settings: roomSettingsRef.current
        });

        break;

      case 'kick':
        onLeave();
        setTimeout(() => {
          onLeave();
          setTimeout(() => {
            showToast(msg.payload.reason || "Bạn đã bị mời ra khỏi phòng.", 'error');
            // Give user time to see toast before reload? 
            // Actually reload might clear toast. Let's just create a full screen overlay or rely on onLeave redirecting.
            // For now, let's keep reload but toast first if possible.
            // But reload clears everything.
            // Let's delay reload or just remove reload if onLeave handles it.
            // If onLeave just unmounts, ToastProvider stays? No, ToastProvider is at App root.
            // So if we stay in App, Toast stays.
            // Removing window.location.reload() if onLeave handles the UI switch.
          }, 100);
        }, 100);
        break;

      case 'media-request':
        const { kind, action } = msg.payload;
        if (kind === 'audio') {
          const currentMuted = isMutedRef.current;
          if (action === 'off') {
            if (!currentMuted) toggleMute();
          } else {
            // Request to UNMUTE
            setMediaRequestModal({
              isOpen: true,
              type: 'audio',
              message: `Chủ phòng muốn bạn bật Micro. Bạn có đồng ý không?`,
              requesterId: msg.from
            });
          }
        } else if (kind === 'video') {
          const currentVideoOff = isVideoOffRef.current;
          if (action === 'off') {
            if (!currentVideoOff) toggleVideo();
          } else {
            // Request to TURN ON VIDEO
            setMediaRequestModal({
              isOpen: true,
              type: 'video',
              message: `Chủ phòng muốn bạn bật Camera. Bạn có đồng ý không?`,
              requesterId: msg.from
            });
          }
        }
        break;

      case 'media-response':
        handleMediaResponse(msg);
        break;

      case 'settings':
        console.log("Received room settings:", msg.payload);
        const newSettings = msg.payload;

        if (isVerified) {
          const reqs = [];
          if (newSettings.requireMic && isMutedRef.current) reqs.push("Bật Micro");
          if (newSettings.requireCamera && isVideoOffRef.current) reqs.push("Bật Camera");

          if (reqs.length > 0) {
            setMediaRequestModal({
              isOpen: true,
              type: 'join_requirement',
              message: `Chủ phòng đã cập nhật cài đặt yêu cầu: ${reqs.join(" và ")}. Bạn có đồng ý thực hiện không?`,
              payload: { settings: newSettings }
            });
          }
        }

        setRoomSettings(newSettings);
        break;

      case 'offer':
        // Extract settings from offer payload if present
        if (msg.payload.settings) {
          setRoomSettings(msg.payload.settings);
        }

        // Verification Logic for Offer
        if (!isVerified) {
          const s = msg.payload.settings;
          console.log("GUEST RECEIVED OFFER. Settings in payload:", s);

          if (s && (s.requireMic || s.requireCamera)) {
            const reqs = [];
            if (s.requireMic) reqs.push("Bật Micro");
            if (s.requireCamera) reqs.push("Bật Camera");

            setMediaRequestModal({
              isOpen: true,
              type: 'join_requirement',
              message: `Phòng này yêu cầu BẮT BUỘC: ${reqs.join(" và ")}.\nBạn có đồng ý bật và tham gia không?`,
              payload: { settings: s }
            });
            // STORE OFFER FOR LATER
            setPendingOffer({ from: msg.from, payload: msg.payload });
            return; // STOP PROCESSING
          } else {
            setIsVerified(true);
          }
        }

        // Process Offer immediately if verified or no restrictions
        await handleOffer(msg.from, msg.payload);
        break;

      case 'answer':
        const pc = pcRef.current[msg.from];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.answer));

          // Guests are added to UI only when they send ANSWER (Confirmed join)
          setPeers(prev => {
            const existing = prev.find(p => p.userId === msg.from);
            if (existing) {
              // Update state
              if (msg.payload.muted !== undefined || msg.payload.videoOff !== undefined) {
                return prev.map(p => p.userId === msg.from ? {
                  ...p,
                  muted: msg.payload.muted ?? p.muted,
                  videoOff: msg.payload.videoOff ?? p.videoOff
                } : p);
              }
              return prev;
            } else {
              // Add new Peer
              return [...prev, {
                userId: msg.from,
                stream: undefined, // Stream via ontrack
                userName: msg.payload.userName || "Guest",
                isLocal: false,
                muted: msg.payload.muted ?? false,
                videoOff: msg.payload.videoOff ?? false
              }];
            }
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
        setPeers(prev => prev.filter(p => p.userId !== msg.from));
        setJoinRequests(prev => prev.filter(p => p.id !== msg.from));
        const pcToClose = pcRef.current[msg.from];
        if (pcToClose) {
          pcToClose.close();
          delete pcRef.current[msg.from];
        }
        delete iceQueue.current[msg.from];
        break;

      case 'chat':
        // Robust check for self-messages (Echo prevention)
        if (String(msg.from) === String(user.id)) return;

        setMessages(prev => {
          // Content-based deduplication
          const exists = prev.some(m =>
            String(m.sender) === String(msg.from) &&
            m.text === msg.payload.text &&
            (new Date().getTime() - new Date(m.timestamp).getTime() < 2000)
          );
          if (exists) return prev;

          return [...prev, {
            id: Math.random().toString(),
            sender: msg.from,
            text: msg.payload.text,
            timestamp: new Date(msg.payload.timestamp)
          }];
        });

        transcriptRef.current.push(`${msg.from}: ${msg.payload.text}`);

        if (!isSidebarOpen || activeTab !== 'chat') {
          setUnreadCount(prev => prev + 1);
        }
        break;

      case 'reaction':
        const newReaction: ReactionItem = {
          id: Math.random().toString(),
          emoji: msg.payload.emoji,
          senderId: msg.from,
          senderName: msg.payload.senderName || "Guest",
          timestamp: Date.now(),
          index: msg.payload.index // Receive index for animation sync
        };
        setReactions(prev => [...prev, newReaction]);
        // Auto remove after animation (approx 2s)
        setTimeout(() => {
          setReactions(prev => prev.filter(r => r.id !== newReaction.id));
        }, 6000);
        break;
        break;
    }
  }, [user.id, roomId, createPeerConnection, isCurrentUserHost, isVerified, settings, onLeave]);

  // Separate Effect for Message Handling
  useEffect(() => {
    const unsub = signaling.onMessage(handleSignaling);
    return () => { unsub(); };
  }, [handleSignaling]);

  // Separate Effect for Joining Room - Runs once per room/user
  useEffect(() => {
    // IMPORTANT: Pass isHost and settings so Server can register the room!
    // Using a Ref for settings here might be better if they change, but for Join only initial matters?
    // Actually, joinRoom sends 'join' signal.
    signaling.joinRoom(roomId, user.id, user.name, settings?.password, user.isHost, settings);

    if (!user.isHost) {
      // Guest: Send request to join
      console.log("Sending join request...");
      signaling.send('request-join', user.id, undefined, roomId, { userName: user.name });
    } else {
      // Host: Send join signal to announce presence to any existing peers (reconnect flow)
      signaling.send('join', user.id, undefined, roomId, { userName: user.name, password: settings?.password });
    }

    return () => {
      Object.keys(pcRef.current).forEach(key => {
        pcRef.current[key].close();
        delete pcRef.current[key];
      });
    };
  }, [roomId, user.id, user.name, user.isHost, settings]); // Removed isVerified and settings (use initial)

  const shareScreen = async () => {
    if (isScreenSharing) { window.location.reload(); return; }

    // Check for mobile/support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      // Check for mobile/support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        showToast("Trình duyệt không hỗ trợ chia sẻ màn hình (hoặc đang dùng Mobile).", 'warning');
        return;
      }
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = screenStream.getVideoTracks()[0];
      (Object.values(pcRef.current) as RTCPeerConnection[]).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack).catch(err => console.error("ReplaceTrack failed", err));
      });
      setPeers(prev => prev.map(p => p.isLocal ? { ...p, stream: screenStream } : p));
      setIsScreenSharing(true);
      videoTrack.onended = () => {
        setIsScreenSharing(false);
        // Revert to camera if possible or just stop? 
        // Ideally we revert to localStream. 
        // The original code handled this via reloading page on second click, but onended logic was incomplete. 
        // For now, let's just update state, user might need to toggle cam again or we reload.
        // Actually, let's keep it simple as before but just update state.
      };
    } catch (err) {
      console.error("Screen share failed", err);
      // Handle user cancellation
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        // User cancelled, do nothing
      } else {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          // User cancelled, do nothing
        } else {
          showToast("Không thể chia sẻ màn hình: " + err, 'error');
        }
      }
    }
  };

  const approveUser = (targetId: string) => {
    signaling.send('approve-join', user.id, targetId, roomId, {});
    setJoinRequests(prev => prev.filter(u => u.id !== targetId));
  };

  const rejectUser = (targetId: string) => {
    signaling.send('reject-join', user.id, targetId, roomId, {});
    setJoinRequests(prev => prev.filter(u => u.id !== targetId));
  };

  const kickUser = (targetId: string) => {
    if (!isCurrentUserHost) return;
    if (confirm("Bạn có chắc chắn muốn mời người này ra khỏi phòng?")) {
      signaling.send('kick', user.id, targetId, roomId, { reason: "Bạn đã bị mời ra khỏi phòng bởi chủ phòng." });
      // Optimistically remove them from list
      setPeers(prev => prev.filter(p => p.userId !== targetId));
    }
  };

  const handleMediaRequest = (targetId: string, currentStatus: boolean, kind: 'audio' | 'video') => {
    if (!isCurrentUserHost) return;
    const action = currentStatus ? 'on' : 'off'; // If currently off (true), we want on.
    // Wait, currentStatus param:
    // For Mic: muted (true/false). If muted(true), we want to unmute (on).
    // For Video: videoOff (true/false). If videoOff(true), we want video on (on).

    // BUT if we want to turn OFF (force mute), currentStatus must be false (is on).

    // So if currentStatus is TRUE (Muted/Off), we send 'on'.
    // If currentStatus is FALSE (Unmuted/On), we send 'off'.

    const newAction = currentStatus ? 'on' : 'off';


    signaling.send('media-request', user.id, targetId, roomId, { kind, action: newAction });
  };

  const [pendingOffer, setPendingOffer] = useState<{ from: string, payload: any } | null>(null);

  const handleOffer = async (fromId: string, payload: any) => {
    const pcAnswer = createPeerConnection(fromId, payload.userName);

    if (payload.muted !== undefined || payload.videoOff !== undefined) {
      setPeers(prev => prev.map(p => p.userId === fromId ? { ...p, muted: payload.muted, videoOff: payload.videoOff } : p));
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

  const handleMediaResponse = (msg: any) => {
    if (msg.payload.status === 'denied') {
      const logMsg = `${msg.payload.userName} đã từ chối yêu cầu ${msg.payload.kind === 'join_requirement' ? 'tham gia (bắt buộc)' : msg.payload.kind === 'audio' ? 'bật Mic' : 'bật Camera'}.`;
      showToast(logMsg, 'warning');

      setLogs(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString(),
        message: logMsg,
        type: 'warning'
      }, ...prev]);

    } else if (msg.payload.status === 'accepted') {
      const logMsg = `${msg.payload.userName} đã chấp nhận yêu cầu bật ${msg.payload.kind === 'audio' ? 'Mic' : 'Camera'}.`;
      showToast(logMsg, 'success');

      setLogs(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString(),
        message: logMsg,
        type: 'info'
      }, ...prev]);
    }
  };

  const handleModalConfirm = () => {
    const { type, payload, requesterId } = mediaRequestModal;
    setMediaRequestModal(prev => ({ ...prev, isOpen: false }));

    if (type === 'audio') {
      if (isMutedRef.current) toggleMute();
    } else if (type === 'video') {
      if (isVideoOffRef.current) toggleVideo();
    } else if (type === 'join_requirement') {
      // User accepted join release logic
      const s = payload?.settings;
      if (s) {
        if (s.requireMic && isMutedRef.current) toggleMute(true);
        if (s.requireCamera && isVideoOffRef.current) toggleVideo(true);
      }
      setIsVerified(true);
      if (pendingOffer) {
        handleOffer(pendingOffer.from, pendingOffer.payload);
        setPendingOffer(null);
      }
    }
  };

  const handleModalCancel = () => {
    const { type, requesterId, payload } = mediaRequestModal;
    setMediaRequestModal(prev => ({ ...prev, isOpen: false }));

    if (type === 'join_requirement' && !isVerified) {
      // User refused join requirements AND IS IN WAIT ROOM -> LEAVE
      signaling.send('leave', user.id, undefined, roomId, {});
      onLeave();
    } else {
      // Refused media request OR refused in-meeting requirement update -> Notify Host
      // For join_requirement upgrade (in meeting), we treat it as deny.
      // Host should know who denied.

      // If there is a requesterId (media-request), send to them.
      // If it's a global setting update (join_requirement), requesterId might be undefined?
      // For 'settings' update, we didn't set requesterId. We should send to Host?
      // Or broadcast 'media-response' to room? Host will pick it up.

      signaling.send('media-response', user.id, requesterId || undefined, roomId, {
        kind: type,
        status: 'denied',
        userName: user.name
      });
    }
  };

  const sendReaction = (emoji: string, index?: number) => {
    if (!roomSettings.allowReactions) return;

    // Show local immediately
    const newReaction: ReactionItem = {
      id: Math.random().toString(),
      emoji: emoji,
      senderId: user.id,
      senderName: user.name,
      timestamp: Date.now(),
      index: index // Pass index for positioning
    };
    setReactions(prev => [...prev, newReaction]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== newReaction.id));
    }, 6000);

    // Broadcast (optional: pass index if we want consistent spread, though remote users don't see the menu)
    signaling.send('reaction', user.id, undefined, roomId, { emoji, senderName: user.name, index });
    // Keep menu open for spamming
    // setIsReactionMenuOpen(false);
  };

  // Blur Processing Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);

  // Effect to handle Blur Logic
  useEffect(() => {
    let activeMixinStream = localStream; // Default

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

      // Use the raw local stream as source
      video.srcObject = localStream;
      await video.play().catch(e => console.error("Blur source play failed", e));

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const draw = () => {
        if (!video || !ctx || !canvas) return;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          // Apply Blur
          ctx.filter = 'blur(20px)';
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        rafRef.current = requestAnimationFrame(draw);
      };
      draw();

      // Create stream from canvas
      const canvasStream = canvas.captureStream(30);
      // Add the original audio track to keep sync
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
      // Revert to raw stream
      updateStreamForPeers(localStream);
    }

    return () => stopBlur();
  }, [isBlurred, localStream]);

  const updateStreamForPeers = (stream: MediaStream) => {
    // 1. Update Local Peer UI
    setPeers(prev => prev.map(p => p.isLocal ? { ...p, stream: stream } : p));

    // 2. Update Remote Sendings
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      Object.values(pcRef.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack).catch(err => console.error("ReplaceTrack failed", err));
        }
      });
    }
  };

  if (!isVerified) {
    return (
      <>
        <WaitRoom user={user} localStream={localStream} onExit={() => {
          // Notify Host to cancel request
          signaling.send('leave', user.id, undefined, roomId, {});
          onLeave();
        }} />
        <ConfirmModal
          isOpen={mediaRequestModal.isOpen}
          title="Yêu cầu từ Chủ phòng"
          message={mediaRequestModal.message}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
          confirmText="Đồng ý"
          cancelText={mediaRequestModal.type === 'join_requirement' ? "Rời phòng" : "Từ chối"}
          type={mediaRequestModal.type === 'join_requirement' ? 'warning' : 'info'}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 select-none">
      {/* Hidden processing elements */}
      <video ref={sourceVideoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex-1 flex flex-col relative" onClick={toggleControls}>
        {/* Floating Reactions Layer */}
        <ReactionFloating reactions={reactions} />

        <header className={`h-16 px-6 flex items-center justify-between glass-effect border-b border-white/5 z-20 transition-all duration-500 ease-in-out ${!showControls ? '-mt-16' : 'mt-0'}`}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-blue-500/20">A</div>
              <div className="flex flex-col">
                <h2 className="hidden md:block text-xs font-bold text-slate-200 uppercase tracking-widest leading-none">AVO SECURE MEETING</h2>
                <div className="flex items-center gap-2 mt-1 group cursor-pointer" onClick={() => {
                  navigator.clipboard.writeText(roomId);
                  showToast('Đã sao chép ID phòng!', 'success');
                }}>
                  <span className="hidden md:block text-[10px] text-slate-500 font-mono group-hover:text-blue-400 transition-colors">ID: {roomId}</span>
                  <Copy size={10} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                </div>
              </div>
            </div>
            <SecurityBadge />
          </div>

          <div className="flex items-center gap-4">
            {isCurrentUserHost && (
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="relative px-3 py-2 md:px-4 bg-slate-800 text-slate-300 rounded-full text-xs font-bold hover:bg-slate-700 transition-colors flex items-center gap-2 border border-slate-700"
              >
                <Settings size={14} />
                <span className="hidden md:inline">Cài Đặt</span>
              </button>
            )}

            <button
              onClick={() => {
                setIsSidebarOpen(true);
                // If Host has requests, open requests tab. Else participants.
                if (isCurrentUserHost && joinRequests.length > 0) {
                  setActiveTab('requests');
                } else {
                  setActiveTab('participants');
                }
              }}
              className="relative px-3 py-2 md:px-4 bg-slate-800 text-slate-300 rounded-full text-xs font-bold hover:bg-slate-700 transition-colors flex items-center gap-2 border border-slate-700"
            >
              <Users size={14} />
              <span className="hidden md:inline">Thành viên</span>
              {joinRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white border-2 border-slate-900 animate-pulse">
                  {joinRequests.length}
                </span>
              )}
            </button>
          </div>
        </header>

        <VideoGrid peers={peers} isLocalBlurred={isBlurred} onToggleFullScreen={toggleFullScreen} />

        {/* Desktop Hover Trigger Zone */}
        <div className="hidden md:block fixed bottom-0 left-0 right-0 h-24 z-40 bg-transparent hover:bg-gradient-to-t hover:from-black/20 to-transparent transition-all" onMouseEnter={() => setShowControls(true)} />

        <div className={`fixed bottom-6 left-0 right-0 z-50 flex items-center justify-center pointer-events-none px-4 transition-transform duration-500 ease-in-out ${!showControls ? 'translate-y-[150%]' : 'translate-y-0'}`}>
          <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 glass-effect rounded-[2rem] pointer-events-auto border border-white/10 shadow-2xl overflow-visible max-w-full backdrop-blur-xl bg-slate-900/80">
            <button onClick={() => toggleMute()} className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
              {isMuted ? <MicOff size={18} className="md:w-5 md:h-5" /> : <Mic size={18} className="md:w-5 md:h-5" />}
            </button>
            <button onClick={() => toggleVideo()} className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isVideoOff ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
              {isVideoOff ? <VideoOff size={18} className="md:w-5 md:h-5" /> : <Video size={18} className="md:w-5 md:h-5" />}
            </button>
            <button onClick={() => setIsBlurred(!isBlurred)} className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isBlurred ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
              {isBlurred ? <EyeOff size={18} className="md:w-5 md:h-5" /> : <Eye size={18} className="md:w-5 md:h-5" />}
            </button>
            <button onClick={shareScreen} className={`hidden md:flex w-10 h-10 md:w-12 md:h-12 rounded-full items-center justify-center transition-all ${isScreenSharing ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
              <MonitorUp size={18} className="md:w-5 md:h-5" />
            </button>
            <div className="relative">

              <button
                disabled={!roomSettings.allowReactions}
                onClick={() => setIsReactionMenuOpen(!isReactionMenuOpen)}
                className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isReactionMenuOpen ? 'bg-slate-700 text-yellow-400' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'} ${!roomSettings.allowReactions ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={roomSettings.allowReactions ? "Thả cảm xúc" : "Bị tắt bởi chủ phòng"}
              >
                <Smile size={18} className="md:w-5 md:h-5" />
              </button>

              {/* Reaction Menu */}
              {isReactionMenuOpen && roomSettings.allowReactions && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-md p-2 rounded-full border border-white/10 flex items-center gap-1 shadow-xl animate-in fade-in slide-in-from-bottom-2">
                  {['❤️', '👍', '😂', '😮', '👏', '🎉'].map((emoji, idx) => (
                    <button
                      key={emoji}
                      onClick={() => sendReaction(emoji, idx)}
                      className="w-10 h-10 flex items-center justify-center text-xl hover:bg-white/10 rounded-full transition-colors active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                if (isSidebarOpen && activeTab === 'chat') {
                  setIsSidebarOpen(false);
                } else {
                  setIsSidebarOpen(true);
                  setActiveTab('chat');
                  setUnreadCount(0);
                }
              }}
              className={`relative w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isSidebarOpen && activeTab === 'chat' ? 'bg-slate-700 text-blue-400 border border-blue-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
            >
              <MessageSquare size={18} className="md:w-5 md:h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-[10px] font-bold flex items-center justify-center text-white border-2 border-slate-900 animate-bounce">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <div className="h-6 md:h-8 w-px bg-white/10 mx-1"></div>

            <button
              onClick={() => {
                // Explicitly tell others we are leaving
                signaling.send('leave', user.id, undefined, roomId, {});
                onLeave();
              }}
              className="px-4 md:px-6 h-10 md:h-12 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold text-xs uppercase tracking-widest flex items-center gap-2 md:gap-3 transition-all active:scale-95 shadow-xl shadow-red-500/30">
              <PhoneOff size={18} className="md:w-5 md:h-5" />
              <span className="hidden md:inline">Leave</span>
            </button>
          </div>
        </div>
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
        }}
        messages={messages}
        onSendMessage={(t) => {
          signaling.broadcastChat(roomId, user.id, t);
          const newMsg: Message = {
            id: Math.random().toString(),
            sender: user.id,
            text: t,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, newMsg]);
          transcriptRef.current.push(`${user.name} (You): ${t}`);
        }}
        aiSummary={aiSummary}
        onGenerateSummary={async () => {
          setIsGeneratingAi(true);
          const s = await getMeetingSummary(transcriptRef.current.join("\n"));
          setAiSummary(s);
          setIsGeneratingAi(false);
        }}
        isGeneratingAi={isGeneratingAi}
        currentUser={{ ...user, isHost: isCurrentUserHost }}
        participants={peers}
        onKick={kickUser}
        joinRequests={joinRequests}
        onApprove={approveUser}
        onReject={rejectUser}
        onToggleMic={(uid, status) => handleMediaRequest(uid, status, 'audio')}
        onToggleCam={(uid, status) => handleMediaRequest(uid, status, 'video')}
      />

      <MeetingSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        joinRequests={joinRequests}
        participants={peers}
        roomSettings={roomSettings}
        onUpdateSettings={(newSettings) => {
          setRoomSettings(newSettings);
          signaling.send('settings', user.id, undefined, roomId, newSettings);
        }}
        onApprove={approveUser}
        onReject={rejectUser}
        roomId={roomId}
        currentUser={user}
        onShowToast={showToast}
        logs={logs}
      />

      <ConfirmModal
        isOpen={mediaRequestModal.isOpen}
        title="Yêu cầu từ Chủ phòng"
        message={mediaRequestModal.message}
        onConfirm={handleModalConfirm}
        onCancel={handleModalCancel}
        confirmText="Đồng ý"
        cancelText={mediaRequestModal.type === 'join_requirement' && !isVerified ? "Rời phòng" : "Hủy"}
        type={mediaRequestModal.type === 'join_requirement' ? 'warning' : 'info'}
      />
    </div>
  );
};

export default MeetingRoom;
