const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');

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

// Đổi mật khẩu
router.post('/change-password', async (req, res) => {
    try {
        const { userId, oldPassword, newPassword } = req.body;
        const user = await User.findById(userId);
        if (!user || !(await bcrypt.compare(oldPassword, user.password))) return res.status(400).json({ error: 'Old password is incorrect' });
        user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
        await user.save();
        res.json({ success: true, message: 'Password changed successfully!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Lịch sử phòng của user
router.get('/meetings/:userId', async (req, res) => {
    try {
        const meetings = await Room.find({ hostId: req.params.userId }).sort({ createdAt: -1 });
        res.json(meetings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
