import React from 'react';
import { RefreshCcw, Settings, Lock, Plus, Copy } from 'lucide-react';
import { MeetingSettings } from '../../types';

interface JoinFormProps {
    name: string;
    setName: (name: string) => void;
    room: string;
    setRoom: (room: string) => void;
    isCreateMode: boolean;
    setIsCreateMode: (mode: boolean) => void;
    joinSettings: MeetingSettings;
    setJoinSettings: (settings: MeetingSettings) => void;
    joinPassword: string;
    setJoinPassword: (pass: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    onShowToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

const JoinForm: React.FC<JoinFormProps> = ({
    name, setName,
    room, setRoom,
    isCreateMode, setIsCreateMode,
    joinSettings, setJoinSettings,
    joinPassword, setJoinPassword,
    onSubmit, onShowToast
}) => {
    return (
        <div className="flex-1 w-full max-w-md">
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm md:max-h-[60vh] md:overflow-y-auto custom-scrollbar">
                {/* Tabs */}
                <div className="flex mb-6 bg-slate-800/50 p-1 rounded-xl">
                    <button
                        type="button"
                        onClick={() => setIsCreateMode(false)}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${!isCreateMode ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        Tham Gia
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setIsCreateMode(true);
                            if (!room) setRoom(Math.random().toString(36).substring(2, 9));
                        }}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${isCreateMode ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                        Tạo Phòng Mới
                    </button>
                </div>

                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Tên của bạn</label>
                        <input
                            required
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="e.g. John Doe"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">{isCreateMode ? "Mã Phòng (Tự động)" : "Nhập Mã Phòng"}</label>
                        <div className="relative">
                            <input
                                required
                                type="text"
                                value={room}
                                onChange={e => setRoom(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all pr-10"
                                placeholder="e.g. general-sync"
                                readOnly={isCreateMode}
                            />
                            {isCreateMode && (
                                <div className="absolute right-3 top-3 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(room);
                                            if (onShowToast) {
                                                onShowToast("Đã sao chép mã phòng thành công!", 'success');
                                            } else {
                                                // Fallback visual feedback
                                                const btn = document.activeElement as HTMLElement;
                                                if (btn) {
                                                    btn.style.color = '#4ade80';
                                                    setTimeout(() => btn.style.color = '', 1000);
                                                }
                                            }
                                        }}
                                        className="text-slate-400 hover:text-white transition-colors"
                                        title="Sao chép mã"
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRoom(Math.random().toString(36).substring(2, 9))}
                                        className="text-slate-400 hover:text-white transition-colors"
                                        title="Tạo mã mới"
                                    >
                                        <RefreshCcw size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Password input for JOIN mode */}
                    {!isCreateMode && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Mật khẩu phòng (Nếu có)</label>
                            <div className="relative">
                                <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
                                <input
                                    type="password"
                                    value={joinPassword}
                                    onChange={e => setJoinPassword(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="Nhập mật khẩu..."
                                />
                            </div>
                        </div>
                    )}

                    {isCreateMode && (
                        <div className="space-y-3 pt-2 border-t border-slate-700/50 mt-4 animate-in slide-in-from-top-2 fade-in duration-300">
                            <p className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                <Settings size={14} /> Cài đặt phòng
                            </p>

                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Mật khẩu phòng (Tùy chọn)</label>
                                <div className="relative">
                                    <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
                                    <input
                                        type="password"
                                        value={joinSettings.password || ''}
                                        onChange={e => setJoinSettings({ ...joinSettings, password: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        placeholder="Để trống nếu không cần mật khẩu"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={joinSettings.allowScreenShare}
                                        onChange={e => setJoinSettings({ ...joinSettings, allowScreenShare: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                    <div className="text-xs">
                                        <span className="block font-medium text-slate-300">Share Screen</span>
                                        <span className="text-slate-500">Cho phép chia sẻ</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={joinSettings.requireMic}
                                        onChange={e => setJoinSettings({ ...joinSettings, requireMic: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                    <div className="text-xs">
                                        <span className="block font-medium text-slate-300">Bắt buộc Mic</span>
                                        <span className="text-slate-500">Phải bật Mic</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={joinSettings.requireCamera}
                                        onChange={e => setJoinSettings({ ...joinSettings, requireCamera: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                    <div className="text-xs">
                                        <span className="block font-medium text-slate-300">Bắt buộc Cam</span>
                                        <span className="text-slate-500">Phải bật Camera</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={joinSettings.allowReactions}
                                        onChange={e => setJoinSettings({ ...joinSettings, allowReactions: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                    <div className="text-xs">
                                        <span className="block font-medium text-slate-300">Thả cảm xúc</span>
                                        <span className="text-slate-500">Cho phép Emote</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2"
                    >
                        {isCreateMode ? <Plus size={20} /> : null}
                        {isCreateMode ? "Tạo Phòng Ngay" : "Tham Gia Ngay"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default JoinForm;
