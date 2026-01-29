
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, PeerStream, Message, SignalingMessage, MeetingSettings } from '../types';
import { signaling } from '../services/signaling';
import { getMeetingSummary } from '../services/aiService';
import VideoGrid from './VideoGrid';
import Sidebar from './Sidebar';
import SecurityBadge from './SecurityBadge';
import MeetingSettingsModal from './MeetingSettingsModal';
import WaitRoom from './WaitRoom';
import { Settings, Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Sparkles, Eye, EyeOff, Users } from 'lucide-react';

interface Props {
  user: User;
  roomId: string;
  localStream: MediaStream;
  onLeave: () => void;
  settings?: MeetingSettings;
}

const MeetingRoom: React.FC<Props> = ({ user, roomId, localStream, onLeave, settings }) => {
  const [peers, setPeers] = useState<PeerStream[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'participants' | 'requests'>(user.isHost ? 'requests' : 'participants');

  // Room Settings State (Host has initial, others receive it)
  const [roomSettings, setRoomSettings] = useState<MeetingSettings | undefined>(settings);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Access Control: Host is always verified. Guests must wait for a signal (Offer/Settings) from Host/Room.
  const [isVerified, setIsVerified] = useState(user.isHost);
  const [joinRequests, setJoinRequests] = useState<User[]>([]);


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

  // Enforce settings on mount or when they change (only if verified)
  useEffect(() => {
    if (isVerified && roomSettings) {
      if (roomSettings.requireMic && isMuted) {
        console.log("Room requires Mic. Unmuting...");
        localStream.getAudioTracks().forEach(t => t.enabled = true);
        setIsMuted(false);
        setPeers(prev => prev.map(p => p.isLocal ? { ...p, muted: false } : p));
        signaling.send('user-update', user.id, undefined, roomId, { muted: false });
      }
      if (roomSettings.requireCamera && isVideoOff) {
        console.log("Room requires Camera. Turning on...");
        localStream.getVideoTracks().forEach(t => t.enabled = true);
        setIsVideoOff(false);
        setPeers(prev => prev.map(p => p.isLocal ? { ...p, videoOff: false } : p));
        signaling.send('user-update', user.id, undefined, roomId, { videoOff: false });
      }
    }
  }, [roomSettings, isVerified, localStream, user.id, roomId, isMuted, isVideoOff]); // Added missing deps

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
  const toggleMute = useCallback(() => {
    if (roomSettingsRef.current?.requireMic) {
      alert("Chủ phòng yêu cầu bắt buộc bật Mic.");
      return;
    }
    const currentMuted = isMutedRef.current;
    const newMutedState = !currentMuted;

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0) console.warn("No audio tracks to toggle!");

    audioTracks.forEach(track => {
      track.enabled = !newMutedState;
    });

    setIsMuted(newMutedState);
    setPeers(prev => prev.map(p => p.isLocal ? { ...p, muted: newMutedState } : p));
    signaling.send('user-update', user.id, undefined, roomId, { muted: newMutedState });
  }, [localStream, user.id, roomId]);

  const toggleVideo = useCallback(() => {
    if (roomSettingsRef.current?.requireCamera) {
      alert("Chủ phòng yêu cầu bắt buộc bật Camera.");
      return;
    }
    const currentVideoOff = isVideoOffRef.current;
    const newVideoOffState = !currentVideoOff;

    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) console.warn("No video tracks to toggle!");

    videoTracks.forEach(track => {
      track.enabled = !newVideoOffState;
    });

    setIsVideoOff(newVideoOffState);
    setPeers(prev => prev.map(p => p.isLocal ? { ...p, videoOff: newVideoOffState } : p));
    signaling.send('user-update', user.id, undefined, roomId, { videoOff: newVideoOffState });
  }, [localStream, user.id, roomId]);

  const handleSignaling = useCallback(async (msg: any) => {
    // Chỉ xử lý tin nhắn trong cùng 1 phòng và không phải từ chính mình
    if (msg.roomId !== roomId || msg.from === user.id) return;

    // Nếu tin nhắn có đích danh, chỉ xử lý nếu gửi cho mình
    if (msg.to && msg.to !== user.id) return;

    // Auto-verify if we receive ANY valid signal from the room (implies we are in)
    if (!isVerified && (msg.type === 'settings' || msg.type === 'offer')) {
      setIsVerified(true);
    }

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
        if (user.isHost) {
          console.log("Received join request from", msg.from);
          setJoinRequests(prev => [...prev.filter(u => u.id !== msg.from), { id: msg.from, name: msg.payload.userName }]);
        }
        break;

      case 'approve-join':
        if (!isVerified) {
          setIsVerified(true);
          signaling.send('join', user.id, undefined, roomId, { userName: user.name, password: settings?.password });
        }
        break;

      case 'reject-join':
        if (!isVerified) {
          alert("Yêu cầu tham gia của bạn đã bị từ chối.");
          onLeave();
        }
        break;

      case 'join':
        if (!isVerified) return;

        if (roomSettingsRef.current?.password) {
          const guestPassword = msg.payload.password;
          if (guestPassword !== roomSettingsRef.current.password) {
            console.log("Rejecting user due to invalid password");
            if (user.isHost) {
              (signaling as any).send('kick', user.id, msg.from, roomId, { reason: "Mật khẩu phòng không đúng." });
            }
            return;
          }
        }

        console.log(`User ${msg.from} joined. Creating Offer.`);

        setPeers(prev => {
          if (prev.find(p => p.userId === msg.from)) return prev;
          return [...prev, {
            userId: msg.from,
            stream: undefined as any,
            userName: msg.payload.userName,
            isLocal: false,
            muted: true,
            videoOff: true
          }];
        });

        if (pcRef.current[msg.from]) {
          console.warn(`PC for ${msg.from} existed. Closing to reset.`);
          pcRef.current[msg.from].close();
          delete pcRef.current[msg.from];
          delete iceQueue.current[msg.from];
        }

        const pcOffer = createPeerConnection(msg.from, msg.payload.userName);
        const offer = await pcOffer.createOffer();
        await pcOffer.setLocalDescription(offer);

        signaling.send('offer', user.id, msg.from, roomId, {
          offer,
          userName: user.name,
          muted: isMutedRef.current, // Use Ref to get current state
          videoOff: isVideoOffRef.current // Use Ref to get current state
        });

        if (user.isHost && roomSettingsRef.current) {
          (signaling as any).send('settings', user.id, msg.from, roomId, roomSettingsRef.current);
        }
        break;

      case 'kick':
        alert(msg.payload.reason || "Bạn đã bị mời ra khỏi phòng.");
        onLeave();
        break;

      case 'media-request':
        const { kind, action } = msg.payload;
        if (kind === 'audio') {
          const currentMuted = isMutedRef.current;
          if (action === 'off') {
            if (!currentMuted) toggleMute(); // Force mute
          } else {
            if (confirm("Chủ phòng muốn bạn bật Micro. Bạn có đồng ý?")) {
              if (currentMuted) toggleMute();
            }
          }
        } else if (kind === 'video') {
          const currentVideoOff = isVideoOffRef.current;
          if (action === 'off') {
            if (!currentVideoOff) toggleVideo(); // Force video off
          } else {
            if (confirm("Chủ phòng muốn bạn bật Camera. Bạn có đồng ý?")) {
              if (currentVideoOff) toggleVideo();
            }
          }
        }
        break;

      case 'settings':
        console.log("Received room settings:", msg.payload);
        setRoomSettings(msg.payload);
        setIsVerified(true);
        break;

      case 'offer':
        const pcAnswer = createPeerConnection(msg.from, msg.payload.userName);

        if (msg.payload.muted !== undefined || msg.payload.videoOff !== undefined) {
          setPeers(prev => prev.map(p => p.userId === msg.from ? { ...p, muted: msg.payload.muted, videoOff: msg.payload.videoOff } : p));
        }

        await pcAnswer.setRemoteDescription(new RTCSessionDescription(msg.payload.offer));
        const answer = await pcAnswer.createAnswer();
        await pcAnswer.setLocalDescription(answer);

        signaling.send('answer', user.id, msg.from, roomId, {
          answer,
          muted: isMutedRef.current,
          videoOff: isVideoOffRef.current
        });
        await processIceQueue(msg.from);
        break;

      case 'answer':
        const pc = pcRef.current[msg.from];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.answer));
          // Update peer state based on Answer payload (Guest's initial state)
          if (msg.payload.muted !== undefined || msg.payload.videoOff !== undefined) {
            setPeers(prev => prev.map(p => p.userId === msg.from ? {
              ...p,
              muted: msg.payload.muted,
              videoOff: msg.payload.videoOff
            } : p));
          }
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
        const pcToClose = pcRef.current[msg.from];
        if (pcToClose) {
          pcToClose.close();
          delete pcRef.current[msg.from];
          delete iceQueue.current[msg.from];
        }
        break;

      case 'chat':
        setMessages(prev => [...prev, {
          id: Math.random().toString(),
          sender: msg.from,
          text: msg.payload.text,
          timestamp: new Date(msg.payload.timestamp)
        }]);
        transcriptRef.current.push(`${msg.from}: ${msg.payload.text}`);
        break;
    }
  }, [user.id, roomId, createPeerConnection, user.isHost, isVerified, settings, onLeave, toggleMute, toggleVideo]); // Added dependencies safely

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
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const videoTrack = screenStream.getVideoTracks()[0];
      (Object.values(pcRef.current) as RTCPeerConnection[]).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      });
      setPeers(prev => prev.map(p => p.isLocal ? { ...p, stream: screenStream } : p));
      setIsScreenSharing(true);
      videoTrack.onended = () => setIsScreenSharing(false);
    } catch (err) { console.error("Screen share failed", err); }
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
    if (!user.isHost) return;
    if (confirm("Bạn có chắc chắn muốn mời người này ra khỏi phòng?")) {
      signaling.send('kick', user.id, targetId, roomId, { reason: "Bạn đã bị mời ra khỏi phòng bởi chủ phòng." });
      // Optimistically remove them from list
      setPeers(prev => prev.filter(p => p.userId !== targetId));
    }
  };

  const handleMediaRequest = (targetId: string, currentStatus: boolean, kind: 'audio' | 'video') => {
    if (!user.isHost) return;
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

  // Blur Processing Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>();
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
    return <WaitRoom user={user} localStream={localStream} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 select-none">
      {/* Hidden processing elements */}
      <video ref={sourceVideoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex-1 flex flex-col relative">
        <header className="h-16 px-6 flex items-center justify-between glass-effect border-b border-white/5 z-20">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-blue-500/20">A</div>
              <div className="flex flex-col">
                <h2 className="hidden md:block text-xs font-bold text-slate-200 uppercase tracking-widest leading-none">AVO SECURE MEETING</h2>
                <span className="hidden md:block text-[10px] text-slate-500 font-mono mt-1">ID: {roomId}</span>
              </div>
            </div>
            <SecurityBadge />
          </div>

          <div className="flex items-center gap-4">
            {user.isHost && (
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="relative px-3 py-2 md:px-4 bg-slate-800 text-slate-300 rounded-full text-xs font-bold hover:bg-slate-700 transition-colors flex items-center gap-2 border border-slate-700"
              >
                <Settings size={14} />
                <span className="hidden md:inline">Cài Đặt</span>
              </button>
            )}

            <button
              onClick={() => { setIsSidebarOpen(true); setActiveTab('participants'); }}
              className="px-3 py-2 md:px-4 bg-slate-800 text-slate-300 rounded-full text-xs font-bold hover:bg-slate-700 transition-colors flex items-center gap-2 border border-slate-700"
            >
              <Users size={14} />
              <span className="hidden md:inline">Thành viên</span>
            </button>
          </div>
        </header>

        <VideoGrid peers={peers} isLocalBlurred={isBlurred} />

        <div className="h-28 flex items-center justify-center absolute bottom-0 left-0 right-0 z-20 pointer-events-none px-4 pb-6">
          <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 glass-effect rounded-[2rem] pointer-events-auto border border-white/10 shadow-2xl overflow-x-auto max-w-full">
            <button onClick={toggleMute} className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
              {isMuted ? <MicOff size={18} className="md:w-5 md:h-5" /> : <Mic size={18} className="md:w-5 md:h-5" />}
            </button>
            <button onClick={toggleVideo} className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isVideoOff ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
              {isVideoOff ? <VideoOff size={18} className="md:w-5 md:h-5" /> : <Video size={18} className="md:w-5 md:h-5" />}
            </button>
            <button onClick={() => setIsBlurred(!isBlurred)} className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isBlurred ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
              {isBlurred ? <EyeOff size={18} className="md:w-5 md:h-5" /> : <Eye size={18} className="md:w-5 md:h-5" />}
            </button>
            <button onClick={shareScreen} className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isScreenSharing ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
              <MonitorUp size={18} className="md:w-5 md:h-5" />
            </button>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${isSidebarOpen ? 'bg-slate-700 text-blue-400 border border-blue-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>
              <MessageSquare size={18} className="md:w-5 md:h-5" />
            </button>

            <div className="h-6 md:h-8 w-px bg-white/10 mx-1"></div>

            <button onClick={onLeave} className="px-4 md:px-6 h-10 md:h-12 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold text-xs uppercase tracking-widest flex items-center gap-2 md:gap-3 transition-all active:scale-95 shadow-xl shadow-red-500/30">
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
        setActiveTab={setActiveTab}
        messages={messages}
        onSendMessage={(t) => signaling.broadcastChat(roomId, user.id, t)}
        aiSummary={aiSummary}
        onGenerateSummary={async () => {
          setIsGeneratingAi(true);
          const s = await getMeetingSummary(transcriptRef.current.join("\n"));
          setAiSummary(s);
          setIsGeneratingAi(false);
        }}
        isGeneratingAi={isGeneratingAi}
        currentUser={user}
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
      />
    </div>
  );
};

export default MeetingRoom;
