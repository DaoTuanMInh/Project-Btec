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
    socket.on('check-room', (roomId, callback) => {
        const room = roomMap[roomId];
        console.log(`Check room ${roomId}:`, room ? "Exists" : "Not Found");
        callback({
            exists: !!room,
            requiresPassword: room ? !!room.settings?.password : false
        });
    });

    socket.on('join-room', (roomId, userId, isHost, settings) => {
        // If creating/hosting, register the room
        if (isHost) {
            console.log(`Registering room ${roomId} with host ${userId}`);
            roomMap[roomId] = { hostId: userId, settings: settings || {} };
        } else {
            // If joining, check if room actually exists (Double check)
            if (!roomMap[roomId]) {
                // Should have been caught by check-room, but for safety
                // We let them join for now, effectively creating a "waiting for host" state if host reconnects?
                // Or we could strict block. Let's strict block or warn. 
                // For this impl, we assume client checked.
            }
        }

        socket.join(roomId);
        // Store mapping for disconnect handling
        socketMap[socket.id] = { roomId, userId, isHost };
        console.log(`User ${userId} (${socket.id}) joined room ${roomId}`);
    });

    socket.on('signal', (data) => {
        // Broadcast to everyone in the room EXCEPT sender
        // Special routing for Direct Messages (like kick/approve)
        const { roomId, to } = data;

        if (to) {
            // Find the specific socket? 
            // Socket.io 'to(roomId)' broadcasts to room. 
            // Providing a specific Socket ID is better for 1-on-1, but our 'to' is UserId.
            // We need to map UserId to SocketId if we want direct, 
            // BUT broadcasting to room with 'to' field in payload is easier for mesh.
            // Frontend filters by 'to'.
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
            const { roomId, userId, isHost } = userInfo;

            // If Host leaves, we do NOT destroy the room immediately. 
            // Reason: Host might just be refreshing the page.
            // Improved Logic: Clean up room only if it's empty or after timeout?
            // For now, let's just NOT delete it on disconnect. 
            // We can trust that a new Host session will overwrite it or we can rely on memory reset.
            // OR: We delete it only if the room is empty.

            // socket.adapter.rooms.get(roomId) returns Set of sockets in room
            const roomSockets = io.sockets.adapter.rooms.get(roomId);
            if (!roomSockets || roomSockets.size === 0) {
                console.log(`Room ${roomId} is now empty. Closing.`);
                delete roomMap[roomId];
            } else {
                console.log(`User left, but room ${roomId} still has members. Keeping alive.`);
                if (isHost) {
                    console.log("Host disconnected, but room kept open for potential reconnect/guests.");
                    // Optional: Could mark room as "Hostless"
                }
            }

            // Notify others in the room that this user left
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
