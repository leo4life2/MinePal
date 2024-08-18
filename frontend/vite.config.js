import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { version } from './package.json';

export default defineConfig({
  plugins: [react()],
  server: {
  },
  define: {
    LOCAL_BE_HOST: JSON.stringify('http://localhost:10101'),
    'process.env.PACKAGE_VERSION': JSON.stringify(version),
  },
  base: './', // Ensure assets are loaded relative to the index.html location
});