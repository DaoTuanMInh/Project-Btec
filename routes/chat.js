const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const Message = require('../models/Message');
const Room = require('../models/Room');

const uploadsPath = path.join(__dirname, '..', 'uploads');
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.JWT_SECRET || 'avo-secret-zero-trust-key-2024').digest('base64').substring(0, 32);
const IV_LENGTH = 16;

const encryptText = (text) => {
    if (!text) return text;
    try {
        let iv = crypto.randomBytes(IV_LENGTH);
        let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (e) { return text; }
};

const decryptText = (text) => {
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
    } catch (e) { return text; }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// filename -> roomId mapping (in-memory, dùng để kiểm tra quyền truy cập file)
const fileRoomMap = new Map();

// Upload file chat
router.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const roomId = req.body.roomId;
    if (roomId) fileRoomMap.set(req.file.filename, roomId);
    res.json({ url: `/uploads/${req.file.filename}`, fileName: req.file.originalname, fileSize: req.file.size });
});

// Lịch sử chat
router.get('/history/:roomId', async (req, res) => {
    try {
        const messages = await Message.find({ roomId: req.params.roomId }).sort({ timestamp: 1 });
        const decryptedMessages = messages.map(msg => ({
            ...msg._doc,
            text: decryptText(msg.text),
            replyTo: msg.replyTo ? { id: msg.replyTo.id, userName: msg.replyTo.userName, text: decryptText(msg.replyTo.text) } : undefined
        }));
        res.json(decryptedMessages);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { router, encryptText, decryptText, fileRoomMap };
