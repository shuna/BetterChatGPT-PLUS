import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  worker: {
    format: 'es',
    plugins: [wasm()],
  },
  resolve: {
    alias: {
      '@icon/': new URL('./src/assets/icons/', import.meta.url).pathname,
      '@type/': new URL('./src/types/', import.meta.url).pathname,
      '@store/': new URL('./src/store/', import.meta.url).pathname,
      '@hooks/': new URL('./src/hooks/', import.meta.url).pathname,
      '@constants/': new URL('./src/constants/', import.meta.url).pathname,
      '@api/': new URL('./src/api/', import.meta.url).pathname,
      '@components/': new URL('./src/components/', import.meta.url).pathname,
      '@utils/': new URL('./src/utils/', import.meta.url).pathname,
      '@src/': new URL('./src/', import.meta.url).pathname,
    },
  },
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }

          if (id.includes('node_modules/i18next/') || id.includes('node_modules/react-i18next/')) {
            return 'vendor-i18n';
          }

          if (
            id.includes('node_modules/react-markdown/') ||
            id.includes('node_modules/remark-gfm/') ||
            id.includes('node_modules/remark-math/')
          ) {
            return 'vendor-markdown';
          }

          if (
            id.includes('node_modules/rehype-katex/') ||
            id.includes('node_modules/katex/')
          ) {
            return 'vendor-katex';
          }

          if (
            id.includes('node_modules/rehype-highlight/') ||
            id.includes('node_modules/highlight.js/')
          ) {
            return 'vendor-highlight';
          }

          if (
            id.includes('node_modules/@dqbd/tiktoken/') ||
            id.includes('cl100k_base.json')
          ) {
            return 'vendor-tiktoken';
          }

          return undefined;
        },
      },
    },
  },
});
