import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The phone client bundles the shared game data (`../data`) and the protocol types
// (`../protocol/ts`) at build time. Nothing is fetched from a CDN at run time.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@protocol': here('../protocol/ts/messages.ts'),
      '@data': here('../data'),
      '@': here('./src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    fs: { allow: [here('..')] },
  },
  build: {
    target: 'es2019',
    cssTarget: 'chrome80',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
});
