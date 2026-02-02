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
                <div className="mb-8">
                    <h1 className="text-5xl font-extrabold mb-2 bg-gradient-to-r from-blue-400 to-indigo-600 bg-clip-text text-transparent">AVO</h1>
                    <p className="text-slate-400 text-lg">Secure, high-performance video meetings with end-to-end encryption.</p>
                </div>

                <JoinForm {...joinFormProps} />
            </div>

            <MediaPreview {...mediaPreviewProps} />
        </div>
    );
};

export default DesktopSetup;
