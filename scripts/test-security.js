/**
 * 🛡️ SECURITY TEST SCRIPT
 * Kiểm tra các tình huống tấn công vào hệ thống
 */

const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

const SERVER_URL = 'https://localhost:3001';
const REAL_JWT_SECRET = 'avo-secret-zero-trust-key-2024'; // DEMO - Thực tế không nên expose

console.log('🔍 Bắt đầu kiểm tra bảo mật...\n');

// ============================================
// TEST 1: JOIN ROOM KHÔNG CÓ TOKEN
// ============================================
async function test1_NoToken() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Cố join room KHÔNG có token');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Promise((resolve) => {
        const socket = io(SERVER_URL, {
            rejectUnauthorized: false
        });

        socket.on('connect', () => {
            console.log('✅ Connected to server');

            // Cố join mà không có token
            socket.emit('join-room', 'test-room-123', 'hacker', false, {}, null, (response) => {
                if (response && response.error && response.error.includes('Missing Auth Token')) {
                    console.log('✅ PASSED: Server đã chặn request không có token');
                    console.log(`   Lỗi nhận được: "${response.error}"\n`);
                } else {
                    console.log('❌ FAILED: Server cho phép join mà không cần token!\n');
                }
                socket.disconnect();
                resolve();
            });
        });

        setTimeout(() => {
            socket.disconnect();
            resolve();
        }, 3000);
    });
}

// ============================================
// TEST 2: SỬ DỤNG TOKEN GIẢ MẠO
// ============================================
async function test2_FakeToken() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Sử dụng token GIẢI MẠO (wrong secret)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Promise((resolve) => {
        const socket = io(SERVER_URL, { rejectUnauthorized: false });

        socket.on('connect', () => {
            console.log('✅ Connected to server');

            // Tạo token với wrong secret
            const fakeToken = jwt.sign({
                userId: 'hacker',
                roomId: 'test-room-123',
                role: 'host' // Cố fake làm host
            }, 'wrong-secret-key-123'); // Wrong secret!

            socket.emit('join-room', 'test-room-123', 'hacker', true, {}, fakeToken, (response) => {
                if (response && response.error && response.error.includes('Invalid')) {
                    console.log('✅ PASSED: Server phát hiện token giả mạo');
                    console.log(`   Lỗi nhận được: "${response.error}"\n`);
                } else {
                    console.log('❌ FAILED: Server chấp nhận token giả!\n');
                }
                socket.disconnect();
                resolve();
            });
        });

        setTimeout(() => {
            socket.disconnect();
            resolve();
        }, 3000);
    });
}

// ============================================
// TEST 3: TOKEN HẾT HẠN
// ============================================
async function test3_ExpiredToken() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 3: Sử dụng token ĐÃ HẾT HẠN');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Promise((resolve) => {
        const socket = io(SERVER_URL, { rejectUnauthorized: false });

        socket.on('connect', () => {
            console.log('✅ Connected to server');

            // Tạo token với thời gian hết hạn trong quá khứ
            const expiredToken = jwt.sign({
                userId: 'user123',
                roomId: 'test-room-123',
                role: 'guest',
                iat: Math.floor(Date.now() / 1000) - 7200 // 2 giờ trước
            }, REAL_JWT_SECRET, { expiresIn: '-1h' }); // Âm = đã hết hạn

            socket.emit('join-room', 'test-room-123', 'user123', false, {}, expiredToken, (response) => {
                if (response && response.error && response.error.includes('Expired')) {
                    console.log('✅ PASSED: Server phát hiện token hết hạn');
                    console.log(`   Lỗi nhận được: "${response.error}"\n`);
                } else {
                    console.log('❌ FAILED: Server chấp nhận token hết hạn!\n');
                }
                socket.disconnect();
                resolve();
            });
        });

        setTimeout(() => {
            socket.disconnect();
            resolve();
        }, 3000);
    });
}

// ============================================
// TEST 4: ROOM ID MISMATCH
// ============================================
async function test4_RoomMismatch() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 4: Token cho Room A nhưng cố join Room B');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Promise((resolve) => {
        const socket = io(SERVER_URL, { rejectUnauthorized: false });

        socket.on('connect', () => {
            console.log('✅ Connected to server');

            // Token cho room-A
            const tokenForRoomA = jwt.sign({
                userId: 'user123',
                roomId: 'room-A',
                role: 'guest'
            }, REAL_JWT_SECRET, { expiresIn: '1h' });

            // Cố dùng để join room-B
            socket.emit('join-room', 'room-B', 'user123', false, {}, tokenForRoomA, (response) => {
                if (response && response.error && response.error.includes('Mismatch')) {
                    console.log('✅ PASSED: Server phát hiện room ID không khớp');
                    console.log(`   Lỗi nhận được: "${response.error}"\n`);
                } else {
                    console.log('❌ FAILED: Server cho phép dùng token sai room!\n');
                }
                socket.disconnect();
                resolve();
            });
        });

        setTimeout(() => {
            socket.disconnect();
            resolve();
        }, 3000);
    });
}

// ============================================
// TEST 5: GUY THƯỜNG CỐ UPDATE SETTINGS
// ============================================
async function test5_UnauthorizedSettingsUpdate() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 5: Guest cố cập nhật room settings');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return new Promise(async (resolve) => {
        const socket = io(SERVER_URL, { rejectUnauthorized: false });
        const roomId = 'test-room-' + Date.now();

        socket.on('connect', async () => {
            console.log('✅ Connected to server');

            // 1. Tạo room với host
            const hostToken = jwt.sign({
                userId: 'host123',
                roomId,
                role: 'host'
            }, REAL_JWT_SECRET, { expiresIn: '1h' });

            socket.emit('join-room', roomId, 'host123', true, {}, hostToken, () => {
                console.log('   Host đã tạo room');

                // 2. Guest cố update settings
                const guestToken = jwt.sign({
                    userId: 'guest456',
                    roomId,
                    role: 'guest' // Không phải host!
                }, REAL_JWT_SECRET, { expiresIn: '1h' });

                socket.emit('update-room-settings', roomId, { lockRoom: true }, guestToken, (response) => {
                    if (response && response.error && response.error.includes('Permission')) {
                        console.log('✅ PASSED: Server chặn guest cập nhật settings');
                        console.log(`   Lỗi nhận được: "${response.error}"\n`);
                    } else {
                        console.log('❌ FAILED: Guest có thể update settings!\n');
                    }
                    socket.disconnect();
                    resolve();
                });
            });
        });

        setTimeout(() => {
            socket.disconnect();
            resolve();
        }, 5000);
    });
}

// ============================================
// TEST 6: KIỂM TRA HTTPS/SSL
// ============================================
async function test6_HTTPSCheck() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 6: Kiểm tra HTTPS/SSL Certificate');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const https = require('https');

    return new Promise((resolve) => {
        https.get('https://localhost:3001', { rejectUnauthorized: false }, (res) => {
            console.log('✅ Server đang chạy trên HTTPS');
            console.log(`   Protocol: ${res.socket.getProtocol()}`);
            console.log(`   Cipher: ${res.socket.getCipher()?.name || 'N/A'}`);
            console.log('   🔐 Tất cả traffic đều được mã hóa\n');
            resolve();
        }).on('error', (err) => {
            console.log(`❌ Lỗi kết nối HTTPS: ${err.message}\n`);
            resolve();
        });
    });
}

// ============================================
// CHẠY TẤT CẢ TESTS
// ============================================
async function runAllTests() {
    console.log('\n🛡️  AVO MEETING SECURITY AUDIT REPORT\n');
    console.log('Đang kiểm tra các vector tấn công phổ biến...\n');

    await test1_NoToken();
    await test2_FakeToken();
    await test3_ExpiredToken();
    await test4_RoomMismatch();
    await test5_UnauthorizedSettingsUpdate();
    await test6_HTTPSCheck();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ HOÀN THÀNH KIỂM TRA BẢO MẬT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(0);
}

runAllTests().catch(err => {
    console.error('❌ Lỗi khi chạy test:', err);
    process.exit(1);
});
