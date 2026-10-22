import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error plain ES module without type declarations
import { battleApi } from './server/api.mjs';

export default defineConfig({
  plugins: [react(), battleApi()],
  server: { port: 5173 },
});
