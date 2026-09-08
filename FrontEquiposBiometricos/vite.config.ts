import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Escuchamos en "localhost". El caché HSTS del navegador es por hostname
    // exacto: `127.0.0.1` quedó "envenenado" (= solo HTTPS por 30 días) porque
    // en algún momento se levantó el compose de PRODUCCIÓN
    // (docker-compose.prod.yml, config.settings.prod) y su header
    // Strict-Transport-Security llegó al navegador vía este proxy. `localhost`
    // es una entrada HSTS distinta y arranca limpia.
    //   - Si `localhost` también acaba envenenado (otro proyecto local mandó
    //     HSTS ahí), usa un subdominio propio: host 'biometric.localhost'
    //     (Chrome/Edge/Firefox lo resuelven a loopback solos) y añádelo a
    //     DJANGO_ALLOWED_HOSTS.
    //   - Para limpiar una entrada: edge://net-internals/#hsts → "Delete
    //     domain security policies" → escribe el hostname → Delete.
    //   - El compose de prod ya no reincide: prod.py respeta
    //     DJANGO_SECURE_SSL_REDIRECT / DJANGO_SECURE_HSTS_SECONDS.
    host: 'localhost',
    // Abre el navegador directo en http://localhost:5173 al arrancar.
    open: true,
    // Si el 5173 está ocupado, fallar en vez de saltar a otro puerto en
    // silencio (evita confusión con proxies/HMR apuntando al puerto viejo).
    strictPort: true,
    // Proxy hacia Django: así el navegador solo habla con localhost:5173
    // (un único origen) y nunca hace un request cross-origin real hacia
    // :8000. Esto es necesario porque el backend entrega el access/refresh
    // token como cookies httpOnly — con dos puertos distintos, algunos
    // navegadores (Edge con "Tracking Prevention", por ejemplo) bloquean
    // esas cookies aunque técnicamente sean "same-site". Reproduce en dev
    // el mismo esquema que ya usa producción (nginx sirviendo /api/ bajo el
    // mismo origen que el frontend — ver FrontEquiposBiometricos/.env.production).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        // OJO: NO poner changeOrigin: true. Eso reescribe el header Host de
        // la request proxied a "127.0.0.1:8000", pero el navegador sigue
        // mandando Origin: "http://localhost:5173" — Django compara ambos
        // en el chequeo de CSRF (ver django/middleware/csrf.py) y con
        // changeOrigin activo nunca coinciden, así que cualquier POST/PUT/
        // PATCH/DELETE autenticado por cookie (refresh, logout, crear
        // equipo, etc.) devuelve 403 "CSRF Failed: Origin checking failed".
        // Sin changeOrigin, Host llega igual a Origin y además
        // DJANGO_ALLOWED_HOSTS ya incluye "localhost" sin importar el puerto.
      },
      // Archivos subidos (QR de equipos, PDFs de hojas de vida, evidencias…).
      // Django los sirve en DEBUG vía `static(MEDIA_URL, …)`. El serializer
      // devuelve URLs absolutas construidas con el Host de la request, que
      // detrás de este proxy es localhost:5173 — sin esta entrada las <img>
      // de `qr_code_url` dan 404. En prod nginx enruta /media/ igual que /api/.
      '/media': {
        target: 'http://127.0.0.1:8000',
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
    },
  },
  // Declaramos explícitamente las dependencias a pre-bundlear para que el
  // dep-scan de Rolldown no tenga que crawlear todo el grafo de imports en
  // el primer arranque. Esto evita el aviso "Your build spent significant
  // time in plugin externalize-deps" y los errores
  // "The server is being restarted or closed. Request is outdated" que
  // aparecen cuando el scan se interrumpe.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      'axios',
      'clsx',
      'lucide-react',
      'recharts',
    ],
  },
})
