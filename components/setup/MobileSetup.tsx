import React, { ComponentProps } from 'react';
import JoinForm from './JoinForm';
import MediaPreview from './MediaPreview';

// Define combined props using ComponentProps
interface MobileSetupProps {
    joinFormProps: ComponentProps<typeof JoinForm>;
    mediaPreviewProps: ComponentProps<typeof MediaPreview>;
}

const MobileSetup: React.FC<MobileSetupProps> = ({ joinFormProps, mediaPreviewProps }) => {
    return (
        <div className="w-full flex flex-col items-center gap-4">
            {/* Mobile Title - Visible only on mobile */}
            <div className="w-full max-w-md mb-4 flex flex-col items-center md:items-start text-center md:text-left">
                <img src="/logoAVO.png" alt="AVO Logo" className="w-20 h-20 object-contain rounded-full shadow-lg mb-3" />
                <p className="text-slate-400 text-lg">Secure, high-performance video meetings.</p>
            </div>

            <MediaPreview {...mediaPreviewProps} />
            <JoinForm {...joinFormProps} />
        </div>
    );
};

export default MobileSetup;
