import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';
  return {
    base: './',
    server: isDev ? {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/socket.io': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          ws: true
        },
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true
        }
      }
    } : {},
    plugins: [
      react()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
