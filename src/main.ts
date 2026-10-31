import './styles.css';

import { WasmBackend } from './core/wasm-backend';
import * as platform from './platform';
import { mountViewer } from './viewer/viewer';

const root = document.getElementById('app');
if (!root) throw new Error('no #app');

const viewer = mountViewer({ root, backend: new WasmBackend() });

const smoke = await platform.smokePath();
if (smoke) {
  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason?.message ?? e.reason)));
  try {
    await platform.smokeReport(true, await viewer.smoke(smoke.path, smoke.save_to, smoke.password));
  } catch (e: any) {
    await platform.smokeReport(false, [String(e?.message ?? e), ...errors].join(' | '));
  }
} else {
  await platform.onOpenPaths((paths) => void viewer.openPaths(paths));
}
