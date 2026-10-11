import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/admin': 'http://127.0.0.1:8001',
      '/api': 'http://127.0.0.1:8001',
      '/static': 'http://127.0.0.1:8001',
    },
  },
  build: {
    rollupOptions: {
      input: {
        app: resolve(import.meta.dirname, 'index.html'),
        layouts: resolve(import.meta.dirname, 'portfolio-layouts.html'),
        amapHelp: resolve(import.meta.dirname, 'help/amap-key.html'),
        opencageHelp: resolve(import.meta.dirname, 'help/opencage-key.html'),
      },
    },
  },
});
