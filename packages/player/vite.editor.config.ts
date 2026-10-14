import { defineConfig } from 'vite';

// The Studio's in-preview editor: dist/scene-editor.iife.js. It uses the player through
// window.UnysonPlusScene, so it bundles no animation engine of its own.
export default defineConfig({
  build: {
    target: 'es2019',
    lib: {
      entry: 'src/editor.ts',
      name: 'UnysonPlusSceneEditor',
      formats: ['iife'],
      fileName: () => 'scene-editor.iife.js',
    },
    minify: 'esbuild',
    sourcemap: false,
    emptyOutDir: false,
  },
});
