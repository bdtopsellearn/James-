import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      // Forward all /api/* to the backend api-server (port 3001)
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        // No rewrite — api-server already mounts everything under /api
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Split heavy third-party libraries into their own long-cacheable chunks so
        // the initial page load only downloads what it needs. Views are additionally
        // lazy-loaded (see App.tsx), producing one chunk per screen.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase') || id.includes('@firebase')) return 'vendor-firebase';
          if (id.includes('qrcode')) return 'vendor-qr';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('motion') || id.includes('framer')) return 'vendor-motion';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
});
