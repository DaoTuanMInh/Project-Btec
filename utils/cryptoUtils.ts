
/**
 * AVO Security Suite
 * Triển khai các phương thức mã hóa bổ trợ cho DTLS/SRTP mặc định của WebRTC
 */

// Tạo khóa ngẫu nhiên cho phòng (Room Key)
export const generateRoomKey = () => {
  return window.crypto.getRandomValues(new Uint8Array(32));
};

// Hàm hash mật khẩu/token đảm bảo không truyền plaintext
export const hashData = async (data: string) => {
  const encoder = new TextEncoder();
  const dataUint8 = encoder.encode(data);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * E2EE cho Media Streams (Conceptual)
 * Trong thực tế, bạn sẽ sử dụng RTCRtpReceiver.createEncodedStreams()
 */
export const encryptFrame = (frame: any, key: any) => {
  // Logic mã hóa frame thô trước khi gửi qua WebRTC Transport
  // Đây là mức độ bảo mật cao nhất (Insertable Streams API)
  return frame; 
};
