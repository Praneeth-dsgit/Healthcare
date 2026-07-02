import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0', // allow network access (LAN + tunnels)
    port: 5173,
    // Required when accessing via Cloudflare/ngrok public URLs
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'],
    proxy: {
      // Dev: browser calls same-origin /api/...; Vite forwards to Flask (avoids ERR_CONNECTION_REFUSED
      // when the browser targets localhost:5000 while the API runs only on the dev machine, etc.)
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
});
