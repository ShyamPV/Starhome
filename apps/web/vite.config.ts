import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { serviceWorker } from './pwa';

const publicDir = fileURLToPath(new URL('./public', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker(publicDir)],
  worker: { format: 'es' },
  server: { port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // Libraries change rarely: separate chunks stay cached across app updates.
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/ },
            { name: 'astro-libs', test: /node_modules[\\/](astronomy-engine|satellite\.js|dexie)[\\/]/ },
          ],
        },
      },
    },
  },
});
