// @ts-nocheck
import React, { ComponentProps, useState } from 'react';
import JoinForm from './JoinForm';
import MediaPreview from './MediaPreview';
import { CalendarRange, LogIn, PlusCircle } from 'lucide-react';

interface DesktopSetupProps {
    joinFormProps: ComponentProps<typeof JoinForm>;
    mediaPreviewProps: ComponentProps<typeof MediaPreview>;
    user?: any;
    onOpenProfile?: () => void;
    onOpenSchedule?: () => void;
    onLogout?: () => void;
}

const NAV_ITEMS = [
    { id: 'join', label: 'Tham Gia', icon: LogIn, color: 'blue', desc: 'Vào phòng họp đang có' },
    { id: 'create', label: 'Tạo Nhanh', icon: PlusCircle, color: 'green', desc: 'Tạo phòng mới ngay lập tức' },
    { id: 'schedule', label: 'Lên Lịch', icon: CalendarRange, color: 'indigo', desc: 'Hẹn họp theo thời gian' },
];

const colorMap: Record<string, { active: string; iconColor: string; dot: string; borderLeft: string }> = {
    blue: { active: 'bg-blue-600/20 border-blue-500/40 text-blue-300', iconColor: 'text-blue-400', dot: 'bg-blue-500', borderLeft: 'border-l-blue-500' },
    green: { active: 'bg-green-600/20 border-green-500/40 text-green-300', iconColor: 'text-green-400', dot: 'bg-green-500', borderLeft: 'border-l-green-500' },
    indigo: { active: 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300', iconColor: 'text-indigo-400', dot: 'bg-indigo-500', borderLeft: 'border-l-indigo-500' },
};

const DesktopSetup: React.FC<DesktopSetupProps> = ({
    joinFormProps, mediaPreviewProps,
    user, onOpenProfile, onOpenSchedule, onLogout,
}) => {
    const { mode, setMode, setRoom, room } = joinFormProps;
    const [collapsed, setCollapsed] = useState(true);

    const generateRoomId = () => {
        const s = () => Math.random().toString(36).substring(2, 6);
        return `${s()}-${s()}-${s()}-${s()}`;
    };

    const handleNav = (id: 'join' | 'create' | 'schedule') => {
        setMode(id);
        if (id !== 'join' && !room) setRoom(generateRoomId());
        // Đóng menu sau khi chọn
        if (window.innerWidth < 1024) {
            setCollapsed(true);
        } else {
            setCollapsed(true);
        }
    };

    return (
        <div className="flex w-full h-screen overflow-hidden relative">

            {/* Sidebar Placeholder to keep layout stable (always 56px) */}
            <div className="w-[56px] shrink-0 h-screen bg-slate-900 border-r border-slate-800" />

            {/* Overlay to close sidebar on click outside */}
            <div
                className={`absolute inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${!collapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setCollapsed(true)}
            />

            {/* ===== LEFT SIDEBAR ===== */}
            <aside
                style={{ width: collapsed ? '56px' : '240px', transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)' }}
                className="absolute top-0 left-0 bottom-0 z-50 flex flex-col bg-slate-900 border-r border-slate-800 overflow-visible"
            >
                {/* Logo row */}
                {/* Logo — click to toggle sidebar */}
                <div
                    onClick={() => setCollapsed(c => !c)}
                    className="flex items-center px-3 py-4 border-b border-slate-800/60 cursor-pointer hover:bg-slate-800/40 transition-colors select-none"
                    style={{ minHeight: '60px' }}
                    title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
                >
                    <img
                        src="/logoAVO.png"
                        alt="AVO"
                        className="w-8 h-8 rounded-lg object-contain shrink-0 border border-slate-700 shadow shadow-blue-500/10 ring-1 ring-transparent hover:ring-blue-500/40 transition-all"
                    />
                    <div
                        className="ml-3 overflow-hidden whitespace-nowrap"
                        style={{ opacity: collapsed ? 0 : 1, transition: 'opacity 0.15s', width: collapsed ? 0 : 'auto' }}
                    >
                        <div className="text-white font-extrabold text-sm leading-tight">AVO Meeting</div>
                        <div className="text-slate-500 text-[10px] leading-none mt-0.5">Secure Video Conference</div>
                    </div>
                </div>

                {/* Nav section label */}
                {!collapsed && (
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-4 mt-4 mb-1">Cuộc họp</p>
                )}

                {/* Nav items */}
                <nav className="flex-1 px-2 py-2 space-y-1 overflow-hidden">
                    {NAV_ITEMS.map(({ id, label, icon: Icon, color, desc }) => {
                        const active = mode === id;
                        const c = colorMap[color];
                        return (
                            <button
                                key={id}
                                type="button"
                                onClick={() => handleNav(id as any)}
                                title={collapsed ? label : undefined}
                                className={`w-full flex items-center rounded-xl text-left transition-all group border overflow-hidden
                                    ${active
                                        ? `${c.active} border border-l-4 ${c.borderLeft} shadow`
                                        : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-800/60'
                                    }`}
                                style={{ padding: collapsed ? '8px' : '10px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
                            >
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all
                                    ${active ? `${c.iconColor}` : 'text-slate-500 group-hover:text-slate-300'}`}>
                                    <Icon size={16} />
                                </div>

                                {/* Label — hidden when collapsed */}
                                <div
                                    className="ml-2.5 min-w-0 overflow-hidden whitespace-nowrap"
                                    style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : '160px', transition: 'opacity 0.15s, max-width 0.25s' }}
                                >
                                    <div className="text-[13px] font-semibold leading-tight">{label}</div>
                                    <div className="text-[10px] text-slate-600 leading-tight mt-0.5 truncate group-hover:text-slate-500">{desc}</div>
                                </div>

                                {/* Active dot */}
                                {active && !collapsed && (
                                    <div className={`w-1.5 h-1.5 rounded-full ml-auto shrink-0 ${c.dot}`} />
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Divider */}
                <div className="border-t border-slate-800/60 mx-2" />

                {/* Bottom: user + logout */}
                {user && (
                    <div className="px-2 py-3 space-y-1">
                        {/* Profile */}
                        <button
                            onClick={onOpenProfile}
                            title={collapsed ? (user.username || 'Hồ sơ') : undefined}
                            className="w-full flex items-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all group overflow-hidden"
                            style={{ padding: collapsed ? '8px' : '8px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
                        >
                            <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-700 shrink-0 border border-slate-600">
                                {user.avatar
                                    ? <img src={user.avatar} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-300">{(user.username || 'U')[0].toUpperCase()}</div>
                                }
                            </div>
                            {!collapsed && (
                                <div className="ml-2.5 min-w-0 overflow-hidden">
                                    <div className="text-[13px] font-semibold text-slate-300 truncate whitespace-nowrap">{user.username || 'Người dùng'}</div>
                                    <div className="text-[10px] text-slate-600 truncate whitespace-nowrap">{user.email || ''}</div>
                                </div>
                            )}
                        </button>

                        {/* Logout */}
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                title={collapsed ? 'Đăng xuất' : undefined}
                                className="w-full flex items-center rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all overflow-hidden"
                                style={{ padding: collapsed ? '8px' : '8px 12px', justifyContent: collapsed ? 'center' : 'flex-start' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                {!collapsed && <span className="ml-2.5 text-[13px] whitespace-nowrap">Đăng xuất</span>}
                            </button>
                        )}
                    </div>
                )}

            </aside>

            {/* ===== MAIN CONTENT ===== */}
            <main className="flex-1 flex items-center justify-center gap-10 px-10 py-8 overflow-hidden relative">
                {/* Schedule button top-right */}
                <button
                    onClick={onOpenSchedule}
                    title="Lịch hẹn của tôi"
                    className="absolute top-4 right-5 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-300 border border-slate-700 hover:border-indigo-500/40 transition-all text-xs font-semibold shadow"
                >
                    <CalendarRange size={14} />
                    <span>Lịch hẹn của tôi</span>
                </button>
                <div className="flex-1 max-w-md">
                    <div className="mb-5">
                        <h1 className="text-2xl font-extrabold text-white mb-1">
                            {mode === 'join' && 'Tham gia cuộc họp'}
                            {mode === 'create' && 'Tạo phòng mới'}
                            {mode === 'schedule' && 'Lên lịch họp'}
                        </h1>
                        <p className="text-slate-400 text-sm">
                            {mode === 'join' && 'Nhập mã phòng để tham gia ngay.'}
                            {mode === 'create' && 'Tạo phòng và mời mọi người tham gia.'}
                            {mode === 'schedule' && 'Hẹn lịch và hệ thống sẽ gửi email tự động.'}
                        </p>
                    </div>
                    <JoinForm {...joinFormProps} hideTabs />
                </div>

                <div className="shrink-0">
                    <MediaPreview {...mediaPreviewProps} />
                </div>
            </main>
        </div>
    );
};

export default DesktopSetup;
