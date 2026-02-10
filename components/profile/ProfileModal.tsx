// @ts-nocheck
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User as UserIcon, Lock, Mail, Camera, Save, Key, Send, CheckCircle, AlertCircle, Clock, Calendar, Users as UsersIcon, History, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { updateProfile, changePassword, requestEmailChange, verifyEmailChange, getMeetingHistory } from '../../services/authService';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onUpdateUser: (user: any) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, user, onUpdateUser }) => {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'info' | 'security' | 'contact' | 'history'>('info');
    const [loading, setLoading] = useState(false);
    const [meetings, setMeetings] = useState<any[]>([]);

    // Info State
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');

    // Password State
    const [oldPass, setOldPass] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');

    // Email State
    const [emailPass, setEmailPass] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [stepEmail, setStepEmail] = useState<'request' | 'verify'>('request');

    // Handlers
    const handleUpdateProfile = async () => {
        setLoading(true);
        try {
            const updatedUser = await updateProfile(user.id, avatarUrl);
            onUpdateUser(updatedUser); // Update parent state
            showToast("Cập nhật thông tin thành công!", 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally { setLoading(false); }
    };

    const handleChangePassword = async () => {
        if (newPass !== confirmPass) return showToast("Mật khẩu mới không khớp", 'error');
        setLoading(true);
        try {
            const res = await changePassword(user.id, oldPass, newPass);
            showToast(res.message, 'success');
            setOldPass(''); setNewPass(''); setConfirmPass('');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally { setLoading(false); }
    };

    const handleRequestEmail = async () => {
        setLoading(true);
        try {
            const res = await requestEmailChange(user.id, emailPass, newEmail);
            showToast(res.message, 'success');
            setStepEmail('verify');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally { setLoading(false); }
    };

    const handleVerifyEmail = async () => {
        setLoading(true);
        try {
            const res = await verifyEmailChange(user.id, newEmail, otpCode);
            showToast(res.message, 'success');
            // Update local user email display
            onUpdateUser({ ...user, email: newEmail });
            setStepEmail('request'); setOtpCode(''); setNewEmail(''); setEmailPass('');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally { setLoading(false); }
    };

    const handleFetchHistory = async () => {
        if (!user || !user.id) {
            console.warn("[Profile] No User ID found for history fetch");
            return;
        }
        setLoading(true);
        try {
            console.log(`[Profile] Fetching history for: ${user.id}`);
            const data = await getMeetingHistory(user.id);
            console.log(`[Profile] Received ${data.length} records`);
            setMeetings(data);
        } catch (e: any) {
            console.error("[Profile] Fetch error:", e);
            showToast(e.message, 'error');
        } finally { setLoading(false); }
    };

    // Auto fetch when tab is opened
    React.useEffect(() => {
        if (activeTab === 'history' && isOpen) {
            handleFetchHistory();
        }
    }, [activeTab, isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

                {/* @ts-ignore - Framer Motion type compatibility */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full max-w-lg md:max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden mx-auto"
                >
                    {/* Header */}
                    <div className="flex justify-between items-center p-5 border-b border-slate-800 bg-slate-800/50">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <UserIcon className="text-blue-400" size={24} /> Hồ sơ cá nhân
                        </h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex flex-col md:flex-row md:h-[500px] max-h-[90vh] overflow-y-auto md:overflow-hidden">
                        {/* Tabs (Sidebar on Desktop, Top Bar on Mobile) */}
                        <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/50 p-3 md:p-4 flex flex-row md:flex-col gap-2 overflow-x-auto no-scrollbar">
                            <SidebarItem active={activeTab === 'info'} onClick={() => setActiveTab('info')} icon={UserIcon} label="Thông tin" isMobileHorizontal />
                            <SidebarItem active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={History} label="Lịch sử họp" isMobileHorizontal />
                            <SidebarItem active={activeTab === 'security'} onClick={() => setActiveTab('security')} icon={Lock} label="Bảo mật" isMobileHorizontal />
                            <SidebarItem active={activeTab === 'contact'} onClick={() => setActiveTab('contact')} icon={Mail} label="Liên hệ" isMobileHorizontal />
                        </div>

                        {/* Content Area */}
                        <div className="w-full md:w-2/3 p-4 md:p-6 overflow-y-auto custom-scrollbar bg-slate-950/30 flex-1">

                            {/* --- INFO TAB --- */}
                            {activeTab === 'info' && (
                                <div className="space-y-6">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="relative group">
                                            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-700 bg-slate-800 flex items-center justify-center">
                                                {avatarUrl ? (
                                                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" onError={(e) => e.currentTarget.src = `https://ui-avatars.com/api/?name=${user.username}&background=random`} />
                                                ) : (
                                                    <span className="text-3xl font-bold text-slate-500">{user.username?.charAt(0)}</span>
                                                )}
                                            </div>
                                            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                                <Camera className="text-white" />
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-lg font-bold text-white">{user.username}</h3>
                                            <p className="text-sm text-slate-400">ID: {user.id}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex flex-col items-center gap-3">
                                            <input
                                                type="file"
                                                id="avatar-upload"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        if (file.size > 2 * 1024 * 1024) {
                                                            showToast("Ảnh quá lớn! Vui lòng chọn ảnh dưới 2MB", 'error');
                                                            return;
                                                        }
                                                        const reader = new FileReader();
                                                        reader.onloadend = () => {
                                                            setAvatarUrl(reader.result as string);
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                            />
                                            <label
                                                htmlFor="avatar-upload"
                                                className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all"
                                            >
                                                <Camera size={18} /> Chọn ảnh từ máy
                                            </label>
                                            <p className="text-xs text-slate-500">Chọn ảnh từ máy tính (tối đa 2MB)</p>
                                        </div>


                                    </div>

                                    <button
                                        onClick={handleUpdateProfile}
                                        disabled={loading}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2 font-bold flex items-center justify-center gap-2 transition-all"
                                    >
                                        {loading ? "Đang lưu..." : <><Save size={18} /> Lưu thay đổi</>}
                                    </button>
                                </div>
                            )}

                            {/* --- SECURITY TAB --- */}
                            {activeTab === 'security' && (
                                <div className="space-y-5">
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Key size={20} /> Đổi mật khẩu</h3>

                                    <InputGroup label="Mật khẩu hiện tại" type="password" value={oldPass} onChange={setOldPass} />
                                    <InputGroup label="Mật khẩu mới" type="password" value={newPass} onChange={setNewPass} />
                                    <InputGroup label="Xác nhận mật khẩu mới" type="password" value={confirmPass} onChange={setConfirmPass} />

                                    <button
                                        onClick={handleChangePassword}
                                        disabled={loading || !oldPass || !newPass}
                                        className="w-full bg-red-600 hover:bg-red-500 text-white rounded-xl py-2 font-bold flex items-center justify-center gap-2 transition-all mt-4"
                                    >
                                        {loading ? "Đang xử lý..." : "Đổi mật khẩu"}
                                    </button>
                                </div>
                            )}

                            {/* --- CONTACT TAB --- */}
                            {activeTab === 'contact' && (
                                <div className="space-y-5">
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Mail size={20} /> Đổi Email</h3>

                                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl mb-4">
                                        <p className="text-xs text-blue-300">Email hiện tại: <span className="text-white font-bold">{user.email}</span></p>
                                    </div>

                                    {stepEmail === 'request' ? (
                                        <>
                                            <InputGroup label="Email mới" type="email" value={newEmail} onChange={setNewEmail} placeholder="tencuaban@example.com" />
                                            <InputGroup label="Mật khẩu xác nhận" type="password" value={emailPass} onChange={setEmailPass} />

                                            <button
                                                onClick={handleRequestEmail}
                                                disabled={loading || !newEmail || !emailPass}
                                                className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2 font-bold flex items-center justify-center gap-2 transition-all mt-2"
                                            >
                                                {loading ? "Đang gửi..." : <><Send size={18} /> Gửi mã xác thực</>}
                                            </button>
                                        </>
                                    ) : (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                                            <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                                                <CheckCircle size={16} /> Đã gửi mã tới {newEmail}
                                            </div>
                                            <InputGroup label="Mã xác thực (OTP)" type="text" value={otpCode} onChange={setOtpCode} placeholder="123456" />

                                            <button
                                                onClick={handleVerifyEmail}
                                                disabled={loading || !otpCode}
                                                className="w-full bg-green-600 hover:bg-green-500 text-white rounded-xl py-2 font-bold flex items-center justify-center gap-2 transition-all mt-2"
                                            >
                                                {loading ? "Đang xác thực..." : "Xác nhận đổi Email"}
                                            </button>
                                            <button onClick={() => setStepEmail('request')} className="w-full text-slate-400 text-sm hover:text-white mt-2 underline">Quay lại</button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- HISTORY TAB --- */}
                            {activeTab === 'history' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-lg font-semibold text-white flex items-center gap-2"><History size={20} className="text-blue-400" /> Lịch sử cuộc họp</h3>
                                        <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-full">{meetings.length} phiên</span>
                                    </div>

                                    {loading && meetings.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-10 gap-3">
                                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent animate-spin rounded-full" />
                                            <p className="text-slate-500 text-sm">Đang tải lịch sử...</p>
                                        </div>
                                    ) : meetings.length === 0 ? (
                                        <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800/50">
                                            <History size={48} className="mx-auto text-slate-800 mb-4 opacity-20" />
                                            <p className="text-slate-400 font-medium">Không có lịch sử cuộc họp gần đây</p>
                                            <p className="text-slate-600 text-xs mt-1">Các cuộc họp bạn tham gia sẽ xuất hiện ở đây</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {meetings.map((m) => {
                                                const isHost = m.hostId === user.id;
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
                                                                </div>
                                                                <h4 className="text-white font-bold text-sm group-hover:text-blue-400 transition-colors">
                                                                    {isHost ? "Phòng họp của bạn" : `Cuộc họp cùng ${m.host}`}
                                                                </h4>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-slate-300 text-xs font-bold flex items-center gap-1 justify-end"><Calendar size={12} /> {new Date(m.createdAt).toLocaleDateString('vi-VN')}</div>
                                                                <div className="text-[10px] text-slate-500">{new Date(m.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-800/50">
                                                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                                                <UsersIcon size={14} className="text-slate-500" />
                                                                <span>{m.participants?.length || 0} người tham gia</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                                                <Clock size={14} className="text-slate-500" />
                                                                <span>{m.endedAt ? Math.round((new Date(m.endedAt).getTime() - new Date(m.createdAt).getTime()) / 60000) : '?'} phút</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

// Helper Components
const SidebarItem = ({ active, onClick, icon: Icon, label, isMobileHorizontal }: any) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-xl transition-all text-xs md:text-sm font-medium whitespace-nowrap ${isMobileHorizontal ? 'flex-1 justify-center md:justify-start md:flex-none' : 'w-full'} ${active ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
    >
        <Icon size={18} /> <span>{label}</span>
    </button>
);

const InputGroup = ({ label, type, value, onChange, placeholder }: any) => {
    const [show, setShow] = useState(false);
    const isPassword = type === 'password';

    return (
        <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
            <div className="relative">
                <input
                    type={isPassword ? (show ? 'text' : 'password') : type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all focus:border-transparent placeholder:text-slate-600 pr-10"
                />
                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setShow(!show)}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ProfileModal;
