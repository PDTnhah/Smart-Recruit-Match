import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const sharedDir = fileURLToPath(new URL('../../packages/shared', import.meta.url));
const srcDir = fileURLToPath(new URL('./src', import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // `@/…` is src (shadcn aliases, components.json); the regex never matches `@srm/…`.
      { find: /^@\//, replacement: `${srcDir}/` },
      // Consume @srm/shared from source so edits hot-reload without rebuilding the package.
      { find: /^@srm\/shared$/, replacement: `${sharedDir}/index.ts` },
      { find: /^@srm\/shared\/(schemas|states|contracts)$/, replacement: `${sharedDir}/$1/index.ts` },
    ],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
