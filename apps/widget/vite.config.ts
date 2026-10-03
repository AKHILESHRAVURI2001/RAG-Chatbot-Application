import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    https: true,
    host: true,
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/widget.ts'),
      name: 'MiniChatbotWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    outDir: 'dist',
    minify: true,
  },
});
