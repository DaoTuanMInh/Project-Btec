require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');    // HTTP cho ngrok (không cần SSL cert)
const fs = require('fs');
const path = require('path');
const { Server } = require("socket.io");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const User = require('./models/User');
const Message = require('./models/Message');
const Room = require('./models/Room');
const crypto = require('crypto');

// Setup Encryption configuration
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'avo-secret-zero-trust-key-2024').digest('base64').substring(0, 32);
const IV_LENGTH = 16;

function encryptText(text) {
    if (!text) return text;
    try {
        let iv = crypto.randomBytes(IV_LENGTH);
        let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (e) { return text; }
}

function decryptText(text) {
    if (!text) return text;
    let textParts = text.split(':');
    if (textParts.length !== 2) return text;
    try {
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return text;
    }
}

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'avo-secret-zero-trust-key-2024';
const PORT = 3001;

// 1. Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Tăng limit để hỗ trợ upload avatar base64
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 10 * 1024 * 1024 // 10MB to allow Base64 avatars
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

// JWT Verify Middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Không có token xác thực' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
    }
};

// OTP Logic
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Cấp OTP chỉ cho những email chưa được đăng ký
    const userExists = await User.findOne({ email });
    if (userExists) {
        return res.status(400).json({ error: "Email này đã được đăng ký" });
    }

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
        if (exists) return res.status(400).json({ error: 'Email này đã được đăng ký' });

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

// Zero-Trust Room Access Token
app.post('/api/token', verifyToken, async (req, res) => {
    try {
        const { roomId, userId, role } = req.body;
        if (!roomId || !userId) return res.status(400).json({ error: 'Thiếu roomId hoặc userId' });
        if (req.userId !== userId) return res.status(403).json({ error: 'userId không khớp với token' });
        const roomToken = jwt.sign(
            { userId, roomId, role: role || 'guest' },
            JWT_SECRET,
            { expiresIn: '15m' }
        );
        console.log(`🔑 Room token issued: user=${userId} → room=${roomId} role=${role}`);
        res.json({ token: roomToken });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// User & Profile
app.post('/api/user/update-profile', async (req, res) => {
    try {
        const { userId, avatar, username } = req.body;
        const user = await User.findByIdAndUpdate(userId, { avatar, username }, { new: true });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ success: true, user: { id: user._id, username: user.username, email: user.email, currentRoom: user.currentRoom, avatar: user.avatar } });
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
        res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
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
        const messages = await Message.find({ roomId: req.params.roomId }).sort({ timestamp: 1 });
        const decryptedMessages = messages.map(msg => ({
            ...msg._doc,
            text: decryptText(msg.text)
        }));
        res.json(decryptedMessages);
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
            const serverPass = room?.password || room?.settings?.password || '';
            callback({
                exists: !!room,
                requiresPassword: !!serverPass,
                valid: !serverPass || password === serverPass,
                locked: !!room?.settings?.lockRoom,
                isHost: room?.hostId === userId || room?.host === userId,
                isEmpty: !roomMap[roomId] || roomMap[roomId].length === 0
            });
        } catch (e) { callback({ exists: false, error: e.message }); }
    });

    socket.on('join-room', async (roomId, userId, userName, isHost, settings, token, avatar, callback) => {
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

        if (typeof callback === 'function') callback({ success: true });
    });

    socket.on('signal', async (data) => {
        const { roomId, type, payload, from, to } = data;
        if (type === 'chat') {
            try {
                const userInfo = socketMap[socket.id] || {};
                await new Message({
                    roomId, senderId: from, text: encryptText(payload.text),
                    userName: payload.userName || userInfo.userName || "Người dùng",
                    type: payload.fileUrl ? (payload.isImage ? 'image' : 'file') : 'text',
                    fileUrl: payload.fileUrl, fileName: payload.fileName, fileSize: payload.fileSize
                }).save();
            } catch (e) { }
        }
        if (type === 'leave') {
            try { await User.findByIdAndUpdate(from || socketMap[socket.id]?.userId, { currentRoom: null }); } catch (e) { }
            const leaveRoom = roomId;
            if (leaveRoom && roomMap[leaveRoom]) {
                roomMap[leaveRoom] = roomMap[leaveRoom].filter(u => u.id !== from && u.socketId !== socket.id);
                if (roomMap[leaveRoom].length === 0) {
                    delete roomMap[leaveRoom];
                    const roomInfo = await Room.findOne({ roomId: leaveRoom, isActive: true });
                    // Nếu không cấu hình autoCloseWhenEmpty (phiên bản cũ) hoặc = true thì tắt
                    if (!roomInfo || roomInfo.settings?.autoCloseWhenEmpty !== false) {
                        Room.updateOne({ roomId: leaveRoom, isActive: true }, { isActive: false, endedAt: new Date() }).catch(() => { });
                        Message.deleteMany({ roomId: leaveRoom }).catch(() => { });
                    }
                }
            }
        }
        if (to) {
            const targetSocketId = userSocketMap[to];
            if (targetSocketId) io.to(targetSocketId).emit('signal', data);
        } else {
            socket.to(roomId).emit('signal', data);
        }
    });

    socket.on('disconnect', async () => {
        const info = socketMap[socket.id];
        if (info) {
            const { roomId, userId } = info;
            if (userSocketMap[userId] === socket.id) delete userSocketMap[userId];
            if (roomMap[roomId]) {
                roomMap[roomId] = roomMap[roomId].filter(u => u.socketId !== socket.id);
                if (roomMap[roomId].length === 0) {
                    delete roomMap[roomId];
                    const roomInfo = await Room.findOne({ roomId, isActive: true });
                    if (!roomInfo || roomInfo.settings?.autoCloseWhenEmpty !== false) {
                        Room.updateOne({ roomId, isActive: true }, { isActive: false, endedAt: new Date() }).catch(() => { });
                        Message.deleteMany({ roomId }).catch(() => { });
                    }
                }
            }
            socket.to(roomId).emit('signal', { type: 'leave', from: userId, roomId });
            delete socketMap[socket.id];
        }
    });
});

// SPA Fallback
app.get('/*splat', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send("Build not found");
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 HTTPS Server: https://localhost:${PORT}`);
});

// HTTP Server cho ngrok (port 3000) — không cần SSL cert
// Dùng io.attach() để chia sẻ cùng socket handlers với HTTPS server
const HTTP_PORT = 3000;
const httpServer = http.createServer(app);
io.attach(httpServer); // Socket.IO giờ lắng nghe trên cả 2 ports!

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🌐 HTTP Server (ngrok): http://localhost:${HTTP_PORT}`);
    console.log(`💡 Chạy ngrok: .\\ngrok http ${HTTP_PORT}`);
});
