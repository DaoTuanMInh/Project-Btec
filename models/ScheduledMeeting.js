const mongoose = require('mongoose');

const scheduledMeetingSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    hostId: { type: String, required: true }, // Luôn là mã JWT UserID (chuỗi string)
    hostEmail: { type: String }, // Lưu thêm email của Host
    hostName: { type: String, required: true },
    startTime: { type: Date, required: true },
    durationMinutes: { type: Number, default: 60 },
    remindBeforeMinutes: { type: Number, default: 15 },
    invitedEmails: [{ type: String }],
    settings: { type: Object, default: {} },
    status: {
        type: String,
        enum: ['scheduled', 'active', 'completed', 'cancelled'],
        default: 'scheduled'
    },
    isInvitedSent: { type: Boolean, default: false },
    isReminderSent: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('ScheduledMeeting', scheduledMeetingSchema);
