const express = require('express');
const https = require('https');
const fs = require('fs');
const { Server } = require("socket.io");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// 1. Setup Middlewares
app.use(cors());
app.use(express.json());

// 2. Serve Frontend Files (All-in-One: Web + Server)
// Serve static files from the 'dist' directory
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

const options = {
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(options, app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const JWT_SECRET = 'avo-secret-zero-trust-key-2024';

// --- API: Zero Trust Token ---
app.post('/api/token', (req, res) => {
    const { userId, roomId, role } = req.body;
    const token = jwt.sign({
        userId, roomId, role: role || 'guest',
        iat: Math.floor(Date.now() / 1000)
    }, JWT_SECRET, { expiresIn: '1h' });

    console.log(`Issued Token for ${userId} -> Room ${roomId}`);
    res.json({ token });
});

// --- SPA Fallback: Serve index.html for unknown routes ---
// Fix for path-to-regexp error: Use REGEX directly to avoid syntax parsing issues
app.get(/(.*)/, (req, res) => {
    // Cannot handle API requests here, they are caught above
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Build not found. Please run 'npm run build' first.");
    }
});

// --- Socket.IO Logic ---
const socketMap = {};
const roomMap = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('check-room', (roomId, password, callback) => {
        if (typeof password === 'function') { callback = password; password = null; }
        const room = roomMap[roomId];

        // Debug Log
        const serverPass = room && room.settings ? room.settings.password : 'N/A';
        console.log(`[CheckRoom] Room: ${roomId}, InputPass: '${password}', ServerPass: '${serverPass}'`);

        const isPasswordCorrect = room && room.settings && room.settings.password ? password === room.settings.password : true;

        callback({
            exists: !!room,
            requiresPassword: room ? !!room.settings?.password : false,
            valid: !!room && isPasswordCorrect,
            locked: room ? !!room.settings?.lockRoom : false
        });
    });

    socket.on('join-room', (roomId, userId, isHost, settings, token, callback) => {
        // Zero Trust Validation
        if (!token) return callback && callback({ error: "Missing Auth Token" });
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.roomId !== roomId) return callback && callback({ error: "Room ID Mismatch" });
        } catch (e) {
            return callback && callback({ error: "Invalid/Expired Token" });
        }

        // Room Logic
        let room = roomMap[roomId];
        if (isHost) {
            if (!room) {
                roomMap[roomId] = { hostId: userId, settings: settings || {}, members: new Set() };
                room = roomMap[roomId];
            } else {
                // Reclaiming Host Status (e.g. reload with new User ID)
                room.hostId = userId;
                // Optional: Update settings if provided?
                if (settings) room.settings = { ...room.settings, ...settings };
            }
        }
        if (room) room.members.add(userId);

        socket.join(roomId);
        socketMap[socket.id] = { roomId, userId };
        console.log(`User ${userId} joined ${roomId}`);
        if (callback) callback({ success: true });
    });

    socket.on('update-room-settings', (roomId, settings, token, callback) => {
        // Zero Trust Validation
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.roomId !== roomId) return callback && callback({ error: "Unauthorized Room" });

            const room = roomMap[roomId];

            // Debug Log
            console.log(`[UpdateSettings] Room: ${roomId}, UID: ${decoded.userId}, HostID: ${room?.hostId}, Role: ${decoded.role}`);

            // Allow if Host ID matches OR if token role is 'host'
            if (room && (room.hostId === decoded.userId || decoded.role === 'host')) {
                room.settings = { ...room.settings, ...settings };
                console.log(`Updated settings for Room ${roomId}:`, JSON.stringify(room.settings));
                if (callback) callback({ success: true, settings: room.settings });
            } else {
                if (callback) callback({ error: "Permission Denied or Room Not Found" });
            }
        } catch (e) {
            console.error("Update Settings Failed: Invalid Token", e);
            if (callback) callback({ error: "Invalid Token" });
        }
    });

    socket.on('signal', (data) => {
        const { roomId, to } = data;
        if (to) socket.to(roomId).emit('signal', data);
        else if (roomId) socket.to(roomId).emit('signal', data);
    });

    socket.on('disconnect', () => {
        const userInfo = socketMap[socket.id];
        if (userInfo) {
            const { roomId, userId } = userInfo;
            const room = roomMap[roomId];
            if (room) {
                room.members.delete(userId);
                if (room.members.size === 0) delete roomMap[roomId];
            }
            socket.to(roomId).emit('signal', { type: 'leave', from: userId, roomId, payload: {} });
            delete socketMap[socket.id];
        }
    });
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server (Web + Signaling) running on https://localhost:${PORT}`);
});
