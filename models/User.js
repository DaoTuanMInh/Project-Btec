const mongoose = require('mongoose');
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    currentRoom: { type: String, default: null },
    avatar: { type: String, default: '' }
});
module.exports = mongoose.model('User', UserSchema);
