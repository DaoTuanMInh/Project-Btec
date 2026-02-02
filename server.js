const express = require('express');
const https = require('https');
const fs = require('fs');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

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

// Map socket.id to user info to handle disconnects
const socketMap = {};
// Map roomId to roomInfo { hostId: string, settings: any }
const roomMap = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Validate Room before joining
    socket.on('check-room', (roomId, password, callback) => {
        // Handle optional password (backward compatibility)
        if (typeof password === 'function') {
            callback = password;
            password = null;
        }

        const room = roomMap[roomId];

        let isPasswordCorrect = true;
        if (room && room.settings && room.settings.password) {
            // If room has password, check it against provided password
            if (password !== room.settings.password) {
                isPasswordCorrect = false;
            }
        }

        console.log(`Check room ${roomId}: ${room ? "Exists" : "Not Found"}, Pass: ${isPasswordCorrect ? "OK" : "Wrong"}`);

        callback({
            exists: !!room,
            requiresPassword: room ? !!room.settings?.password : false,
            valid: !!room && isPasswordCorrect
        });
    });

    socket.on('join-room', (roomId, userId, isHost, settings) => {
        let room = roomMap[roomId];

        if (isHost) {
            // Registering as creator/host
            if (!room) {
                roomMap[roomId] = {
                    hostId: userId,
                    settings: settings || {},
                    members: new Set()
                };
                room = roomMap[roomId];
            } else {
                // Host re-joining
                if (room.hostId === userId) {
                    console.log(`Host ${userId} returned.`);
                }
            }
        } else {
            // Guest joining. If room doesn't exist? (Handled by client check usually)
            // But if specific flow allows creation by guest? No.
        }

        if (room) {
            room.members.add(userId);
        }

        socket.join(roomId);
        // Store mapping for disconnect handling
        socketMap[socket.id] = { roomId, userId };
        console.log(`User ${userId} (${socket.id}) joined room ${roomId}`);
    });

    socket.on('signal', (data) => {
        // Broadcast to everyone in the room EXCEPT sender
        const { roomId, to } = data;
        if (to) {
            socket.to(roomId).emit('signal', data);
        } else {
            if (roomId) {
                socket.to(roomId).emit('signal', data);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const userInfo = socketMap[socket.id];

        if (userInfo) {
            const { roomId, userId } = userInfo;
            const room = roomMap[roomId];

            if (room) {
                room.members.delete(userId);

                if (room.hostId === userId) {
                    console.log(`Host ${userId} left room ${roomId}.`);
                    // We DO NOT transfer host. 
                    // If host leaves, the room stays open until empty, but no one is host.
                }

                if (room.members.size === 0) {
                    delete roomMap[roomId];
                    console.log(`Room ${roomId} is empty. Closed.`);
                }
            }

            // Notify others
            socket.to(roomId).emit('signal', {
                type: 'leave',
                from: userId,
                roomId: roomId,
                payload: {}
            });
            delete socketMap[socket.id];
        }
    });
});

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Signaling server running on port ${PORT}`);
});
