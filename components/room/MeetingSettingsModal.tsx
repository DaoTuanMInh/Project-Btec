import React, { useState } from 'react';
import { User, Message, PeerStream, MeetingSettings } from '../../types';
import { X, UserCheck, UserX, Settings, Mic, Video, Trash2, Shield, Users, Eye, EyeOff, Check, Bell } from 'lucide-react';
import { signaling } from '../../services/signaling';

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
    onShowToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    logs?: { id: string, time: string, message: string, type: 'info' | 'warning' | 'error' }[];
    unreadLogsCount?: number;
    setUnreadLogsCount?: (n: number) => void;
}

const MeetingSettingsModal: React.FC<Props> = ({
    isOpen, onClose, joinRequests, participants, roomSettings, onUpdateSettings, onApprove, onReject, roomId, currentUser, onShowToast, logs = [], unreadLogsCount = 0, setUnreadLogsCount
}) => {
    const [activeTab, setActiveTab] = useState<'requests' | 'participants' | 'settings' | 'logs'>('settings');
    const [showPassword, setShowPassword] = useState(false);

    // Reset unread logs when looking at them
    React.useEffect(() => {
        if (isOpen && activeTab === 'logs' && setUnreadLogsCount) {
            setUnreadLogsCount(0);
        }
    }, [isOpen, activeTab, setUnreadLogsCount]);
    const [localPassword, setLocalPassword] = useState(roomSettings?.password || '');

    React.useEffect(() => {
        if (roomSettings?.password !== undefined) {
            setLocalPassword(roomSettings.password);
        }
    }, [roomSettings?.password]);

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
                        Cài đặt
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'logs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        <Bell size={16} />
                        Nhật ký
                        {unreadLogsCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full animate-pulse">{unreadLogsCount}</span>}
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
                                <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                                    <div className="mb-2">
                                        <span className="block font-medium text-slate-200">Mật khẩu phòng</span>
                                        <span className="text-xs text-slate-500">Đặt mật khẩu để bảo vệ phòng (Để trống nếu muốn mở)</span>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={localPassword}
                                            onChange={e => setLocalPassword(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-4 pr-20 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white"
                                            placeholder="Nhập mật khẩu mới..."
                                        />
                                        <div className="absolute right-2 top-2 flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="p-1 text-slate-400 hover:text-white transition-colors"
                                                title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                                            >
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                            <div className="w-px h-4 bg-slate-700 mx-1"></div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onUpdateSettings({ ...roomSettings, password: localPassword });
                                                    if (onShowToast) onShowToast("Đã cập nhật mật khẩu thành công!", 'success');
                                                }}
                                                className="p-1 text-slate-400 hover:text-emerald-400 transition-colors"
                                                title="Lưu mật khẩu"
                                            >
                                                <Check size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <label className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-colors border ${roomSettings.lockRoom ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'}`}>
                                    <div>
                                        <span className={`block font-medium ${roomSettings.lockRoom ? 'text-red-400' : 'text-slate-200'}`}>Khóa cuộc họp</span>
                                        <span className="text-xs text-slate-500">Ngăn không cho người mới tham gia</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={roomSettings.lockRoom}
                                        onChange={e => onUpdateSettings({ ...roomSettings, lockRoom: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-600 text-red-600 focus:ring-red-500 bg-slate-700"
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

                                <label className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-colors border border-slate-700/50">
                                    <div>
                                        <span className="block font-medium text-slate-200">Cho phép thả cảm xúc</span>
                                        <span className="text-xs text-slate-500">Thành viên có thể sử dụng Emote</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={roomSettings.allowReactions}
                                        onChange={e => onUpdateSettings({ ...roomSettings, allowReactions: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    {activeTab === 'logs' && (
                        <div className="space-y-4">
                            {logs.length === 0 ? (
                                <div className="text-center text-slate-500 py-10">
                                    <Bell size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>Chưa có nhật ký hoạt động nào.</p>
                                </div>
                            ) : (
                                logs.map(log => (
                                    <div key={log.id} className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 flex gap-3 items-start">
                                        <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${log.type === 'warning' ? 'bg-amber-500' : log.type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                                        <div className="flex-1">
                                            <p className="text-sm text-slate-200">{log.message}</p>
                                            <span className="text-xs text-slate-500 mt-1 block">{log.time}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MeetingSettingsModal;
