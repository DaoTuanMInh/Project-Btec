import React, { useState } from 'react';
import { User, MeetingSettings } from '../../types';
import MobileSetup from './MobileSetup';
import DesktopSetup from './DesktopSetup';
import { useToast } from '../ui/Toast';
import { useSetupMedia } from '../../hooks/useSetupMedia';

interface Props {
  onJoin: (user: User, roomId: string, stream?: MediaStream, settings?: MeetingSettings) => void;
  setupMedia: ReturnType<typeof useSetupMedia>;
}

const SetupScreen: React.FC<Props> = ({ onJoin, setupMedia }) => {
  const { showToast } = useToast();

  // 1. Media Logic (Received from App to persist state)
  const {
    previewStream, startCamera,
    isMicOn, toggleMic, isCameraOn, toggleCamera, audioLevel
  } = setupMedia;

  // 2. Form State
  const [name, setName] = useState("");
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
      onJoin({ id: Math.random().toString(36).substr(2, 9), name, isHost: true, muted: !isMicOn, videoOff: !isCameraOn }, room, previewStream || undefined, joinSettings);
    } else {
      try {
        const { signaling } = await import('../../services/signaling');
        const { exists, requiresPassword, valid, locked } = await signaling.checkRoom(room, joinPassword);
        console.log("🔍 Room Check Result:", { exists, requiresPassword, valid, locked, inputPass: joinPassword });

        if (!exists) return showToast("Phòng không tồn tại hoặc đã kết thúc.", 'error');
        if (locked) return showToast("🔒 Phòng đã bị khóa. Không thể tham gia.", 'error');
        if (requiresPassword && !valid) return showToast("Mật khẩu phòng không đúng.", 'error');

        let isRejoiningHost = false;
        try {
          const savedRooms = JSON.parse(localStorage.getItem('avo_created_rooms') || '[]');
          if (savedRooms.includes(room)) isRejoiningHost = true;
        } catch (e) { }

        const finalSettings: MeetingSettings = { ...joinSettings, password: joinPassword };
        onJoin({ id: Math.random().toString(36).substr(2, 9), name, isHost: isRejoiningHost, muted: !isMicOn, videoOff: !isCameraOn }, room, previewStream || undefined, finalSettings);

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
    audioLevel, userName: name
  };

  return (
    <div className="min-h-screen p-6 flex flex-col items-center justify-center max-w-6xl mx-auto">
      <div className="md:hidden w-full">
        <MobileSetup joinFormProps={joinFormProps} mediaPreviewProps={mediaPreviewProps} />
      </div>
      <div className="hidden md:flex w-full justify-center">
        <DesktopSetup joinFormProps={joinFormProps} mediaPreviewProps={mediaPreviewProps} />
      </div>
    </div>
  );
};

export default SetupScreen;
