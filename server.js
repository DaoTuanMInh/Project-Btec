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
const ScheduledMeeting = require('./models/ScheduledMeeting');
const MeetingContent = require('./models/MeetingContent');
const crypto = require('crypto');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Document, Packer, Paragraph, TextRun } = require('docx');

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
const PORT = process.env.PORT || 3000;

// 1. Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit to support base64 avatar upload
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 2. Static Files
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath);
app.use('/uploads', express.static(uploadsPath));

// serve favicon to avoid browser 404 noise
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// 3. HTTP Server & Socket.io Setup (SSL will be handled by Nginx on production)
const server = http.createServer(app);
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
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// 6. OTP & Email Setup
const otpStore = new Map();
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// --- API ROUTES ---

const { spawn, spawnSync } = require('child_process');
const ffmpegStatic = (() => {
    try {
        return require('ffmpeg-static');
    } catch (e) {
        return null;
    }
})();

const getFfmpegExecutable = () => {
    if (ffmpegStatic) return ffmpegStatic;

    // Windows `where`, Unix `which`
    try {
        const command = process.platform === 'win32' ? 'where' : 'which';
        const result = spawnSync(command, ['ffmpeg'], { shell: false });
        if (result.status === 0 && result.stdout) {
            const found = result.stdout.toString().split(/\r?\n/).find(ln => ln.trim());
            if (found) return found.trim();
        }
    } catch (_) {
        // ignore
    }
    return null;
};

const saveToDocx = async (text, title, outputPath) => {
    const doc = new Document({
        sections: [{
            properties: {},
            children: text.split('\n').map(line => new Paragraph({
                children: [new TextRun(line)]
            }))
        }]
    });
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
};

// Simple in-memory queue for audio processing
const meetingContentQueue = [];
let workerBusy = false;

const transcribeAudioFile = async (wavPath) => {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
    if (!wavPath || !fs.existsSync(wavPath)) throw new Error(`Transcription API failed: wav file not found at ${wavPath}`);

    const fileBuffer = fs.readFileSync(wavPath);
    const blob = new Blob([fileBuffer], { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('model', 'whisper-large-v3');
    formData.append('file', blob, 'audio.wav');

    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: formData
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Transcription API failed: ${text}`);
    }

    const data = await resp.json();
    return data.text || '';
};

const formatTranscriptWithSpeakers = async (rawText, participants) => {
    if (!process.env.GROQ_API_KEY) return rawText;
    
    const contextStr = participants ? `Danh sách những người tham gia trong cuộc họp: ${participants}.\n` : '';
    const prompt = `Bạn là một AI xử lý ngôn ngữ tự nhiên. Dưới đây là đoạn hội thoại chưa được phân định người nói:\n\n${rawText}\n\n${contextStr}Hãy phân tích và viết lại nó theo dạng kịch bản có tên người nói. Dựa vào cách họ xưng hô (ví dụ có gọi tên nhau Minh ơi, Long à...) hoặc từ giọng văn để nhận diện, hãy gán tên người nói ở đầu mỗi câu. Nếu không biết tên, có thể dùng "Người 1", "Người 2"...\nTuyệt đối chỉ trả về đoạn hội thoại đã xử lý với cấu trúc Tên: Lời nói, không thêm bất kỳ nhận xét, phân tích hay giới thiệu nào.\nVí dụ:\nMinh: bạn ơi\nLong: ơi mình đây`;

    try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'Bạn là chuyên gia phân tích hội thoại.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 3000
            })
        });
        if (resp.ok) {
            const body = await resp.json();
            const formatted = body?.choices?.[0]?.message?.content?.trim();
            if (formatted && formatted.length > 5) return formatted;
        }
    } catch (e) {
        console.error('Format transcript error:', e);
    }
    return rawText;
};

const summarizeText = async (text) => {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

    const prompt = `Dưới đây là nội dung cuộc họp:
${text}

Hãy tóm tắt nội dung cuộc họp trên. 
Yêu cầu:
1. Luôn bắt đầu bằng câu: "Dưới đây là bản tóm tắt cuộc họp:"
2. KHÔNG sử dụng ký tự in đậm (dấu **), in hoa toàn bộ hay bất kỳ định dạng đặc biệt nào. Chỉ dùng văn bản thuần túy.
3. Cấu trúc tóm tắt gồm đúng 2 mục sau:
1) Các điểm chính
2) Kết luận/đề xuất
`;

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'Bạn là chuyên gia tóm tắt cuộc họp. Luôn trả về kết quả là văn bản thuần túy (Plain Text), tuyệt đối không dùng dấu **, không dùng in hoa toàn bộ tiêu đề, không dùng Markdown.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 900
        })
    });

    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Summary API failed: ${text}`);
    }

    const body = await resp.json();
    const summary = body?.choices?.[0]?.message?.content || body?.choices?.[0]?.text || '';
    return summary.trim();
};

const enqueuePendingMeetingContents = async () => {
    try {
        const pendingContents = await MeetingContent.find({ status: { $in: ['pending', 'processing', 'failed'] } });
        for (const item of pendingContents) {
            if (!meetingContentQueue.some(q => q.contentId.toString() === item._id.toString())) {
                meetingContentQueue.push({
                    contentId: item._id,
                    originalPath: item.audioPath,
                    wavPath: item.wavPath || path.join(uploadsPath, `${Date.now()}-${item._id}-post.wav`),
                    meetingContent: item
                });
                item.status = 'pending';
                await item.save();
            }
        }
        processMeetingQueue();
    } catch (err) {
        console.error('[MeetingContent] enqueue pending failed', err);
    }
};

const processMeetingQueue = async () => {
    if (workerBusy || meetingContentQueue.length === 0) return;
    workerBusy = true;

    const job = meetingContentQueue.shift();
    const { contentId, originalPath, wavPath, meetingContent } = job;

    console.log(`[MeetingContent Worker] Processing job: ${contentId}`);

    try {
        if (!originalPath || !fs.existsSync(originalPath)) {
            throw new Error(`Original audio file not found: ${originalPath}`);
        }

        // Convert webm to wav 16k mono
        const ffmpegExecutable = getFfmpegExecutable();
        if (!ffmpegExecutable) {
            throw new Error('ffmpeg binary not found. Install ffmpeg-static or ensure it is on PATH.');
        }

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegExecutable, ['-y', '-i', originalPath, '-ac', '1', '-ar', '16000', wavPath]);
            
            let stderr = '';
            ffmpeg.stderr.on('data', data => { stderr += data.toString(); });
            ffmpeg.on('error', reject);
            ffmpeg.on('close', code => {
                if (code !== 0) {
                    return reject(new Error(`ffmpeg failed (code ${code}): ${stderr.slice(-200)}`));
                }
                resolve(true);
            });
        });

        meetingContent.wavPath = wavPath;
        meetingContent.status = 'processing';
        await meetingContent.save();

        console.log(`[MeetingContent Worker] Transcribing: ${contentId}`);
        let transcript = meetingContent.transcriptText;
        if (!transcript) {
            const rawTranscript = await transcribeAudioFile(wavPath);
            console.log(`[MeetingContent Worker] Identifying speakers: ${contentId}`);
            transcript = await formatTranscriptWithSpeakers(rawTranscript, meetingContent.participants);
        } else {
            console.log(`[MeetingContent Worker] Using provided local transcript: ${contentId}`);
        }
        
        console.log(`[MeetingContent Worker] Summarizing: ${contentId}`);
        const summary = await summarizeText(transcript);

        const transcriptPath = path.join(uploadsPath, `${Date.now()}-${meetingContent._id}-transcript.txt`);
        // Add UTF-8 BOM (\ufeff) to help editors like Notepad recognize it as UTF-8
        fs.writeFileSync(transcriptPath, "\ufeff" + transcript, 'utf8');

        const summaryPath = path.join(uploadsPath, `${Date.now()}-${meetingContent._id}-summary.txt`);
        const summaryDocxPath = path.join(uploadsPath, `${Date.now()}-${meetingContent._id}-summary.docx`);
        const transcriptDocxPath = path.join(uploadsPath, `${Date.now()}-${meetingContent._id}-transcript.docx`);
        
        fs.writeFileSync(summaryPath, "\ufeff" + summary, 'utf8');
        await saveToDocx(summary, meetingContent.title || 'Summary', summaryDocxPath);
        await saveToDocx(transcript, meetingContent.title || 'Transcript', transcriptDocxPath);

        meetingContent.transcriptText = transcript;
        meetingContent.transcriptPath = transcriptPath;
        meetingContent.transcriptDocxPath = transcriptDocxPath;
        meetingContent.summaryText = summary;
        meetingContent.summaryPath = summaryPath;
        meetingContent.summaryDocxPath = summaryDocxPath;

        meetingContent.status = 'completed';
        meetingContent.updatedAt = new Date();
        await meetingContent.save();
        console.log(`[MeetingContent Worker] Completed: ${contentId}`);

    } catch (err) {
        console.error(`[MeetingContent Worker] Error processing job ${contentId}:`, err);
        try {
            meetingContent.status = 'failed';
            meetingContent.errorMessage = err.message || String(err);
            meetingContent.updatedAt = new Date();
            await meetingContent.save();
        } catch (saveErr) {
            console.error(`[MeetingContent Worker] Final save failed for ${contentId}:`, saveErr);
        }
    } finally {
        workerBusy = false;
        setTimeout(processMeetingQueue, 1000);
    }
};

// JWT Verify Middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No authentication token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// OTP Logic
app.post('/api/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    // Cấp OTP chỉ cho những email chưa được đăng ký
    const userExists = await User.findOne({ email });
    if (userExists) {
        return res.status(400).json({ error: "Email is already registered" });
    }

    const now = Date.now();
    const existing = otpStore.get(email);
    if (existing && (now - existing.lastSentAt < 60000)) {
        return res.status(429).json({ error: "Please wait 60s before getting a new code" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { code, expiresAt: now + 5 * 60 * 1000, lastSentAt: now, attempts: 0 });

    try {
        await transporter.sendMail({
            from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'AVO Meeting Verification Code',
            html: `<h3>Your verification code is: <b style="letter-spacing:5px">${code}</b></h3><p>Valid for 5 minutes.</p>`
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to send email" });
    }
});

app.post('/api/verify-otp', (req, res) => {
    const { email, code } = req.body;
    const record = otpStore.get(email);
    if (!record) return res.status(400).json({ error: "Code has expired or does not exist" });
    if (record.code !== code) return res.status(400).json({ error: "Incorrect verification code" });
    otpStore.delete(email);
    res.json({ success: true });
});

// Forgot Password: Gửi OTP đến email đã đăng ký
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "Email is not registered" });

    const now = Date.now();
    const existing = otpStore.get(`reset_${email}`);
    if (existing && (now - existing.lastSentAt < 60000)) {
        return res.status(429).json({ error: "Please wait 60s before sending the code again" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(`reset_${email}`, { code, expiresAt: now + 5 * 60 * 1000, lastSentAt: now });

    try {
        await transporter.sendMail({
            from: `"AVO Meeting" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: ' Reset Password AVO Meeting',
            html: `
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:16px">
                    <h2 style="color:#60a5fa;margin-bottom:8px">Forgot password?</h2>
                    <p style="color:#94a3b8">We received a request to reset the password for the account <b style="color:#e2e8f0">${email}</b>.</p>
                    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
                        <p style="color:#94a3b8;margin:0 0 8px">Your verification code is:</p>
                        <p style="font-size:36px;font-weight:bold;letter-spacing:12px;color:#60a5fa;margin:0">${code}</p>
                        <p style="color:#64748b;font-size:12px;margin:12px 0 0">Valid for <b>5 minutes</b></p>
                    </div>
                    <p style="color:#64748b;font-size:13px">If you did not request this, please ignore this email.</p>
                </div>
            `
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to send email" });
    }
});

// Reset Password: Xác thực OTP và cập nhật mật khẩu mới
app.post('/api/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error: "Missing information" });

    const record = otpStore.get(`reset_${email}`);
    if (!record) return res.status(400).json({ error: "Code has expired or does not exist" });
    if (Date.now() > record.expiresAt) {
        otpStore.delete(`reset_${email}`);
        return res.status(400).json({ error: "Verification code has expired" });
    }
    if (record.code !== code) return res.status(400).json({ error: "Incorrect verification code" });

    if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters long" });

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await User.updateOne({ email }, { password: hashedPassword });
        otpStore.delete(`reset_${email}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to update password" });
    }
});

app.post('/api/meetings/:roomId/record', verifyToken, upload.single('audio'), async (req, res) => {
    const roomId = req.params.roomId;
    const hostId = req.userId;
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    // Optional: verify user is host for room (scheduled/active meeting) here
    const schedule = await ScheduledMeeting.findOne({ roomId });
    if (schedule && schedule.hostId !== hostId) {
        return res.status(403).json({ error: 'Only host can upload recordings' });
    }

    const filename = req.body.name || `meeting-${Date.now()}`;
    const awsFilename = `${Date.now()}-${filename}.webm`;
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
            wavPath: wavPath
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

// Force download file endpoint
app.get('/api/download-file/:filename', async (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadsPath, filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    try {
        // Try to find the document to get the original title
        const content = await MeetingContent.findOne({
            $or: [
                { transcriptPath: { $regex: filename } },
                { transcriptDocxPath: { $regex: filename } },
                { summaryPath: { $regex: filename } },
                { summaryDocxPath: { $regex: filename } }
            ]
        });

        let downloadName = filename;
        if (content) {
            const ext = path.extname(filename);
            const baseTitle = content.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const type = filename.includes('summary') ? 'Summary' : 'Transcript';
            downloadName = `${baseTitle}_${type}${ext}`;
        }
        res.download(filePath, downloadName);
    } catch (e) {
        res.download(filePath);
    }
});

app.get('/api/meetings/content/:userId', verifyToken, async (req, res) => {
    if (req.userId !== req.params.userId) {
        return res.status(403).json({ error: 'Not allowed' });
    }

    try {
        const contents = await MeetingContent.find({ hostId: req.params.userId }).sort({ createdAt: -1 });
        const formatted = contents.map(item => {
            const audioUrl = item.audioPath ? `/uploads/${path.basename(item.audioPath)}` : null;
            const transcriptUrl = item.transcriptPath ? `/api/download-file/${path.basename(item.transcriptPath)}` : null;
            const transcriptDocxUrl = item.transcriptDocxPath ? `/api/download-file/${path.basename(item.transcriptDocxPath)}` : null;
            const summaryUrl = item.summaryPath ? `/api/download-file/${path.basename(item.summaryPath)}` : null;
            const summaryDocxUrl = item.summaryDocxPath ? `/api/download-file/${path.basename(item.summaryDocxPath)}` : null;
            return {
                _id: item._id,
                roomId: item.roomId,
                meetingId: item.meetingId,
                hostId: item.hostId,
                title: item.title,
                description: item.description,
                status: item.status,
                transcriptText: item.transcriptText,
                summaryText: item.summaryText,
                errorMessage: item.errorMessage,
                audioUrl,
                transcriptUrl,
                transcriptDocxUrl,
                summaryUrl,
                summaryDocxUrl,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            };
        });

        res.json(formatted);
    } catch (err) {
        console.error('content list', err);
        res.status(500).json({ error: 'Unable to fetch meeting contents' });
    }
});

app.delete('/api/meetings/content/:contentId', verifyToken, async (req, res) => {
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

const retryMeetingContentHandler = async (req, res) => {
    try {
        const content = await MeetingContent.findById(req.params.contentId);
        if (!content) return res.status(404).json({ error: 'Meeting content not found' });
        if (content.hostId !== req.userId) return res.status(403).json({ error: 'Not allowed' });

        if (!content.audioPath || !fs.existsSync(content.audioPath)) {
            return res.status(400).json({ error: 'Original audio file missing; cannot retry' });
        }

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

app.post('/api/meetings/content/:contentId/retry', verifyToken, retryMeetingContentHandler);
app.get('/api/meetings/content/:contentId/retry', verifyToken, retryMeetingContentHandler);

// ===== AI API =====
app.post('/api/ai/summarize-chat', verifyToken, async (req, res) => {
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'AI is not configured (missing GROQ_API_KEY)' });
    const { messages } = req.body; // [{sender, text, timestamp}]
    if (!messages || messages.length === 0) return res.status(400).json({ error: 'No chat content to summarize' });

    const chatText = messages.map(m => `${m.senderName}: ${m.text}`).join('\n');
    const prompt = `You are a smart AI assistant. Please read the following conversation from an online meeting and summarize it in Vietnamese. Please:
1. List the main points discussed
2. If there are any conclusions or decisions, please state them clearly
3. Present them neatly and easy to read

Conversation content:
${chatText}`;

    try {
        const apiKey = process.env.GROQ_API_KEY;
        const groqRes = await fetch(
            `https://api.groq.com/openai/v1/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.4,
                    max_tokens: 1024
                })
            }
        );
        const data = await groqRes.json();
        if (!groqRes.ok) throw new Error(data?.error?.message || 'Groq API error');
        const summary = data?.choices?.[0]?.message?.content || 'No result';
        res.json({ summary });
    } catch (err) {
        console.error('Groq API Error:', err.message);
        res.status(500).json({ error: `AI error: ${err.message}` });
    }
});

// Auth Logic
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters long' });

        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: 'Email is already registered' });

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
            return res.status(400).json({ error: 'Invalid login information' });
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
        if (!roomId || !userId) return res.status(400).json({ error: 'Missing roomId or userId' });
        if (req.userId !== userId) return res.status(403).json({ error: 'userId does not match token' });
        const roomToken = jwt.sign(
            { userId, roomId, role: role || 'guest' },
            JWT_SECRET,
            { expiresIn: '15m' }
        );
        console.log(`Room token issued: user=${userId} → room=${roomId} role=${role}`);
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
            return res.status(400).json({ error: "Old password is incorrect" });
        }
        user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
        await user.save();
        res.json({ success: true, message: 'Password changed successfully!' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/user/meetings/:userId', async (req, res) => {
    try {
        const meetings = await Room.find({ hostId: req.params.userId }).sort({ createdAt: -1 });
        res.json(meetings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get active rooms with autoClose=false (persistent rooms) for a specific host
app.get('/api/rooms/active-persistent/:userId', async (req, res) => {
    try {
        const rooms = await Room.find({
            hostId: req.params.userId,
            isActive: true,
            'settings.autoCloseWhenEmpty': false
        }).sort({ createdAt: -1 });
        res.json(rooms);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Force-close a room by host
app.post('/api/rooms/close/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        await Room.updateOne({ roomId, isActive: true }, { isActive: false, endedAt: new Date() });
        await Message.deleteMany({ roomId });
        // Notify via socket if room still has members
        io.to(roomId).emit('signal', { type: 'room-closed', roomId });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Scheduling & Reminders
app.post('/api/meetings/schedule', async (req, res) => {
    try {
        const { roomId, title, description, hostId, hostName, hostEmail, startTime, durationMinutes, remindBeforeMinutes, invitedEmails, settings } = req.body;
        const meeting = new ScheduledMeeting({
            roomId, title, description, hostId, hostName, hostEmail, startTime, durationMinutes, remindBeforeMinutes, invitedEmails, settings
        });
        await meeting.save();
        res.json({ success: true, meeting });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/meetings/my-schedule/:userId', async (req, res) => {
    try {
        const meetings = await ScheduledMeeting.find({ hostId: req.params.userId }).sort({ startTime: 1 });
        res.json(meetings);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/meetings/:id', async (req, res) => {
    try {
        await ScheduledMeeting.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/meetings/:id', async (req, res) => {
    try {
        const { title, description, startTime, remindBeforeMinutes, invitedEmails } = req.body;
        // Reset flags if start time logic might have changed, but keep simple for now
        const updated = await ScheduledMeeting.findByIdAndUpdate(req.params.id, {
            $set: {
                title, description, startTime, remindBeforeMinutes,
                invitedEmails: invitedEmails ? invitedEmails.split(',').map(e => e.trim()).filter(Boolean) : [],
                isReminderSent: false // reset nhắc nhở nếu đổi lịch
            }
        }, { new: true });
        res.json({ success: true, meeting: updated });
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
            text: decryptText(msg.text),
            replyTo: msg.replyTo ? { id: msg.replyTo.id, userName: msg.replyTo.userName, text: decryptText(msg.replyTo.text) } : undefined
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
        io.to(oldSocketId).emit('force-logout', { reason: 'Account has been logged in elsewhere.' });
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
            const scheduled = !room ? await ScheduledMeeting.findOne({ roomId }) : null;

            const serverPass = room?.password || room?.settings?.password || '';
            const isHost = room ? (room.hostId === userId || room.host === userId) : (scheduled && (scheduled.hostId === userId || scheduled.hostEmail === userId));

            callback({
                exists: !!room || (!!scheduled && isHost), // Allow host to enter scheduled room immediately
                isScheduledWaiting: !!scheduled && !room && !isHost, // Guests must wait
                requiresPassword: !!serverPass,
                valid: !serverPass || password === serverPass,
                locked: !!room?.settings?.lockRoom,
                isHost: isHost,
                isEmpty: !roomMap[roomId] || roomMap[roomId].length === 0,
                scheduledSettings: scheduled ? scheduled.settings : null
            });
        } catch (e) { callback({ exists: false, error: e.message }); }
    });

    socket.on('join-room', async (roomId, userId, userName, isHost, settings, token, avatar, callback) => {
        // --- SECURE ZERO TRUST VERIFICATION ---
        try {
            if (!token) throw new Error('Missing room access token');
            
            // Verify and decode the room-specific token
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Check cross-reference: token must match the room and user
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
        // ---------------------------------------

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


        socket.to(roomId).emit('user-connected', userId, userName);
        socket.emit('existing-users', roomMap[roomId].filter(u => u.id !== userId));

        if (typeof callback === 'function') callback({ success: true });
    });

    socket.on('update-room-settings', async (roomId, settings, token, callback) => {
        try {
            // Verify host token before saving settings
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.roomId !== roomId || decoded.role !== 'host') {
                return callback({ error: 'Truy cập bị từ chối: Chỉ chủ phòng mới có thể thay đổi cài đặt.' });
            }

            // Update room settings in DB
            await Room.updateOne({ roomId, isActive: true }, { 
                $set: { 
                    settings, 
                    password: settings?.password || '' 
                } 
            });

            // Broadcast to everyone else in the room
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
                    userName: payload.userName || userInfo.userName || "User",
                    type: payload.fileUrl ? (payload.isImage ? 'image' : 'file') : 'text',
                    fileUrl: payload.fileUrl, fileName: payload.fileName, fileSize: payload.fileSize,
                    replyTo: payload.replyTo ? { id: payload.replyTo.id, userName: payload.replyTo.userName, text: encryptText(payload.replyTo.text) } : undefined
                }).save();

                // === AI CHATBOT INTEGRATION ===
                if ((chatTextRaw.toLowerCase().startsWith('@ai') || chatTextRaw.toLowerCase().startsWith('/ai')) && process.env.GROQ_API_KEY) {
                    const aiQuery = chatTextRaw.replace(/^(@ai|\/ai)\s*/i, '').trim();
                    if (aiQuery) {
                        try {
                            const groqRes = await fetch(
                                `https://api.groq.com/openai/v1/chat/completions`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
                                    body: JSON.stringify({
                                        model: "llama-3.3-70b-versatile",
                                        messages: [
                                            { role: "system", content: "You are a friendly virtual assistant for the AVO Meeting application. Format your answers in markdown or plain text. Answer briefly, intelligently, and wittily in Vietnamese." },
                                            { role: "user", content: aiQuery }
                                        ],
                                        temperature: 0.6,
                                        max_tokens: 1024
                                    })
                                }
                            );
                            const data = await groqRes.json();
                            if (groqRes.ok && data?.choices?.[0]?.message?.content) {
                                const aiResText = data.choices[0].message.content;
                                const aiMsg = {
                                    roomId, type: 'chat',
                                    payload: { text: aiResText, userName: 'AVO Assistant' },
                                    from: 'ai-assistant', to: null
                                };
                                io.to(roomId).emit('signal', aiMsg); // Phát cho TẤT CẢ mọi người trong phòng (gồm cả người gửi)

                                await new Message({
                                    roomId, senderId: 'ai-assistant', text: encryptText(aiResText),
                                    userName: 'AVO Assistant', type: 'text'
                                }).save();
                            }
                        } catch (err) {
                            console.error("AI Assistant Error:", err.message);
                        }
                    }
                }
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

// SPA Fallback (Sử dụng regex /(.*)/ để hỗ trợ refresh trang trên toàn bộ ứng dụng trên Express 5)
app.get(/(.*)/, (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send("Build not found");
});

// CRON JOB FOR MEETING REMINDERS (Runs every minute)
cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        // 1. Send Initial Invites (isInvitedSent = false)
        const uninvited = await ScheduledMeeting.find({ isInvitedSent: false });
        for (const meeting of uninvited) {
            if (meeting.invitedEmails && meeting.invitedEmails.length > 0) {
                const passwordParam = meeting.settings?.password ? `&pwd=${meeting.settings.password}` : '';
                const mailOptions = {
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
                };
                await transporter.sendMail(mailOptions);
            }
            meeting.isInvitedSent = true;
            await meeting.save();
        }

        // 2. Send Reminders (isReminderSent = false and time is within remindBeforeMinutes)
        const pendingReminders = await ScheduledMeeting.find({
            isReminderSent: false,
            startTime: { $gt: now } // Chỉ nhắc các cuộc họp chưa diễn ra
        });

        for (const meeting of pendingReminders) {
            const timeDiffMs = new Date(meeting.startTime) - now;
            const timeDiffMinutes = timeDiffMs / (1000 * 60);

            // Nếu thời gian chênh lệch bằng hoặc nhỏ hơn số phút cấu hình nhắc nhở
            if (timeDiffMinutes <= meeting.remindBeforeMinutes) {
                let recipients = meeting.invitedEmails || [];
                if (meeting.hostEmail && !recipients.includes(meeting.hostEmail)) {
                    recipients.push(meeting.hostEmail); // Nhắc cả Host
                }
                if (recipients.length > 0) {
                    const passwordParam = meeting.settings?.password ? `&pwd=${meeting.settings.password}` : '';
                    const mailOptions = {
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
                    };
                    await transporter.sendMail(mailOptions);
                }
                meeting.isReminderSent = true;
                await meeting.save();
            }
        }
        // 3. Auto-close rooms open for more than 12 hours (even if autoCloseWhenEmpty = false)
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        const staleRooms = await Room.find({
            isActive: true,
            createdAt: { $lt: twelveHoursAgo }
        });
        for (const room of staleRooms) {
            await Room.updateOne({ _id: room._id }, { isActive: false, endedAt: new Date() });
            await Message.deleteMany({ roomId: room.roomId });
            io.to(room.roomId).emit('signal', { type: 'room-closed', roomId: room.roomId, reason: 'Auto-close after 12 hours of inactivity' });
            console.log(`Auto-close room: ${room.roomId} (over 12 hours)`);
        }
    } catch (e) {
        console.error("Cron Job Error:", e);
    }
});

// Ensure pending/failed contents are processed on server startup
enqueuePendingMeetingContents();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Node.js App Server is running on port: ${PORT}`);
});
