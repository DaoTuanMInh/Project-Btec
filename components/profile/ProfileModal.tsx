// @ts-nocheck
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User as UserIcon, Lock, Mail, Camera, Save, Key, Send, CheckCircle, AlertCircle, Clock, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { updateProfile, changePassword, requestEmailChange, verifyEmailChange } from '../../services/authService';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onUpdateUser: (user: any) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, user, onUpdateUser }) => {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'info' | 'security' | 'contact'>('info');
    const [loading, setLoading] = useState(false);

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
            // Avatar đã được upload khi chọn file, chỉ cần lưu thông tin còn lại
            const res = await fetch('/api/user/update-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, avatar: avatarUrl })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onUpdateUser(data.user);
            showToast("Cập nhật thông tin thành công!", 'success');
        } catch (e: any) {
            showToast(e.message || 'Lỗi khi lưu thông tin', 'error');
        } finally { setLoading(false); }
    };

    const handleChangePassword = async () => {
        if (newPass !== confirmPass) return showToast("Mật khẩu mới không khớp", 'error');
        setLoading(true);
        try {
            const res = await changePassword(user.id, oldPass, newPass);
            showToast(res.message || 'Đổi mật khẩu thành công!', 'success');
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


    // Auto fetch when tab is opened
    React.useEffect(() => {
        // Nothing to auto-fetch anymore
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
                            <SidebarItem active={activeTab === 'security'} onClick={() => setActiveTab('security')} icon={Lock} label="Bảo mật" isMobileHorizontal />
                            <SidebarItem active={activeTab === 'contact'} onClick={() => setActiveTab('contact')} icon={Mail} label="Đổi email" isMobileHorizontal />
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
                                            <p className="text-xs text-slate-500">{user.email}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex flex-col items-center gap-3">
                                            <input
                                                type="file"
                                                id="avatar-upload"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    if (file.size > 5 * 1024 * 1024) {
                                                        showToast("Ảnh quá lớn! Vui lòng chọn ảnh dưới 5MB", 'error');
                                                        return;
                                                    }
                                                    // Resize and Compress Image using Canvas before Base64
                                                    const objectUrl = URL.createObjectURL(file);
                                                    const img = new Image();
                                                    img.onload = async () => {
                                                        const canvas = document.createElement('canvas');
                                                        const MAX_WIDTH = 150;
                                                        const MAX_HEIGHT = 150;
                                                        let width = img.width;
                                                        let height = img.height;

                                                        if (width > height) {
                                                            if (width > MAX_WIDTH) {
                                                                height = Math.round((height *= MAX_WIDTH / width));
                                                                width = MAX_WIDTH;
                                                            }
                                                        } else {
                                                            if (height > MAX_HEIGHT) {
                                                                width = Math.round((width *= MAX_HEIGHT / height));
                                                                height = MAX_HEIGHT;
                                                            }
                                                        }

                                                        canvas.width = width;
                                                        canvas.height = height;
                                                        const ctx = canvas.getContext('2d');
                                                        ctx?.drawImage(img, 0, 0, width, height);

                                                        // Get compressed Base64 string (Quality 0.8)
                                                        const base64Avatar = canvas.toDataURL('image/jpeg', 0.8);
                                                        URL.revokeObjectURL(objectUrl);

                                                        setLoading(true);
                                                        try {
                                                            const res = await fetch('/api/user/update-profile', {
                                                                method: 'POST',
                                                                headers: {
                                                                    'Content-Type': 'application/json',
                                                                    'ngrok-skip-browser-warning': 'true'
                                                                },
                                                                body: JSON.stringify({ userId: user.id, avatar: base64Avatar, username: user.username })
                                                            });

                                                            const contentType = res.headers.get("content-type");
                                                            if (contentType && contentType.indexOf("application/json") !== -1) {
                                                                const data = await res.json();
                                                                if (!res.ok) throw new Error(data.error || 'Có lỗi khi cập nhật profile');

                                                                setAvatarUrl(base64Avatar);
                                                                onUpdateUser(data.user);
                                                                showToast('Ảnh đại diện đã được cập nhật!', 'success');
                                                            } else {
                                                                const textData = await res.text();
                                                                console.error("API trả về HTML thay vì JSON:", textData);
                                                                throw new Error("Server gửi về dữ liệu sai định dạng (có thể bạn chọn ảnh quá lớn)");
                                                            }
                                                        } catch (err: any) {
                                                            showToast(err.message || 'Lỗi cập nhật ảnh đại diện', 'error');
                                                        } finally {
                                                            setLoading(false);
                                                        }
                                                    };
                                                    img.src = objectUrl;
                                                }}
                                            />
                                            <label
                                                htmlFor="avatar-upload"
                                                className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all"
                                            >
                                                {loading ? 'Đang upload...' : <><Camera size={18} /> Chọn ảnh từ máy</>}
                                            </label>
                                            <p className="text-xs text-slate-500">Chọn ảnh từ máy tính (tối đa 5MB) — upload tự động</p>
                                        </div>


                                    </div>

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
