
export interface User {
  id: string;
  name: string;
  isHost?: boolean;
  muted?: boolean;
  videoOff?: boolean;
  avatar?: string;
}

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  isImage?: boolean;
  userName?: string;
  replyTo?: {
    id: string;
    userName: string;
    text: string;
  };
}

export interface PeerStream {
  userId: string;
  stream: MediaStream;
  userName: string;
  isLocal: boolean;
  muted: boolean;
  videoOff: boolean;
  isScreenShare?: boolean;
  avatar?: string;
  isSpeaking?: boolean;
}

export enum MeetingStatus {
  IDLE = 'IDLE',
  JOINING = 'JOINING',
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED'
}


export interface MeetingSettings {
  password?: string;
  requireMic: boolean;
  requireCamera: boolean;
  allowScreenShare: boolean;
  waitingRoom: boolean;
  allowReactions: boolean; // New setting
  lockRoom: boolean;
  autoCloseWhenEmpty?: boolean;
}

export interface ReactionItem {
  id: string;
  emoji: string;
  senderId: string;
  senderName?: string;
  timestamp: number;
  index?: number;
}



export type SignalingMessage =
  | { type: 'join'; from: string; to?: string; roomId: string; payload: { userName: string; password?: string } }
  | { type: 'offer'; from: string; to?: string; roomId: string; payload: { offer: RTCSessionDescriptionInit; userName: string; muted: boolean; videoOff: boolean; settings?: MeetingSettings } }
  | { type: 'answer'; from: string; to?: string; roomId: string; payload: { answer: RTCSessionDescriptionInit; muted?: boolean; videoOff?: boolean; userName?: string } }
  | { type: 'candidate'; from: string; to?: string; roomId: string; payload: { candidate: RTCIceCandidateInit } }
  | { type: 'leave'; from: string; to?: string; roomId: string; payload: {} }
  | { type: 'chat'; from: string; to?: string; roomId: string; payload: { text?: string; timestamp: Date; fileUrl?: string; fileName?: string; fileSize?: number; isImage?: boolean } }
  | { type: 'kick'; from: string; to?: string; roomId: string; payload: { reason?: string } }
  | { type: 'request-join'; from: string; to?: string; roomId: string; payload: { userName: string } }
  | { type: 'approve-join'; from: string; to?: string; roomId: string; payload: {} }
  | { type: 'reject-join'; from: string; to?: string; roomId: string; payload: {} }
  | { type: 'settings'; from: string; to?: string; roomId: string; payload: MeetingSettings }
  | { type: 'media-request'; from: string; to?: string; roomId: string; payload: { kind: 'audio' | 'video'; action: 'on' | 'off' } }
  | { type: 'media-response'; from: string; to?: string; roomId: string; payload: { kind: 'audio' | 'video' | 'join_requirement'; status: 'accepted' | 'denied'; userName: string } }
  | { type: 'user-update'; from: string; to?: string; roomId: string; payload: { muted?: boolean; videoOff?: boolean } }
  | { type: 'reaction'; from: string; to?: string; roomId: string; payload: { emoji: string; senderName?: string; index?: number } };
