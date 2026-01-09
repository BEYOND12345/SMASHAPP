import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Keep a stable port so we don't accidentally load a stale server
    port: 5180,
    // Fail loudly if another process is already on 5180
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
