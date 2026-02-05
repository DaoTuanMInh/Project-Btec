
import React, { useRef, useEffect, useState } from 'react';
import { PeerStream } from '../../types';
import { MicOff, Pin, PinOff, LayoutList, Maximize } from 'lucide-react';

interface VideoTileProps {
  peer: PeerStream;
  isBlurred?: boolean;
  isPinned?: boolean;
  onPin?: (id: string) => void;
  className?: string; // Allow overriding styles
}

const VideoTile: React.FC<VideoTileProps> = ({ peer, isBlurred, isPinned, onPin, className }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
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
        });
      }
    }
  }, [peer.stream, peer.videoOff]);

  return (
    <div className={`relative group bg-black rounded-xl overflow-hidden shadow-lg border ${peer.isLocal ? 'border-slate-700' : 'border-slate-800'} flex items-center justify-center ${className || 'aspect-video'}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={peer.isLocal}
        className={`w-full h-full ${isPinned ? 'object-contain' : 'object-cover'} transition-all duration-500 ${!peer.isScreenShare ? 'scale-x-[-1]' : ''} ${isBlurred && peer.isLocal ? 'blur-xl scale-110' : ''} ${peer.videoOff ? 'hidden' : 'block'}`}
      />

      {/* Overlay Placeholder when Video is Off */}
      {peer.videoOff && (
        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-slate-900 w-full h-full z-10">
          <div className="w-20 h-20 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center text-2xl font-bold text-slate-400">
            {peer.userName.charAt(0).toUpperCase()}
          </div>
          <span className="text-slate-500 text-xs font-medium uppercase tracking-widest">Camera Off</span>
        </div>
      )}

      {/* Pin Button */}
      {onPin && (
        <button
          onClick={(e) => { e.stopPropagation(); onPin(peer.userId); }}
          className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 p-2.5 rounded-full text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20 backdrop-blur-sm"
          title={isPinned ? "Unpin" : "Pin video"}
        >
          {isPinned ? <PinOff size={18} /> : <Pin size={18} />}
        </button>
      )}

      {/* Name Tag & Status Icons */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 shadow-sm z-10">
        <div className={`w-2 h-2 rounded-full ${peer.muted ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`}></div>
        <span className="text-xs font-bold text-white max-w-[120px] truncate shadow-black drop-shadow-md flex items-center gap-2">
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
  onToggleFullScreen?: () => void;
}

const VideoGrid: React.FC<VideoGridProps> = ({ peers, isLocalBlurred, onToggleFullScreen }) => {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [isStripVisible, setIsStripVisible] = useState(true);

  const pinnedPeer = pinnedId ? peers.find(p => p.userId === pinnedId) : null;

  if (pinnedId && !pinnedPeer) {
    // Cleanup handled by render
  }

  const togglePin = (id: string) => {
    if (pinnedId === id) setPinnedId(null);
    else setPinnedId(id);
  };

  if (pinnedPeer) {
    const otherPeers = peers.filter(p => p.userId !== pinnedId);

    return (
      <div className="flex-1 p-0 md:p-4 w-full h-full flex flex-col md:flex-row gap-0 md:gap-4 overflow-y-auto md:overflow-hidden transition-all custom-scrollbar">
        {/* Main Stage - Pinned Video */}
        <div className="w-full h-[55vh] md:h-auto md:flex-1 relative bg-slate-900/50 md:rounded-2xl overflow-hidden shadow-2xl border-b md:border border-white/5 group/stage shrink-0 sticky top-0 z-10">
          <VideoTile
            peer={pinnedPeer}
            isBlurred={isLocalBlurred}
            isPinned={true}
            onPin={togglePin}
            className="w-full h-full"
          />

          {/* Fullscreen Button */}
          {onToggleFullScreen && (
            <button
              onClick={onToggleFullScreen}
              className="absolute top-3 right-14 z-30 p-2.5 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-md transition-all border border-white/10"
              title="Full Screen"
            >
              <Maximize size={20} />
            </button>
          )}

          {/* Layout Toggle - Mobile Friendly Position */}
          {otherPeers.length > 0 && (
            <button
              onClick={() => setIsStripVisible(!isStripVisible)}
              className="absolute top-3 left-3 z-30 p-2.5 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-md transition-all border border-white/10"
              title={isStripVisible ? "Hide participants" : "Show participants"}
            >
              <LayoutList size={20} className={isStripVisible ? "text-blue-400" : "text-white"} />
            </button>
          )}
        </div>

        {/* Film Strip - Grid on Mobile, Column on Desktop */}
        {isStripVisible && otherPeers.length > 0 && (
          <div className="
            w-full md:w-72 
            h-auto md:h-full 
            grid grid-cols-4 md:flex md:flex-col gap-1 md:gap-4
            p-1 md:p-0
            pb-32 md:pb-0
            overflow-visible md:overflow-y-auto 
            md:custom-scrollbar
            shrink-0
            animate-in slide-in-from-bottom md:slide-in-from-right duration-300
            bg-black/40 md:bg-transparent
          ">
            {otherPeers.map(peer => (
              <div key={peer.userId} className="aspect-video md:aspect-auto md:h-40 md:min-h-[160px] cursor-pointer" onClick={() => togglePin(peer.userId)}>
                <VideoTile
                  peer={peer}
                  isBlurred={isLocalBlurred}
                  isPinned={false}
                  onPin={togglePin}
                  className="w-full h-full object-cover rounded md:rounded-xl border border-white/10"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 pb-32 overflow-y-auto w-full h-full custom-scrollbar">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max max-w-7xl mx-auto">
        {peers.map(peer => (
          <VideoTile
            key={peer.userId}
            peer={peer}
            isBlurred={isLocalBlurred}
            onPin={togglePin}
          />
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
