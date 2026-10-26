import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  server: {
    proxy: { "/api": "http://127.0.0.1:8788" },
    fs: {
      deny: ['**/data/**', '**/.agent-local/**', '**/AGENTS.md', '**/.git/**', '**/.env*', '**/*.{csv,tsv,xlsx,xls}'],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
