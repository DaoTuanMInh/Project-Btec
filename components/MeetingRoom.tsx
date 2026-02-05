import React, { useRef, useCallback, useEffect } from 'react';
import { User, MeetingSettings, PeerStream, Message } from '../types';
import { signaling } from '../services/signaling';
import VideoGrid from './room/VideoGrid';
import Sidebar from './room/Sidebar';
// import SecurityBadge from './room/SecurityBadge';
import MeetingSettingsModal from './room/MeetingSettingsModal';
import WaitRoom from './room/WaitRoom';
import ReactionFloating from './room/ReactionFloating';
import { Settings, Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Smile, Copy, Eye, EyeOff, Users, Lock } from 'lucide-react';
import ConfirmModal from './ui/ConfirmModal';

// --- IMPORT HOOKS ---
import { useMeetingState } from '../hooks/useMeetingState';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaProcessing } from '../hooks/useMediaProcessing';
import { useMeetingSignaling } from '../hooks/useMeetingSignaling';

interface Props {
  user: User;
  roomId: string;
  localStream: MediaStream;
  onLeave: () => void;
  settings?: MeetingSettings;
}

const MeetingRoom: React.FC<Props> = ({ user, roomId, localStream, onLeave, settings }) => {
  // 1. Init State
  const state = useMeetingState(user, settings);
  const transcriptRef = useRef<string[]>([]);
  const dataChannelsRef = useRef<Record<string, RTCDataChannel>>({}); // E2EE Chat

  // 2. WebRTC Core
  const rtc = useWebRTC({
    user, roomId, localStream,
    setPeers: state.setPeers,
    setMessages: state.setMessages,
    setUnreadCount: state.setUnreadCount,
    transcriptRef,
    isSidebarOpenRef: state.isSidebarOpenRef,
    activeTabRef: state.activeTabRef
  });

  // NOTE: Connecting dataChannelsRef manually since it was tricky to extract fully without circular deps
  useEffect(() => { rtc.dataChannelsRef.current = dataChannelsRef.current; }, [rtc]);

  // 3. Media Processing
  const media = useMediaProcessing({
    localStream, user, roomId, pcRef: rtc.pcRef, setPeers: state.setPeers, settings: state.roomSettings
  });

  // 4. Mute/Video logic (Simple toggles)
  const toggleMute = useCallback((force = false) => {
    if (!force && state.roomSettingsRef.current?.requireMic && !isMutedRef.current) {
      state.showToast("Bắt buộc bật Mic!", 'warning'); return;
    }
    const newVal = !isMutedRef.current;
    localStream.getAudioTracks().forEach(t => t.enabled = !newVal);
    setIsMuted(newVal); isMutedRef.current = newVal;
    state.setPeers(prev => prev.map(p => p.isLocal ? { ...p, muted: newVal } : p));
    signaling.send('user-update', user.id, undefined, roomId, { muted: newVal });
  }, [roomId, user.id]);

  const toggleVideo = useCallback((force = false) => {
    if (!force && state.roomSettingsRef.current?.requireCamera && !isVideoOffRef.current) {
      state.showToast("Bắt buộc bật Camera!", 'warning'); return;
    }
    const newVal = !isVideoOffRef.current;
    localStream.getVideoTracks().forEach(t => t.enabled = !newVal);
    setIsVideoOff(newVal); isVideoOffRef.current = newVal;
    state.setPeers(prev => prev.map(p => p.isLocal ? { ...p, videoOff: newVal } : p));
    signaling.send('user-update', user.id, undefined, roomId, { videoOff: newVal });
  }, [roomId, user.id]);

  // Local State Wrappers for Signaling
  // Local State Wrappers for Signaling
  const [isMuted, setIsMuted] = React.useState(!localStream.getAudioTracks()[0]?.enabled);
  const [isVideoOff, setIsVideoOff] = React.useState(!localStream.getVideoTracks()[0]?.enabled);
  const isMutedRef = useRef(!localStream.getAudioTracks()[0]?.enabled);
  const isVideoOffRef = useRef(!localStream.getVideoTracks()[0]?.enabled);
  // --- STRICT STATE SYNCHRONIZATION ---

  // 1. Initial State from Tracks (Run once on mount)
  useEffect(() => {
    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];

    // Explicitly read current hardware state
    const hardwareMuted = audioTrack ? !audioTrack.enabled : (user.muted ?? false);
    const hardwareVideoOff = videoTrack ? !videoTrack.enabled : (user.videoOff ?? false);

    console.log("[MeetingRoom] Mount Init:", {
      hardwareMuted,
      hardwareVideoOff,
      trackAudioEnabled: audioTrack?.enabled,
      trackVideoEnabled: videoTrack?.enabled,
      userPropMuted: user.muted
    });

    // Force internal state to match hardware
    setIsMuted(hardwareMuted);
    isMutedRef.current = hardwareMuted; // Update ref immediately

    setIsVideoOff(hardwareVideoOff);
    isVideoOffRef.current = hardwareVideoOff;
  }, [localStream, user.muted, user.videoOff]);


  // 2. Verified Entry Sync (Run ONCE when isVerified becomes true)
  useEffect(() => {
    if (state.isVerified) {
      console.log("[MeetingRoom] Verified - Forcing State Sync from Hardware");

      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const realMuted = !audioTrack.enabled;
        console.log(`[Sync] Audio Track is ${realMuted ? 'MUTED/OFF' : 'LIVE/ON'}. Enforcing UI...`);
        setIsMuted(realMuted);
        isMutedRef.current = realMuted;

        // Sync Peers/Server
        state.setPeers(prev => prev.map(p => p.isLocal ? { ...p, muted: realMuted } : p));
        signaling.send('user-update', user.id, undefined, roomId, { muted: realMuted });
      }

      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        const realVideoOff = !videoTrack.enabled;
        console.log(`[Sync] Video Track is ${realVideoOff ? 'OFF' : 'ON'}. Enforcing UI...`);
        setIsVideoOff(realVideoOff);
        isVideoOffRef.current = realVideoOff;

        state.setPeers(prev => prev.map(p => p.isLocal ? { ...p, videoOff: realVideoOff } : p));
        signaling.send('user-update', user.id, undefined, roomId, { videoOff: realVideoOff });
      }
    }
  }, [state.isVerified, localStream, roomId, user.id]);


  // 3. Periodic Health Check (Keep UI aligned with Hardware)
  useEffect(() => {
    if (!state.isVerified) return;

    const interval = setInterval(() => {
      // 3. Health Check: Blindly enforce UI state to match hardware
      // We don't check Ref equality because Ref might be correct while State is stale (rare but possible)
      // React will optimize this: no re-render if state value is same.
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        const realMuted = !audioTrack.enabled;
        setIsMuted(realMuted);
        isMutedRef.current = realMuted;

        // Fix for "Cam đen" / "Mic silent" but Icon "ON" -> If track is enabled but black/silent?
        // No, user said Icon ON (enabled) but hardware OFF (disabled).
        // So realMuted = true. setIsMuted(true) -> Icon turns Red (OFF). Correct.
      }

      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        const realVideoOff = !videoTrack.enabled;
        setIsVideoOff(realVideoOff);
        isVideoOffRef.current = realVideoOff;
      }
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [state.isVerified, localStream]);

  // 5. Signaling Logic
  const sig = useMeetingSignaling({
    user, roomId, isCurrentUserHost: state.isCurrentUserHost,
    setPeers: state.setPeers, setJoinRequests: state.setJoinRequests, setMessages: state.setMessages,
    setReactions: state.setReactions, setRoomSettings: state.setRoomSettings,
    setMediaRequestModal: state.setMediaRequestModal, setLogs: state.setLogs, setUnreadCount: state.setUnreadCount,
    isVerified: state.isVerified, setIsVerified: state.setIsVerified, isVerifiedRef: state.isVerifiedRef,
    isMutedRef, isVideoOffRef, roomSettingsRef: state.roomSettingsRef, transcriptRef,
    isSidebarOpenRef: state.isSidebarOpenRef, activeTabRef: state.activeTabRef,
    createPeerConnection: rtc.createPeerConnection, processIceQueue: rtc.processIceQueue,
    pcRef: rtc.pcRef, iceQueue: rtc.iceQueue,
    onLeave, toggleMute, toggleVideo, settings
  });

  // UI Actions
  const sendReaction = (emoji: string, index?: number) => {
    state.setReactions(prev => [...prev, { id: Math.random().toString(), emoji, senderId: user.id, senderName: user.name, timestamp: Date.now(), index }]);
    signaling.send('reaction', user.id, undefined, roomId, { emoji, senderName: user.name, index });
    setTimeout(() => state.setReactions(prev => prev.slice(1)), 6000);
  };

  const handleModalCancel = () => {
    const { type, requesterId } = state.mediaRequestModal;
    state.setMediaRequestModal(prev => ({ ...prev, isOpen: false }));

    // If user rejects join requirements, kick them out
    if (type === 'join_requirement') {
      signaling.send('leave', user.id, undefined, roomId, {});
      onLeave();
    }
    // If user rejects audio/video request in-meeting, notify host (Broadcast to ensure delivery)
    else if (type === 'audio' || type === 'video') {
      console.log('🚫 User denied request, sending media-response broadcast', { kind: type, status: 'denied' });
      signaling.send('media-response', user.id, undefined, roomId, {
        kind: type,
        status: 'denied',
        userName: user.name
      });
    }
  };


  const handleModalConfirm = () => {
    state.setMediaRequestModal(prev => ({ ...prev, isOpen: false }));
    const { type, payload } = state.mediaRequestModal;

    // Simply enable mic/camera without notification (host can see the change)
    if (type === 'audio' && isMutedRef.current) {
      toggleMute();
    }

    if (type === 'video' && isVideoOffRef.current) {
      toggleVideo();
    }

    if (type === 'join_requirement') {
      if (payload?.settings?.requireMic && isMutedRef.current) toggleMute(true);
      if (payload?.settings?.requireCamera && isVideoOffRef.current) toggleVideo(true);
      state.setIsVerified(true);
      if (sig.pendingOffer) {
        sig.handleOffer(sig.pendingOffer.from, sig.pendingOffer.payload);
        sig.setPendingOffer(null);
      }
    }
  };

  // Ensure Local Peer is in List
  useEffect(() => {
    state.setPeers(prev => {
      const me = { userId: user.id, stream: media.isBlurred && media.canvasRef.current ? (media.sourceVideoRef.current as any)?.srcObject : localStream, userName: user.name, isLocal: true, muted: isMuted, videoOff: isVideoOff };
      // Note: Logic simplification. Real logic should merge stream properly.
      // But for refactor safety, we rely on hooks updating state.
      // Let's just ensure basic presence.
      if (!prev.find(p => p.isLocal)) return [...prev, me];
      // Update local state in peer list
      return prev.map(p => p.isLocal ? { ...p, muted: isMuted, videoOff: isVideoOff } : p);
    });
  }, [isMuted, isVideoOff]);

  if (!state.isVerified) {
    return (
      <>
        <WaitRoom
          user={user}
          localStream={localStream}
          onExit={() => { signaling.send('leave', user.id, undefined, roomId, {}); onLeave(); }}
          isMicOn={!isMuted}
          isCameraOn={!isVideoOff}
          onToggleMic={() => toggleMute()} // Allow wait room to toggle without force
          onToggleCamera={() => toggleVideo()}
        />
        <ConfirmModal isOpen={state.mediaRequestModal.isOpen} title="Yêu cầu" message={state.mediaRequestModal.message} onConfirm={handleModalConfirm} onCancel={handleModalCancel} confirmText="Đồng ý" cancelText="Hủy" type="info" />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 select-none">
      <video ref={media.sourceVideoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={media.canvasRef} className="hidden" />

      <div className="flex-1 flex flex-col relative" onClick={() => state.showControls ? null : state.setShowControls(true)}>
        <ReactionFloating reactions={state.reactions} /> {/* Fix: reactions from hook */}

        {/* HEADER */}
        <header className={`h-16 px-6 flex items-center justify-between glass-effect z-20 transition-all ${!state.showControls ? '-mt-16' : ''}`}>
          <div className="flex gap-3 items-center">
            <div className="text-white font-bold bg-blue-600 w-9 h-9 flex items-center justify-center rounded-xl">A</div>
            <div>
              <h2 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                AVO MEETING
                {state.roomSettings.lockRoom && (
                  <span className="flex items-center gap-1 text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full border border-red-500/20">
                    <Lock size={10} /> Locked
                  </span>
                )}
              </h2>
              <div className="text-[10px] text-slate-500 cursor-pointer" onClick={() => { navigator.clipboard.writeText(roomId); state.showToast("Copied!", 'success'); }}>ID: {roomId} <Copy size={10} className="inline" /></div></div>
          </div>
          {/* SecurityBadge Removed */}
          <div className="flex gap-4">
            {state.isCurrentUserHost && <button onClick={() => state.setIsSettingsModalOpen(true)} className="px-3 py-2 bg-slate-800 rounded-full text-xs text-slate-300 flex gap-2"><Settings size={14} /> Cài đặt</button>}
            <button onClick={() => { state.setIsSidebarOpen(true); state.setActiveTab('participants'); }} className="px-3 py-2 bg-slate-800 rounded-full text-xs text-slate-300 flex gap-2 relative">
              <Users size={14} /> Thành viên
              {state.joinRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-slate-950">
                  {state.joinRequests.length}
                </span>
              )}
            </button>
          </div>
        </header>

        <VideoGrid peers={state.peers} isLocalBlurred={media.isBlurred} onToggleFullScreen={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()} />

        {/* CONTROLS */}
        <div className={`fixed bottom-6 left-0 right-0 z-50 flex justify-center transition-all ${!state.showControls ? 'translate-y-[150%]' : ''}`}>
          <div className="flex gap-3 p-3 glass-effect rounded-[2rem] bg-slate-900/80">
            <button onClick={() => toggleMute()} className={`w-12 h-12 rounded-full flex items-center justify-center ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-200'}`}>{isMuted ? <MicOff /> : <Mic />}</button>
            <button onClick={() => toggleVideo()} className={`w-12 h-12 rounded-full flex items-center justify-center ${isVideoOff ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-200'}`}>{isVideoOff ? <VideoOff /> : <Video />}</button>
            <button onClick={() => media.setIsBlurred(!media.isBlurred)} className={`w-12 h-12 rounded-full flex items-center justify-center ${media.isBlurred ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200'}`}>{media.isBlurred ? <EyeOff /> : <Eye />}</button>
            <button onClick={media.shareScreen} className={`hidden md:flex w-12 h-12 rounded-full items-center justify-center ${media.isScreenSharing ? 'bg-blue-600' : 'bg-slate-800'}`}><MonitorUp /></button>

            {state.roomSettings.allowReactions && (
              <div className="relative">
                <button onClick={() => state.setIsReactionMenuOpen(!state.isReactionMenuOpen)} className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-yellow-400"><Smile /></button>
                {state.isReactionMenuOpen && (
                  <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-slate-800 p-2 rounded-full flex gap-1">
                    {['❤️', '👍', '😂', '😮', '👏', '🎉'].map((e, i) => <button key={e} onClick={() => sendReaction(e, i)} className="w-10 h-10 hover:bg-white/10 rounded-full text-xl">{e}</button>)}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => {
              if (state.isSidebarOpen && state.activeTab === 'chat') {
                state.setIsSidebarOpen(false);
              } else {
                state.setIsSidebarOpen(true);
                state.setActiveTab('chat');
              }
            }} className={`w-12 h-12 rounded-full flex items-center justify-center relative ${state.isSidebarOpen && state.activeTab === 'chat' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200'}`}><MessageSquare />
              {state.unreadCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-[10px] text-white flex items-center justify-center">{state.unreadCount}</span>}
            </button>
            <button onClick={() => { signaling.send('leave', user.id, undefined, roomId, {}); onLeave(); }} className="px-6 h-12 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold flex items-center gap-2"><PhoneOff /><span className="hidden md:inline">Leave</span></button>
          </div>
        </div>
      </div>

      <Sidebar
        isOpen={state.isSidebarOpen}
        onClose={() => state.setIsSidebarOpen(false)}
        activeTab={state.activeTab}
        setActiveTab={state.setActiveTab}
        messages={state.messages}
        onSendMessage={(t) => {
          const msg = { type: 'chat', text: t, timestamp: new Date(), id: Math.random().toString() };
          Object.values(rtc.dataChannelsRef.current).forEach(dc => dc.readyState === 'open' && dc.send(JSON.stringify(msg)));
          state.setMessages(p => [...p, { id: msg.id, sender: user.id, text: t, timestamp: msg.timestamp }]);
        }}
        currentUser={{ ...user, isHost: state.isCurrentUserHost }}
        participants={state.peers}
        onKick={(uid) => signaling.send('kick', user.id, uid, roomId, { reason: "Kicked" })}
        joinRequests={state.joinRequests}
        onApprove={(uid) => { signaling.send('approve-join', user.id, uid, roomId, {}); state.setJoinRequests(p => p.filter(u => u.id !== uid)); }}
        onReject={(uid) => { signaling.send('reject-join', user.id, uid, roomId, {}); state.setJoinRequests(p => p.filter(u => u.id !== uid)); }}
        onToggleMic={(uid, st) => signaling.send('media-request', user.id, uid, roomId, { kind: 'audio', action: st ? 'on' : 'off' })}
        onToggleCam={(uid, st) => signaling.send('media-request', user.id, uid, roomId, { kind: 'video', action: st ? 'on' : 'off' })}
      />

      <MeetingSettingsModal
        isOpen={state.isSettingsModalOpen}
        onClose={() => state.setIsSettingsModalOpen(false)}
        joinRequests={state.joinRequests}
        participants={state.peers}
        roomSettings={state.roomSettings}
        onUpdateSettings={async (s) => {
          state.setRoomSettings(s);
          signaling.send('settings', user.id, undefined, roomId, s);
          try {
            await signaling.updateRoomSettings(roomId, s);
            // Success: silently updated
          } catch (e) {
            state.showToast(`Lỗi lưu cài đặt Server: ${e}`, 'error');
          }
        }}
        onApprove={() => { }} onReject={() => { }}
        roomId={roomId} currentUser={user} onShowToast={state.showToast} logs={state.logs}
      />

      <ConfirmModal isOpen={state.mediaRequestModal.isOpen} title="Yêu cầu" message={state.mediaRequestModal.message} onConfirm={handleModalConfirm} onCancel={handleModalCancel} confirmText="Đồng ý" cancelText="Hủy" type="info" />
    </div>
  );
};

export default MeetingRoom;
