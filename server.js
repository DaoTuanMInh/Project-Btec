require('dotenv').config();
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');

// ── Routes ──────────────────────────────────────────────
const { router: authRouter, transporter } = require('./routes/auth');
const meetingsRouter = require('./routes/meetings');
const usersRouter = require('./routes/users');
const { router: chatRouter, fileRoomMap } = require('./routes/chat');

// ── Services ─────────────────────────────────────────────
const { enqueuePendingMeetingContents } = require('./services/meetingWorker');

// ── Socket ───────────────────────────────────────────────
const { initSocket, roomMap } = require('./socket/signaling');

// ── Models (chỉ dùng trong cron) ────────────────────────
const Room = require('./models/Room');
const Message = require('./models/Message');
const ScheduledMeeting = require('./models/ScheduledMeeting');

// ────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// 1. Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 2. Static Files
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath);
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Bảo vệ /uploads — chỉ người đang trong đúng phòng chứa file mới truy cập được
// Token có thể qua Authorization header hoặc ?token= (cho <img> và <a href>)
app.use('/uploads', (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
    if (!token) return res.status(401).send('Unauthorized');
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'avo-secret-zero-trust-key-2024');
    } catch (e) {
        return res.status(403).send('Forbidden: Invalid token');
    }
    const userId = decoded.id || decoded.userId || decoded._id;
    // Lấy tên file từ URL path (/uploads/<filename>)
    const filename = req.path.replace(/^\//, '').split('?')[0];
    // Tìm roomId mà file này được upload vào
    const fileRoom = fileRoomMap.get(filename);
    if (!fileRoom) return res.status(403).send('Forbidden: File not found or session expired.');
    // Kiểm tra user có đang trong đúng phòng chứa file không
    const roomUsers = roomMap[fileRoom] || [];
    const isInRoom = roomUsers.some(u => u.id === userId);
    if (!isInRoom) return res.status(403).send('Forbidden: You must be in the room that owns this file.');
    next();
}, express.static(uploadsPath));

// 3. HTTP Server & Socket.io
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 10 * 1024 * 1024
});

// 4. MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// 5. API Routes
app.use('/api/auth', authRouter);

// Frontend gọi trực tiếp (không có prefix /auth/)
app.use('/api/send-otp', authRouter);
app.use('/api/verify-otp', authRouter);
app.use('/api/forgot-password', authRouter);
app.use('/api/reset-password', authRouter);

app.use('/api/meetings', meetingsRouter);

// /api/download-file is a sub-route of meetingsRouter
app.get('/api/download-file/:filename', (req, res, next) => {
    req.url = req.url.replace('/api/download-file', '/download-file');
    meetingsRouter(req, res, next);
});

// /api/ai/summarize-chat is mounted under meetingsRouter as /ai/summarize-chat
app.use('/api/ai', meetingsRouter);

// /api/token
app.post('/api/token', (req, res, next) => {
    req.url = '/token';
    usersRouter(req, res, next);
});
app.use('/api/user', usersRouter);

app.use('/api/chat', chatRouter);
app.use('/api/rooms', require('./routes/rooms')(io));

// 6. Socket.io handlers
initSocket(io);

// 7. Cron Job: nhắc nhở & tự đóng phòng
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();

        // Gửi lời mời lần đầu
        const uninvited = await ScheduledMeeting.find({ isInvitedSent: false });
        for (const meeting of uninvited) {
            if (meeting.invitedEmails && meeting.invitedEmails.length > 0) {
                const passwordParam = meeting.settings?.password ? `&pwd=${meeting.settings.password}` : '';
                await transporter.sendMail({
                    from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
                    to: meeting.invitedEmails.join(','),
                    subject: `Invitation to meeting: ${meeting.title}`,
                    html: `
                        <h3>You are invited to join the meeting: <b>${meeting.title}</b></h3>
                        <p>Host: <b>${meeting.hostName}</b> ${meeting.hostEmail ? `(${meeting.hostEmail})` : ''}</p>
                        <p>Start: <b>${new Date(meeting.startTime).toLocaleString('en-US')}</b></p>
                        <p>Message: <i>${meeting.description || 'No description'}</i></p>
                        <hr/>
                        <a href="${process.env.APP_URL || 'https://avomeet.site'}/?room=${meeting.roomId}${passwordParam}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">Go to Meeting (Join)</a>
                    `
                });
            }
            meeting.isInvitedSent = true;
            await meeting.save();
        }

        // Gửi nhắc nhở
        const pendingReminders = await ScheduledMeeting.find({ isReminderSent: false, startTime: { $gt: now } });
        for (const meeting of pendingReminders) {
            const timeDiffMinutes = (new Date(meeting.startTime) - now) / (1000 * 60);
            if (timeDiffMinutes <= meeting.remindBeforeMinutes) {
                let recipients = [...(meeting.invitedEmails || [])];
                if (meeting.hostEmail && !recipients.includes(meeting.hostEmail)) recipients.push(meeting.hostEmail);
                if (recipients.length > 0) {
                    const passwordParam = meeting.settings?.password ? `&pwd=${meeting.settings.password}` : '';
                    await transporter.sendMail({
                        from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
                        to: recipients.join(','),
                        subject: `Reminder: Meeting "${meeting.title}" is about to start!`,
                        html: `
                            <h3 style="color:#e11d48">Meeting is about to start!</h3>
                            <p>The meeting <b>${meeting.title}</b> will take place in <b>${Math.ceil(timeDiffMinutes)} minutes</b>.</p>
                            <p>Don't keep everyone waiting!</p>
                            <hr/>
                            <a href="${process.env.APP_URL || 'https://avomeet.site'}/?room=${meeting.roomId}${passwordParam}" style="display:inline-block;padding:10px 20px;background:#e11d48;color:white;text-decoration:none;border-radius:5px;font-weight:bold;">Join Now</a>
                        `
                    });
                }
                meeting.isReminderSent = true;
                await meeting.save();
            }
        }

        // Tự đóng phòng sau 12 giờ
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        const staleRooms = await Room.find({ isActive: true, createdAt: { $lt: twelveHoursAgo } });
        for (const room of staleRooms) {
            await Room.updateOne({ _id: room._id }, { isActive: false, endedAt: new Date() });
            // Xóa file vật lý trên disk trước khi xóa tin nhắn khỏi DB
            const fileMessages = await Message.find({ roomId: room.roomId, fileUrl: { $exists: true, $ne: null } });
            for (const msg of fileMessages) {
                if (msg.fileUrl) {
                    const filename = msg.fileUrl.replace(/^\/uploads\//, '');
                    const filePath = path.join(uploadsPath, filename);
                    try {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            console.log(`[Cleanup] Deleted file: ${filename}`);
                        }
                    } catch (err) {
                        console.error(`[Cleanup] Failed to delete ${filename}:`, err.message);
                    }
                }
            }
            await Message.deleteMany({ roomId: room.roomId });
            io.to(room.roomId).emit('signal', { type: 'room-closed', roomId: room.roomId, reason: 'Auto-close after 12 hours of inactivity' });
            console.log(`Auto-close room: ${room.roomId} (over 12 hours)`);
        }
    } catch (e) {
        console.error('Cron Job Error:', e);
    }
});

// 8. SPA Fallback
app.get(/(.*)/, (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('Build not found');
});

// 9. Khởi động
enqueuePendingMeetingContents();
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Node.js App Server is running on port: ${PORT}`);
});
