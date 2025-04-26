import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
    outDir: 'dist',
  },
  publicDir: 'public',
  // Explicitly copy _redirects file to output directory
  // This additional configuration ensures Render gets the file
  server: {
    proxy: {
      // Special handling for history API - must come first for specificity
      '^/api/history': {
        target: 'https://emilios-ads-asst-v1-history-backend.onrender.com',
        changeOrigin: true,
        secure: true,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('PROXY ERROR (HISTORY):', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log(`PROXYING HISTORY REQUEST: ${req.method} ${req.url} -> ${options.target}${proxyReq.path}`);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log(`PROXY HISTORY RESPONSE: ${proxyRes.statusCode} ${req.url}`);
          });
        },
      },
      // General proxy for other API requests, analyze, and get-help
      '^/(analyze|get-help|api)': {
        target: 'https://emilios-ads-asst-v1-backend.onrender.com',
        changeOrigin: true,
        secure: true,
        ws: true,
        configure: (proxy, options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('PROXY ERROR:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log(`PROXYING REQUEST: ${req.method} ${req.url} -> ${options.target}${proxyReq.path}`);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log(`PROXY RESPONSE: ${proxyRes.statusCode} ${req.url}`);
          });
        },
      }
    }
  }
})
