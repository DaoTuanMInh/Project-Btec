import { io, Socket } from "socket.io-client";
import { SignalingMessage } from '../types';
import { clearSession, getToken } from './authService';

// Determine the signaling server URL based on current host
// This allows it to work on localhost and LAN IP (e.g. 192.168.x.x:3001)
// HTTPS is mandatory now
// Connect to the same origin (proxied by Vite)
// This avoids double-certificate issues and CORS problems
// const SOCKET_URL = '/'; 

type MessageHandler = (msg: SignalingMessage) => void;

class SignalingService {
  private socket: Socket;
  private handlers: Set<MessageHandler> = new Set();
  private currentUserToken: string | null = null; // Cache token

  constructor() {
    // ZERO TRUST: Optimized for All-in-One Server
    // Connect to current origin (works for Localhost & Ngrok automatically)
    this.socket = io('/', {
      autoConnect: true,
      reconnection: true,
      rejectUnauthorized: false,
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to Signaling Server via ' + window.location.origin);
      console.log("Connected to signaling server with ID:", this.socket.id);
    });

    this.socket.on('signal', (msg: SignalingMessage) => {
      this.handlers.forEach(handler => handler(msg));
    });

    this.socket.on('force-logout', (msg: any) => {
      console.warn("Force Logout:", msg.reason);
      alert("Tài khoản của bạn đã được đăng nhập ở nơi khác. Vui lòng đăng nhập lại.");
      clearSession();
    });

    this.socket.on('connect_error', (err) => {
      console.error("Signaling connection error:", err);
    });
  }

  // Identify session immediately after login
  registerSession(userId: string) {
    console.log("Registering Session for User:", userId);
    if (this.socket.connected) {
      this.socket.emit('register-session', userId);
    } else {
      this.socket.once('connect', () => {
        this.socket.emit('register-session', userId);
      });
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // Gửi tin nhắn có ID người nhận (to) và mã phòng (roomId)
  send(type: SignalingMessage['type'], from: string, to: string | undefined, roomId: string, payload: any) {
    this.socket.emit('signal', {
      type,
      from,
      to,
      roomId,
      payload
    });
  }

  // Check if room exists before joining
  checkRoom(roomId: string, password?: string, userId?: string): Promise<{ exists: boolean; requiresPassword: boolean; valid: boolean; locked: boolean; isHost?: boolean; isEmpty?: boolean }> {
    return new Promise((resolve) => {
      // Timeout protection
      const timer = setTimeout(() => resolve({ exists: false, requiresPassword: false, valid: false, locked: false, isEmpty: true }), 2000);

      this.socket.emit('check-room', roomId, password, userId, (response: any) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  async joinRoom(roomId: string, userId: string, userName: string, password?: string, isHost: boolean = false, settings?: any, avatar?: string) {
    try {
      console.log(`Requesting Zero Trust Access Token...`);

      const authToken = getToken(); // Lấy JWT từ session
      if (!authToken) throw new Error('Chưa đăng nhập hoặc phiên hết hạn');

      const response = await fetch(`/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`  // ← fix: gửi JWT token
        },
        body: JSON.stringify({
          roomId,
          userId,
          role: isHost ? 'host' : 'guest'
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server trả ${response.status}`);
      }

      const data = await response.json();
      if (!data.token) throw new Error('Không nhận được access token');

      this.currentUserToken = data.token;
      console.log('Token obtained. Joining Secure Socket Room...');

      return new Promise<void>((resolve, reject) => {
        this.socket.emit('join-room', roomId, userId, userName, isHost, settings, data.token, avatar, (ack: any) => {
          if (ack && ack.error) {
            console.error('Join Denied by Zero Trust Policy:', ack.error);
            alert(ack.error);
            reject(new Error(ack.error));
          } else {
            resolve();
          }
        });
      });
    } catch (err: any) {
      console.error('Zero Trust Auth Failed:', err);
      alert(`Lỗi tham gia phòng!\n\n${err.message || 'Không thể kết nối với server.'}\n\nVui lòng tải lại trang và thử lại.`);
      throw err;
    }
  }

  updateRoomSettings(roomId: string, settings: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.currentUserToken) {
        console.warn("No auth token available to update settings");
        reject("No Auth Token");
        return;
      }
      this.socket.emit('update-room-settings', roomId, settings, this.currentUserToken, (response: any) => {
        if (response && response.error) {
          console.error("Update Settings Failed:", response.error);
          reject(response.error);
        } else {
          console.log("Settings updated securely on server.");
          resolve();
        }
      });
    });
  }

  broadcastChat(roomId: string, userId: string, text: string) {
    this.send('chat', userId, undefined, roomId, { text, timestamp: new Date() });
  }
}

export const signaling = new SignalingService();
