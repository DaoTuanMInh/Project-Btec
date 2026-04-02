require('dotenv').config();
const fs = require('fs');
const path = require('path');

const wavPath = 'c:\\Users\\admin\\Project-Btec\\uploads\\1775073696252-meeting-1775073646994.wav';

if (!fs.existsSync(wavPath)) {
    console.error('File not found:', wavPath);
    process.exit(1);
}

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

// Test it
transcribeAudioFile(wavPath).then(text => {
    console.log('Transcription successful!');
    console.log('Text preview:', text.substring(0, 100) + '...');
    process.exit(0);
}).catch(err => {
    console.error('Transcription failed:', err.message);
    process.exit(1);
});
