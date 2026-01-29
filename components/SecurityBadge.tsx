
import React from 'react';
import { ShieldCheck, Lock, EyeOff } from 'lucide-react';

const SecurityBadge: React.FC = () => {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
      <div className="flex -space-x-1">
        <ShieldCheck className="w-4 h-4 text-emerald-500" />
        <Lock className="w-4 h-4 text-emerald-400" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">E2EE Active</span>
        <span className="text-[8px] text-emerald-600/80 font-medium">DTLS 1.3 / SRTP AES-256</span>
      </div>
      <div className="h-4 w-px bg-emerald-500/20 mx-1"></div>
      <div className="flex items-center gap-1">
        <EyeOff className="w-3 h-3 text-emerald-500/60" />
        <span className="text-[8px] text-emerald-500/60 font-medium italic">Privacy Mode</span>
      </div>
    </div>
  );
};

export default SecurityBadge;
