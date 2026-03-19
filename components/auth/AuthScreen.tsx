import React, { useState } from 'react';
import { User as UserIcon, Lock, ArrowRight, Loader2, Key, Mail, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../ui/Toast';
import { login, register, requestOtp, confirmOtp, forgotPassword, resetPassword } from '../../services/authService';

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

    // Forgot Password State
    // step: 'email' | 'otp' | 'newpass'
    const [isForgot, setIsForgot] = useState(false);
    const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'newpass'>('email');
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [showNewPass, setShowNewPass] = useState(false);

    // Visibility States
    const [showPass, setShowPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);

    // Remember Me
    const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('avo_remember_email'));

    // Pre-fill email if remembered
    React.useEffect(() => {
        const saved = localStorage.getItem('avo_remember_email');
        if (saved) setEmail(saved);
    }, []);

    const handleSendOtp = async () => {
        if (!email) return showToast("Please enter your email address", 'error');
        setIsLoading(true);
        try {
            await requestOtp(email);
            setOtpSent(true);
            showToast("The verification code has been sent! Please check your email.", 'info');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // === FORGOT PASSWORD HANDLERS ===
    const handleForgotSendOtp = async () => {
        if (!email) return showToast("Please enter Email", 'error');
        setIsLoading(true);
        try {
            await forgotPassword(email);
            setForgotStep('otp');
            showToast("The password reset code has been sent!", 'info');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally { setIsLoading(false); }
    };

    const handleForgotVerifyOtp = async () => {
        if (!otpCode) return showToast("Please enter the verification code", 'error');
        setIsLoading(true);
        try {
            // We just move to next step; OTP verified server-side on reset
            setForgotStep('newpass');
            showToast("Verification successful! Please enter a new password.", 'success');
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally { setIsLoading(false); }
    };

    const handleForgotReset = async () => {
        if (!newPassword) return showToast("Please enter a new password", 'error');
        if (newPassword !== confirmNewPassword) return showToast("Passwords do not match", 'error');
        if (newPassword.length < 6) return showToast("Password must be at least 6 characters long", 'warning');
        setIsLoading(true);
        try {
            await resetPassword(email, otpCode, newPassword);
            showToast("Password reset successful! Please login.", 'success');
            // Reset all state
            setIsForgot(false);
            setForgotStep('email');
            setOtpCode("");
            setNewPassword("");
            setConfirmNewPassword("");
            setIsLogin(true);
        } catch (error: any) {
            showToast(error.message, 'error');
        } finally { setIsLoading(false); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!email || !password) return showToast("Please enter your email address and password", 'error');
        if (!isLogin) {
            if (!username && !otpSent) return showToast("Please enter your username", 'error');
            if (password !== confirmPassword && !otpSent) return showToast("Passwords do not match", 'error');

            // Password Complexity Check
            const hasUpperCase = /[A-Z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
            const minLength = password.length >= 6;

            if (!otpSent) {
                if (!hasUpperCase) return showToast("Password must contain at least one uppercase letter", 'warning');
                if (!hasNumber) return showToast("Password must contain at least one number", 'warning');
                if (!hasSpecialChar) return showToast("Password must contain at least one special character", 'warning');
                if (!minLength) return showToast("Password must be at least 6 characters long", 'warning');
            }
        }

        setIsLoading(true);
        try {
            if (isLogin) {
                // LOGIN
                if (rememberMe) {
                    localStorage.setItem('avo_remember_email', email);
                } else {
                    localStorage.removeItem('avo_remember_email');
                }
                await login(email, password, rememberMe);
                showToast("Login successful!", 'success');
                onAuthenticated();
            } else {
                // REGISTER
                if (!otpSent) {
                    // Step 1: Request OTP
                    await handleSendOtp();
                } else {
                    // Step 2: Verify OTP & Register
                    if (!otpCode) throw new Error("Please enter the verification code");
                    await confirmOtp(email, otpCode);

                    // Proceed to Register
                    await register(email, username, password);
                    showToast("Registration successful! Please login.", 'success');

                    // Reset State
                    setIsLogin(true);
                    setOtpSent(false);
                    setOtpCode("");
                    setPassword("");
                    setConfirmPassword("");
                }
            }
        } catch (error: any) {
            showToast(error.message || "An error occurred", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // Header title helper
    const getTitle = () => {
        if (isForgot) {
            if (forgotStep === 'email') return 'Forgot Password';
            if (forgotStep === 'otp') return 'Enter Verification Code';
            return 'Set New Password';
        }
        if (isLogin) return 'Login with Email';
        return otpSent ? 'Enter Verification Code' : 'Create New Account';
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
                    <img src="/logoAVO.png" alt="Logo" className="w-24 h-24 mx-auto mb-1 object-contain rounded-full shadow-lg" onError={(e) => e.currentTarget.style.display = 'none'} />
                    <p className="text-slate-200 font-medium">{getTitle()}</p>
                </div>

                {/* ===== FORGOT PASSWORD FLOW ===== */}
                <AnimatePresence mode="wait">
                    {isForgot && (
                        <MotionDiv key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="p-8 space-y-4">

                            {/* Step 1: Enter email */}
                            {forgotStep === 'email' && (
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-400">Enter the email address associated with your account to receive a password reset code.</p>
                                    <div className="relative">
                                        <Mail size={18} className="absolute left-3 top-3 text-slate-500" />
                                        <input type="email" className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="example@gmail.com" value={email} onChange={e => setEmail(e.target.value)} />
                                    </div>
                                    <button onClick={handleForgotSendOtp} disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all">
                                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <><Mail size={18} />Send Verification Code</>}
                                    </button>
                                </div>
                            )}

                            {/* Step 2: Enter OTP */}
                            {forgotStep === 'otp' && (
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-400">The verification code has been sent to <b className="text-slate-200">{email}</b>. It is valid for 5 minutes.</p>
                                    <div className="relative">
                                        <Key size={18} className="absolute left-3 top-3 text-slate-500" />
                                        <input type="text" inputMode="numeric" maxLength={6} className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 outline-none tracking-[0.5em] font-mono text-center text-lg" placeholder="000000" value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))} />
                                    </div>
                                    <button onClick={handleForgotVerifyOtp} disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all">
                                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <><ShieldCheck size={18} />Verify Code</>}
                                    </button>
                                    <button onClick={() => { setForgotStep('email'); setOtpCode(''); }} className="w-full text-slate-500 hover:text-slate-300 text-sm py-1 transition-colors">← Resend Code</button>
                                </div>
                            )}

                            {/* Step 3: New Password */}
                            {forgotStep === 'newpass' && (
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-400">Enter a new password for the account <b className="text-slate-200">{email}</b></p>
                                    <div className="relative">
                                        <Lock size={18} className="absolute left-3 top-3 text-slate-500" />
                                        <input type={showNewPass ? 'text' : 'password'} className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg py-2.5 pl-10 pr-10 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="New Password (≥6 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                                        <button type="button" onClick={() => setShowNewPass(v => !v)} className="absolute right-3 top-3 text-slate-500 hover:text-slate-300">{showNewPass ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                                    </div>
                                    <div className="relative">
                                        <Lock size={18} className="absolute left-3 top-3 text-slate-500" />
                                        <input type="password" className="w-full bg-slate-800 border border-slate-700 text-slate-100 rounded-lg py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Confirm New Password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} />
                                    </div>
                                    <button onClick={handleForgotReset} disabled={isLoading} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all">
                                        {isLoading ? <Loader2 className="animate-spin" size={20} /> : <><ShieldCheck size={18} />Reset Password</>}
                                    </button>
                                </div>
                            )}

                            <button onClick={() => { setIsForgot(false); setForgotStep('email'); setOtpCode(''); setEmail(''); }} className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors pt-2">
                                ← Back to Login
                            </button>
                        </MotionDiv>
                    )}
                </AnimatePresence>

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
                                        <label className="text-sm font-medium text-green-400">Verification Code (OTP)</label>
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
                                        <p className="text-xs text-slate-500 text-center">The code has been sent to Terminal (Server Log).</p>
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
                                        <label className="text-sm font-medium text-slate-300">Display Name</label>
                                        <div className="relative">
                                            <UserIcon size={18} className="absolute left-3 top-3 text-slate-500" />
                                            <input
                                                type="text"
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                placeholder="Enter display name"
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
                                        <label className="text-sm font-medium text-slate-300">Password</label>
                                        <div className="relative">
                                            <Lock size={18} className="absolute left-3 top-3 text-slate-500" />
                                            <input
                                                type={showPass ? "text" : "password"}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-10 pr-10 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                placeholder="Enter password"
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
                                            <label className="text-sm font-medium text-slate-300">Confirm Password</label>
                                            <div className="relative">
                                                <Key size={18} className="absolute left-3 top-3 text-slate-500" />
                                                <input
                                                    type={showConfirmPass ? "text" : "password"}
                                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-10 pr-10 text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                                    placeholder="Confirm password"
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

                        {/* Remember Me (login only) */}
                        {isLogin && (
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={rememberMe}
                                            onChange={e => setRememberMe(e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-4.5 h-4.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all
                                            ${rememberMe
                                                ? 'bg-blue-600 border-blue-600'
                                                : 'bg-slate-800 border-slate-600 group-hover:border-slate-400'
                                            }`}
                                        >
                                            {rememberMe && (
                                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">Remember me</span>
                                </label>
                                <span className="text-xs text-slate-600 italic">Save in {rememberMe ? '30 days' : 'this session'}</span>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full mt-6 ${otpSent && !isLogin ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'} text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer`}
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={20} /> : (
                                isLogin ? "Login" : (
                                    otpSent ? "Verify & Register" : "Send Verification Code"
                                )
                            )}
                            {!isLoading && <ArrowRight size={18} />}
                        </button>
                    </form>

                    {/* Toggle Mode */}
                    {!isForgot && (
                        <div className="mt-6 text-center text-sm text-slate-400">
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <button onClick={() => { setIsLogin(!isLogin); setOtpSent(false); }} className="text-blue-400 hover:text-blue-300 font-medium hover:underline transition-colors">
                                {isLogin ? "Register now" : "Login now"}
                            </button>
                            {isLogin && (
                                <div className="mt-3">
                                    <button onClick={() => { setIsForgot(true); setForgotStep('email'); setEmail(''); setOtpCode(''); }} className="text-amber-400 hover:text-amber-300 text-xs hover:underline transition-colors">
                                        Forgot password?
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </MotionDiv>
        </div>
    );
};

export default AuthScreen;
