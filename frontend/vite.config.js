import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react({
    swcOptions: {
      jsc: {
        transform: {
          react: {
            development: true,
            throwIfNamespace: true,
          }
        }
      }
    }
  })],
  server: {
  },
  define: {
    LOCAL_BE_HOST: JSON.stringify('http://localhost:10101'),
    'process.env.NODE_ENV': '"development"'
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
  mode: 'development'
});