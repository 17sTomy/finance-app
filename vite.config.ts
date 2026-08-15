import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/finance-app/' : '/',
  plugins: [react()],
  server: { port: 5173, host: '127.0.0.1', watch: { ignored: ['**/.brave-qa-desktop/**', '**/qa/**'] } },
  test: { environment: 'jsdom', globals: true },
});
