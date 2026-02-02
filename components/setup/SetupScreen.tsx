import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, MeetingSettings } from '../../types';
import { Mic, MicOff, Video, VideoOff, RefreshCcw, Settings, Lock, Monitor, Speaker, Users, Plus } from 'lucide-react';
import MobileSetup from './MobileSetup';
import DesktopSetup from './DesktopSetup';
import { useToast } from '../ui/Toast';

interface Props {
  onJoin: (user: User, roomId: string, stream?: MediaStream, settings?: MeetingSettings) => void;
}

const SetupScreen: React.FC<Props> = ({ onJoin }) => {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [isCreateMode, setIsCreateMode] = useState(false);
  const { showToast } = useToast();
  const [joinSettings, setJoinSettings] = useState<MeetingSettings>({
    requireMic: false,
    requireCamera: false,
    allowScreenShare: true,
    waitingRoom: false,
    lockRoom: false,
    allowReactions: true,
    password: ''
  });
  const [joinPassword, setJoinPassword] = useState("");

  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);


  // Lock to prevent infinite restart loops
  const isStartingRef = useRef(false);
  // Ref to track intent, avoiding stale closures in event handlers
  const isCameraOnRef = useRef(isCameraOn);

  useEffect(() => {
    isCameraOnRef.current = isCameraOn;
  }, [isCameraOn]);

  // Audio Engine Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);


  // Initialize Audio Engine once
  useEffect(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      // Start Visualization Loop
      const updateLevel = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setAudioLevel(Math.min(100, average * 3));

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
      };
    } catch (e) {
      console.error("Failed to init audio engine", e);
    }
  }, []);

  const connectAudioSource = (stream: MediaStream) => {
    try {
      const audioCtx = audioContextRef.current;
      const analyser = analyserRef.current;
      if (!audioCtx || !analyser) return;

      // Resume if suspended (browser policy)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      // Cleanup old source
      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch (e) { }
      }

      // Create new source
      if (stream.getAudioTracks().length > 0) {
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        sourceRef.current = source;
      }
    } catch (e) {
      console.error("Failed to connect audio source", e);
    }
  };

  const startCamera = useCallback(async (manual = false) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
      }

      console.log("Requesting camera access...");
      // Always request new stream
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      setPreviewStream(stream);

      // Monitor track health
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        // Check for hardware mute immediately if manual action
        if (manual && videoTrack.muted) {
          showToast("Camera có thể đang bị tắt bằng phím cứng trên máy. Vui lòng kiểm tra lại!", 'warning');
        }

        videoTrack.onended = () => {
          console.warn("Video track ended (hardware switch?). Checking if should restart...");
          // Only restart if the user INTENDS for the camera to be ON
          if (isCameraOnRef.current && !isStartingRef.current) {
            console.log("Intent is ON, restarting...");
            startCamera(false);
          } else {
            console.log("Intent is OFF, ignoring track end.");
          }
        };
      }

      // Apply initial audio state
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMicOn;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch (err) {
          console.error("Auto-play failed:", err);
        }
      }
      setIsCameraOn(true); // Ensure UI reflects active state

      // Connect to persisted audio engine
      connectAudioSource(stream);

    } catch (e) {
      console.warn("Could not get preview stream:", e);
      if (manual) {
        showToast("Không thể bật Camera. Vui lòng kiểm tra quyền truy cập!", 'error');
      }
    } finally {
      // Add a small buffer/delay before releasing the lock to prevent rapid-fire restarts
      setTimeout(() => {
        isStartingRef.current = false;
      }, 1000);
    }
  }, [isMicOn, isCameraOn, previewStream]);

  // Initial load only
  useEffect(() => {
    startCamera(false);
  }, []);

  // Periodic health check
  useEffect(() => {
    const checkInterval = setInterval(() => {
      // Check intent via Ref to avoid stale closures
      if (isCameraOnRef.current && !isStartingRef.current) {
        const vTrack = previewStream?.getVideoTracks()[0];

        // Condition 1: No stream at all
        if (!previewStream || !previewStream.active) {
          console.log("Camera ON but stream inactive/missing. Restarting...");
          startCamera(false);
          return;
        }

        // Condition 2: No video track or track issues
        if (!vTrack || vTrack.readyState === 'ended' || vTrack.muted) {
          console.log("Camera ON but track ended/muted/missing. Restarting...");
          startCamera(false);
        }
      }
    }, 2000);

    return () => {
      clearInterval(checkInterval);
    };
  }, [startCamera, previewStream]); // Re-create interval if dependencies change, but don't auto-start

  const toggleMic = () => {
    if (previewStream) {
      const newStatus = !isMicOn;
      previewStream.getAudioTracks().forEach(track => {
        track.enabled = newStatus;
      });
      setIsMicOn(newStatus);

      if (newStatus && audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    }
  };

  const toggleCamera = async () => {
    if (!isCameraOn) {
      // Turning ON: Check if stream is dead
      const vTrack = previewStream?.getVideoTracks()[0];
      if (!previewStream || !vTrack || vTrack.readyState === 'ended' || vTrack.muted) {
        await startCamera(true);
        return;
      }
    }

    if (previewStream) {
      const newStatus = !isCameraOn;
      previewStream.getVideoTracks().forEach(track => {
        track.enabled = newStatus;
      });
      setIsCameraOn(newStatus);
    }
  };

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
      // Validate Creator Settings
      if (joinSettings.requireCamera && !isCameraOn) return showToast("Cài đặt phòng yêu cầu bật Camera.", 'warning');
      if (joinSettings.requireMic && !isMicOn) return showToast("Cài đặt phòng yêu cầu bật Mic.", 'warning');

      // Save as My Created Room
      try {
        const savedRooms = JSON.parse(localStorage.getItem('avo_created_rooms') || '[]');
        if (!savedRooms.includes(room)) {
          localStorage.setItem('avo_created_rooms', JSON.stringify([...savedRooms, room]));
        }
      } catch (e) {
        console.warn("Failed to save room to local storage");
      }

      // For Host: Proceed to create
      onJoin(
        { id: Math.random().toString(36).substr(2, 9), name, isHost: true },
        room,
        previewStream || undefined,
        joinSettings // Apply new settings
      );
    } else {
      // Join Mode: Validate Room Existence First
      try {
        const { exists, requiresPassword, valid } = await import('../../services/signaling').then(m => m.signaling.checkRoom(room, joinPassword));

        if (!exists) {
          showToast("Phòng không tồn tại hoặc đã kết thúc.", 'error');
          return;
        }

        if (requiresPassword && !valid) {
          showToast("Mật khẩu phòng không đúng. Vui lòng kiểm tra lại!", 'error');
          return;
        }

        // Check if I am the Creator (Rejoining) -> Claim Host Status
        let isRejoiningHost = false;
        try {
          const savedRooms = JSON.parse(localStorage.getItem('avo_created_rooms') || '[]');
          if (savedRooms.includes(room)) {
            console.log("Recognized as creator of this room. Rejoining as Host.");
            isRejoiningHost = true;
          }
        } catch (e) { }

        // In future iteration, we can enforce password check here if returned by server (requiresPassword),
        // but we already have waiting room to handle it. 
        // However, knowing it 'exists' prevents the problem of "Waiting forever for a ghost room".

        // Pass isHost=true if rejoining
        const finalSettings: MeetingSettings = { ...joinSettings, password: joinPassword };
        onJoin(
          { id: Math.random().toString(36).substr(2, 9), name, isHost: isRejoiningHost },
          room,
          previewStream || undefined,
          finalSettings
        );

      } catch (err) {
        console.error("Room check failed", err);
        showToast("Không thể kết nối đến máy chủ.", 'error');
      }
    }
  };

  // Prepare props objects
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
    isMicOn,
    isCameraOn,
    toggleMic,
    toggleCamera,
    onReloadCamera: () => startCamera(true),
    audioLevel,
    userName: name
  };

  return (
    <div className="min-h-screen p-6 flex flex-col items-center justify-center max-w-6xl mx-auto">
      {/* Mobile View */}
      <div className="md:hidden w-full">
        <MobileSetup joinFormProps={joinFormProps} mediaPreviewProps={mediaPreviewProps} />
      </div>

      {/* Desktop View */}
      <div className="hidden md:flex w-full justify-center">
        <DesktopSetup joinFormProps={joinFormProps} mediaPreviewProps={mediaPreviewProps} />
      </div>
    </div>
  );
};

export default SetupScreen;

