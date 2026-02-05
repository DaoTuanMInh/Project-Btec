import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ReactionItem } from '../../types';

interface ReactionFloatingProps {
    reactions: ReactionItem[];
}

const ReactionParticle: React.FC<{ reaction: ReactionItem }> = ({ reaction }) => {
    // Generate random values once per particle
    const [randoms] = useState(() => ({
        x: (Math.random() - 0.5) * 150,
        y: -150 - Math.random() * 200,
        rotate: (Math.random() - 0.5) * 60,
        scale: 1 + Math.random() * 0.4,
        duration: 4 + Math.random() * 2
    }));

    // Calculate origin base point
    // Align with buttons if index provided, else random center jitter
    const originOffset = reaction.index !== undefined
        ? (reaction.index - 2.5) * 45
        : (Math.random() - 0.5) * 60;

    return (
        <div
            className="absolute bottom-32 left-1/2 flex flex-col items-center gap-1 pointer-events-none origin-bottom"
            style={{ marginLeft: `${originOffset}px` }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.2, y: 50, x: 0, rotate: 0 }}
                animate={{
                    opacity: [0, 1, 1, 0],
                    scale: [0.2, 1.2, randoms.scale],
                    y: randoms.y,
                    x: randoms.x,
                    rotate: randoms.rotate
                }}
                transition={{
                    duration: randoms.duration,
                    ease: [0.22, 1, 0.36, 1],
                    times: [0, 0.1, 0.8, 1]
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }} // Use inline style to avoid TS className error on motion.div
            >
                <span className="text-4xl drop-shadow-lg filter pb-1">{reaction.emoji}</span>
                <span className="text-[10px] font-bold text-white bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm whitespace-nowrap shadow-sm">
                    {reaction.senderName}
                </span>
            </motion.div>
        </div>
    );
};

const ReactionFloating: React.FC<ReactionFloatingProps> = ({ reactions }) => {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-50">
            <AnimatePresence>
                {reactions.map((reaction) => (
                    <ReactionParticle key={reaction.id} reaction={reaction} />
                ))}
            </AnimatePresence>
        </div>
    );
};

export default ReactionFloating;
