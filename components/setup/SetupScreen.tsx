import React, { useState } from 'react';
import { User, MeetingSettings } from '../../types';
import MobileSetup from './MobileSetup';
import DesktopSetup from './DesktopSetup';
import { useToast } from '../ui/Toast';
import { useSetupMedia } from '../../hooks/useSetupMedia';
import { LogOut, User as UserIcon, CalendarPlus } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import ProfileModal from '../profile/ProfileModal';
import ScheduleModal from '../schedule/ScheduleModal';

interface Props {
  onJoin: (user: User, roomId: string, stream?: MediaStream, settings?: MeetingSettings) => void;
  setupMedia: ReturnType<typeof useSetupMedia>;
  initialName?: string;
  userId?: string;
  onLogout?: () => void;
  onUpdateUser?: (user: any) => void;

  resumeRoomId?: string | null; // New prop
  onClearResume?: () => void;   // Callback to clear persistence
  user?: any; // Full auth user object
}

const SetupScreen: React.FC<Props> = ({ onJoin, setupMedia, initialName = "", userId, onLogout, onUpdateUser, resumeRoomId, onClearResume, user }) => {
  const { showToast } = useToast();
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isScheduleOpen, setScheduleOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(user || {});

  // Sync prop user to state
  React.useEffect(() => { if (user) setCurrentUser(user); }, [user]);


  // 1. Media Logic (Received from App to persist state)
  const {
    previewStream, startCamera,
    isMicOn, toggleMic, isCameraOn, toggleCamera, audioLevel
  } = setupMedia;

  // 2. Form State
  const [name, setName] = useState(initialName);
  const [room, setRoom] = useState("");
  const [mode, setMode] = useState<'join' | 'create' | 'schedule'>('join');
  const [joinPassword, setJoinPassword] = useState("");

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    const urlPwd = params.get('pwd');
    if (urlRoom) {
      setRoom(urlRoom);
      setMode('join');
      if (urlPwd) {
        setJoinPassword(urlPwd);
      }
    }
  }, []);
  const [joinSettings, setJoinSettings] = useState<MeetingSettings>({
    requireMic: false,
    requireCamera: false,
    allowScreenShare: true,
    waitingRoom: false,
    lockRoom: false,
    allowReactions: true,
    autoCloseWhenEmpty: true,
    password: ''
  });

  // Resume Logic
  const handleResume = async () => {
    if (!resumeRoomId) return;
    try {
      const { signaling } = await import('../../services/signaling');
      // Check Room Status (and Host)
      const { exists, requiresPassword, valid, locked, isHost } = await signaling.checkRoom(resumeRoomId, undefined, userId);

      if (!exists) {
        showToast("Meeting has ended.", 'error');
        if (onClearResume) onClearResume();
        return;
      }

      // Auto-fill and submit
      setRoom(resumeRoomId);
      onJoin({ id: userId || 'me', name: name || 'User', isHost: !!isHost, avatar: currentUser?.avatar }, resumeRoomId, previewStream || undefined, { ...joinSettings, password: '' });

    } catch (e) { console.error("Resume Error", e); }
  };

  const handleClearResume = async () => {
    // Send LEAVE signal to clear server persistence
    try {
      const { signaling } = await import('../../services/signaling');
      if (resumeRoomId) signaling.send('leave', userId || 'me', undefined, resumeRoomId, {});
    } catch (e) { }

    if (onClearResume) onClearResume();
  };

  // NOTE: Initialization logic removed as it is now handled in App.tsx via useSetupMedia hook.


  // NOTE: Initialization logic removed as it is now handled in App.tsx via useSetupMedia hook.
  // This prevents the camera from restarting when SetupScreen remounts (e.g. keyboard open, resize).

  const executeJoin = async (targetRoom: string) => {
    if (!name) return showToast("Please fill in your display name.", 'warning');
    if (!targetRoom) return;

    try {
      const { signaling } = await import('../../services/signaling');
      // Check room with userId to detect if Host
      const { exists, requiresPassword, valid, locked, isHost, isEmpty, isScheduledWaiting, scheduledSettings } = await signaling.checkRoom(targetRoom, joinPassword, userId);
      console.log("Room Check Result:", { exists, requiresPassword, valid, locked, isHost, isEmpty, isScheduledWaiting, inputPass: joinPassword });

      if (isScheduledWaiting) return showToast("This scheduled meeting has not been started by the Host.", 'warning');
      if (!exists) return showToast("Room does not exist or has ended.", 'error');
      if (locked) return showToast("🔒 Room is locked. Cannot join.", 'error');
      if (requiresPassword && !valid) return showToast("Incorrect room password.", 'error');

      let isRejoiningHost = isHost || false;

      // Fallback for Legacy/Guest (local storage check)
      if (!isRejoiningHost) {
        try {
          const savedRooms = JSON.parse(localStorage.getItem('avo_created_rooms') || '[]');
          if (savedRooms.includes(targetRoom)) isRejoiningHost = true;
        } catch (e) { }
      }

      let finalSettings: MeetingSettings = { ...joinSettings, password: joinPassword };
      if (scheduledSettings && isRejoiningHost && isEmpty) {
        // If host is starting a scheduled room, override default join settings with scheduled settings
        finalSettings = { ...scheduledSettings, password: joinPassword };
      }

      onJoin({
        id: userId || Math.random().toString(36).substr(2, 9),
        name,
        isHost: isRejoiningHost,
        muted: !isMicOn,
        videoOff: !isCameraOn,
        avatar: currentUser?.avatar
      }, targetRoom, previewStream || undefined, finalSettings);

    } catch (err) {
      console.error("Room check failed", err);
      showToast("Cannot connect to server.", 'error');
    }
  };

  // Form Handlers
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Check Hardware Intent
    if (isCameraOn) {
      const videoTrack = previewStream?.getVideoTracks()[0];
      if (!previewStream || !videoTrack || videoTrack.readyState === 'ended' || videoTrack.muted) {
        showToast("Camera is disabled or blocked. Check hardware flip!", 'error');
        return;
      }
    }

    if (!name || !room) return;

    if (mode === 'create') {
      if (joinSettings.requireCamera && !isCameraOn) return showToast("Room settings require Camera enabled.", 'warning');
      if (joinSettings.requireMic && !isMicOn) return showToast("Room settings require Mic enabled.", 'warning');

      try {
        const savedRooms = JSON.parse(localStorage.getItem('avo_created_rooms') || '[]');
        if (!savedRooms.includes(room)) localStorage.setItem('avo_created_rooms', JSON.stringify([...savedRooms, room]));
      } catch (e) { }
      onJoin({ id: userId || Math.random().toString(36).substr(2, 9), name, isHost: true, muted: !isMicOn, videoOff: !isCameraOn, avatar: currentUser?.avatar }, room, previewStream || undefined, joinSettings);
    } else if (mode === 'join') {
      executeJoin(room);
    }
  };

  const handleDirectJoin = (targetRoomId: string) => {
    setScheduleOpen(false);
    setRoom(targetRoomId);
    setMode('join');
    // Give state a moment to settle, then join
    setTimeout(() => {
      executeJoin(targetRoomId);
    }, 100);
  };

  const joinFormProps = {
    name, setName,
    room, setRoom,
    mode, setMode,
    joinSettings, setJoinSettings,
    joinPassword, setJoinPassword,
    onSubmit: handleSubmit,
    onShowToast: showToast,
    currentUser // Pass currentUser for email scheduling
  };

  const mediaPreviewProps = {
    stream: previewStream,
    isMicOn, isCameraOn,
    toggleMic, toggleCamera,
    onReloadCamera: () => startCamera(true),
    audioLevel, userName: name,
    userAvatar: currentUser?.avatar
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Mobile Layout */}
      <div className="md:hidden w-full p-6 flex flex-col items-center justify-center min-h-screen">
        {/* Mobile top controls */}
        <div className="fixed top-4 right-4 flex gap-2 z-50">
          {user && (
            <>
              <button onClick={() => setScheduleOpen(true)} className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-indigo-400 border border-slate-700" title="Schedule">
                <CalendarPlus size={18} />
              </button>
              <button onClick={() => setProfileOpen(true)} className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                {currentUser.avatar ? <img src={currentUser.avatar} className="w-full h-full object-cover" /> : <UserIcon size={18} className="text-slate-400" />}
              </button>
            </>
          )}
          {onLogout && (
            <button onClick={onLogout} className="p-2.5 bg-red-600/20 text-red-400 rounded-full border border-red-900/50">
              <LogOut size={18} />
            </button>
          )}
        </div>
        <MobileSetup joinFormProps={joinFormProps} mediaPreviewProps={mediaPreviewProps} />
      </div>

      {/* Desktop Layout */}
      <div className="hidden md:flex w-full h-screen">
        <DesktopSetup
          joinFormProps={joinFormProps}
          mediaPreviewProps={mediaPreviewProps}
          user={currentUser}
          onOpenProfile={() => setProfileOpen(true)}
          onOpenSchedule={() => setScheduleOpen(true)}
          onLogout={onLogout}
        />
      </div>

      {/* Modals */}
      <ScheduleModal
        isOpen={isScheduleOpen}
        onClose={() => setScheduleOpen(false)}
        user={currentUser}
        onDirectJoin={handleDirectJoin}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setProfileOpen(false)}
        user={currentUser}
        onUpdateUser={(u) => {
          setCurrentUser(u);
          if (onUpdateUser) onUpdateUser(u);
        }}
      />

      <ConfirmModal
        isOpen={!!resumeRoomId}
        title="Detected active session"
        message={`You are in room ${resumeRoomId}. Do you want to return?`}
        confirmText="Return to Room"
        cancelText="No, Close"
        onConfirm={handleResume}
        onCancel={handleClearResume}
        type="info"
      />
    </div>
  );
};

export default SetupScreen;
