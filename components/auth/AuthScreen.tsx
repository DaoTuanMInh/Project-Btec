import React, { useState } from 'react';
import { User as UserIcon, Lock, ArrowRight, Loader2, Key, Mail, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../ui/Toast';
import { login, register, requestOtp, confirmOtp } from '../../services/authService';

interface AuthScreenProps {
    onAuthenticated: () => void;
}

// Workaround for React 19 type mismatch with framer-motion v10
const MotionDiv = motion.div as any;

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();

    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // OTP State
    const [otpSent, setOtpSent] = useState(false);
    const [otpCode, setOtpCode] = useState("");

    // Visibility States
    const [showPass, setShowPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);

    const handleSendOtp = async () => {
        if (!email) return showToast("Vui lòng nhập Email", 'error');
        setIsLoading(true);
        try {
            await requestOtp(email);
            setOtpSent(true);
            showToast("Mã xác thực đã được gửi! Vui lòng kiểm tra Email.", 'info');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!email || !password) return showToast("Vui lòng nhập đầy đủ thông tin", 'error');
        if (!isLogin) {
            if (!username && !otpSent) return showToast("Vui lòng nhập tên hiển thị", 'error');
            if (password !== confirmPassword && !otpSent) return showToast("Mật khẩu xác nhận không khớp", 'error');

            // Password Complexity Check
            const hasUpperCase = /[A-Z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
            const minLength = password.length >= 6;

            if (!otpSent) {
                if (!hasUpperCase) return showToast("Mật khẩu phải có ít nhất 1 chữ hoa", 'warning');
                if (!hasNumber) return showToast("Mật khẩu phải có ít nhất 1 chữ số", 'warning');
                if (!hasSpecialChar) return showToast("Mật khẩu phải có ít nhất 1 ký tự đặc biệt", 'warning');
                if (!minLength) return showToast("Mật khẩu phải có ít nhất 6 ký tự", 'warning');
            }
        }

        setIsLoading(true);
        try {
            if (isLogin) {
                // LOGIN
                await login(email, password);
                showToast("Đăng nhập thành công!", 'success');
                onAuthenticated();
            } else {
                // REGISTER
                if (!otpSent) {
                    // Step 1: Request OTP
                    await handleSendOtp();
                } else {
                    // Step 2: Verify OTP & Register
                    if (!otpCode) throw new Error("Vui lòng nhập mã xác thực");
                    await confirmOtp(email, otpCode);

                    // Proceed to Register
                    await register(email, username, password);
                    showToast("Đăng ký thành công! Vui lòng đăng nhập.", 'success');

                    // Reset State
                    setIsLogin(true);
                    setOtpSent(false);
                    setOtpCode("");
                    setPassword("");
                    setConfirmPassword("");
                }
            }
        } catch (error: any) {
            showToast(error.message || "Đã có lỗi xảy ra", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            {/* Container */}
            <MotionDiv
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
                <div className="bg-slate-800/50 p-6 text-center border-b border-slate-800">
                    <img src="/logoAVO.png" alt="Logo" className="w-24 h-24 mx-auto mb-1 object-contain rounded-full shadow-lg" />
                    <p className="text-slate-200 font-medium">
                        {isLogin ? "Đăng nhập bằng Email" : (otpSent ? "Nhập mã xác thực" : "Tạo tài khoản mới")}
                    </p>
                </div>

                {/* Form */}
                <div className="p-8">
                    <form onSubmit={handleSubmit} className="space-y-4">

                        {/* Email Field */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Email (Gmail)</label>
                            <div className="relative">
                                <Mail size={18} className="absolute left-3 top-3 text-slate-500" />
                                <input
                                    disabled={otpSent}
                                    type="email"
                                    className={`w-full bg-slate-800 border ${otpSent ? 'border-green-500/50 text-green-400' : 'border-slate-700 text-slate-100'} rounded-lg py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                                    placeholder="example@gmail.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* OTP Input (Visible Only After Sending) */}
                        <AnimatePresence>
                            {otpSent && !isLogin && (
                                <MotionDiv
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="space-y-2 py-1">
                                        <label className="text-sm font-medium text-green-400">Mã xác thực (OTP)</label>
                                        <div className="relative">
                                            <input
                                                autoFocus
                                                type="text"
                                                maxLength={6}
                                                className="w-full bg-slate-800 border border-green-500 rounded-lg py-2.5 px-4 text-center text-xl tracking-widest font-mono text-green-400 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                                                placeholder="000000"
                                                value={otpCode}
                                                onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                            />
                                        </div>
                                        <p className="text-xs text-slate-500 text-center">Mã đã được gửi đến Terminal (Server Log).</p>
                                    </div>
                                </MotionDiv>
                            )}
                        </AnimatePresence>

                        {/* Username Field - Register Only */}
                        <AnimatePresence>
                            {!isLogin && !otpSent && (
                                <MotionDiv
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="space-y-2 p-1">
                                        <label className="text-sm font-medium text-slate-300">Tên hiển thị</label>
                                        <div className="relative">
                                            <UserIcon size={18} className="absolute left-3 top-3 text-slate-500" />
                                            <input
                                                type="text"
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                placeholder="Nhập tên hiển thị"
                                                value={username}
                                                onChange={e => setUsername(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </MotionDiv>
                            )}
                        </AnimatePresence>

                        {/* Password Fields - Hidden during OTP step for cleaner UI, or kept visible? Let's hide to focus on OTP */}
                        <AnimatePresence>
                            {(!isLogin && !otpSent) || isLogin ? (
                                <MotionDiv
                                    initial={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="space-y-4 overflow-hidden"
                                >
                                    {/* Password */}
                                    <div className="space-y-2 p-1">
                                        <label className="text-sm font-medium text-slate-300">Mật khẩu</label>
                                        <div className="relative">
                                            <Lock size={18} className="absolute left-3 top-3 text-slate-500" />
                                            <input
                                                type={showPass ? "text" : "password"}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-10 pr-10 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                placeholder="Nhập mật khẩu"
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPass(!showPass)}
                                                className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors"
                                            >
                                                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Confirm Password (Register Only) */}
                                    {!isLogin && (
                                        <div className="space-y-2 p-1">
                                            <label className="text-sm font-medium text-slate-300">Xác nhận mật khẩu</label>
                                            <div className="relative">
                                                <Key size={18} className="absolute left-3 top-3 text-slate-500" />
                                                <input
                                                    type={showConfirmPass ? "text" : "password"}
                                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-10 pr-10 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                    placeholder="Nhập lại mật khẩu"
                                                    value={confirmPassword}
                                                    onChange={e => setConfirmPassword(e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                                                    className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors"
                                                >
                                                    {showConfirmPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </MotionDiv>
                            ) : null}
                        </AnimatePresence>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full mt-6 ${otpSent && !isLogin ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'} text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer`}
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={20} /> : (
                                isLogin ? "Đăng nhập" : (
                                    otpSent ? "Xác thực & Đăng ký" : "Gửi mã xác thực"
                                )
                            )}
                            {!isLoading && <ArrowRight size={18} />}
                        </button>
                    </form>

                    {/* Toggle Mode */}
                    <div className="mt-6 text-center text-sm text-slate-400">
                        {isLogin ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
                        <button
                            onClick={() => { setIsLogin(!isLogin); setOtpSent(false); }}
                            className="text-blue-400 hover:text-blue-300 font-medium hover:underline transition-colors"
                        >
                            {isLogin ? "Đăng ký ngay" : "Đăng nhập ngay"}
                        </button>
                    </div>
                </div>
            </MotionDiv>
        </div>
    );
};

export default AuthScreen;
