import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
  },
  define: {
    LOCAL_BE_HOST: JSON.stringify('http://localhost:10101')
  },
  base: './', // Ensure assets are loaded relative to the index.html location
});