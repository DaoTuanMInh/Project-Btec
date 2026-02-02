import { io, Socket } from "socket.io-client";
import { SignalingMessage } from '../types';

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

  constructor() {
    console.log("Connecting to signaling server (via proxy)...");
    this.socket = io({
      path: '/socket.io', // Default, but explicit is good
      rejectUnauthorized: false,
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log("Connected to signaling server with ID:", this.socket.id);
    });

    this.socket.on('signal', (msg: SignalingMessage) => {
      this.handlers.forEach(handler => handler(msg));
    });

    this.socket.on('connect_error', (err) => {
      console.error("Signaling connection error:", err);
    });
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
  checkRoom(roomId: string, password?: string): Promise<{ exists: boolean; requiresPassword: boolean; valid: boolean }> {
    return new Promise((resolve) => {
      // Timeout protection
      const timer = setTimeout(() => resolve({ exists: false, requiresPassword: false, valid: false }), 2000);

      this.socket.emit('check-room', roomId, password, (response: any) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  joinRoom(roomId: string, userId: string, userName: string, password?: string, isHost: boolean = false, settings?: any) {
    this.socket.emit('join-room', roomId, userId, isHost, settings); // Send metadata to server logic

    // IMPORTANT: Only Host should announce presence immediately.
    // Guests announce via 'request-join'. 
    if (isHost) {
      this.send('join', userId, undefined, roomId, { userName, password });
    }
  }

  broadcastChat(roomId: string, userId: string, text: string) {
    this.send('chat', userId, undefined, roomId, { text, timestamp: new Date() });
  }
}

export const signaling = new SignalingService();
