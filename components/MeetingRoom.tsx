import React, { useRef, useCallback, useEffect } from 'react';
import { User, MeetingSettings, PeerStream, Message } from '../types';
import { signaling } from '../services/signaling';
import VideoGrid from './room/VideoGrid';
import Sidebar from './room/Sidebar';
// import SecurityBadge from './room/SecurityBadge';
import MeetingSettingsModal from './room/MeetingSettingsModal';
import WaitRoom from './room/WaitRoom';
import ReactionFloating from './room/ReactionFloating';
import { Settings, Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, MessageSquare, Smile, Copy, Eye, EyeOff, Users, Lock, Circle, StopCircle, FileText } from 'lucide-react';
import ConfirmModal from './ui/ConfirmModal';

// --- IMPORT HOOKS ---
import { useMeetingState } from '../hooks/useMeetingState';
import { useWebRTC } from '../hooks/useWebRTC';
import { useMediaProcessing } from '../hooks/useMediaProcessing';
import { useMeetingSignaling } from '../hooks/useMeetingSignaling';
import { getToken } from '../services/authService';

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
  const { setPeers, showToast, roomSettingsRef } = state;
  const transcriptRef = useRef<string[]>([]);
  const dataChannelsRef = useRef<Record<string, RTCDataChannel>>({}); // E2EE Chat
  const processedMsgIdsRef = useRef(new Set<string>()); // Anti-spam/dedup tracking
  const currentVideoTrackRef = useRef<MediaStreamTrack | null>(localStream.getVideoTracks()[0]);

  // 2. WebRTC Core
  const rtc = useWebRTC({
    user, roomId, localStream,
    setPeers: state.setPeers,
    setMessages: state.setMessages,
    setUnreadCount: state.setUnreadCount,
    transcriptRef,
    isSidebarOpenRef: state.isSidebarOpenRef,
    activeTabRef: state.activeTabRef,
    processedMsgIdsRef,
    currentVideoTrackRef
  });

  // NOTE: Connecting dataChannelsRef manually since it was tricky to extract fully without circular deps
  useEffect(() => { rtc.dataChannelsRef.current = dataChannelsRef.current; }, [rtc]);

  // 3. Media Processing
  const media = useMediaProcessing({
    localStream, user, roomId, pcRef: rtc.pcRef, setPeers: state.setPeers, currentVideoTrackRef, settings: state.roomSettings
  });

  // Local State Wrappers for Signaling
  const [isMuted, setIsMuted] = React.useState(!localStream.getAudioTracks()[0]?.enabled);
  const [isVideoOff, setIsVideoOff] = React.useState(!localStream.getVideoTracks()[0]?.enabled);
  const isMutedRef = useRef(!localStream.getAudioTracks()[0]?.enabled);
  const isVideoOffRef = useRef(!localStream.getVideoTracks()[0]?.enabled);

  // Recording state
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingLabel, setRecordingLabel] = React.useState('Ready');
  const [recordedBlobs, setRecordedBlobs] = React.useState<Blob[]>([]);
  const [recordingName, setRecordingName] = React.useState('');
  const [showRecordingNameInput, setShowRecordingNameInput] = React.useState(false);
  const [stopConfirming, setStopConfirming] = React.useState(false);
  const [roomCloseAfterSave, setRoomCloseAfterSave] = React.useState(false);
  const [contentRefreshKey, setContentRefreshKey] = React.useState(0); // Increments after each successful upload
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const targetFileNameRef = useRef<string>(`meeting-${Date.now()}`);

  // --- STRICT STATE SYNCHRONIZATION ---
  useEffect(() => {
    const audioTrack = localStream.getAudioTracks()[0];
    const videoTrack = localStream.getVideoTracks()[0];
    const hardwareMuted = audioTrack ? !audioTrack.enabled : (user.muted ?? false);
    const hardwareVideoOff = videoTrack ? !videoTrack.enabled : (user.videoOff ?? false);

    setIsMuted(hardwareMuted);
    isMutedRef.current = hardwareMuted;
    setIsVideoOff(hardwareVideoOff);
    isVideoOffRef.current = hardwareVideoOff;
  }, [localStream, user.muted, user.videoOff]);


  // 4. Mute/Video logic
  // Speech Recognition Live Transcription
  useEffect(() => {
    if (!state.isVerified || isMuted) return; // Only transcribe if mic is on

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    let recognition: any;
    try {
        recognition = new SpeechRecognition();
    } catch(e) { return; }
    
    recognition.continuous = true;
    recognition.interimResults = false;
    const currentLang = state.roomSettings.transcriptionLang || 'vi-VN';
    recognition.lang = currentLang === 'auto' ? 'vi-VN' : currentLang;

    let isManuallyStopped = false;

    recognition.onresult = (event: any) => {
      const lastIndex = event.results.length - 1;
      const text = event.results[lastIndex][0].transcript.trim();
      if (text) {
        // Send to others
        signaling.send('transcript-chunk', user.id, undefined, roomId, { text, userName: user.name });
        // Save locally for the host recording it
        if (transcriptRef.current) transcriptRef.current.push(`${user.name}: ${text}`);
      }
    };

    recognition.onerror = (e: any) => {
      // Catch fatal errors that should permanently stop recognition for this session
      if (e.error === 'not-allowed' || e.error === 'audio-capture' || e.error === 'service-not-allowed') {
          isManuallyStopped = true;
      }
    };
    
    recognition.onend = () => {
      if (!isManuallyStopped && !isMuted) {
         // FIX: Use setTimeout to prevent maximum call stack / tight CPU loop if recognition immediately fails to start
         setTimeout(() => {
            if (!isManuallyStopped && !isMuted) {
               try { recognition.start(); } catch(e){}
            }
         }, 1000);
      }
    };

    try { recognition.start(); } catch(e){}

    return () => {
      isManuallyStopped = true;
      try { recognition.stop(); } catch(e){}
    };
  }, [state.isVerified, isMuted, roomId, user.id, user.name]);

  const toggleMute = useCallback((force = false) => {
    if (!force && roomSettingsRef.current?.requireMic && !isMutedRef.current) {
      showToast("The room settings require Mic to be turned on!", 'warning'); return;
    }
    const newVal = !isMutedRef.current;
    localStream.getAudioTracks().forEach(t => t.enabled = !newVal);
    setIsMuted(newVal); isMutedRef.current = newVal;
    setPeers(prev => prev.map(p => p.isLocal ? { ...p, muted: newVal, isScreenShare: media.isScreenSharing } : p));
    signaling.send('user-update', user.id, undefined, roomId, { muted: newVal, isScreenShare: media.isScreenSharing });
  }, [roomId, user.id, localStream, media.isScreenSharing, roomSettingsRef, showToast, setPeers]);

  const toggleVideo = useCallback((force = false) => {
    if (!force && roomSettingsRef.current?.requireCamera && !isVideoOffRef.current) {
      showToast("The room settings require Camera to be turned on!", 'warning'); return;
    }
    const newVal = !isVideoOffRef.current;
    localStream.getVideoTracks().forEach(t => t.enabled = !newVal);
    setIsVideoOff(newVal); isVideoOffRef.current = newVal;
    setPeers(prev => prev.map(p => p.isLocal ? { ...p, videoOff: newVal, isScreenShare: media.isScreenSharing } : p));
    signaling.send('user-update', user.id, undefined, roomId, { videoOff: newVal, isScreenShare: media.isScreenSharing });
  }, [roomId, user.id, localStream, media.isScreenSharing, roomSettingsRef, showToast, setPeers]);

  const chooseSupportedMimeType = () => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav'
    ];
    for (const mimeType of candidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }
    return '';
  };

  const startRecordingWithName = async (filename: string) => {
    if (!state.isCurrentUserHost) {
      state.showToast('Only host can start recording.', 'warning');
      return;
    }
    // Pre-check: recording requires authentication to upload
    if (!getToken()) {
      state.showToast('Recording requires you to be logged in. Please log in first.', 'error');
      return;
    }
    if (isRecording) return;
    
    if (typeof MediaRecorder === 'undefined') {
      state.showToast('MediaRecorder is not supported in your browser', 'error');
      return;
    }

    const chosenMimeType = chooseSupportedMimeType();
    if (!chosenMimeType) {
      state.showToast('No supported audio MIME type for MediaRecorder, please use Chrome/Edge/Firefox latest', 'error');
      return;
    }

    // We allow starting with a temporary name; final name can be set after stop
    const normalizedName = filename.trim() || `meeting-${Date.now()}`;
    targetFileNameRef.current = normalizedName;
    setRecordingName(normalizedName);

    let recordingStream: MediaStream;
    let audioCtx: AudioContext | null = null;

    try {
      // 1. Create an AudioContext to mix all audio sources
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      const destination = audioCtx.createMediaStreamDestination();

      // 2. Add Local Stream (if active and enabled)
      if (localStream.getAudioTracks().length > 0) {
        const localSource = audioCtx.createMediaStreamSource(localStream);
        localSource.connect(destination);
      }

      // 3. Add all Remote Peer Streams
      state.peers.forEach(peer => {
        if (!peer.isLocal && peer.stream && peer.stream.getAudioTracks().length > 0) {
          const remoteSource = audioCtx.createMediaStreamSource(peer.stream);
          remoteSource.connect(destination);
        }
      });

      recordingStream = destination.stream;
      
      // Keep the context alive for the duration of the recording
      (recordingStream as any)._audioCtx = audioCtx; 

    } catch (mixerErr) {
       console.error("Failed to setup audio mixer:", mixerErr);
       // Fallback to local stream only if AudioContext fails (e.g. strict policies)
       const activeTrack = localStream.getAudioTracks().find(t => t.readyState === 'live');
       if (!activeTrack) {
         state.showToast('No active audio track found. Please enable microphone or have participants speak.', 'error');
         return;
       }
       recordingStream = new MediaStream([activeTrack]);
    }

    const options: any = { mimeType: chosenMimeType, audioBitsPerSecond: 128000 };
    let recorder: MediaRecorder | null = null;

    const createRecorder = async () => {
      try {
        console.log('[Recording] Attempting MediaRecorder on mixed stream with mimeType:', chosenMimeType);
        return new MediaRecorder(recordingStream, options);
      } catch (err) {
        console.error('[Recording] MediaRecorder failed', err);
        throw err;
      }
    };

    try {
      recorder = await createRecorder();
      console.log('[Recording] MediaRecorder created, stream tracks:', recordingStream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled, readyState: t.readyState })));
      recorder.onerror = (event: any) => {
        console.error('MediaRecorder onerror', event);
        const errMsg = event.error?.message || 'Unknown MediaRecorder error';
        state.showToast(`Could not start recording: ${errMsg}. Please check your microphone and permissions.`, 'error');
      };

      mediaRecorderRef.current = recorder;
      setRecordedBlobs([]);
      setRecordingLabel('Recording...');

      // Notify everyone that the recording has started with TTS
      signaling.send('announcement', user.id, undefined, roomId, {
        message: 'The host is now recording the meeting.',
        lang: 'en-US'
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
          setRecordedBlobs(prev => [...prev, event.data]);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        setRecordingLabel('Uploading final recording...');

        const blob = new Blob(chunks, { type: 'audio/webm' });
        
        if (blob.size === 0) {
            state.showToast('Recording failed: Audio stream produced no data. Please ensure your microphone is active.', 'error');
            // Teardown the audio context
            if ((recordingStream as any)._audioCtx) {
               (recordingStream as any)._audioCtx.close();
            }
            if (roomCloseAfterSave) {
              setRoomCloseAfterSave(false);
              signaling.send('leave', user.id, undefined, roomId, {});
              onLeave();
            }
            return;
        }

        // Always clear transcript at start of upload — prevents old content accumulating
        // regardless of whether this upload succeeds or fails
        transcriptRef.current = [];

        await uploadRecordedBlob(blob, targetFileNameRef.current);

        // Teardown the audio context
        if ((recordingStream as any)._audioCtx) {
           (recordingStream as any)._audioCtx.close();
        }

        if (roomCloseAfterSave) {
          setRoomCloseAfterSave(false);
          signaling.send('leave', user.id, undefined, roomId, {});
          onLeave();
        }
      };

      recorder.start(5000); // Emit chunks every 5 seconds
      setIsRecording(true);
      state.showToast('Recording started.', 'success');
    } catch (err: any) {
      console.error('Recording error', err);
      const message = err?.message || 'Unknown error';
      state.showToast(`Could not start recording: ${message}. Please check your microphone and permissions.`, 'error');
      setRecordingLabel('Failed');
    }
  };

  const handleStartRecording = () => {
    const tempName = `meeting-${Date.now()}`;
    targetFileNameRef.current = tempName;
    setRecordingName(tempName);
    startRecordingWithName(tempName);
  };

  const handleStopRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;

    setStopConfirming(true);
    setShowRecordingNameInput(true);
    setRecordingLabel('Enter filename to save, or Cancel to continue recording');
  };

  const handleLeaveRoom = () => {
    if (isRecording) {
      setRoomCloseAfterSave(true);
      setStopConfirming(true);
      setShowRecordingNameInput(true);
      setRecordingLabel('Enter filename to save before leaving room');
      return;
    }
    signaling.send('leave', user.id, undefined, roomId, {});
    onLeave();
  };

  const uploadRecordedBlob = async (blob: Blob, filename: string) => {
    // Pre-check: ensure user is authenticated before wasting a large file upload
    const token = getToken();
    if (!token) {
      state.showToast('Upload failed: You are not logged in. Please log in and try again.', 'error');
      setRecordingLabel('Upload failed — not authenticated');
      setTimeout(() => setRecordingLabel('Ready'), 4000);
      return;
    }

    const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
    setRecordingLabel(`Uploading (${sizeMB} MB)...`);
    const formData = new FormData();
    formData.append('audio', blob, `${filename}.webm`);
    formData.append('roomId', roomId);
    formData.append('hostId', user.id);
    formData.append('name', filename);
    const names = Array.from(new Set(state.peers.map(p => p.userName))).filter(Boolean).join(', ');
    if (names) formData.append('participants', names);

    // Send the snapshot of transcript captured before upload started
    if (transcriptRef.current && transcriptRef.current.length > 0) {
        formData.append('rawTranscript', transcriptRef.current.join('\n'));
    }

    try {
      const res = await fetch(`/api/meetings/${roomId}/record`, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Record upload failed');
      state.showToast('Recording uploaded successfully. Sending to AI summarizer...', 'success');
      setRecordingLabel('Uploaded ✓');
      // Trigger Content tab refresh in MeetingSettingsModal
      setContentRefreshKey(k => k + 1);
    } catch (err: any) {
      console.error(err);
      state.showToast(`Audio upload failed: ${err.message || err}`, 'error');
      setRecordingLabel('Upload failed');
    } finally {
      setTimeout(() => setRecordingLabel('Ready'), 3000);
    }
  };


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

      // 4. Fetch Chat History
      const fetchHistory = async () => {
        try {
          const res = await fetch(`/api/chat/history/${roomId}`);
          const history = await res.json();
          if (Array.isArray(history)) {
            state.setMessages(history.map((m: any) => ({
              id: m._id,
              sender: m.senderId,
              userName: m.userName,
              text: m.text || "",
              timestamp: new Date(m.timestamp),
              fileUrl: m.fileUrl,
              fileName: m.fileName,
              fileSize: m.fileSize,
              isImage: m.type === 'image'
            })));
          }
        } catch (e) { console.error("History fetch error", e); }
      };
      fetchHistory();
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
    setMediaRequestModal: state.setMediaRequestModal, setLogs: state.setLogs,
    setUnreadCount: state.setUnreadCount,
    setUnreadLogsCount: state.setUnreadLogsCount,
    isVerified: state.isVerified, setIsVerified: state.setIsVerified, isVerifiedRef: state.isVerifiedRef,
    isMutedRef, isVideoOffRef, roomSettingsRef: state.roomSettingsRef, transcriptRef,
    isSidebarOpenRef: state.isSidebarOpenRef, activeTabRef: state.activeTabRef,
    isSettingsModalOpenRef: state.isSettingsModalOpenRef,
    processedMsgIdsRef,
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
      console.log('User denied request, sending media-response broadcast', { kind: type, status: 'denied' });
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
    if (!user.id) return;

    state.setPeers(prev => {
      const existingMe = prev.find(p => p.isLocal);
      const me = {
        userId: user.id,
        stream: existingMe ? existingMe.stream : localStream,
        userName: user.name,
        isLocal: true,
        muted: isMuted,
        videoOff: isVideoOff,
        avatar: user.avatar,
        isScreenShare: existingMe ? existingMe.isScreenShare : media.isScreenSharing
      };

      if (!existingMe) {
        console.log("Initializing Local Peer with avatar:", user.avatar ? 'YES' : 'NO');
        return [me, ...prev]; // Put local user at the top
      }

      // Update local state in peer list
      return prev.map(p => p.isLocal ? me : p);
    });
  }, [user.id, user.name, user.avatar, isMuted, isVideoOff, localStream]);

  // Handle Chat Unread Count
  useEffect(() => {
    if (state.isSidebarOpen && state.activeTab === 'chat') {
      state.setUnreadCount(0);
    }
  }, [state.isSidebarOpen, state.activeTab]);

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
        <ConfirmModal isOpen={state.mediaRequestModal.isOpen} title="Request" message={state.mediaRequestModal.message} onConfirm={handleModalConfirm} onCancel={handleModalCancel} confirmText="Confirm" cancelText="Cancel" type="info" />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 select-none">
      <video ref={media.sourceVideoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={media.canvasRef} className="hidden" />

      <div className="flex-1 flex flex-col relative" onClick={() => state.setShowControls(!state.showControls)}>
        <ReactionFloating reactions={state.reactions} /> {/* Fix: reactions from hook */}

        {/* HEADER */}
        <header onClick={e => e.stopPropagation()} className={`h-16 md:h-20 px-4 md:px-6 flex items-center justify-between glass-effect z-20 transition-all ${!state.showControls ? '-mt-16 md:-mt-20' : ''}`}>
          <div className="flex gap-2 md:gap-3 items-center min-w-0">
            <img src="/logoAVO.png" alt="Logo" className="w-9 h-9 md:w-13 md:h-13 object-contain rounded-full shadow-sm shrink-0" />
            <div className="min-w-0">
              <h2 className="text-[10px] md:text-sm font-bold text-slate-200 flex items-center gap-1.5 md:gap-2">
                <span className="truncate">AVO MEETING</span>
                {state.roomSettings.lockRoom && (
                  <span className="flex items-center gap-1 text-[9px] md:text-[10px] bg-red-500/10 text-red-500 px-1.5 md:px-2 py-0.5 rounded-full border border-red-500/20 shrink-0">
                    <Lock size={8} className="md:w-2.5 md:h-2.5" /> Locked
                  </span>
                )}
              </h2>
              <div className="text-[9px] md:text-[10px] text-slate-500 cursor-pointer hover:text-blue-400 transition-colors flex items-center gap-1 truncate mt-0.5 md:mt-1.5" onClick={() => { navigator.clipboard.writeText(roomId); state.showToast("Copied!", 'success'); }}>
                <span className="opacity-70">ID:</span> <span className="font-mono font-medium">{roomId}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 md:gap-4 items-center shrink-0">
            {state.isCurrentUserHost && (
              <button
                onClick={() => state.setIsSettingsModalOpen(true)}
                className="p-2 md:px-3 md:py-2 bg-slate-800 rounded-full text-xs text-slate-300 flex items-center gap-2 relative group hover:bg-slate-700 transition-colors"
                title="Settings & Logs"
              >
                <Settings size={14} className="group-hover:rotate-45 transition-transform" />
                <span className="hidden lg:inline text-[10px] md:text-xs">Settings</span>
                {state.unreadLogsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] md:text-[10px] font-bold w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center border-2 border-slate-950 animate-pulse">
                    {state.unreadLogsCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => { state.setIsSidebarOpen(true); state.setActiveTab('participants'); }}
              className="p-2 md:px-3 md:py-2 bg-slate-800 rounded-full text-xs text-slate-300 flex items-center gap-2 relative hover:bg-slate-700 transition-colors"
            >
              <Users size={14} />
              <span className="hidden lg:inline">Participants</span>
              {state.joinRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] md:text-[10px] font-bold w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center border-2 border-slate-950">
                  {state.joinRequests.length}
                </span>
              )}
            </button>
          </div>
        </header>

        <VideoGrid peers={state.peers} isLocalBlurred={media.isBlurred} onToggleFullScreen={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()} />



        {/* CONTROLS */}
        <div onClick={e => e.stopPropagation()} className={`fixed bottom-6 left-0 right-0 z-50 flex flex-col items-center gap-4 transition-all px-4 ${!state.showControls ? 'translate-y-[150%]' : ''}`}>

          {/* Recording dot (top corner) */}
          {isRecording && (
            <div className="fixed top-4 right-4 z-60 w-3 h-3 rounded-full bg-red-500 animate-pulse border-2 border-white/60 shadow-[0_0_10px_rgba(255,0,0,0.7)]" />
          )}

          <div className={`transition-all duration-300 ease-out origin-bottom ${state.isReactionMenuOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-90 translate-y-4 pointer-events-none'}`}>
            <div className="bg-slate-800 p-2 md:p-3 rounded-full flex gap-2 md:gap-3 shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-white/10 backdrop-blur-xl mb-2">
              {['❤️', '👍', '😂', '😮', '👏', '🎉'].map((e, i) => (
                <button
                  key={e}
                  onClick={() => {
                    const reactId = Math.random().toString();
                    signaling.send('reaction', user.id, undefined, roomId, { emoji: e, senderName: user.name });
                    state.setReactions(prev => [...prev.filter(r => r.senderId !== user.id), { id: reactId, senderId: user.id, senderName: user.name, emoji: e, timestamp: Date.now() }]);
                    state.setIsReactionMenuOpen(false); // Đóng menu sau khi nhấn
                  }}
                  className="w-10 h-10 md:w-12 md:h-12 hover:bg-white/10 rounded-full text-2xl md:text-3xl transition-transform hover:scale-125 focus:outline-none"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-2 md:gap-3 p-2 md:p-3 glass-effect rounded-[2rem] bg-slate-900/80 max-w-[95vw] lg:max-w-full shadow-2xl border border-white/5 pointer-events-auto">
            <button onClick={() => toggleMute()} className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>{isMuted ? <MicOff size={20} /> : <Mic size={20} />}</button>
            <button onClick={() => toggleVideo()} className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-full flex items-center justify-center transition-colors ${isVideoOff ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>{isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}</button>
            <button onClick={() => media.setIsBlurred(!media.isBlurred)} className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-full flex items-center justify-center transition-colors ${media.isBlurred ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>{media.isBlurred ? <EyeOff size={20} /> : <Eye size={20} />}</button>
            <button onClick={() => isRecording ? handleStopRecording() : handleStartRecording()} className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`} title={isRecording ? 'Stop Recording' : 'Start Recording'}>
              {isRecording ? <StopCircle size={20} /> : <Circle size={20} />}
            </button>
            <button onClick={media.shareScreen} className={`hidden md:flex w-12 h-12 shrink-0 rounded-full items-center justify-center transition-colors ${media.isScreenSharing ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}><MonitorUp size={20} /></button>

            {state.roomSettings.allowReactions && (
              <div className="relative shrink-0">
                <button onClick={() => state.setIsReactionMenuOpen(!state.isReactionMenuOpen)} className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all ${state.isReactionMenuOpen ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-800 text-yellow-400 hover:bg-slate-700'}`}><Smile size={20} /></button>
              </div>
            )}



            <button onClick={() => {
              if (state.isSidebarOpen && state.activeTab === 'chat') {
                state.setIsSidebarOpen(false);
              } else {
                state.setIsSidebarOpen(true);
                state.setActiveTab('chat');
              }
            }} className={`w-10 h-10 md:w-12 md:h-12 shrink-0 rounded-full flex items-center justify-center relative transition-colors ${state.isSidebarOpen && state.activeTab === 'chat' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}><MessageSquare size={20} />
              {state.unreadCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-[10px] text-white flex items-center justify-center border border-slate-900">{state.unreadCount}</span>}
            </button>
            <button onClick={handleLeaveRoom} className="px-5 md:px-6 h-10 md:h-12 shrink-0 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold flex items-center gap-2 transition-all active:scale-95"><PhoneOff size={20} /><span className="hidden md:inline">Leave</span></button>
          </div>
        </div>

        {showRecordingNameInput && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => {
              setShowRecordingNameInput(false);
              if (stopConfirming) {
                setStopConfirming(false);
                setRecordingLabel('Recording...');
              }
            }} />
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl z-10">
              <h3 className="text-white text-lg font-bold mb-2">Enter summary filename</h3>
              <p className="text-slate-400 text-sm mb-4">Enter summary filename (e.g., Meeting-1)</p>
              <input
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                placeholder="example: Meeting-1"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => {
                  setShowRecordingNameInput(false);
                  if (stopConfirming) {
                    setStopConfirming(false);
                    setRecordingLabel('Recording...');
                  }
                }} className="px-3 py-2 text-slate-300 hover:text-white bg-slate-700 rounded-lg">Cancel</button>
                <button onClick={() => {
                  const chosenName = recordingName.trim() || `meeting-${Date.now()}`;
                  setShowRecordingNameInput(false);
                  setStopConfirming(false);
                  setRecordingName(chosenName);
                  targetFileNameRef.current = chosenName;

                  if (isRecording && mediaRecorderRef.current) {
                    setRecordingLabel('Stopping and uploading...');
                    mediaRecorderRef.current.stop();
                  }
                }} className="px-3 py-2 text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg">Confirm</button>
              </div>
            </div>
          </div>
        )}

      </div>

      <Sidebar
        isOpen={state.isSidebarOpen}
        onClose={() => state.setIsSidebarOpen(false)}
        activeTab={state.activeTab}
        setActiveTab={state.setActiveTab}
        messages={state.messages}
        onSendMessage={(t, replyTo) => {
          const msg = { type: 'chat', text: t, timestamp: new Date(), id: Math.random().toString(), userName: user.name, replyTo };
          // E2EE Broadcast
          Object.values(rtc.dataChannelsRef.current).forEach(dc => dc.readyState === 'open' && dc.send(JSON.stringify(msg)));
          // Signaling Backup + Server Persistence
          signaling.send('chat', user.id, undefined, roomId, { text: t, timestamp: msg.timestamp, userName: user.name, id: msg.id, replyTo });

          state.setMessages(p => [...p, { id: msg.id, sender: user.id, userName: user.name, text: t, timestamp: msg.timestamp, replyTo }]);
          state.setUnreadCount(0); // Clear on send
        }}
        onSendFile={async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('roomId', roomId); // gắn roomId để server biết file thuộc phòng nào
          try {
            const token = getToken();
            const res = await fetch('/api/chat/upload', {
              method: 'POST',
              body: formData,
              headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (data.url) {
              const isImage = file.type.startsWith('image/');
              const msgId = Math.random().toString();
              const timestamp = new Date();
              const msg = {
                type: 'chat',
                fileUrl: data.url,
                fileName: data.fileName,
                fileSize: data.fileSize,
                isImage,
                timestamp,
                id: msgId,
                userName: user.name
              };

              // E2EE Broadcast
              Object.values(rtc.dataChannelsRef.current).forEach(dc => dc.readyState === 'open' && dc.send(JSON.stringify(msg)));
              // Signaling Backup + Server Persistence
              signaling.send('chat', user.id, undefined, roomId, { ...msg });

              state.setMessages(p => [...p, {
                id: msgId,
                sender: user.id,
                userName: user.name,
                text: "",
                timestamp,
                fileUrl: data.url,
                fileName: data.fileName,
                fileSize: data.fileSize,
                isImage
              }]);
              state.setUnreadCount(0);
            }
          } catch (e) {
            console.error("Upload error", e);
            state.showToast("Unable to upload file to server.", 'error');
          }
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
            state.showToast(`Failed to save settings to Server: ${e}`, 'error');
          }
        }}
        onApprove={() => { }} onReject={() => { }}
        roomId={roomId} currentUser={user} onShowToast={state.showToast}
        logs={state.logs}
        unreadLogsCount={state.unreadLogsCount}
        setUnreadLogsCount={state.setUnreadLogsCount}
        contentRefreshKey={contentRefreshKey}
      />

      <ConfirmModal isOpen={state.mediaRequestModal.isOpen} title="Request" message={state.mediaRequestModal.message} onConfirm={handleModalConfirm} onCancel={handleModalCancel} confirmText="Confirm" cancelText="Cancel" type="info" />
    </div>
  );
};

export default MeetingRoom;
