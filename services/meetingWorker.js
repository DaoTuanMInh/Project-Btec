const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const MeetingContent = require('../models/MeetingContent');
const { getFfmpegExecutable, saveToDocx, transcribeAudioFile, formatTranscriptWithSpeakers, summarizeText } = require('./aiService');

const meetingContentQueue = [];
let workerBusy = false;

const uploadsPath = path.join(__dirname, '..', 'uploads');

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

        const ffmpegExecutable = getFfmpegExecutable();
        if (!ffmpegExecutable) throw new Error('ffmpeg binary not found.');

        // Chuyển WebM → WAV 16kHz mono
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegExecutable, ['-y', '-i', originalPath, '-ac', '1', '-ar', '16000', wavPath]);
            let stderr = '';
            ffmpeg.stderr.on('data', data => { stderr += data.toString(); });
            ffmpeg.on('error', reject);
            ffmpeg.on('close', code => {
                if (code !== 0) return reject(new Error(`ffmpeg failed (code ${code}): ${stderr.slice(-200)}`));
                resolve(true);
            });
        });

        meetingContent.wavPath = wavPath;
        meetingContent.status = 'processing';
        await meetingContent.save();

        console.log(`[MeetingContent Worker] Transcribing: ${contentId}`);
        let transcript = meetingContent.transcriptText;
        if (!transcript) {
            const rawAudioText = await transcribeAudioFile(wavPath, uploadsPath);
            console.log(`[MeetingContent Worker] AI Identifying speakers: ${contentId}`);
            transcript = await formatTranscriptWithSpeakers(rawAudioText, meetingContent.participants, false);
        } else {
            console.log(`[MeetingContent Worker] Using local live transcript: ${contentId}`);
            transcript = await formatTranscriptWithSpeakers(transcript, meetingContent.participants, true);
        }

        console.log(`[MeetingContent Worker] Summarizing: ${contentId}`);
        const summary = await summarizeText(transcript);

        const transcriptPath = path.join(uploadsPath, `${Date.now()}-${meetingContent._id}-transcript.txt`);
        const summaryPath = path.join(uploadsPath, `${Date.now()}-${meetingContent._id}-summary.txt`);
        const summaryDocxPath = path.join(uploadsPath, `${Date.now()}-${meetingContent._id}-summary.docx`);
        const transcriptDocxPath = path.join(uploadsPath, `${Date.now()}-${meetingContent._id}-transcript.docx`);

        fs.writeFileSync(transcriptPath, '\ufeff' + transcript, 'utf8');
        fs.writeFileSync(summaryPath, '\ufeff' + summary, 'utf8');
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

module.exports = { meetingContentQueue, enqueuePendingMeetingContents, processMeetingQueue };
