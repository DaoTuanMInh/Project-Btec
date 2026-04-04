const jwt = require('jsonwebtoken');
const Room = require('../models/Room');
const Message = require('../models/Message');
const ScheduledMeeting = require('../models/ScheduledMeeting');
const User = require('../models/User');
const { encryptText, decryptText } = require('../routes/chat');

const JWT_SECRET = process.env.JWT_SECRET || 'avo-secret-zero-trust-key-2024';

const socketMap = {};
const roomMap = {};
const userSocketMap = {};

const handleSessionKick = (io, userId, newSocketId) => {
    const oldSocketId = userSocketMap[userId];
    if (oldSocketId && oldSocketId !== newSocketId) {
        io.to(oldSocketId).emit('force-logout', { reason: 'Account has been logged in elsewhere.' });
        const oldSocket = io.sockets.sockets.get(oldSocketId);
        if (oldSocket) setTimeout(() => oldSocket.disconnect(true), 500);
    }
    userSocketMap[userId] = newSocketId;
};

const initSocket = (io) => {
    io.on('connection', (socket) => {
        socket.on('register-session', (userId) => {
            if (!userId) return;
            handleSessionKick(io, userId, socket.id);
            socketMap[socket.id] = { userId };
        });

        socket.on('check-room', async (roomId, password, userId, callback) => {
            if (typeof userId === 'function') { callback = userId; userId = null; }
            if (typeof password === 'function') { callback = password; password = null; }
            try {
                const room = await Room.findOne({ roomId, isActive: true });
                const scheduled = !room ? await ScheduledMeeting.findOne({ roomId }) : null;
                const serverPass = room?.password || room?.settings?.password || '';
                const isHost = room
                    ? (room.hostId === userId || room.host === userId)
                    : (scheduled && (scheduled.hostId === userId || scheduled.hostEmail === userId));
                callback({
                    exists: !!room || (!!scheduled && isHost),
                    isScheduledWaiting: !!scheduled && !room && !isHost,
                    requiresPassword: !!serverPass,
                    valid: !serverPass || password === serverPass,
                    locked: !!room?.settings?.lockRoom,
                    isHost,
                    isEmpty: !roomMap[roomId] || roomMap[roomId].length === 0,
                    scheduledSettings: scheduled ? scheduled.settings : null
                });
            } catch (e) { callback({ exists: false, error: e.message }); }
        });

        socket.on('join-room', async (roomId, userId, userName, isHost, settings, token, avatar, callback) => {
            try {
                if (!token) throw new Error('Missing room access token');
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded.roomId !== roomId || decoded.userId !== userId) {
                    console.warn(`Access Denied: Token mismatch. user=${userId}, room=${roomId}`);
                    if (typeof callback === 'function') callback({ error: 'Truy cập bị từ chối: Token không hợp lệ cho phòng này.' });
                    return;
                }
                console.log(`Zero Trust Verified: ${userName} (${userId}) joined room ${roomId}`);
            } catch (err) {
                console.error('Zero Trust Auth Error:', err.message);
                if (typeof callback === 'function') callback({ error: `Xác thực thất bại: ${err.message}` });
                return;
            }

            handleSessionKick(io, userId, socket.id);
            socket.join(roomId);
            socketMap[socket.id] = { roomId, userId, userName, avatar };

            try { await User.findByIdAndUpdate(userId, { currentRoom: roomId }); } catch (e) {}

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

            socket.to(roomId).emit('user-connected', userId, userName);
            socket.emit('existing-users', roomMap[roomId].filter(u => u.id !== userId));
            if (typeof callback === 'function') callback({ success: true });
        });

        socket.on('update-room-settings', async (roomId, settings, token, callback) => {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded.roomId !== roomId || decoded.role !== 'host') {
                    return callback({ error: 'Truy cập bị từ chối: Chỉ chủ phòng mới có thể thay đổi cài đặt.' });
                }
                await Room.updateOne({ roomId, isActive: true }, { $set: { settings, password: settings?.password || '' } });
                socket.to(roomId).emit('signal', { type: 'room-settings-updated', roomId, settings });
                console.log(`Settings updated for room ${roomId} by host.`);
                if (typeof callback === 'function') callback({ success: true });
            } catch (e) {
                console.error('Update Settings Error:', e.message);
                if (typeof callback === 'function') callback({ error: `Lỗi cập nhật: ${e.message}` });
            }
        });

        socket.on('signal', async (data) => {
            const { roomId, type, payload, from, to } = data;

            if (type === 'chat') {
                try {
                    const userInfo = socketMap[socket.id] || {};
                    const chatTextRaw = payload.text || '';
                    await new Message({
                        roomId, senderId: from, text: encryptText(chatTextRaw),
                        userName: payload.userName || userInfo.userName || 'User',
                        type: payload.fileUrl ? (payload.isImage ? 'image' : 'file') : 'text',
                        fileUrl: payload.fileUrl, fileName: payload.fileName, fileSize: payload.fileSize,
                        replyTo: payload.replyTo ? { id: payload.replyTo.id, userName: payload.replyTo.userName, text: encryptText(payload.replyTo.text) } : undefined
                    }).save();

                    // AI Chatbot
                    if ((chatTextRaw.toLowerCase().startsWith('@ai') || chatTextRaw.toLowerCase().startsWith('/ai')) && process.env.GROQ_API_KEY) {
                        const aiQuery = chatTextRaw.replace(/^(@ai|\/ai)\s*/i, '').trim();
                        if (aiQuery) {
                            try {
                                const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
                                    body: JSON.stringify({
                                        model: 'llama-3.3-70b-versatile',
                                        messages: [
                                            { role: 'system', content: 'You are a friendly virtual assistant for the AVO Meeting application. Format your answers in markdown or plain text. Answer briefly, intelligently, and wittily in English.' },
                                            { role: 'user', content: aiQuery }
                                        ],
                                        temperature: 0.6, max_tokens: 1024
                                    })
                                });
                                const aiData = await groqRes.json();
                                if (groqRes.ok && aiData?.choices?.[0]?.message?.content) {
                                    const aiResText = aiData.choices[0].message.content;
                                    const aiMsg = { roomId, type: 'chat', payload: { text: aiResText, userName: 'AVO Assistant' }, from: 'ai-assistant', to: null };
                                    io.to(roomId).emit('signal', aiMsg);
                                    await new Message({ roomId, senderId: 'ai-assistant', text: encryptText(aiResText), userName: 'AVO Assistant', type: 'text' }).save();
                                }
                            } catch (err) { console.error('AI Assistant Error:', err.message); }
                        }
                    }
                } catch (e) {}
            }

            if (type === 'leave') {
                try { await User.findByIdAndUpdate(from || socketMap[socket.id]?.userId, { currentRoom: null }); } catch (e) {}
                if (roomId && roomMap[roomId]) {
                    roomMap[roomId] = roomMap[roomId].filter(u => u.id !== from && u.socketId !== socket.id);
                    if (roomMap[roomId].length === 0) {
                        delete roomMap[roomId];
                        const roomInfo = await Room.findOne({ roomId, isActive: true });
                        if (!roomInfo || roomInfo.settings?.autoCloseWhenEmpty !== false) {
                            Room.updateOne({ roomId, isActive: true }, { isActive: false, endedAt: new Date() }).catch(() => {});
                            Message.deleteMany({ roomId }).catch(() => {});
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
                            Room.updateOne({ roomId, isActive: true }, { isActive: false, endedAt: new Date() }).catch(() => {});
                            Message.deleteMany({ roomId }).catch(() => {});
                        }
                    }
                }
                socket.to(roomId).emit('signal', { type: 'leave', from: userId, roomId });
                delete socketMap[socket.id];
            }
        });
    });
};

module.exports = { initSocket, roomMap };
