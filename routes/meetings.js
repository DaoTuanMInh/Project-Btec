const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const MeetingContent = require('../models/MeetingContent');
const ScheduledMeeting = require('../models/ScheduledMeeting');
const { meetingContentQueue, processMeetingQueue } = require('../services/meetingWorker');

const JWT_SECRET = process.env.JWT_SECRET || 'avo-secret-zero-trust-key-2024';
const uploadsPath = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max

// Middleware xác thực JWT
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
    if (!token) return res.status(401).json({ error: 'No authentication token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (e) { return res.status(401).json({ error: 'Invalid or expired token' }); }
};

// Upload audio ghi âm
router.post('/:roomId/record', verifyToken, upload.single('audio'), async (req, res) => {
    const roomId = req.params.roomId;
    const hostId = req.userId;
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    // Enforce host check: scheduled meeting OR room creator
    const schedule = await ScheduledMeeting.findOne({ roomId });
    if (schedule && schedule.hostId !== hostId) {
        return res.status(403).json({ error: 'Only host can upload recordings' });
    }
    if (!schedule) {
        // For non-scheduled rooms, check the Room document
        const Room = require('../models/Room');
        const room = await Room.findOne({ roomId });
        if (room && room.hostId && room.hostId !== hostId) {
            return res.status(403).json({ error: 'Only host can upload recordings' });
        }
    }


    const filename = req.body.name || `meeting-${Date.now()}`;
    const originalPath = req.file.path;
    const wavPath = path.join(uploadsPath, `${Date.now()}-${filename}.wav`);

    try {
        const meetingContent = new MeetingContent({
            roomId,
            meetingId: schedule ? schedule._id : undefined,
            hostId,
            title: filename,
            description: req.body.description || '',
            participants: req.body.participants || '',
            transcriptText: req.body.rawTranscript || '',
            status: 'pending',
            audioPath: originalPath,
            wavPath
        });
        await meetingContent.save();
        meetingContentQueue.push({ contentId: meetingContent._id, originalPath, wavPath, meetingContent });
        processMeetingQueue();
        res.status(202).json({ success: true, contentId: meetingContent._id });
    } catch (err) {
        console.error('record handler', err);
        res.status(500).json({ error: 'Unable to enqueue recording' });
    }
});

// Download file
router.get('/download-file/:filename', verifyToken, async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadsPath, filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found');
    try {
        const content = await MeetingContent.findOne({
            $or: [
                { audioPath: { $regex: filename } },
                { wavPath: { $regex: filename } },
                { transcriptPath: { $regex: filename } },
                { transcriptDocxPath: { $regex: filename } },
                { summaryPath: { $regex: filename } },
                { summaryDocxPath: { $regex: filename } }
            ]
        });
        if (content && content.hostId !== req.userId) {
            return res.status(403).json({ error: 'You are not authorized to download this file.' });
        }
        let downloadName = filename;
        if (content) {
            const ext = path.extname(filename);
            const baseTitle = content.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const type = filename.includes('summary') ? 'Summary' : 'Transcript';
            downloadName = `${baseTitle}_${type}${ext}`;
        }
        res.download(filePath, downloadName);
    } catch (e) { res.download(filePath); }
});

// Lấy danh sách nội dung cuộc họp
router.get('/content/:userId', verifyToken, async (req, res) => {
    if (req.userId !== req.params.userId) return res.status(403).json({ error: 'Not allowed' });
    try {
        const contents = await MeetingContent.find({ hostId: req.params.userId }).sort({ createdAt: -1 });
        const formatted = contents.map(item => {
            const audioUrl = item.audioPath ? `/uploads/${path.basename(item.audioPath)}` : null;
            const transcriptUrl = item.transcriptPath ? `/api/download-file/${path.basename(item.transcriptPath)}` : null;
            const transcriptDocxUrl = item.transcriptDocxPath ? `/api/download-file/${path.basename(item.transcriptDocxPath)}` : null;
            const summaryUrl = item.summaryPath ? `/api/download-file/${path.basename(item.summaryPath)}` : null;
            const summaryDocxUrl = item.summaryDocxPath ? `/api/download-file/${path.basename(item.summaryDocxPath)}` : null;
            return {
                _id: item._id, roomId: item.roomId, meetingId: item.meetingId, hostId: item.hostId,
                title: item.title, description: item.description, status: item.status,
                transcriptText: item.transcriptText, summaryText: item.summaryText, errorMessage: item.errorMessage,
                audioUrl, transcriptUrl, transcriptDocxUrl, summaryUrl, summaryDocxUrl,
                createdAt: item.createdAt, updatedAt: item.updatedAt
            };
        });
        res.json(formatted);
    } catch (err) {
        console.error('content list', err);
        res.status(500).json({ error: 'Unable to fetch meeting contents' });
    }
});

// Xoá nội dung cuộc họp
router.delete('/content/:contentId', verifyToken, async (req, res) => {
    try {
        const content = await MeetingContent.findById(req.params.contentId);
        if (!content) return res.status(404).json({ error: 'Meeting content not found' });
        if (content.hostId !== req.userId) return res.status(403).json({ error: 'Not allowed' });
        [content.audioPath, content.wavPath, content.transcriptPath, content.summaryPath, content.summaryDocxPath].forEach(filePath => {
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
        await MeetingContent.deleteOne({ _id: content._id });
        return res.json({ success: true });
    } catch (err) {
        console.error('delete meeting content', err);
        return res.status(500).json({ error: 'Error deleting content' });
    }
});

// Retry xử lý ghi âm
const retryHandler = async (req, res) => {
    try {
        const content = await MeetingContent.findById(req.params.contentId);
        if (!content) return res.status(404).json({ error: 'Meeting content not found' });
        if (content.hostId !== req.userId) return res.status(403).json({ error: 'Not allowed' });
        if (!content.audioPath || !fs.existsSync(content.audioPath)) return res.status(400).json({ error: 'Original audio file missing; cannot retry' });
        content.status = 'pending';
        await content.save();
        meetingContentQueue.push({
            contentId: content._id,
            originalPath: content.audioPath,
            wavPath: content.wavPath || path.join(uploadsPath, `${Date.now()}-${content._id}-retry.wav`),
            meetingContent: content
        });
        processMeetingQueue();
        return res.json({ success: true, message: 'Retry enqueued' });
    } catch (err) {
        console.error('retry meeting content', err);
        return res.status(500).json({ error: 'Error retrying content' });
    }
};
router.post('/content/:contentId/retry', verifyToken, retryHandler);
router.get('/content/:contentId/retry', verifyToken, retryHandler);

// Lên lịch cuộc họp
router.post('/schedule', async (req, res) => {
    try {
        const { roomId, title, description, hostId, hostName, hostEmail, startTime, durationMinutes, remindBeforeMinutes, invitedEmails, settings } = req.body;
        const meeting = new ScheduledMeeting({ roomId, title, description, hostId, hostName, hostEmail, startTime, durationMinutes, remindBeforeMinutes, invitedEmails, settings });
        await meeting.save();
        res.json({ success: true, meeting });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/my-schedule/:userId', async (req, res) => {
    try {
        const meetings = await ScheduledMeeting.find({ hostId: req.params.userId }).sort({ startTime: 1 });
        res.json(meetings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        await ScheduledMeeting.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
    try {
        const { title, description, startTime, remindBeforeMinutes, invitedEmails } = req.body;
        const updated = await ScheduledMeeting.findByIdAndUpdate(req.params.id, {
            $set: {
                title, description, startTime, remindBeforeMinutes,
                invitedEmails: invitedEmails ? invitedEmails.split(',').map(e => e.trim()).filter(Boolean) : [],
                isReminderSent: false
            }
        }, { new: true });
        res.json({ success: true, meeting: updated });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI: Tóm tắt chat
router.post('/summarize-chat', verifyToken, async (req, res) => {
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'AI is not configured (missing GROQ_API_KEY)' });
    const { messages } = req.body;
    if (!messages || messages.length === 0) return res.status(400).json({ error: 'No chat content to summarize' });
    const chatText = messages.map(m => `${m.senderName}: ${m.text}`).join('\n');
    const prompt = `You are a smart AI assistant. Please read the following conversation from an online meeting and summarize it in the same language as the conversation (Vietnamese or English).\n\nIf the conversation is in Vietnamese:\n1. Liệt kê các điểm chính\n2. Nêu rõ kết luận hoặc quyết định\n3. Trình bày gọn gàng\n\nIf the conversation is in English:\n1. List the main points discussed\n2. If there are any conclusions or decisions, please state them clearly\n3. Present them neatly and easy to read\n\nConversation content:\n${chatText}`;
    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 1024 })
        });
        const data = await groqRes.json();
        if (!groqRes.ok) throw new Error(data?.error?.message || 'Groq API error');
        res.json({ summary: data?.choices?.[0]?.message?.content || 'No result' });
    } catch (err) {
        console.error('Groq API Error:', err.message);
        res.status(500).json({ error: `AI error: ${err.message}` });
    }
});

module.exports = router;
