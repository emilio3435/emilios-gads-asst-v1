import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy requests for /analyze, /get-help, and /api/* to the backend server
      '^/(analyze|get-help|api)': { // Added |api
        target: 'https://emilios-ads-asst-v1-backend.onrender.com', // Backend URL on Render
        changeOrigin: true, // Required for external domains
        secure: true, // Set to true for HTTPS
        ws: true, // Enable WebSocket proxying if needed later
        // No rewrite needed as the paths match
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
