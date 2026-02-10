require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require("socket.io");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const multer = require('multer');

// --- Models ---
const User = require('./models/User');
const Message = require('./models/Message');
const Room = require('./models/Room');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'avo-secret-zero-trust-key-2024';
const PORT = 3001;

// 1. Middlewares
app.use(cors());
app.use(express.json());

// 2. Static Files
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath);
app.use('/uploads', express.static(uploadsPath));

// 3. HTTPS & Socket.io Setup
const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};
const server = https.createServer(options, app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// 4. Multer Configuration (Max 50MB)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// 5. MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 6. OTP & Email Setup
const otpStore = new Map();
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// --- API ROUTES ---

// OTP Logic
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const now = Date.now();
    const existing = otpStore.get(email);
    if (existing && (now - existing.lastSentAt < 60000)) {
        return res.status(429).json({ error: "Vui lòng đợi 60s trước khi lấy mã mới" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { code, expiresAt: now + 5 * 60 * 1000, lastSentAt: now, attempts: 0 });

    try {
        await transporter.sendMail({
            from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Mã xác thực AVO Meeting',
            html: `<h3>Mã xác thực của bạn là: <b style="letter-spacing:5px">${code}</b></h3><p>Hiệu lực 5 phút.</p>`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Gửi mail thất bại" });
    }
});

app.post('/api/verify-otp', (req, res) => {
    const { email, code } = req.body;
    const record = otpStore.get(email);
    if (!record) return res.status(400).json({ error: "Mã đã hết hạn hoặc không tồn tại" });
    if (record.code !== code) return res.status(400).json({ error: "Mã xác thực không đúng" });
    otpStore.delete(email);
    res.json({ success: true });
});

// Auth Logic
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });

        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: 'Email đã được sử dụng' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).send('Server Error'); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: 'Thông tin đăng nhập không chính xác' });
        }
        res.json({
            success: true,
            user: { id: user.id, username: user.username, email: user.email, currentRoom: user.currentRoom, avatar: user.avatar },
            token: jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
        });
    } catch (err) { res.status(500).send('Server Error'); }
});

// User & Profile
app.post('/api/user/update-profile', async (req, res) => {
    try {
        const { userId, avatar, username } = req.body;
        const user = await User.findByIdAndUpdate(userId, { avatar, username }, { new: true });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/change-password', async (req, res) => {
    try {
        const { userId, oldPassword, newPassword } = req.body;
        const user = await User.findById(userId);
        if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
            return res.status(400).json({ error: "Mật khẩu cũ không đúng" });
        }
        user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
        await user.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/user/meetings/:userId', async (req, res) => {
    try {
        const meetings = await Room.find({
            $or: [{ hostId: req.params.userId }, { "participants.userId": req.params.userId }]
        }).sort({ createdAt: -1 });
        res.json(meetings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Chat & Uploads
app.post('/api/chat/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    res.json({ url: `/uploads/${req.file.filename}`, fileName: req.file.originalname, fileSize: req.file.size });
});

app.get('/api/chat/history/:roomId', async (req, res) => {
    try {
        res.json(await Message.find({ roomId: req.params.roomId }).sort({ timestamp: 1 }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- SOCKET.IO LOGIC ---
const socketMap = {};
const roomMap = {};
const userSocketMap = {};

const handleSessionKick = (userId, newSocketId) => {
    const oldSocketId = userSocketMap[userId];
    if (oldSocketId && oldSocketId !== newSocketId) {
        io.to(oldSocketId).emit('force-logout', { reason: 'Tài khoản đã đăng nhập ở nơi khác.' });
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) setTimeout(() => oldSocket.disconnect(true), 500);
    }
    userSocketMap[userId] = newSocketId;
};

io.on('connection', (socket) => {
    socket.on('register-session', (userId) => {
        if (!userId) return;
        handleSessionKick(userId, socket.id);
        socketMap[socket.id] = { userId };
    });

    socket.on('check-room', async (roomId, password, userId, callback) => {
        if (typeof userId === 'function') { callback = userId; userId = null; }
        if (typeof password === 'function') { callback = password; password = null; }
        try {
            const room = await Room.findOne({ roomId, isActive: true });
            const serverPass = room?.settings?.password || '';
            callback({
                exists: !!room,
                requiresPassword: !!serverPass,
                valid: !serverPass || password === serverPass,
                locked: !!room?.settings?.lockRoom,
                isHost: room?.hostId === userId || room?.host === userId
            });
        } catch (e) { callback({ exists: false, error: e.message }); }
    });

    socket.on('join-room', async (roomId, userId, userName, isHost, settings, token, avatar) => {
        handleSessionKick(userId, socket.id);
        socket.join(roomId);
        socketMap[socket.id] = { roomId, userId, userName, avatar };

        try { await User.findByIdAndUpdate(userId, { currentRoom: roomId }); } catch (e) { }

        if (isHost) {
            let room = await Room.findOne({ roomId, isActive: true });
            if (!room) {
                room = new Room({ roomId, host: userName, hostId: userId, settings, password: settings?.password || '' });
                await room.save();
            }
        }

        if (!roomMap[roomId]) roomMap[roomId] = [];
        roomMap[roomId] = roomMap[roomId].filter(u => u.id !== userId);
        roomMap[roomId].push({ id: userId, name: userName, socketId: socket.id, avatar });

        try {
            await Room.updateOne({ roomId, isActive: true }, { $addToSet: { participants: { userId, username: userName } } });
        } catch (e) { }

        socket.to(roomId).emit('user-connected', userId, userName);
        socket.emit('existing-users', roomMap[roomId].filter(u => u.id !== userId));
    });

    socket.on('signal', async (data) => {
        const { roomId, type, payload, from, to } = data;
        if (type === 'chat') {
            try {
                const userInfo = socketMap[socket.id] || {};
                await new Message({
                    roomId, senderId: from, text: payload.text,
                    userName: payload.userName || userInfo.userName || "Người dùng",
                    type: payload.fileUrl ? (payload.isImage ? 'image' : 'file') : 'text',
                    fileUrl: payload.fileUrl, fileName: payload.fileName, fileSize: payload.fileSize
                }).save();
            } catch (e) { }
        }
        if (type === 'leave') {
            try { await User.findByIdAndUpdate(from || socketMap[socket.id]?.userId, { currentRoom: null }); } catch (e) { }
        }
        if (to) socket.to(to).emit('signal', data);
        else socket.to(roomId).emit('signal', data);
    });

    socket.on('disconnect', () => {
        const info = socketMap[socket.id];
        if (info) {
            const { roomId, userId } = info;
            if (userSocketMap[userId] === socket.id) delete userSocketMap[userId];
            if (roomMap[roomId]) {
                roomMap[roomId] = roomMap[roomId].filter(u => u.socketId !== socket.id);
                if (roomMap[roomId].length === 0) {
                    delete roomMap[roomId];
                    Room.updateOne({ roomId, isActive: true }, { isActive: false, endedAt: new Date() }).catch(() => { });
                }
            }
            socket.to(roomId).emit('signal', { type: 'leave', from: userId, roomId });
            delete socketMap[socket.id];
        }
    });
});

// SPA Fallback
app.get('/:path*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send("Build not found");
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on https://localhost:${PORT}`);
});
