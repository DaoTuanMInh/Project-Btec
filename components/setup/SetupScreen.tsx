import React, { useState } from 'react';
import { User, MeetingSettings } from '../../types';
import MobileSetup from './MobileSetup';
import DesktopSetup from './DesktopSetup';
import { useToast } from '../ui/Toast';
import { useSetupMedia } from '../../hooks/useSetupMedia';
import { LogOut, User as UserIcon } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import ProfileModal from '../profile/ProfileModal';

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
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [joinPassword, setJoinPassword] = useState("");
  const [joinSettings, setJoinSettings] = useState<MeetingSettings>({
    requireMic: false,
    requireCamera: false,
    allowScreenShare: true,
    waitingRoom: false,
    lockRoom: false,
    allowReactions: true,
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
        showToast("Phòng họp đã kết thúc.", 'error');
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

  // Form Handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check Hardware Intent
    if (isCameraOn) {
      const videoTrack = previewStream?.getVideoTracks()[0];
      if (!previewStream || !videoTrack || videoTrack.readyState === 'ended' || videoTrack.muted) {
        showToast("Camera bị vô hiệu hóa hoặc bị chặn. Kiểm tra phím cứng!", 'error');
        return;
      }
    }

    if (!name || !room) return;

    if (isCreateMode) {
      if (joinSettings.requireCamera && !isCameraOn) return showToast("Cài đặt phòng yêu cầu bật Camera.", 'warning');
      if (joinSettings.requireMic && !isMicOn) return showToast("Cài đặt phòng yêu cầu bật Mic.", 'warning');

      try {
        const savedRooms = JSON.parse(localStorage.getItem('avo_created_rooms') || '[]');
        if (!savedRooms.includes(room)) localStorage.setItem('avo_created_rooms', JSON.stringify([...savedRooms, room]));
      } catch (e) { }
      onJoin({ id: userId || Math.random().toString(36).substr(2, 9), name, isHost: true, muted: !isMicOn, videoOff: !isCameraOn, avatar: currentUser?.avatar }, room, previewStream || undefined, joinSettings);
    } else {
      try {
        const { signaling } = await import('../../services/signaling');
        // Check room with userId to detect if Host
        const { exists, requiresPassword, valid, locked, isHost } = await signaling.checkRoom(room, joinPassword, userId);
        console.log("🔍 Room Check Result:", { exists, requiresPassword, valid, locked, isHost, inputPass: joinPassword });

        if (!exists) return showToast("Phòng không tồn tại hoặc đã kết thúc.", 'error');
        if (locked) return showToast("🔒 Phòng đã bị khóa. Không thể tham gia.", 'error');
        if (requiresPassword && !valid) return showToast("Mật khẩu phòng không đúng.", 'error');

        let isRejoiningHost = isHost || false;

        // Fallback for Legacy/Guest (local storage check)
        if (!isRejoiningHost) {
          try {
            const savedRooms = JSON.parse(localStorage.getItem('avo_created_rooms') || '[]');
            if (savedRooms.includes(room)) isRejoiningHost = true;
          } catch (e) { }
        }

        const finalSettings: MeetingSettings = { ...joinSettings, password: joinPassword };
        onJoin({
          id: userId || Math.random().toString(36).substr(2, 9),
          name,
          isHost: isRejoiningHost,
          muted: !isMicOn,
          videoOff: !isCameraOn,
          avatar: currentUser?.avatar
        }, room, previewStream || undefined, finalSettings);

      } catch (err) {
        console.error("Room check failed", err);
        showToast("Không thể kết nối đến máy chủ.", 'error');
      }
    }
  };

  const joinFormProps = {
    name, setName,
    room, setRoom,
    isCreateMode, setIsCreateMode,
    joinSettings, setJoinSettings,
    joinPassword, setJoinPassword,
    onSubmit: handleSubmit,
    onShowToast: showToast
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
    <div className="min-h-screen p-6 flex flex-col items-center justify-center max-w-6xl mx-auto">
      <div className="md:hidden w-full">
        <MobileSetup joinFormProps={joinFormProps} mediaPreviewProps={mediaPreviewProps} />
      </div>
      <div className="hidden md:flex w-full justify-center">
        <DesktopSetup joinFormProps={joinFormProps} mediaPreviewProps={mediaPreviewProps} />
      </div>

      {/* Top Right Controls */}
      <div className="fixed top-4 right-4 flex gap-3 z-50">
        {user && (
          <button
            onClick={() => setProfileOpen(true)}
            className="w-11 h-11 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors overflow-hidden border border-slate-700"
            title="Hồ sơ cá nhân"
          >
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={20} />
            )}
          </button>
        )}
        {onLogout && (
          <button
            onClick={onLogout}
            className="p-3 bg-red-600/20 text-red-400 hover:bg-red-600/30 hover:text-red-300 rounded-full transition-all border border-red-900/50 backdrop-blur-sm cursor-pointer"
            title="Đăng xuất"
          >
            <LogOut size={20} />
          </button>
        )}
      </div>

      {/* Modals */}
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
        title="Phát hiện phiên họp chưa kết thúc"
        message={`Bạn đang ở trong phòng ${resumeRoomId}. Bạn có muốn quay lại không?`}
        confirmText="Quay lại phòng"
        cancelText="Không, kết thúc"
        onConfirm={handleResume}
        onCancel={handleClearResume}
        type="info"
      />
    </div>
  );
};

export default SetupScreen;
