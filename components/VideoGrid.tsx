
import React, { useRef, useEffect } from 'react';
import { PeerStream } from '../types';
import { MicOff } from 'lucide-react';

interface VideoTileProps {
  peer: PeerStream;
  isBlurred?: boolean;
}

const VideoTile: React.FC<VideoTileProps> = ({ peer, isBlurred }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      console.log(`[VideoTile] Assigning stream ${peer.stream.id} to ${peer.userName}`);
      videoRef.current.srcObject = peer.stream;
      // Check if stream is active
      if (!peer.stream.active) {
        console.warn("Stream is inactive!");
      }
      // Force play
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Auto-play failed:", error);
          // Handle auto-play policies or interruption
        });
      }
    }
  }, [peer.stream, peer.videoOff]); // Add videoOff dependency to ensure re-check on toggle

  return (
    <div className={`relative group bg-black rounded-xl overflow-hidden shadow-lg border ${peer.isLocal ? 'border-slate-700' : 'border-slate-800'} flex items-center justify-center aspect-video`}>
      {peer.videoOff ? (
        <div className="flex flex-col items-center justify-center space-y-3 bg-slate-900 w-full h-full">
          <div className="w-20 h-20 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center text-2xl font-bold text-slate-400">
            {peer.userName.charAt(0).toUpperCase()}
          </div>
          <span className="text-slate-500 text-xs font-medium uppercase tracking-widest">Camera Off</span>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={peer.isLocal} // Always mute local video to prevent echo
          className={`w-full h-full object-cover transition-all duration-500 ${peer.isLocal ? 'scale-x-[-1]' : ''} ${isBlurred && peer.isLocal ? 'blur-xl scale-110' : ''}`}
        />
      )}

      {/* Name Tag & Status Icons */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 shadow-sm">
        <div className={`w-2 h-2 rounded-full ${peer.muted ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></div>
        <span className="text-xs font-bold text-white max-w-[120px] truncate shadow-black drop-shadow-md">
          {peer.userName} {peer.isLocal && "(You)"}
        </span>

        {/* Explicit Mute Icon */}
        {peer.muted && (
          <div className="ml-1 pl-2 border-l border-white/20 text-red-400 flex items-center gap-1">
            <MicOff size={12} />
            <span className="text-[10px] uppercase font-bold tracking-wider">Muted</span>
          </div>
        )}
      </div>

      {isBlurred && peer.isLocal && !peer.videoOff && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-emerald-500/20 backdrop-blur-md px-4 py-2 rounded-full border border-emerald-500/30">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-tighter">Privacy Blur Active</span>
          </div>
        </div>
      )}
    </div>
  );
};

interface VideoGridProps {
  peers: PeerStream[];
  isLocalBlurred: boolean;
}

const VideoGrid: React.FC<VideoGridProps> = ({ peers, isLocalBlurred }) => {
  return (
    <div className="flex-1 p-6 overflow-y-auto w-full h-full">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max max-w-7xl mx-auto">
        {peers.map(peer => (
          <VideoTile key={peer.userId} peer={peer} isBlurred={isLocalBlurred} />
        ))}
        {peers.length === 0 && (
          <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-600 space-y-4">
            <div className="w-16 h-16 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
            <p className="italic text-sm">Waiting for secure connections...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoGrid;
