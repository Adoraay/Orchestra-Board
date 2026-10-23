import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content-Security-Policy de l'app : rien ne se charge hors de l'app (logos en data:, styles inline de React).
// Seulement au build : en dev, Vite injecte un script inline et un WebSocket pour le rechargement à chaud.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const csp = {
  name: 'orchestra-csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
};

// base './' pour que le build marche quand Electron charge dist/index.html en file://
export default defineConfig({
  plugins: [react(), csp],
  base: './',
  server: { port: 5173, strictPort: true },
});
