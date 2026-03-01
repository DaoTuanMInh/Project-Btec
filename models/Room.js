const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    host: { type: String, required: true }, // Username của Host
    hostId: { type: String }, // User ID (New for Resume Host)
    password: { type: String, default: '' },
    settings: {
        waitingRoom: { type: Boolean, default: false },
        allowScreenShare: { type: Boolean, default: true },
        requireMic: { type: Boolean, default: false },
        requireCamera: { type: Boolean, default: false },
        lockRoom: { type: Boolean, default: false },
        allowReactions: { type: Boolean, default: true },
        autoCloseWhenEmpty: { type: Boolean, default: true }
    },
    participants: [{
        userId: String,
        username: String,
        joinedAt: { type: Date, default: Date.now }
    }],
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    endedAt: { type: Date }
});

module.exports = mongoose.model('Room', RoomSchema);
