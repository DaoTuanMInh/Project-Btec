
export interface User {
  id: string;
  name: string;
  isHost?: boolean;
}

export interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: Date;
}

export interface PeerStream {
  userId: string;
  stream: MediaStream;
  userName: string;
  isLocal: boolean;
  muted: boolean;
  videoOff: boolean;
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
}


export interface SignalingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'join' | 'leave' | 'chat' | 'settings' | 'kick'
  | 'media-request' | 'request-join' | 'approve-join' | 'reject-join' | 'user-update';
  from: string;
  to?: string;
  payload: any;
}
