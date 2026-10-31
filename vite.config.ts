import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The worker imports the core by URL, from the directory that
// `scripts/sync-odr.mjs` fills. The bundle needs the version for that URL.
const manifest = createRequire(import.meta.url).resolve('@opendocument/odr-core/package.json');
const { version: odrVersion } = JSON.parse(readFileSync(manifest, 'utf8'));

export default defineConfig({
  // Tauri expects a fixed port, and it shows the Rust errors itself.
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  plugins: [tailwindcss()],
  define: { __ODR_VERSION__: JSON.stringify(odrVersion) },
  worker: { format: 'es' },
  build: {
    // WebKitGTK on Linux is the oldest engine that we support.
    target: 'es2022',
    sourcemap: true,
  },
});
