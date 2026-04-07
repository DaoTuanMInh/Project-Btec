
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
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      if (videoRef.current.srcObject !== peer.stream) {
        videoRef.current.srcObject = peer.stream;
        console.log("Stream attached for peer:", peer.userName);
      }
    } else {
      if (videoRef.current && videoRef.current.srcObject !== null) {
        videoRef.current.srcObject = null;
      }
    }
  }, [peer.stream, peer.isScreenShare]);

  // Audio Detection for Speaking Effect
  useEffect(() => {
    if (!peer.stream || peer.muted || peer.stream.getAudioTracks().length === 0) {
      setIsSpeaking(false);
      return;
    }

    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    let intervalId: NodeJS.Timeout;

    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source = audioContext.createMediaStreamSource(peer.stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let lastSpeakingState = false;

      const checkAudio = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;

        // Threshold for speaking
        const isCurrentlySpeaking = average > 15;
        
        if (isCurrentlySpeaking !== lastSpeakingState) {
            setIsSpeaking(isCurrentlySpeaking);
            lastSpeakingState = isCurrentlySpeaking;
        }
      };

      // Run checking every 150ms instead of 60FPS to drastically save CPU
      intervalId = setInterval(checkAudio, 150);
    } catch (e) {
      console.error("Audio analysis failed", e);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (source) source.disconnect();
      if (audioContext) audioContext.close();
    };
  }, [peer.stream, peer.muted]);

  // Check if we should show the avatar placeholder
  const shouldShowAvatar = (peer.videoOff && !peer.isScreenShare) || !peer.stream;

  return (
    <div className={`relative group bg-black rounded-xl overflow-hidden shadow-lg border ${peer.isLocal ? 'border-slate-700' : 'border-slate-800'} transition-all duration-300 ${isSpeaking && shouldShowAvatar ? 'ring-2 ring-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.2)]' : ''} flex items-center justify-center ${className || 'aspect-video'}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={peer.isLocal}
        onLoadedMetadata={() => {
          videoRef.current?.play().catch(e => console.warn(e));
        }}
        className={`w-full h-full ${isPinned ? 'object-contain' : 'object-cover'} transition-all duration-500 ${!peer.isScreenShare ? 'scale-x-[-1]' : ''} ${isBlurred && peer.isLocal ? 'blur-xl scale-110' : ''} ${shouldShowAvatar ? 'hidden' : 'block'}`}
      />

      {/* Overlay Placeholder when Video is Off or Not Ready */}
      {shouldShowAvatar && (
        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-slate-900 w-full h-full z-10">
          <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${isSpeaking ? 'scale-110' : 'scale-100'}`}>
            {/* Pulsing Rings when Speaking */}
            {isSpeaking && (
              <>
                <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping opacity-75"></div>
                <div className="absolute -inset-2 rounded-full border border-blue-500/30 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"></div>
              </>
            )}

            <div className={`w-full h-full rounded-full bg-slate-800 border-2 flex items-center justify-center text-2xl font-bold text-slate-400 overflow-hidden z-10 relative transition-colors duration-300 ${isSpeaking ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-white/5'}`}>
              {peer.avatar ? (
                <img src={peer.avatar} alt={peer.userName} className="w-full h-full object-cover" />
              ) : (
                <span>{peer.userName.charAt(0).toUpperCase()}</span>
              )}
            </div>
          </div>

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
      <div className={`absolute bottom-2 left-2 flex items-center gap-1.5 backdrop-blur-md px-2 py-1 rounded-lg border shadow-sm z-10 max-w-[80%] transition-colors duration-300 ${isSpeaking ? 'bg-blue-600/60 border-blue-500/50' : 'bg-black/60 border-white/10'}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${peer.muted ? 'bg-red-500' : isSpeaking ? 'bg-blue-400 animate-pulse' : 'bg-emerald-500 animate-pulse'}`}></div>
        <span className="text-[10px] md:text-xs font-bold text-white truncate shadow-black drop-shadow-md">
          {peer.userName} {peer.isLocal && "(You)"}
        </span>

        {/* Explicit Mute Icon */}
        {peer.muted && (
          <div className="ml-1 pl-2 border-l border-white/20 text-red-400 flex items-center">
            <MicOff size={12} />
          </div>
        )}
      </div>

      {isBlurred && peer.isLocal && !peer.videoOff && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-emerald-500/20 backdrop-blur-md p-2 rounded-full border border-emerald-500/30">
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

  const togglePin = (id: string) => {
    if (pinnedId === id) setPinnedId(null);
    else setPinnedId(id);
  };

  if (pinnedPeer) {
    const otherPeers = peers.filter(p => p.userId !== pinnedId);

    return (
      <div className="flex-1 p-0 md:p-4 w-full h-[100dvh] md:h-full flex flex-col md:flex-row gap-0 md:gap-4 overflow-hidden transition-all">
        {/* Main Stage - Pinned Video */}
        <div className="w-full flex-1 md:w-auto relative bg-black md:bg-slate-900/50 md:rounded-2xl overflow-hidden shadow-2xl border-b md:border border-white/5 group/stage min-h-0">
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

        {/* Film Strip - Elegant Horizontal Scroll on Mobile, Column on Desktop */}
        {isStripVisible && otherPeers.length > 0 && (
          <div className="
            w-full md:w-80 
            h-40 md:h-full 
            flex flex-row md:flex-col gap-3
            p-3 md:p-0
            mb-20 md:mb-0
            overflow-x-auto md:overflow-x-hidden md:overflow-y-auto 
            md:custom-scrollbar
            shrink-0
            animate-in slide-in-from-bottom md:slide-in-from-right duration-300
            bg-slate-900 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none
            snap-x snap-mandatory flex-nowrap
          ">
            {otherPeers.map(peer => (
              <div key={peer.userId} className="w-28 md:w-full h-full md:h-44 md:min-h-[176px] cursor-pointer snap-start shrink-0" onClick={() => togglePin(peer.userId)}>
                <VideoTile
                  peer={peer}
                  isBlurred={isLocalBlurred}
                  isPinned={false}
                  onPin={togglePin}
                  className="w-full h-full object-cover rounded-xl border border-white/10 shadow-xl"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-6 pb-32 overflow-y-auto w-full h-full custom-scrollbar">
      <div className={`grid ${peers.length > 2 ? 'grid-cols-2' : 'grid-cols-1'} md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-6 auto-rows-max max-w-7xl mx-auto animate-in fade-in zoom-in-95 duration-500`}>
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
