
import React, { useState, useEffect, useCallback } from 'react';
import { User, MeetingStatus, PeerStream, MeetingSettings } from './types';
import SetupScreen from './components/setup/SetupScreen';
import MeetingRoom from './components/MeetingRoom';
import AuthScreen from './components/auth/AuthScreen';
import { useSetupMedia } from './hooks/useSetupMedia';
import { validateSession, getUser, clearSession, storeUser } from './services/authService';
import { signaling } from './services/signaling';

const App: React.FC = () => {
  const [status, setStatus] = useState<MeetingStatus>(MeetingStatus.IDLE);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [meetingSettings, setMeetingSettings] = useState<MeetingSettings | undefined>(undefined);

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);

  // Register Session Immediately on Auth
  useEffect(() => {
    if (authUser?.id) {
      signaling.registerSession(authUser.id);
    }
  }, [authUser]);

  // Lifted Media State to persist across SetupScreen remounts
  const setupMedia = useSetupMedia();

  // Check Auth on Mount
  useEffect(() => {
    const isValid = validateSession();
    if (isValid) {
      setIsAuthenticated(true);
      const user = getUser();
      if (user) {
        setAuthUser(user);
        if (user.currentRoom) {
          console.log("Resuming Active Session:", user.currentRoom);
          signaling.checkRoom(user.currentRoom, undefined, user.id).then(checkResult => {
            const isHost = checkResult.isHost || false;
            console.log("Resume Role:", isHost ? "HOST" : "GUEST");

            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
              .then(stream => {
                setLocalStream(stream);
                setRoomId(user.currentRoom!);
                setCurrentUser({ id: user.id || 'me', name: user.username, isHost: isHost, avatar: user.avatar });
                setStatus(MeetingStatus.ACTIVE);
              })
              .catch(e => console.error("Auto-resume media error", e));
          });
        }
      }
    }
    setIsAuthChecked(true);
  }, []);

  // Explicitly Initialize Camera ONCE at App level
  // Only if Authenticated to avoid permission prompt on Login screen
  useEffect(() => {
    if (isAuthenticated) {
      console.log("[App] App Mounted - Initializing Camera Singleton");
      setupMedia.startCamera(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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

            // Restore avatar from Auth User Storage to avoid empty background after f5
            const authUserStore = getUser();
            if (authUserStore?.avatar) user.avatar = authUserStore.avatar;

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
      // Enforce Auth ID if logged in (Critical for Single Session Enforcement)
      if (authUser?.id) {
        user.id = authUser.id;
        if (authUser.avatar) user.avatar = authUser.avatar; // Restore Avatar because session has purged
      }

      let stream = existingStream;
      // Truncate out dead streams from previous sessions (Only if there are tracks and ALL are ended)
      if (stream && stream.getTracks().length > 0 && stream.getTracks().every(track => track.readyState === 'ended')) {
        stream = undefined;
      }

      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (mediaErr) {
          console.warn("Fallback get media failed, trying audio only", mediaErr);
          try { stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true }); }
          catch (audioErr) {
            console.warn("Audio only failed, joining as spectator", audioErr);
            stream = new MediaStream(); // Dummy stream
          }
        }
      }
      setLocalStream(stream);
      setCurrentUser(user);
      setRoomId(id);
      setMeetingSettings(settings);
      setStatus(MeetingStatus.ACTIVE);

      // User object might contain a 5MB base64 avatar which throws QuotaExceededError in sessionStorage
      const sessionUser = { ...user };
      delete sessionUser.avatar;

      // Save session
      sessionStorage.setItem('avo-meeting-session', JSON.stringify({
        user: sessionUser,
        roomId: id,
        settings
      }));
    } catch (err: any) {
      alert("Failed to join room: " + (err?.message || "Please allow Camera/Mic permissions to continue."));
      console.error("Join Error:", err);
    }
  };

  const leaveMeeting = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setLocalStream(null);
    setStatus(MeetingStatus.IDLE);
    // Restore currentUser from authUser instead of null to keep avatar/profile active
    setCurrentUser(authUser ? { id: authUser.id, name: authUser.username, avatar: authUser.avatar } : null);
    sessionStorage.removeItem('avo-meeting-session');

    // Automatically restart camera for the setup screen preview
    setTimeout(() => {
      setupMedia.startCamera(false);
    }, 300);
  };

  if (!isAuthChecked) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading...</div>;

  if (!isAuthenticated) return <AuthScreen onAuthenticated={() => {
    setIsAuthenticated(true);
    const user = getUser();
    if (user) {
      setAuthUser(user);
      if (user.currentRoom) {
        signaling.checkRoom(user.currentRoom, undefined, user.id).then(checkResult => {
          const isHost = checkResult.isHost || false;
          console.log("Resume Role:", isHost ? "HOST" : "GUEST");

          navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
              setLocalStream(stream);
              setRoomId(user.currentRoom!);
              setCurrentUser({ id: user.id || 'me', name: user.username, isHost: isHost, avatar: user.avatar });
              setStatus(MeetingStatus.ACTIVE);
            })
            .catch(e => console.error("Auto-resume media error", e));
        });
      }
    }
  }} />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {status === MeetingStatus.IDLE ? (
        <SetupScreen
          onJoin={startMeeting}
          setupMedia={setupMedia}
          initialName={authUser?.username}
          userId={authUser?.id}
          onLogout={clearSession}
          user={authUser}
          onUpdateUser={(u) => {
            setAuthUser(u);
            setCurrentUser({ id: u.id, name: u.username, isHost: currentUser?.isHost, avatar: u.avatar });
            storeUser(u);
          }}
          resumeRoomId={authUser?.currentRoom}
          onClearResume={() => {
            // Clear resume state
            if (authUser) {
              const updatedUser = { ...authUser, currentRoom: null };
              setAuthUser(updatedUser);
              storeUser(updatedUser);
            }
          }}
        />
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
