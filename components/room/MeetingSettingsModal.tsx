import React, { useState } from 'react';
import { User, Message, PeerStream, MeetingSettings } from '../../types';
import { X, UserCheck, UserX, Settings, Mic, Video, Trash2, Shield, Users, Eye, EyeOff, Check, Bell, FileText, Download, RotateCw, Globe, Languages } from 'lucide-react';
import { signaling } from '../../services/signaling';
import { getToken } from '../../services/authService';
import ConfirmModal from '../ui/ConfirmModal';

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
    const [activeTab, setActiveTab] = useState<'requests' | 'participants' | 'settings' | 'meeting-content' | 'logs'>('settings');
    const [showPassword, setShowPassword] = useState(false);
    const [meetingContents, setMeetingContents] = useState<any[]>([]);
    const [contentLoading, setContentLoading] = useState(false);
    const [deleteContentId, setDeleteContentId] = useState<string | null>(null);

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

    const handleFetchMeetingContents = async () => {
        if (!currentUser?.id) return;
        setContentLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`/api/meetings/content/${currentUser.id}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            // Filter by current roomId
            setMeetingContents(data.filter((c: any) => c.roomId === roomId));
        } catch (e: any) {
            console.error('[MeetingContent] Fetch error:', e);
        } finally { setContentLoading(false); }
    };

    React.useEffect(() => {
        if (isOpen && activeTab === 'meeting-content') {
            handleFetchMeetingContents();
        }
    }, [isOpen, activeTab]);

    const handleDeleteMeetingContent = async (id: string) => {
        try {
            const token = getToken();
            const res = await fetch(`/api/meetings/content/${id}`, {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) throw new Error('Delete failed');
            if (onShowToast) onShowToast('Meeting content deleted', 'success');
            setMeetingContents(prev => prev.filter(c => c._id !== id));
        } catch (e: any) {
            if (onShowToast) onShowToast('Error deleting meeting content', 'error');
        } finally {
            setDeleteContentId(null);
        }
    };

    const handleRetryMeetingContent = async (id: string) => {
        try {
            const token = getToken();
            const res = await fetch(`/api/meetings/content/${id}/retry`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) throw new Error('Retry failed');
            if (onShowToast) onShowToast('Retry started. Please wait a moment.', 'success');
            setTimeout(handleFetchMeetingContents, 2000);
        } catch (e: any) {
            if (onShowToast) onShowToast('Error retrying meeting content', 'error');
        }
    };

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
                        Settings
                    </button>
                    <button
                        onClick={() => setActiveTab('meeting-content')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'meeting-content' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        <FileText size={16} />
                        Content
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'logs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        <Bell size={16} />
                        Logs
                        {unreadLogsCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full animate-pulse">{unreadLogsCount}</span>}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-950/30">
                    {activeTab === 'settings' && roomSettings && (
                        <div className="space-y-6">
                            <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl">
                                <h3 className="text-blue-400 font-bold mb-1">General Settings</h3>
                                <p className="text-xs text-blue-300/70">Apply to all members in the room</p>
                            </div>

                            <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-xl">
                                <div className="flex items-center gap-2 mb-3">
                                    <Languages size={18} className="text-blue-400" />
                                    <div>
                                        <span className="block font-medium text-slate-200">Transcription Language</span>
                                        <span className="text-[10px] text-slate-400">Choose language for live captions or Auto AI for bilingual.</span>
                                    </div>
                                </div>
                                <select
                                    value={roomSettings.transcriptionLang || 'vi-VN'}
                                    onChange={e => onUpdateSettings({ ...roomSettings, transcriptionLang: e.target.value as any })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="vi-VN">Tiếng Việt (Vietnamese)</option>
                                    <option value="en-US">Tiếng Anh (English)</option>
                                    <option value="auto">Auto AI (Bilingual - Best Quality ✨)</option>
                                </select>
                                {roomSettings.transcriptionLang === 'auto' && (
                                    <div className="mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                        <p className="text-[10px] text-emerald-300 italic">
                                            <strong>Note:</strong> Auto AI captures both English and Vietnamese perfectly. Processing occurs on the server and results will be available in the "Content" tab after the meeting.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50">
                                    <div className="mb-2">
                                        <span className="block font-medium text-slate-200">Room Password</span>
                                        <span className="text-xs text-slate-500">Set a password to protect the room (Leave empty if you want to open)</span>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={localPassword}
                                            onChange={e => setLocalPassword(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-4 pr-20 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-white"
                                            placeholder="Enter new password..."
                                        />
                                        <div className="absolute right-2 top-2 flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="p-1 text-slate-400 hover:text-white transition-colors"
                                                title={showPassword ? "Hide password" : "Show password"}
                                            >
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                            <div className="w-px h-4 bg-slate-700 mx-1"></div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onUpdateSettings({ ...roomSettings, password: localPassword });
                                                    if (onShowToast) onShowToast("Password updated successfully!", 'success');
                                                }}
                                                className="p-1 text-slate-400 hover:text-emerald-400 transition-colors"
                                                title="Save password"
                                            >
                                                <Check size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <label className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-colors border ${roomSettings.lockRoom ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'}`}>
                                    <div>
                                        <span className={`block font-medium ${roomSettings.lockRoom ? 'text-red-400' : 'text-slate-200'}`}>Lock Meeting</span>
                                        <span className="text-xs text-slate-500">Prevent new people from joining</span>
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
                                        <span className="block font-medium text-slate-200">Waiting Room</span>
                                        <span className="text-xs text-slate-500">Hold participants in a lobby for approval</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={roomSettings.waitingRoom}
                                        onChange={e => onUpdateSettings({ ...roomSettings, waitingRoom: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                </label>
                                <label className="flex items-center justify-between p-4 bg-slate-800/30 rounded-xl cursor-pointer hover:bg-slate-800/50 transition-colors border border-slate-700/50">
                                    <div>
                                        <span className="block font-medium text-slate-200">Require Camera</span>
                                        <span className="text-xs text-slate-500">Members must turn on Camera when joining</span>
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
                                        <span className="block font-medium text-slate-200">Require Mic</span>
                                        <span className="text-xs text-slate-500">Members must turn on Mic when joining</span>
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
                                        <span className="block font-medium text-slate-200">Allow Screen Share</span>
                                        <span className="text-xs text-slate-500">Members can share screen</span>
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
                                        <span className="block font-medium text-slate-200">Allow Reactions</span>
                                        <span className="text-xs text-slate-500">Members can use Emote</span>
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

                    {activeTab === 'meeting-content' && (
                        <div className="space-y-4">
                            <div className="bg-fuchsia-900/10 border border-fuchsia-500/20 p-4 rounded-xl mb-4">
                                <h3 className="text-fuchsia-400 font-bold mb-1">Recording & Transcription</h3>
                                <p className="text-xs text-fuchsia-300/70">Manage your recordings from this session</p>
                            </div>

                            {contentLoading ? (
                                <div className="text-center py-10">
                                    <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                                    <p className="text-slate-400 text-sm">Loading recordings...</p>
                                </div>
                            ) : meetingContents.length === 0 ? (
                                <div className="text-center text-slate-500 py-10 border-2 border-dashed border-slate-800 rounded-2xl">
                                    <FileText size={32} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">No recordings found for this roomId.</p>
                                    <p className="text-xs opacity-50 mt-1">Start recording to see content here.</p>
                                </div>
                            ) : (
                                meetingContents.map(c => {
                                    const statusLabel = c.status === 'completed' ? 'Success' : c.status === 'processing' ? 'Processing' : c.status === 'failed' ? 'Failed' : 'Pending';
                                    const summaryText = c.summaryText || (c.status === 'processing' ? 'Thinking...' : c.status === 'failed' ? 'Processing failed.' : 'Waiting in queue...');

                                    return (
                                        <div key={c._id} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-colors">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="min-w-0 flex-1 pr-4">
                                                    <h4 className="text-white font-bold text-sm truncate">{c.title || 'Untitled recording'}</h4>
                                                    <p className="text-slate-500 text-[10px] mt-0.5">{new Date(c.createdAt).toLocaleString()}</p>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${c.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : c.status === 'failed' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
                                                    {statusLabel}
                                                </span>
                                            </div>

                                            <div 
                                                className="text-slate-400 text-xs line-clamp-2 italic mb-4"
                                                dangerouslySetInnerHTML={{ __html: summaryText.replace(/\n/g, '<br />') }}
                                            />

                                            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-800/50">
                                                {c.status === 'completed' && (
                                                    <>
                                                        {c.summaryDocxUrl && (
                                                            <a href={c.summaryDocxUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-fuchsia-600/20 hover:bg-fuchsia-600/30 text-fuchsia-300 text-[10px] font-semibold transition-colors">
                                                                <Download size={12} /> Summary (.docx)
                                                            </a>
                                                        )}
                                                        {c.transcriptDocxUrl && (
                                                            <a href={c.transcriptDocxUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-[10px] font-semibold transition-colors">
                                                                <Download size={12} /> Transcript (.docx)
                                                            </a>
                                                        )}
                                                    </>
                                                )}
                                                {c.status === 'failed' && (
                                                    <button onClick={() => handleRetryMeetingContent(c._id)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold transition-colors">
                                                        <RotateCw size={12} /> Retry
                                                    </button>
                                                )}
                                                <button onClick={() => setDeleteContentId(c._id)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 text-[10px] font-semibold ml-auto transition-colors">
                                                    <Trash2 size={12} /> Delete
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <ConfirmModal isOpen={!!deleteContentId} title="Delete Recording" message="Are you sure you want to delete this recording? This action cannot be undone." onConfirm={() => deleteContentId && handleDeleteMeetingContent(deleteContentId)} onCancel={() => setDeleteContentId(null)} />
                        </div>
                    )}

                    {activeTab === 'logs' && (
                        <div className="space-y-4">
                            {logs.length === 0 ? (
                                <div className="text-center text-slate-500 py-10">
                                    <Bell size={32} className="mx-auto mb-2 opacity-50" />
                                    <p>No activity logs yet.</p>
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
