
const mongoose = require('mongoose');
require('dotenv').config();

const clearDb = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
        console.log('正在连接 MongoDB:', mongoUri);

        await mongoose.connect(mongoUri);
        console.log('✅ Đã kết nối MongoDB.');

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        for (let collection of collections) {
            await db.collection(collection.name).drop();
            console.log(`🗑️  Đã xóa collection: ${collection.name}`);
        }

        console.log('✨ Đã xóa toàn bộ dữ liệu thành công!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Lỗi:', err);
        process.exit(1);
    }
};

clearDb();
