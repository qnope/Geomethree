import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLEFILE : un seul HTML pour l'Artifact, Three.js chargé depuis le CDN (non inliné).
const single = !!process.env.SINGLEFILE;

export default defineConfig({
  base: './',
  plugins: single ? [viteSingleFile()] : [],
  build: {
    target: 'es2020',
    rollupOptions: single
      ? { external: ['three'], output: { paths: { three: 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js' } } }
      : {},
  },
  test: { environment: 'node' },
});
