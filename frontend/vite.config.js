import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
  },
  define: {
    PROD_BE_HOST: JSON.stringify('http://'),
    TEST_BE_HOST: JSON.stringify('http://localhost:19999')
  },
});

