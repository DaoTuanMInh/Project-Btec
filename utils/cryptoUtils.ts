
/**
 * AVO Security Suite
 * Implement encryption methods for DTLS/SRTP default of WebRTC
 */

// Generate random key for room (Room Key)
export const generateRoomKey = () => {
  return window.crypto.getRandomValues(new Uint8Array(32));
};

// Hash password/token to ensure no plaintext is transmitted
export const hashData = async (data: string) => {
  const encoder = new TextEncoder();
  const dataUint8 = encoder.encode(data);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * E2EE cho Media Streams (Conceptual)
 * In reality, you will use RTCRtpReceiver.createEncodedStreams()
 */
export const encryptFrame = (frame: any, key: any) => {
  // Logic encrypt raw frame before sending through WebRTC Transport
  // This is the highest level of security (Insertable Streams API)
  return frame; 
};
