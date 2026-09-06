import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Proxy /api to a separate API process, opt-in via API_TARGET.
//
// Only needed when Vite runs standalone against the Python backend, which cannot
// host Vite the way server.ts does. The frontend calls the API with relative
// paths, so without this those requests hit the Vite port and 404.
//
// Deliberately opt-in rather than always-on: server.ts mounts vite.middlewares
// after its own /api routes, so an unconditional proxy would still capture any
// /api path Express does NOT define (e.g. /api/health) and forward it off-box,
// instead of falling through to the SPA handler. Gating on API_TARGET keeps the
// Node path byte-for-byte unchanged.
//
//   PowerShell : $env:API_TARGET="http://127.0.0.1:8000"; npx vite
//   bash       : API_TARGET=http://127.0.0.1:8000 npx vite
const apiTarget = process.env.API_TARGET;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},

      // Present only when API_TARGET is set - see the note above.
      ...(apiTarget
        ? {proxy: {'/api': {target: apiTarget, changeOrigin: true}}}
        : {}),
    },
  };
});
