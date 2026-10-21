import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// `npm run dev` serves the React app with hot reload and forwards /api to the
// Python backend, so the browser sees one origin and the session cookie just works.
// Start the backend first (scripts\dev-python.cmd, port 8000). API_TARGET points the
// proxy elsewhere.
const apiTarget = process.env.API_TARGET || 'http://127.0.0.1:8000';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 5173,
      proxy: {'/api': {target: apiTarget, changeOrigin: true}},
      // Only the frontend's own sources trigger reloads. Watching dist/ also crashed
      // the dev server on Windows (EBUSY) whenever `npm run build` replaced files there.
      watch: {
        ignored: ['**/dist/**', '**/backend/**', '**/private/**', '**/*.md', '**/capability-hub.db*'],
      },
    },
  };
});
