const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'avo-secret-zero-trust-key-2024';

const otpStore = new Map();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Đăng ký
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: 'Email is already registered' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Server Error' }); }
});

// Đăng nhập
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: 'Invalid login information' });
        }
        res.json({
            success: true,
            user: { id: user.id, username: user.username, email: user.email, currentRoom: user.currentRoom, avatar: user.avatar },
            token: jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
        });
    } catch (err) { res.status(500).json({ error: 'Server Error' }); }
});

// Gửi OTP đăng ký
router.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ error: 'Email is already registered' });
    const now = Date.now();
    const existing = otpStore.get(email);
    if (existing && (now - existing.lastSentAt < 60000)) return res.status(429).json({ error: 'Please wait 60s before getting a new code' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { code, expiresAt: now + 5 * 60 * 1000, lastSentAt: now, attempts: 0 });
    try {
        await transporter.sendMail({
            from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'AVO Meeting Verification Code',
            html: `<h3>Your verification code is: <b style="letter-spacing:5px">${code}</b></h3><p>Valid for 5 minutes.</p>`
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Failed to send email' }); }
});

// Xác nhận OTP
router.post('/verify-otp', (req, res) => {
    const { email, code } = req.body;
    const record = otpStore.get(email);
    if (!record) return res.status(400).json({ error: 'Code has expired or does not exist' });
    if (record.code !== code) return res.status(400).json({ error: 'Incorrect verification code' });
    otpStore.delete(email);
    res.json({ success: true });
});

// Quên mật khẩu - gửi OTP
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'Email is not registered' });
    const now = Date.now();
    const existing = otpStore.get(`reset_${email}`);
    if (existing && (now - existing.lastSentAt < 60000)) return res.status(429).json({ error: 'Please wait 60s before sending the code again' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(`reset_${email}`, { code, expiresAt: now + 5 * 60 * 1000, lastSentAt: now });
    try {
        await transporter.sendMail({
            from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: ' Reset Password AVO Meeting',
            html: `
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px">
                    <h2 style="color:#60a5fa;margin-bottom:8px">Forgot password?</h2>
                    <p style="color:#94a3b8">We received a request to reset the password for the account <b style="color:#e2e8f0">${email}</b>.</p>
                    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
                        <p style="color:#94a3b8;margin:0 0 8px">Your verification code is:</p>
                        <p style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#60a5fa;margin:0">${code}</p>
                        <p style="color:#64748b;font-size:12px;margin:12px 0 0">Valid for <b>5 minutes</b></p>
                    </div>
                    <p style="color:#64748b;font-size:13px">If you did not request this, please ignore this email.</p>
                </div>
            `
        });
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Failed to send email' }); }
});

// Đặt lại mật khẩu
router.post('/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error: 'Missing information' });
    const record = otpStore.get(`reset_${email}`);
    if (!record) return res.status(400).json({ error: 'Code has expired or does not exist' });
    if (Date.now() > record.expiresAt) { otpStore.delete(`reset_${email}`); return res.status(400).json({ error: 'Verification code has expired' }); }
    if (record.code !== code) return res.status(400).json({ error: 'Incorrect verification code' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await User.updateOne({ email }, { password: hashedPassword });
        otpStore.delete(`reset_${email}`);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to update password' }); }
});

module.exports = { router, otpStore, transporter };
