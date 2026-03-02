// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarPlus, Clock, Mail, Trash2, ArrowRight, Edit2, Save, History, User as UserIcon, Calendar, Power } from 'lucide-react';
import { useToast } from '../ui/Toast';
import ConfirmModal from '../ui/ConfirmModal';
import { getMeetingHistory } from '../../services/authService';
import { io as socketIO } from 'socket.io-client';

interface ScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onDirectJoin?: (roomId: string) => void;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, user, onDirectJoin }) => {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'schedule' | 'history'>('schedule');

    // ---- SCHEDULE TAB STATE ----
    const [loading, setLoading] = useState(false);
    const [schedules, setSchedules] = useState<any[]>([]);

    const handleFetchSchedules = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/meetings/my-schedule/${user.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSchedules(data);
        } catch (e: any) {
            console.error('[Schedule] Fetch error:', e);
        } finally { setLoading(false); }
    };

    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [overdueConfirmId, setOverdueConfirmId] = useState<string | null>(null);

    const handleDeleteSchedule = async (id: string) => {
        try {
            const res = await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Đã xóa lịch hẹn', 'success');
                setSchedules(prev => prev.filter(s => s._id !== id));
            }
        } catch (e) {
            showToast('Lỗi xóa lịch hẹn', 'error');
        } finally {
            setDeleteConfirmId(null);
            setOverdueConfirmId(null);
        }
    };

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any>({});
    const [saveLoading, setSaveLoading] = useState(false);

    const startEdit = (e: React.MouseEvent, s: any) => {
        e.preventDefault();
        setEditingId(s._id);
        const stTime = s.startTime
            ? new Date(new Date(s.startTime).getTime() - new Date(s.startTime).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
            : '';
        setEditForm({
            title: s.title || '',
            description: s.description || '',
            startTime: stTime,
            remindBeforeMinutes: s.remindBeforeMinutes || 15,
            invitedEmails: Array.isArray(s.invitedEmails) ? s.invitedEmails.join(', ') : ''
        });
    };

    const handleUpdateSchedule = async (id: string) => {
        if (!editForm.title || !editForm.startTime) {
            showToast('Vui lòng điền tiêu đề và thời gian', 'error');
            return;
        }
        setSaveLoading(true);
        try {
            const res = await fetch(`/api/meetings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast('Cập nhật lịch thành công!', 'success');
            setSchedules(prev => prev.map(s => s._id === id ? data.meeting : s));
            setEditingId(null);
        } catch (e: any) {
            showToast(e.message || 'Lỗi cập nhật lịch', 'error');
        } finally { setSaveLoading(false); }
    };

    // ---- HISTORY TAB STATE ----
    const [histLoading, setHistLoading] = useState(false);
    const [meetings, setMeetings] = useState<any[]>([]);
    const [activeRooms, setActiveRooms] = useState<any[]>([]);
    const [closingRoomId, setClosingRoomId] = useState<string | null>(null);
    const [closeConfirmRoomId, setCloseConfirmRoomId] = useState<string | null>(null);

    const handleFetchHistory = async () => {
        if (!user?.id) return;
        setHistLoading(true);
        try {
            const [histData, activeData] = await Promise.all([
                getMeetingHistory(user.id),
                fetch(`/api/rooms/active-persistent/${user.id}`).then(r => r.json())
            ]);
            setMeetings(histData);
            setActiveRooms(Array.isArray(activeData) ? activeData : []);
        } catch (e: any) {
            showToast(e.message || 'Lỗi tải lịch sử', 'error');
        } finally { setHistLoading(false); }
    };

    const handleCloseRoom = async (roomId: string) => {
        setClosingRoomId(roomId);
        try {
            const res = await fetch(`/api/rooms/close/${roomId}`, { method: 'POST' });
            if (!res.ok) throw new Error();
            showToast('Phòng đã được đóng lại!', 'success');
            setActiveRooms(prev => prev.filter(r => r.roomId !== roomId));
            // Also update meetings list to reflect endedAt
            setMeetings(prev => prev.map(m => m.roomId === roomId ? { ...m, endedAt: new Date().toISOString() } : m));
        } catch (e) {
            showToast('Lỗi khi đóng phòng', 'error');
        } finally {
            setClosingRoomId(null);
            setCloseConfirmRoomId(null);
        }
    };

    // Listen for room-closed socket event (triggered by 12h auto-close or another tab)
    useEffect(() => {
        const socket = socketIO('/', { transports: ['websocket'], autoConnect: true });
        socket.on('signal', (data: any) => {
            if (data.type === 'room-closed') {
                setActiveRooms(prev => prev.filter(r => r.roomId !== data.roomId));
                if (isOpen && activeTab === 'history') {
                    showToast(`Phòng ${data.roomId} đã được tự đóng`, 'info');
                }
            }
        });
        return () => { socket.disconnect(); };
    }, [isOpen, activeTab]);

    useEffect(() => {
        if (isOpen) {
            handleFetchSchedules();
        }
    }, [isOpen, user?.id]);

    useEffect(() => {
        if (isOpen && activeTab === 'history') {
            handleFetchHistory();
        }
    }, [activeTab, isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

                {/* @ts-ignore */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden mx-auto flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="flex justify-between items-center px-5 pt-5 pb-0 border-b border-slate-800 bg-slate-800/50 shrink-0">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <CalendarPlus className="text-indigo-400" size={20} /> Lịch của tôi
                            </h2>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg mb-1">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex px-5 gap-1 bg-slate-800/50 pt-2 shrink-0 border-b border-slate-800">
                        <button
                            onClick={() => setActiveTab('schedule')}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all border-b-2 ${activeTab === 'schedule'
                                ? 'border-indigo-500 text-indigo-400 bg-slate-900/60'
                                : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                        >
                            <CalendarPlus size={15} /> Lịch hẹn
                            <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 rounded-full border border-indigo-500/30 ml-0.5">{schedules.length}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-all border-b-2 ${activeTab === 'history'
                                ? 'border-blue-500 text-blue-400 bg-slate-900/60'
                                : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                        >
                            <History size={15} /> Lịch sử họp
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar bg-slate-950/30 flex-1">

                        {/* ---- SCHEDULE TAB ---- */}
                        {activeTab === 'schedule' && (
                            loading && schedules.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent animate-spin rounded-full" />
                                    <p className="text-slate-500 text-sm">Đang tải lịch hẹn...</p>
                                </div>
                            ) : schedules.length === 0 ? (
                                <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800/50">
                                    <CalendarPlus size={56} className="mx-auto text-slate-800 mb-4 opacity-30" />
                                    <p className="text-slate-300 font-bold text-lg">Bạn chưa lên lịch cuộc họp nào</p>
                                    <p className="text-slate-500 text-sm mt-2">Vào tab Lên Lịch ngoài sảnh để tạo nhé.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {schedules.map((s) => {
                                        const meetingTime = new Date(s.startTime);
                                        const isPassed = meetingTime < new Date();

                                        return (
                                            <div key={s._id} className={`bg-slate-900 border p-4 rounded-2xl relative overflow-hidden transition-all group flex flex-col justify-between ${isPassed && editingId !== s._id ? 'border-red-900/30 opacity-70' : 'border-indigo-500/30 hover:border-indigo-400 shadow-lg shadow-indigo-500/5'}`}>
                                                {isPassed && editingId !== s._id && <div className="absolute top-0 right-0 bg-red-900/40 text-red-400 text-[10px] px-2 py-1 rounded-bl-lg font-bold">Quá Hạn</div>}

                                                {editingId === s._id ? (
                                                    <div className="space-y-3">
                                                        <div>
                                                            <label className="text-[10px] text-slate-400 mb-1 block">Tiêu đề cuộc họp</label>
                                                            <input type="text" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-slate-400 mb-1 block">Mô tả ngắn</label>
                                                            <input type="text" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <label className="text-[10px] text-slate-400 mb-1 block">Bắt đầu lúc</label>
                                                                <input type="datetime-local" value={editForm.startTime} onChange={e => setEditForm({ ...editForm, startTime: e.target.value })} className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 [color-scheme:dark]" />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-slate-400 mb-1 block">Nhắc trước (phút)</label>
                                                                <input type="number" value={editForm.remindBeforeMinutes} onChange={e => setEditForm({ ...editForm, remindBeforeMinutes: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-slate-400 mb-1 block">Email khách mời (cách nhau bởi dấu phẩy)</label>
                                                            <input type="text" value={editForm.invitedEmails} onChange={e => setEditForm({ ...editForm, invitedEmails: e.target.value })} className="w-full bg-slate-950 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" placeholder="guest1@gmail.com, guest2@gmail.com" />
                                                        </div>
                                                        <div className="flex gap-2 justify-end pt-2 border-t border-slate-800/50 mt-2">
                                                            <button disabled={saveLoading} onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-transparent">Hủy</button>
                                                            <button disabled={saveLoading} onClick={() => handleUpdateSchedule(s._id)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1 shadow-lg disabled:opacity-50">
                                                                {saveLoading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={12} />} Lưu Thay Đổi
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div>
                                                            <div className="flex justify-between items-start mb-3">
                                                                <div className="pr-4">
                                                                    <h4 className="text-white font-bold text-[15px] mb-1 leading-snug">{s.title}</h4>
                                                                    <div className="text-indigo-400 text-xs font-mono tracking-wider bg-indigo-500/10 inline-block px-1.5 py-0.5 rounded border border-indigo-500/20">{s.roomId}</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-slate-400 text-xs bg-slate-800/50 p-2 rounded-lg mb-3 line-clamp-2" title={s.description}>
                                                                {s.description || <span className="italic opacity-50">Không có mô tả</span>}
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3 mt-auto">
                                                            <div className="flex items-center justify-between text-xs font-medium">
                                                                <div className="flex items-center gap-1.5 text-slate-300">
                                                                    <Clock size={14} className={isPassed ? 'text-red-400' : 'text-indigo-400'} />
                                                                    {meetingTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                                                </div>
                                                                <span className="text-slate-500">{meetingTime.toLocaleDateString('vi-VN')}</span>
                                                            </div>

                                                            <div className="flex items-center justify-between pt-3 border-t border-slate-800/50">
                                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500" title={`Gửi Email trước ${s.remindBeforeMinutes} phút`}>
                                                                    <Mail size={12} className="text-slate-600" /> Nhắc trước: {s.remindBeforeMinutes}p
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <button onClick={(e) => startEdit(e, s)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors border border-transparent hover:border-blue-500/20 bg-slate-800" title="Sửa lịch hẹn">
                                                                        <Edit2 size={13} />
                                                                    </button>
                                                                    <button onClick={() => setDeleteConfirmId(s._id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20 bg-slate-800" title="Xóa lịch họp">
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            if (isPassed) {
                                                                                setOverdueConfirmId(s._id);
                                                                            } else {
                                                                                if (onDirectJoin) onDirectJoin(s.roomId);
                                                                                else window.location.href = `/?room=${s.roomId}`;
                                                                            }
                                                                        }}
                                                                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg shadow-lg flex items-center gap-1 transition-all"
                                                                    >
                                                                        Vào phòng <ArrowRight size={12} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        )}

                        {/* ---- HISTORY TAB ---- */}
                        {activeTab === 'history' && (
                            histLoading && meetings.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent animate-spin rounded-full" />
                                    <p className="text-slate-500 text-sm">Đang tải lịch sử...</p>
                                </div>
                            ) : meetings.length === 0 ? (
                                <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800/50">
                                    <History size={56} className="mx-auto text-slate-800 mb-4 opacity-20" />
                                    <p className="text-slate-400 font-medium">Không có lịch sử cuộc họp gần đây</p>
                                    <p className="text-slate-600 text-xs mt-1">Các cuộc họp bạn tham gia sẽ xuất hiện ở đây</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {meetings.map((m) => {
                                        const isHost = m.hostId === user?.id;
                                        const isStillActive = activeRooms.some(r => r.roomId === m.roomId);
                                        return (
                                            <div key={m._id} className={`bg-slate-900 border p-4 rounded-2xl hover:border-blue-500/30 transition-all group ${isHost ? 'border-blue-500/30' : 'border-slate-800'}`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="text-blue-400 text-[10px] font-bold uppercase tracking-wider">Room ID: {m.roomId}</div>
                                                            {isHost && (
                                                                <span className="bg-amber-500/10 text-amber-500 text-[9px] px-1.5 py-0.5 rounded border border-amber-500/20 font-bold flex items-center gap-1">
                                                                    <UserIcon size={10} /> CHỦ PHÒNG
                                                                </span>
                                                            )}
                                                            {isStillActive && (
                                                                <span className="bg-green-500/10 text-green-400 text-[9px] px-1.5 py-0.5 rounded border border-green-500/20 font-bold flex items-center gap-1 animate-pulse">
                                                                    ● LIVE
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h4 className="text-white font-bold text-sm group-hover:text-blue-400 transition-colors">
                                                            {isHost ? 'Phòng họp của bạn' : `Cuộc họp cùng ${m.host}`}
                                                        </h4>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-slate-300 text-xs font-bold flex items-center gap-1 justify-end"><Calendar size={12} /> {new Date(m.createdAt).toLocaleDateString('vi-VN')}</div>
                                                        <div className="text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800/50">
                                                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                                        <Clock size={14} className="text-slate-500" />
                                                        <span>{m.endedAt ? Math.round((new Date(m.endedAt).getTime() - new Date(m.createdAt).getTime()) / 60000) : '...'} phút</span>
                                                    </div>
                                                    {isHost && isStillActive && (
                                                        <button
                                                            onClick={() => setCloseConfirmRoomId(m.roomId)}
                                                            disabled={closingRoomId === m.roomId}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 hover:text-red-300 text-[11px] font-bold rounded-lg border border-red-500/30 hover:border-red-400/50 transition-all disabled:opacity-50"
                                                        >
                                                            {closingRoomId === m.roomId
                                                                ? <span className="w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                                                : <Power size={12} />}
                                                            Hủy phòng
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        )}
                    </div>
                </motion.div>

                <ConfirmModal
                    isOpen={!!deleteConfirmId}
                    title="Xóa Lịch Hẹn"
                    message="Bạn có chắc chắn muốn xóa Lịch hẹn này không? Hành động này không thể hoàn tác."
                    confirmText="Xác nhận xóa"
                    cancelText="Không, giữ lại"
                    type="danger"
                    onConfirm={() => deleteConfirmId && handleDeleteSchedule(deleteConfirmId)}
                    onCancel={() => setDeleteConfirmId(null)}
                />

                <ConfirmModal
                    isOpen={!!overdueConfirmId}
                    title="⏰ Phòng họp đã quá hạn"
                    message="Phòng họp này đã quá thời gian hẹn. Bạn có muốn tiếp tục vào phòng không?"
                    confirmText="✅ Tiếp tục vào phòng"
                    cancelText="🗑️ Hủy & Xóa lịch này"
                    type="warning"
                    onConfirm={() => {
                        const meetingObj = schedules.find(s => s._id === overdueConfirmId);
                        if (meetingObj) {
                            if (onDirectJoin) onDirectJoin(meetingObj.roomId);
                            else window.location.href = `/?room=${meetingObj.roomId}`;
                        }
                        setOverdueConfirmId(null);
                    }}
                    onCancel={() => overdueConfirmId && handleDeleteSchedule(overdueConfirmId)}
                    onClose={() => setOverdueConfirmId(null)}
                />

                <ConfirmModal
                    isOpen={!!closeConfirmRoomId}
                    title="🔴 Đóng phòng họp"
                    message="Bạn có chắc muốn đóng phòng này không? Tất cả người đang ở trong phòng sẽ bị ngắt kết nối ngay lập tức."
                    confirmText="Đóng phòng ngay"
                    cancelText="Hủy"
                    type="danger"
                    onConfirm={() => closeConfirmRoomId && handleCloseRoom(closeConfirmRoomId)}
                    onCancel={() => setCloseConfirmRoomId(null)}
                    onClose={() => setCloseConfirmRoomId(null)}
                />
            </div>
        </AnimatePresence>
    );
};

export default ScheduleModal;
