try {
    const ffmpegPath = require('ffmpeg-static');
    console.log('ffmpeg-static path:', ffmpegPath);
    const { spawnSync } = require('child_process');
    const result = spawnSync(ffmpegPath, ['-version']);
    if (result.status === 0) {
        console.log('ffmpeg-static is working correctly!');
    } else {
        console.error('ffmpeg-static returned error code:', result.status);
    }
} catch (e) {
    console.error('Failed to load ffmpeg-static:', e.message);
}
