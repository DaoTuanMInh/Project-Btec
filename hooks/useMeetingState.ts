import { useState, useRef, useEffect } from 'react';
import { User, MeetingSettings, Message, PeerStream, ReactionItem } from '../types';
import { useToast } from '../components/ui/Toast';

export const useMeetingState = (user: User, initialSettings?: MeetingSettings) => {
    const { showToast } = useToast();

    // 1. Core State
    const isCurrentUserHost = user.isHost;
    const [joinRequests, setJoinRequests] = useState<User[]>([]);
    const [logs, setLogs] = useState<{ id: string, time: string, message: string, type: 'info' | 'warning' | 'error' }[]>([]);
    const [peers, setPeers] = useState<PeerStream[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [reactions, setReactions] = useState<ReactionItem[]>([]);

    // 2. UI State
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'chat' | 'participants' | 'requests'>(user.isHost ? 'requests' : 'participants');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isReactionMenuOpen, setIsReactionMenuOpen] = useState(false);

    const [showControls, setShowControls] = useState(true);
    const [isFullScreen, setIsFullScreen] = useState(false);

    // 3. Modals State
    const [mediaRequestModal, setMediaRequestModal] = useState<{
        isOpen: boolean;
        type: 'audio' | 'video' | 'join_requirement';
        message: string;
        requesterId?: string;
        payload?: any;
    }>({ isOpen: false, type: 'audio', message: '' });

    // 4. Room Settings
    const [roomSettings, setRoomSettings] = useState<MeetingSettings>(initialSettings || {
        waitingRoom: true,
        requireMic: false,
        requireCamera: false,
        lockRoom: false,
        allowScreenShare: false,
        allowReactions: true,
        password: '',
        transcriptionLang: 'vi-VN'
    });

    // 5. Access Control
    const [isVerified, setIsVerified] = useState(user.isHost);
    const [unreadCount, setUnreadCount] = useState(0);
    const [unreadLogsCount, setUnreadLogsCount] = useState(0);

    // Refs for stable access in event handlers
    const isSidebarOpenRef = useRef(isSidebarOpen);
    const activeTabRef = useRef(activeTab);
    const roomSettingsRef = useRef(roomSettings);
    const isVerifiedRef = useRef(isVerified);
    const isSettingsModalOpenRef = useRef(isSettingsModalOpen);

    useEffect(() => { isSidebarOpenRef.current = isSidebarOpen; }, [isSidebarOpen]);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
    useEffect(() => { roomSettingsRef.current = roomSettings; }, [roomSettings]);
    useEffect(() => { isVerifiedRef.current = isVerified; }, [isVerified]);
    useEffect(() => { isSettingsModalOpenRef.current = isSettingsModalOpen; }, [isSettingsModalOpen]);

    return {
        isCurrentUserHost,
        joinRequests, setJoinRequests,
        logs, setLogs,
        peers, setPeers,
        messages, setMessages,
        reactions, setReactions, // Added this

        isSidebarOpen, setIsSidebarOpen, isSidebarOpenRef,
        activeTab, setActiveTab, activeTabRef,
        isSettingsModalOpen, setIsSettingsModalOpen,
        isReactionMenuOpen, setIsReactionMenuOpen,

        showControls, setShowControls,
        isFullScreen, setIsFullScreen,
        mediaRequestModal, setMediaRequestModal,
        roomSettings, setRoomSettings, roomSettingsRef,
        isVerified, setIsVerified, isVerifiedRef,
        unreadCount, setUnreadCount,
        unreadLogsCount, setUnreadLogsCount,
        isSettingsModalOpenRef,
        showToast
    };
};
