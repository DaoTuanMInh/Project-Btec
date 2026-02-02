
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { ToastProvider } from './components/ui/Toast';
import './index.css'; // Ensure CSS is loaded if not already

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
