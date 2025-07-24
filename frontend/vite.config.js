import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [
    svgr(),
    react({
      swcOptions: {
        jsc: {
          transform: {
            react: {
              development: true,
              throwIfNamespace: true,
            },
          },
        },
      },
    })
  ],
  server: {
  },
  base: './', // Ensure assets are loaded relative to the index.html location
  build: {
    minify: false,
    terserOptions: {
      compress: false,
      mangle: false,
    },
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    sourcemap: true,
    target: 'esnext',
  },
  esbuild: {
    keepNames: true,
  },
  // mode: 'development'
});
