/*
  Everything that the viewer needs from the operating system, over Tauri.
  The viewer does not import Tauri itself.
*/
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';

export async function readFile(path: string): Promise<Uint8Array> {
  const buffer = await invoke<ArrayBuffer>('read_file', { path });
  return new Uint8Array(buffer);
}

export async function writeFile(path: string, bytes: Uint8Array): Promise<void> {
  // A raw body, so the bytes do not go through JSON. The path goes in a
  // header, which takes only ASCII.
  await invoke('write_file', bytes, { headers: { 'x-path': encodeURIComponent(path) } });
}

export function baseName(path: string) {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1) || path;
}

export function dirName(path: string) {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut > 0 ? path.slice(0, cut) : '';
}

export async function pickFile(extensions: string[]): Promise<string | null> {
  const picked = await openDialog({
    multiple: false,
    directory: false,
    filters: [
      { name: 'Documents', extensions },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  return typeof picked === 'string' ? picked : null;
}

/** A path to save to. The extension stays the one of the format. */
export async function pickSaveTarget(suggested: string, extension: string): Promise<string | null> {
  const picked = await saveDialog({
    defaultPath: suggested,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  });
  if (!picked) return null;
  return /\.[^./\\]+$/.test(baseName(picked)) ? picked : `${picked}.${extension}`;
}

export function confirmDiscard(name: string): Promise<boolean> {
  return ask(`${name} has changes that are not saved. If you continue, the changes are lost.`, {
    title: 'Unsaved changes',
    kind: 'warning',
    okLabel: 'Discard changes',
    cancelLabel: 'Cancel',
  });
}

export function setTitle(title: string) {
  return getCurrentWindow().setTitle(title);
}

/** Asks before the window closes. The handler returns false to keep it open. */
export function onCloseRequested(allow: () => Promise<boolean>) {
  return getCurrentWindow().onCloseRequested(async (event) => {
    if (!(await allow())) event.preventDefault();
  });
}

export function closeWindow() {
  return getCurrentWindow().close();
}

/** The files that the operating system gave this window, now and later. */
export async function onOpenPaths(handler: (paths: string[]) => void) {
  await listen<string[]>('open-paths', (event) => handler(event.payload));
  const launch = await invoke<string[]>('take_launch');
  if (launch.length) handler(launch);
}

export function openWindows(paths: string[]) {
  return invoke('open_window', { paths });
}

export function onMenu(handler: (id: string) => void) {
  return listen<string>('menu', (event) => handler(event.payload));
}

export function setMenuCheck(id: string, checked: boolean) {
  return invoke('set_menu_check', { id, checked });
}

/** Files that are dragged over the window, by path. */
export function onDragDrop(handlers: {
  enter: () => void;
  leave: () => void;
  drop: (paths: string[]) => void;
}) {
  return getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload;
    if (p.type === 'enter') handlers.enter();
    else if (p.type === 'leave') handlers.leave();
    else if (p.type === 'drop') {
      handlers.leave();
      if (p.paths.length) handlers.drop(p.paths);
    }
  });
}

export function startPrint(title: string, html: string) {
  return invoke('start_print', { title, html });
}

const LINK_SCHEMES = /^(https?|mailto):/i;

/** Opens a link of a document in the browser of the system. */
export function openLink(href: string) {
  if (LINK_SCHEMES.test(href)) void openUrl(href);
}

export function smokePath() {
  return invoke<{ path: string; save_to: string | null; password: string | null } | null>('smoke_path');
}

export function smokeReport(ok: boolean, detail: string) {
  return invoke('smoke_report', { ok, detail });
}

export interface Recent {
  path: string;
  name: string;
  openedAt: number;
}

const RECENTS_KEY = 'recents';
const RECENTS_MAX = 20;

export function recents(): Recent[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((r) => typeof r?.path === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberRecent(path: string) {
  const list = recents().filter((r) => r.path !== path);
  list.unshift({ path, name: baseName(path), openedAt: Date.now() });
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, RECENTS_MAX)));
}

export function forgetRecent(path: string) {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents().filter((r) => r.path !== path)));
}

export function clearRecents() {
  localStorage.removeItem(RECENTS_KEY);
}

export function setting(key: string, fallback: boolean): boolean {
  const value = localStorage.getItem(`setting.${key}`);
  return value === null ? fallback : value === 'true';
}

export function setSetting(key: string, value: boolean) {
  localStorage.setItem(`setting.${key}`, String(value));
}
