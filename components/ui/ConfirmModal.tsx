// @ts-nocheck
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, AlertTriangle, Info } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    /** Called when X button is clicked — just dismisses without side-effects.
     *  Falls back to onCancel if not provided. */
    onClose?: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'info' | 'warning' | 'danger';
    disableBackdropClose?: boolean;
}

const typeConfig = {
    danger: {
        icon: AlertTriangle,
        iconBg: 'bg-red-500/15',
        iconColor: 'text-red-400',
        border: 'border-red-500/20',
        confirmBtn: 'bg-red-600 hover:bg-red-500 shadow-red-500/25',
    },
    warning: {
        icon: AlertTriangle,
        iconBg: 'bg-amber-500/15',
        iconColor: 'text-amber-400',
        border: 'border-amber-500/20',
        confirmBtn: 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/25',
    },
    info: {
        icon: Info,
        iconBg: 'bg-blue-500/15',
        iconColor: 'text-blue-400',
        border: 'border-blue-500/20',
        confirmBtn: 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/25',
    },
};

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    onClose,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'info',
    disableBackdropClose = false,
}) => {
    if (!isOpen) return null;
    const handleClose = onClose ?? onCancel;

    const cfg = typeConfig[type];
    const IconComp = cfg.icon;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={disableBackdropClose ? undefined : onCancel}
                />

                {/* @ts-ignore */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 16 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    className={`relative w-full max-w-sm bg-slate-900 border ${cfg.border} rounded-2xl shadow-2xl overflow-hidden`}
                >
                    {/* X close button — just dismisses, no side-effects */}
                    <button
                        onClick={handleClose}
                        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all z-10"
                    >
                        <X size={14} />
                    </button>

                    {/* Content */}
                    <div className="p-6 flex flex-col items-center text-center gap-4">
                        {/* Icon */}
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${cfg.iconBg}`}>
                            <IconComp size={24} className={cfg.iconColor} />
                        </div>

                        {/* Text */}
                        <div className="space-y-1.5">
                            <h3 className="text-base font-bold text-white leading-snug">{title}</h3>
                            <p className="text-sm text-slate-400 leading-relaxed">{message}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2.5 w-full mt-1">
                            <button
                                onClick={onCancel}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition-all"
                            >
                                {cancelText}
                            </button>
                            <button
                                onClick={onConfirm}
                                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg ${cfg.confirmBtn} transition-all active:scale-95`}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ConfirmModal;
