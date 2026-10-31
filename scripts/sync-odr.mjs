/*
  Copies `@opendocument/odr-core` from node_modules into `public/odr/<version>/`.

  The worker imports the package by URL at runtime, and does not bundle it.
  The emscripten glue finds its `.wasm` sibling through `import.meta.url`. A
  copy keeps the three files side by side, but a bundler moves them apart.
  This is the same arrangement as the website.

  npm holds the version, so `public/odr/` is generated and gitignored.
  `vite.config.ts` reads the same manifest and defines the version into the
  bundle. `predev` and `prebuild` run this script.
*/
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'odr');

const manifestPath = require.resolve('@opendocument/odr-core/package.json');
const source = dirname(manifestPath);
const { version } = JSON.parse(await readFile(manifestPath, 'utf8'));

const files = ['index.js', 'odr-core.mjs', 'odr-core.wasm', 'index.d.ts'];

await rm(target, { recursive: true, force: true });
const versioned = join(target, version);
await mkdir(versioned, { recursive: true });
await Promise.all(files.map((f) => copyFile(join(source, f), join(versioned, f))));

console.log(`odr-core ${version} -> public/odr/${version}/`);
