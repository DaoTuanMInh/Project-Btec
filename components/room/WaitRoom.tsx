import React, { useState, useEffect, useRef } from 'react';
import { User, MeetingSettings } from '../../types';
import { Mic, MicOff, Video, VideoOff, RefreshCcw, PhoneOff } from 'lucide-react';

interface Props {
    user: User;
    localStream: MediaStream;
    onExit: () => void;
    isMicOn: boolean;
    isCameraOn: boolean;
    onToggleMic: () => void;
    onToggleCamera: () => void;
}

const WaitRoom: React.FC<Props> = ({ user, localStream, onExit, isMicOn, isCameraOn, onToggleMic, onToggleCamera }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    // Audio Visualizer removed per user request

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
            <div className="max-w-md w-full bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-6 text-center">
                <div className="w-28 h-28 mx-auto mb-8 relative">
                    <img src="/logoAVO.png" alt="Logo" className="w-full h-full object-contain rounded-full shadow-xl animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Waiting for approval</h2>
                <p className="text-slate-400 mb-8">The host has received the request. Please wait a moment...</p>

                {/* Video Preview */}
                <div className="relative aspect-[3/4] md:aspect-video bg-black rounded-xl overflow-hidden mb-6 border border-slate-700">
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className={`w-full h-full object-cover scale-x-[-1] ${!isCameraOn ? 'hidden' : ''}`}
                    />
                    {!isCameraOn && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-slate-500 text-xl font-bold overflow-hidden border-4 border-slate-600">
                                {user.avatar ? (
                                    <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span>{user.name.charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                        </div>
                    )}
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white/70 uppercase font-bold tracking-wider">
                        Your Preview
                    </div>

                    {/* Controls Overlay */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/80 p-2 rounded-full border border-white/10 backdrop-blur-md">
                        <button onClick={onToggleMic} className={`p-3 rounded-full transition-all ${isMicOn ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-500 hover:bg-red-600'} text-white`}>
                            {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                        </button>
                        <button onClick={onToggleCamera} className={`p-3 rounded-full transition-all ${isCameraOn ? 'bg-slate-700 hover:bg-slate-600' : 'bg-red-500 hover:bg-red-600'} text-white`}>
                            {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
                        </button>
                        <div className="w-px h-6 bg-white/20 mx-1"></div>
                        <button onClick={onExit} className="p-3 rounded-full bg-red-600 hover:bg-red-500 text-white transition-all shadow-lg shadow-red-500/20" title="Rời khỏi">
                            <PhoneOff size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                        <span>Keeping connection alive...</span>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => {
                                window.location.reload();
                            }}
                            className="text-xs text-slate-500 hover:text-white underline"
                        >
                            Resend request (Refresh)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WaitRoom;
