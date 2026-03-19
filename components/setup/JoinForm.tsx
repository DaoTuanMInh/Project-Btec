import React from 'react';
import { RefreshCcw, Settings, Lock, Plus, Copy, Eye, EyeOff } from 'lucide-react';
import { MeetingSettings } from '../../types';

const generateRoomId = () => {
    const s = () => Math.random().toString(36).substring(2, 6);
    return `${s()}-${s()}-${s()}-${s()}`;
};

// ─── EmailTagInput ────────────────────────────────────────────────────────────
interface EmailTagInputProps {
    value: string;
    onChange: (val: string) => void;
}

const EmailTagInput: React.FC<EmailTagInputProps> = ({ value, onChange }) => {
    const [inputVal, setInputVal] = React.useState('');
    const inputRef = React.useRef<HTMLInputElement>(null);

    const tags = value.split(',').map(e => e.trim()).filter(Boolean);

    const parseEmails = (raw: string): string[] =>
        raw.split(/[\s,;\t\n\r]+/).map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));

    const addEmails = (raw: string) => {
        const newOnes = parseEmails(raw);
        if (!newOnes.length) return;
        const merged = [...new Set([...tags, ...newOnes])];
        onChange(merged.join(', '));
    };

    const removeTag = (email: string) => onChange(tags.filter(t => t !== email).join(', '));

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Enter still works as separator on desktop
        if (e.key === 'Enter') {
            e.preventDefault();
            if (inputVal.trim()) { addEmails(inputVal); setInputVal(''); }
        }
        if (e.key === 'Backspace' && !inputVal && tags.length) removeTag(tags[tags.length - 1]);
    };

    // onChange handles Space/comma/semicolon — catches mobile virtual keyboards that skip keydown
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        // If the last typed char is a separator → commit
        if (val.endsWith(' ') || val.endsWith(',') || val.endsWith(';')) {
            const toAdd = val.slice(0, -1).trim();
            if (toAdd) { addEmails(toAdd); }
            setInputVal('');
        } else {
            setInputVal(val);
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        addEmails(inputVal + ' ' + e.clipboardData.getData('text'));
        setInputVal('');
    };

    const handleBlur = () => {
        if (inputVal.trim()) { addEmails(inputVal); setInputVal(''); }
    };

    return (
        <div
            onClick={() => inputRef.current?.focus()}
            className="w-full min-h-[76px] max-h-44 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex flex-wrap gap-1.5 cursor-text focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all"
        >
            {tags.map(email => (
                <span key={email} className="flex items-center gap-1 bg-indigo-600/25 text-indigo-300 text-xs px-2 py-1 rounded-md border border-indigo-500/30 font-mono">
                    <span className="truncate max-w-[200px]" title={email}>{email}</span>
                    <button type="button" onClick={ev => { ev.stopPropagation(); removeTag(email); }} className="text-indigo-400/60 hover:text-red-400 transition-colors leading-none text-base ml-0.5">×</button>
                </span>
            ))}
            <input
                ref={inputRef}
                type="text"
                value={inputVal}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onBlur={handleBlur}
                className="flex-1 min-w-[160px] bg-transparent text-slate-200 text-sm outline-none placeholder:text-slate-600 py-0.5"
                placeholder={tags.length === 0 ? 'Enter email, press Space or Enter to add...' : 'Add email...'}
            />
        </div>
    );
};

interface JoinFormProps {
    name: string;
    setName: (name: string) => void;
    room: string;
    setRoom: (room: string) => void;
    mode: 'join' | 'create' | 'schedule';
    setMode: (mode: 'join' | 'create' | 'schedule') => void;
    joinSettings: MeetingSettings;
    setJoinSettings: (settings: MeetingSettings) => void;
    joinPassword: string;
    setJoinPassword: (pass: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    onShowToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
    currentUser?: any;
    hideTabs?: boolean;
}

const JoinForm: React.FC<JoinFormProps> = ({
    name, setName,
    room, setRoom,
    mode, setMode,
    joinSettings, setJoinSettings,
    joinPassword, setJoinPassword,
    onSubmit, onShowToast, currentUser,
    hideTabs = false
}) => {
    const [showPass, setShowPass] = React.useState(false);
    const [showJoinPass, setShowJoinPass] = React.useState(false);
    const [title, setTitle] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [startTime, setStartTime] = React.useState("");
    const [invitedEmails, setInvitedEmails] = React.useState("");
    const [remindBeforeMinutes, setRemindBeforeMinutes] = React.useState(15);
    const [isScheduling, setIsScheduling] = React.useState(false);

    const handleLocalSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (mode === 'schedule') {
            if (!title || !startTime || !room || !name) return onShowToast?.("Please fill in Meeting Title, Start Time, and Display Name.", "error");

            setIsScheduling(true);
            try {
                const res = await fetch('/api/meetings/schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        roomId: room,
                        title, description,
                        hostId: currentUser?.id || 'guest',
                        hostName: name,
                        hostEmail: currentUser?.email,
                        startTime,
                        durationMinutes: 60,
                        remindBeforeMinutes: Number(remindBeforeMinutes),
                        invitedEmails: invitedEmails.split(',').map(e => e.trim()).filter(Boolean),
                        settings: joinSettings
                    })
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error);
                }
                onShowToast?.("Scheduled successfully! Invitation emails have been sent.", "success");
                setMode('join'); // Return to join
                setTitle(""); setDescription(""); setStartTime(""); setInvitedEmails("");
            } catch (error: any) {
                onShowToast?.(error.message || "Failed to schedule", "error");
            } finally { setIsScheduling(false); }
        } else {
            onSubmit(e);
        }
    };

    return (
        <div className="flex-1 w-full max-w-md">
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 backdrop-blur-sm md:max-h-[60vh] md:overflow-y-auto custom-scrollbar">
                {/* Tabs - only show when not hidden (mobile or non-sidebar layouts) */}
                {!hideTabs && (
                    <div className="flex mb-6 bg-slate-800/50 p-1 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setMode('join')}
                            className={`flex-1 py-2 px-2 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-all ${mode === 'join' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Join
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setMode('create');
                                if (!room) setRoom(generateRoomId());
                            }}
                            className={`flex-1 py-2 px-2 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-all ${mode === 'create' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Create
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setMode('schedule');
                                if (!room) setRoom(generateRoomId());
                            }}
                            className={`flex-1 py-2 px-2 md:px-4 rounded-lg text-xs md:text-sm font-medium transition-all ${mode === 'schedule' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                        >
                            Schedule
                        </button>
                    </div>
                )}

                <form onSubmit={handleLocalSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Your name</label>
                        <input
                            required
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="e.g. John Doe"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">{mode !== 'join' ? "Room ID (Auto-generated)" : "Enter Room ID"}</label>
                        <div className="relative group">
                            <input
                                required
                                type="text"
                                value={room}
                                onChange={mode !== 'join' ? undefined : e => setRoom(e.target.value)}
                                className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all pr-20 ${mode !== 'join' ? 'bg-slate-800/50 border-slate-700/50 text-blue-400 font-mono cursor-default select-all' : 'bg-slate-800 border-slate-700 text-white'}`}
                                placeholder="e.g. abcd-efgh-ijkl-mnop"
                                readOnly={mode !== 'join'}
                            />
                            {mode !== 'join' && (
                                <div className="absolute right-2 top-2 flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(room);
                                            onShowToast?.("Copied room ID successfully!", 'success');
                                        }}
                                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-all"
                                        title="Copy room ID"
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newId = generateRoomId();
                                            setRoom(newId);
                                            onShowToast?.("Generated new room ID!", 'info');
                                        }}
                                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-md transition-all animate-in spin-in-180 duration-500"
                                        title="Generate new room ID"
                                    >
                                        <RefreshCcw size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                        {mode !== 'join' && <p className="text-[10px] text-slate-500 mt-1 italic">* Room ID is automatically generated to ensure uniqueness.</p>}
                    </div>

                    {/* Schedule Fields */}
                    {mode === 'schedule' && (
                        <div className="space-y-4 pt-4 border-t border-slate-700/50 mt-4 animate-in slide-in-from-top-2 fade-in duration-300">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Meeting title <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    placeholder="e.g. Sprint Review Meeting"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Short description (Note)</label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    placeholder="Additional notes about the content..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Start time <span className="text-red-500">*</span></label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={startTime}
                                    onChange={e => setStartTime(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    style={{ colorScheme: "dark" }}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Reminder via Email:</label>
                                <select
                                    value={remindBeforeMinutes}
                                    onChange={e => setRemindBeforeMinutes(Number(e.target.value))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                >
                                    <option value={5}>5 Minutes</option>
                                    <option value={15}>15 Minutes</option>
                                    <option value={30}>30 Minutes</option>
                                    <option value={60}>1 Hour</option>
                                    <option value={0}>No reminder</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">
                                    Invited emails
                                    {(() => {
                                        const count = invitedEmails.split(',').map(e => e.trim()).filter(Boolean).length;
                                        return count > 0 ? <span className="ml-2 text-[11px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full">{count} people</span> : null;
                                    })()}
                                </label>
                                <EmailTagInput value={invitedEmails} onChange={setInvitedEmails} />
                            </div>
                        </div>
                    )}

                    {/* Password input for JOIN mode */}
                    {mode === 'join' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Password (If any)</label>
                            <div className="relative">
                                <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
                                <input
                                    type={showJoinPass ? "text" : "password"}
                                    value={joinPassword}
                                    onChange={e => setJoinPassword(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-10 py-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    placeholder="Enter password..."
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowJoinPass(!showJoinPass)}
                                    className="absolute right-3 top-3.5 text-slate-400 hover:text-blue-400 transition-colors"
                                >
                                    {showJoinPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {mode !== 'join' && (
                        <div className="space-y-3 pt-2 border-t border-slate-700/50 mt-4 animate-in slide-in-from-top-2 fade-in duration-300">
                            <p className="text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                <Settings size={14} /> Room settings
                            </p>

                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Password (Optional)</label>
                                <div className="relative">
                                    <Lock size={14} className="absolute left-3 top-3 text-slate-500" />
                                    <input
                                        type={showPass ? "text" : "password"}
                                        value={joinSettings.password || ''}
                                        onChange={e => setJoinSettings({ ...joinSettings, password: e.target.value })}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        placeholder="Leave empty if no password is required"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPass(!showPass)}
                                        className="absolute right-3 top-3 text-slate-400 hover:text-blue-400 transition-colors"
                                    >
                                        {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={joinSettings.requireCamera}
                                        onChange={e => setJoinSettings({ ...joinSettings, requireCamera: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                    <div className="text-xs">
                                        <span className="block font-medium text-slate-300">Require Camera</span>
                                        <span className="text-slate-500">Must turn on Camera</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={joinSettings.requireMic}
                                        onChange={e => setJoinSettings({ ...joinSettings, requireMic: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                    <div className="text-xs">
                                        <span className="block font-medium text-slate-300">Require Mic</span>
                                        <span className="text-slate-500">Must turn on Mic</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={joinSettings.allowScreenShare}
                                        onChange={e => setJoinSettings({ ...joinSettings, allowScreenShare: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                    <div className="text-xs">
                                        <span className="block font-medium text-slate-300">Share Screen</span>
                                        <span className="text-slate-500">Allow screen sharing</span>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 cursor-pointer hover:bg-slate-800 transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={joinSettings.allowReactions}
                                        onChange={e => setJoinSettings({ ...joinSettings, allowReactions: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 bg-slate-700"
                                    />
                                    <div className="text-xs">
                                        <span className="block font-medium text-slate-300">Emote</span>
                                        <span className="text-slate-500">Allow Emote</span>
                                    </div>
                                </label>

                                <label className="col-span-2 flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors">
                                    <div className="text-xs">
                                        <span className="block font-medium text-red-400">Auto close room</span>
                                        <span className="text-red-500/70">Close room and save history when no one is left</span>
                                    </div>
                                    <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                                        <input
                                            type="checkbox"
                                            name="toggle"
                                            id="autoClose"
                                            checked={joinSettings.autoCloseWhenEmpty !== false} // True by default
                                            onChange={e => setJoinSettings({ ...joinSettings, autoCloseWhenEmpty: e.target.checked })}
                                            className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-transform duration-200 ease-in-out border-slate-500"
                                            style={{
                                                transform: joinSettings.autoCloseWhenEmpty !== false ? 'translateX(100%)' : 'translateX(0)',
                                                borderColor: joinSettings.autoCloseWhenEmpty !== false ? '#3b82f6' : '#64748b'
                                            }}
                                        />
                                        <label htmlFor="autoClose" className={`toggle-label block overflow-hidden h-5 rounded-full bg-slate-700 cursor-pointer transition-colors duration-200 ${joinSettings.autoCloseWhenEmpty !== false ? 'bg-blue-500' : 'bg-slate-600'}`}></label>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isScheduling}
                        className={`w-full text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2
                            ${mode === 'schedule' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-blue-600 hover:bg-blue-500'}
                            ${isScheduling ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {mode === 'schedule' && isScheduling ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                {mode !== 'join' ? <Plus size={20} /> : null}
                                {mode === 'create' ? "Create Room Now" : mode === 'schedule' ? "Send Email & Schedule" : "Join Now"}
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default JoinForm;

