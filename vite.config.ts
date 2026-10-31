import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

// The worker imports the core by URL, from the directory that
// `scripts/sync-odr.mjs` fills. The bundle needs the version for that URL.
const manifest = createRequire(import.meta.url).resolve('@opendocument/odr-core/package.json');
const { version: odrVersion } = JSON.parse(readFileSync(manifest, 'utf8'));

/*
  In dev, Vite answers a module import of a `public/` file with an error, and
  it adds `?import` to dynamic imports at runtime. This middleware serves
  `/odr/` before Vite sees the request, as the files are. A build has no such
  problem, because Tauri serves `dist/` as it is.
*/
function serveOdrRaw(): Plugin {
  const types: Record<string, string> = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.wasm': 'application/wasm',
  };
  return {
    name: 'odr-raw',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.startsWith('/odr/')) return next();
        const base = join(process.cwd(), 'public', 'odr');
        const file = join(process.cwd(), 'public', decodeURIComponent(url));
        if (!file.startsWith(base) || !existsSync(file)) return next();
        const ext = file.slice(file.lastIndexOf('.'));
        res.setHeader('Content-Type', types[ext] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  // Tauri expects a fixed port, and it shows the Rust errors itself.
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  plugins: [tailwindcss(), serveOdrRaw()],
  define: { __ODR_VERSION__: JSON.stringify(odrVersion) },
  worker: { format: 'es' },
  build: {
    // WebKitGTK on Linux is the oldest engine that we support.
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: { main: 'index.html', print: 'print.html' },
    },
  },
});
