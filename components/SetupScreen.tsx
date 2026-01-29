import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, MeetingSettings } from '../types';
import { Mic, MicOff, Video, VideoOff, RefreshCcw, Settings, Lock, Monitor, Speaker, Users, Plus } from 'lucide-react';

interface Props {
  onJoin: (user: User, roomId: string, stream?: MediaStream, settings?: MeetingSettings) => void;
}

const SetupScreen: React.FC<Props> = ({ onJoin }) => {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [joinSettings, setJoinSettings] = useState<MeetingSettings>({
    requireMic: false,
    requireCamera: false,
    allowScreenShare: true,
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
          alert("Camera có thể đang bị tắt bằng phím cứng trên máy. Vui lòng bật lại hoặc thử ấn Refresh!");
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
        alert("Không thể bật Camera. Vui lòng kiểm tra phím cứng trên máy hoặc quyền truy cập, sau đó ấn Refresh.");
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
        alert("Camera seems to be disabled or blocked. Please check your physical camera switch (Fn keys) or permissions.");
        return;
      }
    }

    if (!name || !room) return;

    if (isCreateMode) {
      // Validate Creator Settings
      if (joinSettings.requireCamera && !isCameraOn) return alert("Cài đặt phòng yêu cầu bật Camera.");
      if (joinSettings.requireMic && !isMicOn) return alert("Cài đặt phòng yêu cầu bật Mic.");

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
        const { exists, requiresPassword } = await import('../services/signaling').then(m => m.signaling.checkRoom(room));

        if (!exists) {
          alert("Phòng không tồn tại hoặc đã kết thúc. Vui lòng kiểm tra lại mã phòng.");
          return;
        }

        // In future iteration, we can enforce password check here if returned by server (requiresPassword),
        // but we already have waiting room to handle it. 
        // However, knowing it 'exists' prevents the problem of "Waiting forever for a ghost room".

        const finalSettings: MeetingSettings = { ...joinSettings, password: joinPassword };
        onJoin(
          { id: Math.random().toString(36).substr(2, 9), name, isHost: false },
          room,
          previewStream || undefined,
          finalSettings
        );

      } catch (err) {
        console.error("Room check failed", err);
        alert("Không thể kết nối đến máy chủ.");
      }
    }
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-center min-h-screen p-6 gap-12 max-w-6xl mx-auto">
      <div className="flex-1 w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-5xl font-extrabold mb-2 bg-gradient-to-r from-blue-400 to-indigo-600 bg-clip-text text-transparent">AVO</h1>
          <p className="text-slate-400 text-lg">Secure, high-performance video meetings with end-to-end encryption.</p>
        </div>

        <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm max-h-[60vh] overflow-y-auto custom-scrollbar">
          {/* Tabs */}
          <div className="flex mb-6 bg-slate-800/50 p-1 rounded-xl">
            <button
              onClick={() => setIsCreateMode(false)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${!isCreateMode ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Tham Gia
            </button>
            <button
              onClick={() => {
                setIsCreateMode(true);
                if (!room) setRoom(Math.random().toString(36).substring(2, 9)); // Auto generate room ID
              }}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${isCreateMode ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              Tạo Phòng Mới
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Tên của bạn</label>
              <input
                required
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="e.g. John Doe"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">{isCreateMode ? "Mã Phòng (Tự động)" : "Nhập Mã Phòng"}</label>
              <div className="relative">
                <input
                  required
                  type="text"
                  value={room}
                  onChange={e => setRoom(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all pr-10"
                  placeholder="e.g. general-sync"
                  readOnly={isCreateMode} // Make read-only if generating
                />
                {isCreateMode && (
                  <button
                    type="button"
                    onClick={() => setRoom(Math.random().toString(36).substring(2, 9))}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                    title="Generate New Code"
                  >
                    <RefreshCcw size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Password input for JOIN mode */}
            {!isCreateMode && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Mật khẩu phòng (Nếu có)</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
                  <input
                    type="password"
                    value={joinPassword}
                    onChange={e => setJoinPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="Nhập mật khẩu..."
                  />
                </div>
              </div>
            )}

            {isCreateMode && (
              <div className="space-y-3 pt-2 border-t border-slate-700/50 mt-4 animate-in slide-in-from-top-2 fade-in duration-300">
                <p className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                  <Settings size={14} /> Cài đặt phòng
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Mật khẩu phòng (Tùy chọn)</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
                    <input
                      type="password"
                      value={joinSettings.password || ''}
                      onChange={e => setJoinSettings({ ...joinSettings, password: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="Để trống nếu không cần mật khẩu"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={joinSettings.allowScreenShare}
                      onChange={e => setJoinSettings({ ...joinSettings, allowScreenShare: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                    />
                    <div className="text-xs">
                      <span className="block font-medium text-slate-300">Share Screen</span>
                      <span className="text-slate-500">Cho phép chia sẻ</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={joinSettings.requireMic}
                      onChange={e => setJoinSettings({ ...joinSettings, requireMic: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                    />
                    <div className="text-xs">
                      <span className="block font-medium text-slate-300">Bắt buộc Mic</span>
                      <span className="text-slate-500">Phải bật Mic</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={joinSettings.requireCamera}
                      onChange={e => setJoinSettings({ ...joinSettings, requireCamera: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                    />
                    <div className="text-xs">
                      <span className="block font-medium text-slate-300">Bắt buộc Cam</span>
                      <span className="text-slate-500">Phải bật Camera</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2"
            >
              {isCreateMode ? <Plus size={20} /> : null}
              {isCreateMode ? "Tạo Phòng Ngay" : "Tham Gia Ngay"}
            </button>
          </form>
        </div>
      </div>

      <div className="flex-1 w-full max-w-xl">
        <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden border-2 border-slate-800 shadow-2xl group flex flex-col">
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              // Added scale-x-[-1] to mirror the video
              className={`w-full h-full object-cover scale-x-[-1] ${!isCameraOn ? 'hidden' : ''}`}
            />
            {!isCameraOn && (
              <div className="w-full h-full flex items-center justify-center bg-slate-800 absolute inset-0">
                <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center text-slate-500 text-2xl font-bold">
                  {name.charAt(0).toUpperCase() || "U"}
                </div>
              </div>
            )}

            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs text-slate-200">
              Preview
            </div>

            <div className="absolute top-4 right-4 z-10">
              <button
                type="button"
                onClick={() => startCamera(true)}
                className="p-2.5 rounded-full bg-slate-900/60 hover:bg-slate-800 text-white backdrop-blur-md transition-all border border-white/10"
                title="Reload Camera"
              >
                <RefreshCcw size={16} />
              </button>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="h-16 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 border-t border-white/5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`p-2.5 rounded-full transition-all ${isMicOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
                >
                  {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                {/* Audio Visualizer Bar */}
                <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${audioLevel > 60 ? 'bg-yellow-400' : 'bg-green-500'}`}
                    style={{ width: `${isMicOn ? audioLevel : 0}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={toggleCamera}
                className={`p-2.5 rounded-full transition-all ${isCameraOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
              >
                {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
              </button>
            </div>

            <div className="text-xs text-slate-500 font-mono">
              {isCameraOn ? "CAMERA ON" : "CAMERA OFF"}
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-slate-500 text-sm">
          Check your audio and video before joining
        </p>
      </div>
    </div>
  );
};

export default SetupScreen;

