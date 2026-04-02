const mongoose = require('mongoose');

const meetingContentSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    meetingId: { type: String },
    hostId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    participants: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    audioPath: { type: String },
    wavPath: { type: String },
    transcriptText: { type: String },
    transcriptPath: { type: String },
    transcriptDocxPath: { type: String },
    summaryText: { type: String },
    summaryPath: { type: String },
    summaryDocxPath: { type: String },
    errorMessage: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('MeetingContent', meetingContentSchema);