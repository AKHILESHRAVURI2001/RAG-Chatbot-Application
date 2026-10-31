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
        target: 'http://localhost:4000',
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
  experimental: {
    // Vite's default behavior for emitted assets (including Worker chunks) in this lib+iife build
    // hard-codes a root-absolute URL (e.g. "/assets/foo.js"), which only works if dist/ is hosted
    // at a domain's root — confirmed broken for any subpath deployment. Override it to compute the
    // URL relative to wherever widget.js's own <script> tag was actually loaded from instead, the
    // same fix already used for public/ assets (see getStaticAssetUrl in src/shared/assetUrl.ts).
    renderBuiltUrl(filename) {
      return {
        runtime: `((typeof document!=="undefined"&&document.currentScript&&document.currentScript.getAttribute("src"))?new URL(${JSON.stringify(filename)},document.currentScript.getAttribute("src")).href:${JSON.stringify(filename)})`,
      };
    },
  },
});
