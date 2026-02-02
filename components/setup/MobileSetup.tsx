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
            <div className="w-full max-w-md mb-4 text-center md:text-left">
                <h1 className="text-5xl font-extrabold mb-2 bg-gradient-to-r from-blue-400 to-indigo-600 bg-clip-text text-transparent">AVO</h1>
                <p className="text-slate-400 text-lg">Secure, high-performance video meetings with end-to-end encryption.</p>
            </div>

            <MediaPreview {...mediaPreviewProps} />
            <JoinForm {...joinFormProps} />
        </div>
    );
};

export default MobileSetup;
