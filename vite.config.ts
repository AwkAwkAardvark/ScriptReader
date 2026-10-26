import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'pages-deployment-files',
    apply: 'build',
    writeBundle(options) {
      const output = options.dir ?? 'dist';
      for (const file of ['_headers', '_redirects']) copyFileSync(resolve('deployment', file), resolve(output, file));
    },
  }],
  build: { sourcemap: false },
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
