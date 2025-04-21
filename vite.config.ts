import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy requests for /analyze and /get-help to the backend server
      '^/(analyze|get-help)': { // Match paths starting with /analyze OR /get-help
        target: 'http://localhost:5001', // Correct backend port
        changeOrigin: true, // Recommended for virtual hosted sites
        secure: false, // OK for localhost development
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
