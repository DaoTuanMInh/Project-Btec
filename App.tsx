
import React, { useState, useEffect, useCallback } from 'react';
import { User, MeetingStatus, PeerStream, MeetingSettings } from './types';
import SetupScreen from './components/SetupScreen';
import MeetingRoom from './components/MeetingRoom';

const App: React.FC = () => {
  const [status, setStatus] = useState<MeetingStatus>(MeetingStatus.IDLE);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [meetingSettings, setMeetingSettings] = useState<MeetingSettings | undefined>(undefined);

  const startMeeting = async (user: User, id: string, existingStream?: MediaStream, settings?: MeetingSettings) => {
    try {
      let stream = existingStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
      }
      setLocalStream(stream);
      setCurrentUser(user);
      setRoomId(id);
      setMeetingSettings(settings);
      setStatus(MeetingStatus.ACTIVE);
    } catch (err) {
      alert("Please allow camera and microphone access to join the meeting.");
      console.error(err);
    }
  };

  const leaveMeeting = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setLocalStream(null);
    setStatus(MeetingStatus.IDLE);
    setCurrentUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {status === MeetingStatus.IDLE ? (
        <SetupScreen onJoin={startMeeting} />
      ) : (
        <MeetingRoom
          user={currentUser!}
          roomId={roomId}
          localStream={localStream!}
          onLeave={leaveMeeting}
          settings={meetingSettings}
        />
      )}
    </div>
  );
};

export default App;
