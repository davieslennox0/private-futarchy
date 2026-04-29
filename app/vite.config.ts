import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    // Required for @solana/web3.js and crypto in browser
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'process'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  define: {
    'process.env': {},
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

