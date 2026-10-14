import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// One self-contained script (GSAP included) that exported pages load: dist/scene-player.iife.js.
export default defineConfig({
  define: { __PLAYER_VERSION__: JSON.stringify(version) },
  build: {
    target: 'es2019',
    lib: {
      entry: 'src/iife.ts',
      name: 'UnysonPlusSceneBundle',
      formats: ['iife'],
      fileName: () => 'scene-player.iife.js',
    },
    minify: 'esbuild',
    sourcemap: false,
    emptyOutDir: true,
  },
});
