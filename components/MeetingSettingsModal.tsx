import React, { useState } from 'react';
import { User, Message, PeerStream, MeetingSettings } from '../types';
import { X, UserCheck, UserX, Settings, Mic, Video, Trash2, Shield, Users } from 'lucide-react';
import { signaling } from '../services/signaling';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    joinRequests: User[];
    participants: PeerStream[];
    roomSettings?: MeetingSettings;
    onUpdateSettings: (s: MeetingSettings) => void;
    onApprove: (userId: string) => void;
    onReject: (userId: string) => void;
    roomId: string;
    currentUser: User;
}

const MeetingSettingsModal: React.FC<Props> = ({
    isOpen, onClose, joinRequests, participants, roomSettings, onUpdateSettings, onApprove, onReject, roomId, currentUser
}) => {
    const [activeTab, setActiveTab] = useState<'requests' | 'participants' | 'settings'>('settings');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-900/50">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Settings className="w-5 h-5 text-blue-400" />
                        Meeting Control
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-700 bg-slate-800/30">
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'settings' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        <Shield size={16} />
                        Cài đặt phòng
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-950/30">
                    {activeTab === 'settings' && roomSettings && (
                        <div className="space-y-6">
                            <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl">
                                <h3 className="text-blue-400 font-bold mb-1">Cài Đặt Chung</h3>
                                <p className="text-xs text-blue-300/70">Áp dụng cho tất cả thành viên trong phòng</p>
                            </div>

                            <div className="space-y-4">
                                <label className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-colors border border-slate-700/50">
                                    <div>
                                        <span className="block font-medium text-slate-200">Bắt buộc Mic</span>
                                        <span className="text-xs text-slate-500">Thành viên phải bật Mic khi tham gia</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={roomSettings.requireMic}
                                        onChange={e => onUpdateSettings({ ...roomSettings, requireMic: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                </label>

                                <label className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-colors border border-slate-700/50">
                                    <div>
                                        <span className="block font-medium text-slate-200">Bắt buộc Camera</span>
                                        <span className="text-xs text-slate-500">Thành viên phải bật Camera khi tham gia</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={roomSettings.requireCamera}
                                        onChange={e => onUpdateSettings({ ...roomSettings, requireCamera: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                </label>

                                <label className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-colors border border-slate-700/50">
                                    <div>
                                        <span className="block font-medium text-slate-200">Cho phép chia sẻ màn hình</span>
                                        <span className="text-xs text-slate-500">Thành viên có thể share screen</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={roomSettings.allowScreenShare}
                                        onChange={e => onUpdateSettings({ ...roomSettings, allowScreenShare: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MeetingSettingsModal;
