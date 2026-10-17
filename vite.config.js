import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' pour que le build marche quand Electron charge dist/index.html en file://
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, strictPort: true },
});
