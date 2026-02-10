
import React, { useState, useRef, useEffect } from 'react';
import { Message, User, PeerStream } from '../../types';
import { X, MessageSquare, Send, Mic, Video, MicOff, VideoOff, UserX, UserCheck, Search, Paperclip, File, Download, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmModal from '../ui/ConfirmModal';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'chat' | 'participants' | 'requests'; // Added requests
  setActiveTab: (tab: 'chat' | 'participants' | 'requests') => void;
  messages: Message[];
  onSendMessage: (text: string) => void;

  currentUser: User;
  participants: PeerStream[];
  onKick: (userId: string) => void;
  joinRequests: User[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onToggleMic?: (userId: string, currentStatus: boolean) => void;
  onToggleCam?: (userId: string, currentStatus: boolean) => void;
  onSendFile?: (file: File) => void; // New
}

const MotionDiv = motion.div as any;

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  messages,
  onSendMessage,

  currentUser,
  participants,
  onKick,
  joinRequests,
  onApprove,
  onReject,
  onToggleMic,
  onToggleCam,
  onSendFile
}) => {
  const [inputText, setInputText] = useState("");
  const [kickConfirm, setKickConfirm] = useState<{ isOpen: boolean, userId: string | null }>({ isOpen: false, userId: null });
  const [participantSearch, setParticipantSearch] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onSendFile) {
      setIsUploading(true);
      try {
        await onSendFile(file);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 bottom-0 right-0 z-[100] w-full md:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-white/5 animate-in slide-in-from-right duration-300 shadow-2xl h-[100dvh]">
      <div className="absolute top-0 left-0 w-full h-16 flex items-center justify-between px-6 border-b border-white/5 bg-slate-900/50 z-20">
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

      <div className="absolute top-16 bottom-0 left-0 right-0 overflow-y-auto p-4 custom-scrollbar">
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
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs overflow-hidden border border-white/5">
                      {req.avatar ? (
                        <img src={req.avatar} alt={req.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>{req.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-200">{req.name}</h4>
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



        {activeTab === 'participants' && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">In Meeting ({participants.length})</h3>

            <div className="px-2 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                <input
                  type="text"
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                  placeholder="Search participants..."
                  className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-slate-600 border border-transparent focus:border-blue-500/20"
                />
              </div>
            </div>

            {participants
              .filter(p => p.userName.toLowerCase().includes(participantSearch.toLowerCase()))
              .map(p => (
                <div key={p.userId} className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-lg overflow-hidden border border-white/10">
                      {p.avatar || (p.isLocal && currentUser.avatar) ? (
                        <img src={p.avatar || currentUser.avatar} alt={p.userName} className="w-full h-full object-cover" />
                      ) : (
                        <span>{p.userName.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        {p.userName}
                        {p.isLocal && <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-400">YOU</span>}
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
                          onClick={() => setKickConfirm({ isOpen: true, userId: p.userId })}
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
            {participants.filter(p => p.userName.toLowerCase().includes(participantSearch.toLowerCase())).length === 0 && (
              <div className="text-center text-slate-500 text-xs py-4">
                No participants found
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="pb-32 space-y-2 px-1">
            <AnimatePresence initial={false}>
              {messages.length === 0 ? (
                <MotionDiv
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-slate-500 text-xs mt-10 italic"
                >
                  <MessageSquare size={32} className="mx-auto mb-3 opacity-20" />
                  Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!
                </MotionDiv>
              ) : (
                messages.map((msg, index) => {
                  const isMe = msg.sender === currentUser.id;
                  const prevMsg = index > 0 ? messages[index - 1] : null;
                  const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

                  // Is this message followed by another one from the same sender within 1 minute?
                  const isGroupedWithNext = nextMsg && nextMsg.sender === msg.sender &&
                    (new Date(nextMsg.timestamp).getTime() - new Date(msg.timestamp).getTime() < 60000);

                  // Is this the first message in a continuous burst from this sender?
                  const isFirstInGroup = !prevMsg || prevMsg.sender !== msg.sender ||
                    (new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime() >= 60000);

                  const senderName = isMe ? "Bạn" : (participants.find(p => p.userId === msg.sender)?.userName || msg.userName || "Người lạ");

                  return (
                    <MotionDiv
                      key={msg.id}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'} ${isFirstInGroup ? 'mt-4' : 'mt-1'}`}
                    >
                      {/* Avatar - Show only on the LAST message of a group (isGroupedWithNext is false) */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0 transition-opacity self-end ${isMe ? 'bg-blue-500/10' : 'bg-slate-800'} ${isGroupedWithNext ? 'opacity-0' : 'opacity-100'}`}>
                        {!isMe ? (
                          participants.find(p => p.userId === msg.sender)?.avatar ?
                            <img src={participants.find(p => p.userId === msg.sender)?.avatar} className="w-full h-full object-cover" /> :
                            <span className="text-slate-400">{senderName.charAt(0).toUpperCase()}</span>
                        ) : (
                          currentUser.avatar ? <img src={currentUser.avatar} className="w-full h-full object-cover" /> : <span className="text-blue-400">{currentUser.name?.charAt(0).toUpperCase()}</span>
                        )}
                      </div>

                      <div className={`flex flex-col min-w-0 max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                        {/* Name - Show only on the FIRST message of a group */}
                        {isFirstInGroup && (
                          <div className="flex items-center gap-2 mb-1 px-1">
                            {!isMe && <span className="text-[10px] font-bold text-slate-400">{senderName}</span>}
                            <span className="text-[9px] text-slate-600 font-medium">
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        )}
                        <div
                          className={`
                            px-4 py-2 rounded-2xl text-[15px] break-words shadow-sm
                            ${isMe
                              ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                              : 'bg-slate-800 text-slate-200 border border-white/5'
                            }
                            ${isMe
                              ? (isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-sm') + ' rounded-br-sm'
                              : (isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-sm') + ' rounded-bl-sm'
                            }
                          `}
                        >
                          {msg.fileUrl ? (
                            <div className="flex flex-col gap-2 min-w-[150px]">
                              {msg.isImage ? (
                                <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-white/10 hover:opacity-90 transition-opacity">
                                  <img src={msg.fileUrl} alt={msg.fileName} className="max-w-full h-auto max-h-[200px] object-cover" />
                                </a>
                              ) : (
                                <div className="flex items-center gap-3 bg-white/10 p-2 rounded-lg">
                                  <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center shrink-0">
                                    <File size={20} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">{msg.fileName}</p>
                                    <p className="text-[10px] opacity-60">{(msg.fileSize! / 1024 / 1024).toFixed(2)} MB</p>
                                  </div>
                                </div>
                              )}
                              <a
                                href={msg.fileUrl}
                                download={msg.fileName}
                                className={`flex items-center justify-center gap-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${isMe ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                              >
                                <Download size={12} /> Tải xuống
                              </a>
                            </div>
                          ) : (
                            msg.text
                          )}
                        </div>
                      </div>
                    </MotionDiv>
                  );
                })
              )}
            </AnimatePresence>
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {
        activeTab === 'chat' && (
          <div className="fixed bottom-0 right-0 w-full md:w-96 z-[120] p-4 bg-slate-900 border-t border-white/5">
            <form onSubmit={handleSend} className="relative group">
              <div className="absolute inset-0 bg-blue-500/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-full"></div>
              <div className="relative flex items-center gap-2 bg-slate-800 border border-slate-700 focus-within:border-blue-500/50 rounded-2xl px-1 py-1 transition-all">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="p-2 text-slate-400 hover:text-white transition-colors hover:bg-white/5 rounded-xl ml-1"
                >
                  {isUploading ? <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" /> : <Paperclip size={20} />}
                </button>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Aa"
                  className="flex-1 bg-transparent text-slate-200 text-[16px] md:text-[15px] pl-1 pr-2 py-2 focus:outline-none placeholder:text-slate-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="p-2 bg-blue-600 text-white rounded-[14px] hover:bg-blue-500 disabled:opacity-30 disabled:grayscale transition-all shadow-lg active:scale-95"
                >
                  <Send size={18} />
                </button>
              </div>
            </form>
          </div>
        )
      }
      <ConfirmModal
        isOpen={kickConfirm.isOpen}
        onCancel={() => setKickConfirm({ ...kickConfirm, isOpen: false })}
        onConfirm={() => {
          if (kickConfirm.userId) {
            onKick(kickConfirm.userId);
            setKickConfirm({ isOpen: false, userId: null });
          }
        }}
        title="Xác nhận đuổi thành viên"
        message="Bạn có chắc chắn muốn mời thành viên này ra khỏi khoỉ phòng họp? Hành động này không thể hoàn tác ngay lập tức."
        confirmText="Đuổi ngay"
        cancelText="Hủy bỏ"
        type="danger"
      />
    </div >
  );
};

export default Sidebar;
