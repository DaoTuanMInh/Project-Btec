import React from 'react';
import { RefreshCcw, Settings, Lock, Plus, Copy, Eye, EyeOff } from 'lucide-react';
import { MeetingSettings } from '../../types';

const generateRoomId = () => {
    const s = () => Math.random().toString(36).substring(2, 6);
    return `${s()}-${s()}-${s()}-${s()}`;
};

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
    const [showPass, setShowPass] = React.useState(false);
    const [showJoinPass, setShowJoinPass] = React.useState(false);
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
                            if (!room) setRoom(generateRoomId());
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
                        <label className="block text-sm font-medium text-slate-300 mb-1">{isCreateMode ? "Mã Phòng (Tạo tự động)" : "Nhập Mã Phòng"}</label>
                        <div className="relative group">
                            <input
                                required
                                type="text"
                                value={room}
                                onChange={isCreateMode ? undefined : e => setRoom(e.target.value)}
                                className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all pr-20 ${isCreateMode ? 'bg-slate-800/50 border-slate-700/50 text-blue-400 font-mono cursor-default select-all' : 'bg-slate-800 border-slate-700 text-white'}`}
                                placeholder="e.g. abcd-efgh-ijkl-mnop"
                                readOnly={isCreateMode}
                            />
                            {isCreateMode && (
                                <div className="absolute right-2 top-2 flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(room);
                                            onShowToast?.("Đã sao chép mã phòng thành công!", 'success');
                                        }}
                                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-all"
                                        title="Sao chép mã"
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newId = generateRoomId();
                                            setRoom(newId);
                                            onShowToast?.("Đã tạo mã phòng mới!", 'info');
                                        }}
                                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-all animate-in spin-in-180 duration-500"
                                        title="Tạo mã mới"
                                    >
                                        <RefreshCcw size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                        {isCreateMode && <p className="text-[10px] text-slate-500 mt-1 italic">* Mã phòng được cấp tự động để đảm bảo tính duy nhất.</p>}
                    </div>

                    {/* Password input for JOIN mode */}
                    {!isCreateMode && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Mật khẩu phòng (Nếu có)</label>
                            <div className="relative">
                                <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
                                <input
                                    type={showJoinPass ? "text" : "password"}
                                    value={joinPassword}
                                    onChange={e => setJoinPassword(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-10 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="Nhập mật khẩu..."
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowJoinPass(!showJoinPass)}
                                    className="absolute right-3 top-3.5 text-slate-400 hover:text-blue-400 transition-colors"
                                >
                                    {showJoinPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
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
                                        type={showPass ? "text" : "password"}
                                        value={joinSettings.password || ''}
                                        onChange={e => setJoinSettings({ ...joinSettings, password: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        placeholder="Để trống nếu không cần mật khẩu"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass(!showPass)}
                                        className="absolute right-3 top-3 text-slate-400 hover:text-blue-400 transition-colors"
                                    >
                                        {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
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
