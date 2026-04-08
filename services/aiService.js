const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const { spawn, spawnSync } = require('child_process');

const ffmpegStatic = (() => {
    try { return require('ffmpeg-static'); } catch (e) { return null; }
})();

const getFfmpegExecutable = () => {
    if (ffmpegStatic) return ffmpegStatic;
    try {
        const command = process.platform === 'win32' ? 'where' : 'which';
        const result = spawnSync(command, ['ffmpeg'], { shell: false });
        if (result.status === 0 && result.stdout) {
            const found = result.stdout.toString().split(/\r?\n/).find(ln => ln.trim());
            if (found) return found.trim();
        }
    } catch (_) {}
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

// Helper: gửi 1 chunk WAV lên Groq Whisper
const transcribeSingleChunk = async (chunkPath) => {
    const fileBuffer = fs.readFileSync(chunkPath);
    const blob = new Blob([fileBuffer], { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('model', 'whisper-large-v3');
    formData.append('file', blob, path.basename(chunkPath));

    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: formData
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Transcription API failed on chunk ${path.basename(chunkPath)}: ${errText}`);
    }

    const data = await resp.json();
    return data.text || '';
};

// Transcription chính với chunking cho file lớn (> 23MB)
const transcribeAudioFile = async (wavPath, uploadsPath) => {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
    if (!wavPath || !fs.existsSync(wavPath)) throw new Error(`Transcription API failed: wav file not found at ${wavPath}`);

    const CHUNK_DURATION_SECONDS = 600; // 10 phút mỗi chunk
    const fileSizeMB = fs.statSync(wavPath).size / (1024 * 1024);
    console.log(`[Transcribe] File size: ${fileSizeMB.toFixed(1)}MB`);

    // File nhỏ: transcribe thẳng
    if (fileSizeMB < 23) {
        console.log(`[Transcribe] Small file - direct transcription`);
        return await transcribeSingleChunk(wavPath);
    }

    // File lớn: cắt thành chunks
    console.log(`[Transcribe] Large file - splitting into ${CHUNK_DURATION_SECONDS}s chunks`);
    const ffmpegExecutable = getFfmpegExecutable();
    if (!ffmpegExecutable) throw new Error('ffmpeg not found, cannot split audio chunks');

    const chunkDir = path.join(uploadsPath, `chunks_${Date.now()}`);
    fs.mkdirSync(chunkDir, { recursive: true });
    const chunkPattern = path.join(chunkDir, 'chunk_%03d.wav');

    await new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegExecutable, [
            '-y', '-i', wavPath,
            '-f', 'segment',
            '-segment_time', String(CHUNK_DURATION_SECONDS),
            '-c', 'copy',
            chunkPattern
        ]);
        let stderr = '';
        ffmpeg.stderr.on('data', d => { stderr += d.toString(); });
        ffmpeg.on('error', reject);
        ffmpeg.on('close', code => {
            if (code !== 0) return reject(new Error(`ffmpeg chunk split failed (code ${code}): ${stderr.slice(-300)}`));
            resolve(true);
        });
    });

    const chunkFiles = fs.readdirSync(chunkDir)
        .filter(f => f.endsWith('.wav'))
        .sort()
        .map(f => path.join(chunkDir, f));

    console.log(`[Transcribe] Created ${chunkFiles.length} chunks, transcribing each...`);

    const transcripts = [];
    for (let i = 0; i < chunkFiles.length; i++) {
        const chunkPath = chunkFiles[i];
        const chunkSizeMB = fs.statSync(chunkPath).size / (1024 * 1024);
        console.log(`[Transcribe] Chunk ${i + 1}/${chunkFiles.length} (${chunkSizeMB.toFixed(1)}MB)...`);
        const text = await transcribeSingleChunk(chunkPath);
        if (text.trim()) transcripts.push(text.trim());
    }

    try {
        fs.rmSync(chunkDir, { recursive: true, force: true });
        console.log(`[Transcribe] Cleaned up chunk directory`);
    } catch (e) {
        console.warn('[Transcribe] Could not cleanup chunk dir:', e.message);
    }

    const combined = transcripts.join(' ');
    console.log(`[Transcribe] All chunks merged. Total length: ${combined.length} chars`);
    return combined;
};

// Định dạng transcript có tên người nói qua LLM
const formatTranscriptWithSpeakers = async (rawText, participants, isLive = false) => {
    if (!process.env.GROQ_API_KEY) return rawText;

    const contextStr = participants ? `Danh sách những người tham gia trong cuộc họp: ${participants}.\n` : '';

    let prompt = '';
    if (isLive) {
        prompt = `Bạn là một AI xử lý ngôn ngữ tự nhiên. Dưới đây là biên bản cuộc họp đã có Tên người nói được ghi nhận trực tiếp:\n\n${rawText}\n\n${contextStr}Nhiệm vụ của bạn là:
1. TUYỆT ĐỐI không thay đổi tên người nói. Giữ nguyên định dạng "Tên: Lời nói" ở đầu mỗi câu.
2. Chỉ sửa lỗi chính tả, dấu câu và các từ bị nhận diện sai âm thanh cho đoạn văn trôi chảy hơn (ví dụ: "xin chào" thành "Xin chào").
3. Không thêm bất kỳ nhận xét, phân tích hay giới thiệu nào.`;
    } else {
        prompt = `Bạn là một AI xử lý ngôn ngữ tự nhiên. Dưới đây là đoạn hội thoại chưa được phân định người nói:\n\n${rawText}\n\n${contextStr}Hãy phân tích và viết lại nó theo dạng kịch bản có tên người nói. Dựa vào cách họ xưng hô (ví dụ có gọi tên nhau Minh ơi, Long à...) hoặc từ giọng văn để nhận diện, hãy gán tên người nói ở đầu mỗi câu. Nếu không biết tên, hãy xem xét ngôn ngữ của đoạn hội thoại: sử dụng "Người 1", "Người 2"... nếu là Tiếng Việt, hoặc "Speaker 1", "Speaker 2"... nếu là Tiếng Anh.\nTuyệt đối chỉ trả về đoạn hội thoại đã xử lý với cấu trúc Tên: Lời nói, không thêm bất kỳ nhận xét, phân tích hay giới thiệu nào.\nVí dụ Tiếng Việt:\nMinh: bạn ơi\nNgười 1: ơi mình đây\nVí dụ Tiếng Anh:\nJohn: hello\nSpeaker 1: hi there`;
    }

    try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
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

// Tóm tắt cuộc họp
const summarizeText = async (text) => {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

    const prompt = `Here is the meeting content:\n${text}\n\nPlease summarize the meeting above.\nRequirements:\n1. Detect the main language of the meeting content (Vietnamese or English).\n2. Write the ENTIRE summary in that detected language.\n3. If the language is Vietnamese, start with exactly "Dưới đây là tóm tắt cuộc họp:", use section headers "1) Các điểm chính" and "2) Kết luận/Đề xuất".\n4. If the language is English, start with exactly "Here is the meeting summary:", use section headers "1) Key points" and "2) Conclusions/Recommendations".\n5. DO NOT use bold text (like **) or any markdown formatting. Use plain text only.\n6. The summary structure MUST consist of exactly 2 sections.`;

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'You are an expert at summarizing meetings. You must generate the summary in the same language as the meeting content. Always return plain text only, absolutely no markdown formatting, no ** tags, no all-caps headers.' },
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
    return (body?.choices?.[0]?.message?.content || body?.choices?.[0]?.text || '').trim();
};

module.exports = {
    getFfmpegExecutable,
    saveToDocx,
    transcribeAudioFile,
    formatTranscriptWithSpeakers,
    summarizeText
};
