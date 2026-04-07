import React, { useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, RefreshCcw } from 'lucide-react';

interface MediaPreviewProps {
    stream: MediaStream | null;
    isMicOn: boolean;
    isCameraOn: boolean;
    toggleMic: () => void;
    toggleCamera: () => void;
    onReloadCamera: () => void;
    audioLevel: number;
    userName: string;
    userAvatar?: string;
}

const MediaPreview: React.FC<MediaPreviewProps> = ({
    stream,
    isMicOn,
    isCameraOn,
    toggleMic,
    toggleCamera,
    onReloadCamera,
    audioLevel,
    userName,
    userAvatar
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    // Handle re-play when camera is toggled back on
    useEffect(() => {
        if (isCameraOn && videoRef.current && stream) {
            videoRef.current.play().catch(e => {
                if (e.name !== 'AbortError') console.error("Play failed", e);
            });
        }
    }, [isCameraOn, stream]);

    return (
        <div className="flex-1 w-full max-w-xl">
            <div className="relative aspect-[3/4] md:aspect-video bg-slate-900 rounded-2xl overflow-hidden border-2 border-slate-800 shadow-2xl group flex flex-col">
                <div className="flex-1 relative overflow-hidden">
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className={`w-full h-full object-cover scale-x-[-1] ${!isCameraOn ? 'hidden' : ''}`}
                    />
                    {!isCameraOn && (
                        <div className="w-full h-full flex items-center justify-center bg-slate-800 absolute inset-0">
                            <div className="w-24 h-24 rounded-full bg-slate-700 flex items-center justify-center text-slate-500 text-2xl font-bold overflow-hidden border-4 border-slate-600">
                                {userAvatar ? (
                                    <img src={userAvatar} alt={userName} className="w-full h-full object-cover" />
                                ) : (
                                    <span>{userName.charAt(0).toUpperCase() || "U"}</span>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-xs text-slate-200">
                        Preview
                    </div>

                    <div className="absolute top-4 right-4 z-10">
                        <button
                            type="button"
                            onClick={onReloadCamera}
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
                            {/* Audio Visualizer Bar Removed */}
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
    );
};

export default MediaPreview;
