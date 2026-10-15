import { defineConfig } from 'vite';

// The 3D runtime: dist/scene-3d.iife.js (three.js and the 3D text font). The player loads it from next
// to its own script only when a scene has a 3D layer, so scenes without 3D never download it.
export default defineConfig({
  build: {
    target: 'es2019',
    lib: {
      entry: 'src/three/entry.ts',
      name: 'UnysonPlusScene3DBundle',
      formats: ['iife'],
      fileName: () => 'scene-3d.iife.js',
    },
    minify: 'esbuild',
    sourcemap: false,
    emptyOutDir: false,
  },
});
