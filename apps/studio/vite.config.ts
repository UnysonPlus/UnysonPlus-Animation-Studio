import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const studio = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const player = JSON.parse(readFileSync(new URL('../../packages/player/package.json', import.meta.url), 'utf8'));

// Served from the root of its own subdomain, so the base path is "/".
export default defineConfig({
  base: '/',
  plugins: [react()],
  define: {
    __STUDIO_VERSION__: JSON.stringify(studio.version),
    __PLAYER_VERSION__: JSON.stringify(player.version),
  },
  build: { target: 'es2020', sourcemap: false },
});
