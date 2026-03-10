const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    senderId: { type: String, required: true },
    userName: { type: String },
    type: {
        type: String,
        enum: ['text', 'file', 'image'],
        default: 'text'
    },
    text: { type: String },
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    replyTo: {
        id: String,
        userName: String,
        text: String
    },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);
