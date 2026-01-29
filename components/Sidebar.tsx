
import React, { useState, useRef, useEffect } from 'react';
import { Message, User, PeerStream } from '../types';
import { X, MessageSquare, Send, Mic, Video, MicOff, VideoOff, UserX, UserCheck } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'chat' | 'participants' | 'requests'; // Added requests
  setActiveTab: (tab: 'chat' | 'participants' | 'requests') => void;
  messages: Message[];
  onSendMessage: (text: string) => void;
  aiSummary: string;
  onGenerateSummary: () => void;
  isGeneratingAi: boolean;
  currentUser: User;
  participants: PeerStream[];
  onKick: (userId: string) => void;
  joinRequests: User[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onToggleMic?: (userId: string, currentStatus: boolean) => void; // New
  onToggleCam?: (userId: string, currentStatus: boolean) => void; // New
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  messages,
  onSendMessage,
  aiSummary,
  onGenerateSummary,
  isGeneratingAi,
  currentUser,
  participants,
  onKick,
  joinRequests,
  onApprove,
  onReject,
  onToggleMic,
  onToggleCam
}) => {
  const [inputText, setInputText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTab]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText("");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full md:w-96 md:static md:z-auto flex flex-col bg-slate-900 border-l border-white/5 animate-in slide-in-from-right duration-300 shadow-2xl">
      <div className="h-16 flex items-center justify-between px-6 border-b border-white/5">
        <div className="flex bg-slate-800 p-1 rounded-lg overflow-x-auto no-scrollbar max-w-[240px]">
          {currentUser.isHost && (
            <button
              onClick={() => setActiveTab('requests')}
              className={`relative px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${activeTab === 'requests' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Requests
              {joinRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] flex items-center justify-center text-white border border-slate-900">
                  {joinRequests.length}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setActiveTab('participants')}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'participants' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            People ({participants.length})
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'chat' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Chat
          </button>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'requests' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">Join Requests ({joinRequests.length})</h3>
            {joinRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500 opacity-50">
                <UserCheck size={32} className="mb-2" />
                <p className="text-sm">No pending requests</p>
              </div>
            ) : (
              joinRequests.map(req => (
                <div key={req.id} className="flex flex-col bg-slate-800/50 p-3 rounded-xl border border-slate-700 hover:border-slate-600 transition-all">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                      {req.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-200">{req.name}</h4>
                      <p className="text-[10px] text-slate-500">ID: {req.id.slice(0, 4)}...</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onReject(req.id)}
                      className="flex-1 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all text-xs font-bold"
                    >
                      Refuse
                    </button>
                    <button
                      onClick={() => onApprove(req.id)}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all text-xs font-bold"
                    >
                      Admit
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="space-y-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-500 opacity-50">
                <MessageSquare size={48} className="mb-3" />
                <p className="text-sm">No messages yet</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.sender === currentUser.id ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-slate-500">{msg.sender === currentUser.id ? 'YOU' : 'OTHER'}</span>
                    <span className="text-[10px] text-slate-600">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${msg.sender === currentUser.id ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-200 rounded-tl-none'}`}>
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {activeTab === 'participants' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">In Meeting ({participants.length})</h3>
            {participants.map(p => (
              <div key={p.userId} className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-lg">
                    {p.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      {p.userName}
                      {p.isLocal && <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-400">YOU</span>}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {p.isLocal ? (currentUser.isHost ? "Host" : "Guest") : "Member"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={!currentUser.isHost || p.isLocal}
                    onClick={() => onToggleMic && onToggleMic(p.userId, p.muted)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-all
                      ${p.muted ? 'bg-red-500/10 text-red-500' : 'bg-slate-700 text-slate-400'}
                      ${currentUser.isHost && !p.isLocal ? 'hover:bg-slate-600 cursor-pointer' : 'cursor-default'}
                    `}
                    title={currentUser.isHost ? "Toggle Mic" : "Mic Status"}
                  >
                    {p.muted ? <MicOff size={12} /> : <Mic size={12} />}
                  </button>
                  <button
                    disabled={!currentUser.isHost || p.isLocal}
                    onClick={() => onToggleCam && onToggleCam(p.userId, p.videoOff)}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-all
                      ${p.videoOff ? 'bg-red-500/10 text-red-500' : 'bg-slate-700 text-slate-400'}
                      ${currentUser.isHost && !p.isLocal ? 'hover:bg-slate-600 cursor-pointer' : 'cursor-default'}
                    `}
                    title={currentUser.isHost ? "Toggle Camera" : "Camera Status"}
                  >
                    {p.videoOff ? <VideoOff size={12} /> : <Video size={12} />}
                  </button>

                  {/* Kick Button for Host */}
                  {currentUser.isHost && !p.isLocal && (
                    <div className="ml-1 pl-2 border-l border-slate-700">
                      <button
                        onClick={() => onKick(p.userId)}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-red-500 hover:bg-red-500 hover:text-white transition-all"
                        title="Kick User"
                      >
                        <UserX size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}


      </div>

      {activeTab === 'chat' && (
        <form onSubmit={handleSend} className="p-4 border-t border-white/5 bg-slate-900/80 backdrop-blur-md">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Type message..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg flex items-center justify-center transition-all"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default Sidebar;
