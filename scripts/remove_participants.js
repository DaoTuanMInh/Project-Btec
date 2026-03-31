require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const result = await mongoose.connection.db.collection('rooms').updateMany(
        {},
        { $unset: { participants: '' } }
    );
    console.log('Deleted participants from', result.modifiedCount, 'documents');
    mongoose.disconnect();
}).catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
