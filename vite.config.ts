import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './', // Use relative paths for static deployment (Web Server for Chrome)
    server: {
      port: 3000,
      host: '0.0.0.0', // Allow LAN access
      https: {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem'),
      },
      proxy: {
        '/socket.io': {
          target: 'https://localhost:3001',
          secure: false,
          changeOrigin: true,
          ws: true
        },
        '/api': {
          target: 'https://localhost:3001',
          secure: false,
          changeOrigin: true
        }
      }
    },
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
