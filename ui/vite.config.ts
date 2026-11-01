import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8080';
const devPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export default defineConfig({
  plugins: [react()],
  server: {
    port: devPort,
    host: '0.0.0.0',
    strictPort: false,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.warn(`[vite-proxy] Backend servisine (${backendTarget}) bağlanılamadı:`, err.message);
          });
        },
      },
    },
  },
});
