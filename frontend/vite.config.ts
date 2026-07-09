import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Proxy /api → backend Express local (porta 3000): em desenvolvimento o
 * frontend chama caminhos relativos (/api/...) e o Vite repassa, evitando
 * CORS e mantendo as URLs idênticas às de produção (quando o Nginx fará o
 * mesmo papel — ver CLAUDE.md Seção 8, deploy PLANEJADO).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
