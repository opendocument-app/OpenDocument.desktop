/*
  Runs the built app in its smoke mode on every file in `test/documents/`.
  The app opens the file, waits for the rendered page, saves a copy where the
  window would offer a save, reports one line, and exits.

    node test/smoke.mjs <path to the app binary>

  A file named `*-<password>.<ext>` is opened with that password.
*/
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const binary = resolve(process.argv[2] ?? '');
const documents = resolve(import.meta.dirname, 'documents');
const out = mkdtempSync(join(tmpdir(), 'odr-smoke-'));
const TIMEOUT_MS = 90_000;

function run(file) {
  const password = file.match(/-([^-.]+)\.[^.]+$/)?.[1];
  const env = {
    ...process.env,
    ODR_DESKTOP_SMOKE: join(documents, file),
    ODR_DESKTOP_SMOKE_SAVE: join(out, file),
  };
  if (password) env.ODR_DESKTOP_SMOKE_PASSWORD = password;
  return new Promise((done) => {
    const child = spawn(binary, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on('exit', (code) => {
      clearTimeout(timer);
      const line = output.split('\n').find((l) => l.startsWith('smoke: ')) ?? `no report (exit ${code})`;
      done({ ok: code === 0 && line.startsWith('smoke: ok'), line, output });
    });
  });
}

let failed = 0;
for (const file of readdirSync(documents).sort()) {
  const { ok, line, output } = await run(file);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: ${line}`);
  if (!ok) {
    failed++;
    console.log(output.trim().split('\n').slice(-20).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
