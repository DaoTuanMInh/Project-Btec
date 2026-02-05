
import React, { useState, useEffect, useCallback } from 'react';
import { User, MeetingStatus, PeerStream, MeetingSettings } from './types';
import SetupScreen from './components/setup/SetupScreen';
import MeetingRoom from './components/MeetingRoom';
import { useSetupMedia } from './hooks/useSetupMedia';

const App: React.FC = () => {
  const [status, setStatus] = useState<MeetingStatus>(MeetingStatus.IDLE);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [meetingSettings, setMeetingSettings] = useState<MeetingSettings | undefined>(undefined);

  // Lifted Media State to persist across SetupScreen remounts
  const setupMedia = useSetupMedia();

  // Explicitly Initialize Camera ONCE at App level
  // This guarantees it never re-runs due to hook updates or component remounts
  useEffect(() => {
    console.log("[App] App Mounted - Initializing Camera Singleton");
    setupMedia.startCamera(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore Session on Load
  useEffect(() => {
    // ... (keep existing logic)
    const savedSession = sessionStorage.getItem('avo-meeting-session');
    if (savedSession) {
      try {
        const { user, roomId: savedRoomId, settings } = JSON.parse(savedSession);
        // Attempt to restore media stream
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          .then(stream => {
            setLocalStream(stream);
            setCurrentUser(user);
            setRoomId(savedRoomId);
            setMeetingSettings(settings);
            setStatus(MeetingStatus.ACTIVE);
          })
          .catch(err => {
            console.error("Failed to restore media stream", err);
            sessionStorage.removeItem('avo-meeting-session');
          });
      } catch (e) {
        console.error("Error parsing saved session", e);
        sessionStorage.removeItem('avo-meeting-session');
      }
    }
  }, []);

  const startMeeting = async (user: User, id: string, existingStream?: MediaStream, settings?: MeetingSettings) => {
    try {
      let stream = existingStream;
      if (!stream) {
        // Fallback if no preview stream (rare with hoisted hook)
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

      // Save session
      sessionStorage.setItem('avo-meeting-session', JSON.stringify({
        user,
        roomId: id,
        settings
      }));
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
    sessionStorage.removeItem('avo-meeting-session');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {status === MeetingStatus.IDLE ? (
        <SetupScreen onJoin={startMeeting} setupMedia={setupMedia} />
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
