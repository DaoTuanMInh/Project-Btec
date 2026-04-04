const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Message = require('../models/Message');

module.exports = (io) => {
    // Rooms active persistent (for a specific host)
    router.get('/active-persistent/:userId', async (req, res) => {
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
    router.post('/close/:roomId', async (req, res) => {
        try {
            const { roomId } = req.params;
            await Room.updateOne({ roomId, isActive: true }, { isActive: false, endedAt: new Date() });
            await Message.deleteMany({ roomId });
            io.to(roomId).emit('signal', { type: 'room-closed', roomId });
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return router;
};
