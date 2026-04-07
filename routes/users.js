const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');
const { transporter } = require('./auth');

const JWT_SECRET = process.env.JWT_SECRET || 'avo-secret-zero-trust-key-2024';
const uploadsPath = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// OTP store dùng cho email change
const emailChangeOtpStore = new Map();

// ── Helper: Email Templates ──────────────────────────────

function passwordChangedEmail(username, email) {
    const time = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
    return {
        from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: '🔐 Your AVO Meeting Password Has Been Changed',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px">
            <h2 style="color:#f87171;margin-bottom:8px">⚠️ Password Changed</h2>
            <p style="color:#94a3b8">Hi <b style="color:#e2e8f0">${username}</b>,</p>
            <p style="color:#94a3b8">Your password on <b style="color:#60a5fa">AVO Meeting</b> was just changed successfully.</p>
            <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin:24px 0">
                <p style="margin:0;color:#94a3b8;font-size:13px"> Time: <b style="color:#e2e8f0">${time}</b></p>
                <p style="margin:8px 0 0;color:#94a3b8;font-size:13px"> Account: <b style="color:#e2e8f0">${email}</b></p>
            </div>
            <p style="color:#f87171;font-size:13px">If you did not make this change, please contact us immediately or reset your password.</p>
            <p style="color:#64748b;font-size:12px;margin-top:24px">— AVO Meeting Security Team</p>
        </div>`
    };
}

function emailChangeRequestOldEmail(username, oldEmail, newEmail) {
    const time = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
    return {
        from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
        to: oldEmail,
        subject: '📧 Email Change Request – AVO Meeting',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px">
            <h2 style="color:#fb923c;margin-bottom:8px"> Email Change Requested</h2>
            <p style="color:#94a3b8">Hi <b style="color:#e2e8f0">${username}</b>,</p>
            <p style="color:#94a3b8">We received a request to change the email address on your <b style="color:#60a5fa">AVO Meeting</b> account.</p>
            <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin:24px 0">
                <p style="margin:0;color:#94a3b8;font-size:13px"> Time: <b style="color:#e2e8f0">${time}</b></p>
                <p style="margin:8px 0 0;color:#94a3b8;font-size:13px"> Current email: <b style="color:#e2e8f0">${oldEmail}</b></p>
                <p style="margin:8px 0 0;color:#94a3b8;font-size:13px"> New email: <b style="color:#60a5fa">${newEmail}</b></p>
            </div>
            <p style="color:#fb923c;font-size:13px">A verification code has been sent to <b>${newEmail}</b> to confirm this change. If you did not request this, please secure your account immediately.</p>
            <p style="color:#64748b;font-size:12px;margin-top:24px">— AVO Meeting Security Team</p>
        </div>`
    };
}

function emailChangeOtpNewEmail(username, newEmail, code) {
    return {
        from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
        to: newEmail,
        subject: '✅ Verify Your New Email – AVO Meeting',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px">
            <h2 style="color:#60a5fa;margin-bottom:8px">Verify Your New Email</h2>
            <p style="color:#94a3b8">Hi <b style="color:#e2e8f0">${username}</b>,</p>
            <p style="color:#94a3b8">Please use the code below to confirm this email as your new <b style="color:#60a5fa">AVO Meeting</b> account email.</p>
            <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
                <p style="color:#94a3b8;margin:0 0 8px">Your verification code:</p>
                <p style="font-size:38px;font-weight:bold;letter-spacing:12px;color:#60a5fa;margin:0">${code}</p>
                <p style="color:#64748b;font-size:12px;margin:12px 0 0">Valid for <b>10 minutes</b></p>
            </div>
            <p style="color:#64748b;font-size:13px">If you did not request this, please ignore this email.</p>
            <p style="color:#64748b;font-size:12px;margin-top:24px">— AVO Meeting Security Team</p>
        </div>`
    };
}

function emailChangedConfirmation(username, oldEmail, newEmail, toEmail) {
    const time = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
    return {
        from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: '✅ Email Changed Successfully – AVO Meeting',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px">
            <h2 style="color:#34d399;margin-bottom:8px"> Email Updated Successfully</h2>
            <p style="color:#94a3b8">Hi <b style="color:#e2e8f0">${username}</b>,</p>
            <p style="color:#94a3b8">Your email address on <b style="color:#60a5fa">AVO Meeting</b> has been updated successfully.</p>
            <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin:24px 0">
                <p style="margin:0;color:#94a3b8;font-size:13px"> Time: <b style="color:#e2e8f0">${time}</b></p>
                <p style="margin:8px 0 0;color:#94a3b8;font-size:13px"> Old email: <b style="color:#f87171">${oldEmail}</b></p>
                <p style="margin:8px 0 0;color:#94a3b8;font-size:13px"> New email: <b style="color:#34d399">${newEmail}</b></p>
            </div>
            <p style="color:#64748b;font-size:13px">If you did not make this change, please contact support immediately.</p>
            <p style="color:#64748b;font-size:12px;margin-top:24px">— AVO Meeting Security Team</p>
        </div>`
    };
}

// ── Routes ──────────────────────────────────────────────

// Zero-Trust Room Access Token
router.post('/token', async (req, res) => {
    try {
        const { roomId, userId, role } = req.body;
        if (!roomId || !userId) return res.status(400).json({ error: 'Missing roomId or userId' });
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No authentication token' });
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.userId !== userId) return res.status(403).json({ error: 'userId does not match token' });
        const roomToken = jwt.sign({ userId, roomId, role: role || 'guest' }, JWT_SECRET, { expiresIn: '15m' });
        console.log(`Room token issued: user=${userId} → room=${roomId} role=${role}`);
        res.json({ token: roomToken });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cập nhật profile
router.post('/update-profile', async (req, res) => {
    try {
        const { userId, avatar, username } = req.body;
        const user = await User.findByIdAndUpdate(userId, { avatar, username }, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user: { id: user._id, username: user.username, email: user.email, currentRoom: user.currentRoom, avatar: user.avatar } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Đổi mật khẩu → gửi email thông báo về email hiện tại
router.post('/change-password', async (req, res) => {
    try {
        const { userId, oldPassword, newPassword } = req.body;
        const user = await User.findById(userId);
        if (!user || !(await bcrypt.compare(oldPassword, user.password)))
            return res.status(400).json({ error: 'Old password is incorrect' });

        user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
        await user.save();

        // Gửi email thông báo bảo mật về email cũ (không block response)
        transporter.sendMail(passwordChangedEmail(user.username, user.email)).catch(err =>
            console.error('Failed to send password change notification:', err)
        );

        res.json({ success: true, message: 'Password changed successfully!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Request đổi email: xác thực mật khẩu, gửi OTP về email mới + thông báo email cũ
router.post('/request-email-change', async (req, res) => {
    try {
        const { userId, password, newEmail } = req.body;
        if (!userId || !password || !newEmail)
            return res.status(400).json({ error: 'Missing required fields' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Kiểm tra email mới chưa tồn tại
        if (user.email === newEmail)
            return res.status(400).json({ error: 'New email must be different from current email' });
        const existing = await User.findOne({ email: newEmail });
        if (existing) return res.status(400).json({ error: 'This email is already in use by another account' });

        // Xác thực mật khẩu
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.status(400).json({ error: 'Incorrect password' });

        // Rate limit: 60s
        const storeKey = `emailchange_${userId}`;
        const existing_otp = emailChangeOtpStore.get(storeKey);
        const now = Date.now();
        if (existing_otp && (now - existing_otp.lastSentAt < 60000))
            return res.status(429).json({ error: 'Please wait 60 seconds before requesting again' });

        // Tạo OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        emailChangeOtpStore.set(storeKey, {
            code,
            newEmail,
            oldEmail: user.email,
            expiresAt: now + 10 * 60 * 1000, // 10 phút
            lastSentAt: now
        });

        // Gửi song song: OTP → email mới, thông báo → email cũ
        await Promise.all([
            transporter.sendMail(emailChangeOtpNewEmail(user.username, newEmail, code)),
            transporter.sendMail(emailChangeRequestOldEmail(user.username, user.email, newEmail))
        ]);

        res.json({ success: true, message: `Verification code sent to ${newEmail}` });
    } catch (e) {
        console.error('request-email-change error:', e);
        res.status(500).json({ error: 'Failed to send verification email' });
    }
});

// Verify OTP đổi email → gửi xác nhận cả 2 email → mới update MongoDB
router.post('/verify-email-change', async (req, res) => {
    try {
        const { userId, newEmail, code } = req.body;
        if (!userId || !newEmail || !code)
            return res.status(400).json({ error: 'Missing required fields' });

        const storeKey = `emailchange_${userId}`;
        const record = emailChangeOtpStore.get(storeKey);

        if (!record) return res.status(400).json({ error: 'Verification code has expired or does not exist' });
        if (Date.now() > record.expiresAt) {
            emailChangeOtpStore.delete(storeKey);
            return res.status(400).json({ error: 'Verification code has expired' });
        }
        if (record.newEmail !== newEmail) return res.status(400).json({ error: 'Email does not match request' });
        if (record.code !== code) return res.status(400).json({ error: 'Incorrect verification code' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const oldEmail = record.oldEmail;

        // Kiểm tra lại email mới chưa bị dùng (race condition)
        const taken = await User.findOne({ email: newEmail });
        if (taken && taken._id.toString() !== userId)
            return res.status(400).json({ error: 'This email is already in use by another account' });

        // Xoá OTP trước
        emailChangeOtpStore.delete(storeKey);

        // Gửi email xác nhận về CẢ HAI email TRƯỚC khi update
        await Promise.all([
            transporter.sendMail(emailChangedConfirmation(user.username, oldEmail, newEmail, oldEmail)),
            transporter.sendMail(emailChangedConfirmation(user.username, oldEmail, newEmail, newEmail))
        ]);

        // CẬP NHẬT MongoDB SAU KHI EMAIL ĐÃ ĐƯỢC GỬI
        user.email = newEmail;
        await user.save();

        res.json({ success: true, message: 'Email updated successfully!' });
    } catch (e) {
        console.error('verify-email-change error:', e);
        res.status(500).json({ error: 'Failed to update email' });
    }
});

// Lịch sử phòng của user
router.get('/meetings/:userId', async (req, res) => {
    try {
        const meetings = await Room.find({ hostId: req.params.userId }).sort({ createdAt: -1 });
        res.json(meetings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
