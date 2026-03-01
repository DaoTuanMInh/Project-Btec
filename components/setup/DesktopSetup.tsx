import React, { ComponentProps } from 'react';
import JoinForm from './JoinForm';
import MediaPreview from './MediaPreview';

// Define combined props using ComponentProps
interface DesktopSetupProps {
    joinFormProps: ComponentProps<typeof JoinForm>;
    mediaPreviewProps: ComponentProps<typeof MediaPreview>;
}

const DesktopSetup: React.FC<DesktopSetupProps> = ({ joinFormProps, mediaPreviewProps }) => {
    return (
        <div className="flex flex-row items-center justify-center gap-12 w-full max-w-6xl">
            <div className="flex-1 w-full max-w-md flex flex-col">
                <div className="mb-8 flex flex-col items-center text-center">
                    <img src="/logoAVO.png" alt="AVO Logo" className="w-24 h-24 object-contain rounded-full shadow-lg mb-4" />
                    <p className="text-slate-400 text-lg">Secure, high-performance video meetings.</p>
                </div>

                <JoinForm {...joinFormProps} />
            </div>

            <MediaPreview {...mediaPreviewProps} />
        </div>
    );
};

export default DesktopSetup;
