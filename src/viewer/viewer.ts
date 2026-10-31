/*
  The viewer of one window, ported from the website (`src/scripts/viewer.ts`).

  The document lives in an iframe that runs the scripts of the renderer and
  `frame-bridge.js`, and nothing else of ours. The frame is sandboxed without
  `allow-same-origin`, so this side never touches its DOM: every command goes
  over `postMessage`, and every answer comes back the same way. The engine
  holds the open document. An edit goes into it, and a save comes out of it.

  The differences from the website:
  - The engine is a `Backend`, and every call to it is async.
  - A save writes the file on disk. "Save As" picks a new path.
  - A spreadsheet shows one tab for each sheet, as on Android.
  - The landing panel lists the recent documents.
  - A document that the system opens while this window holds one goes to a new
    window.
*/
import type { Backend, OpenDocument, OpenOptions, View } from '../core/backend';
import * as platform from '../platform';
import bridgeSource from './frame-bridge.js?raw';
import { recentItem, tabButton, windowMarkup } from './markup';

/*
  The most cells that one sheet writes. The markup of a sheet goes into
  `srcdoc` as one string, so a big sheet costs memory and time before
  anything paints. A styled cell is about 226 bytes, so this is about 45 MB.
  Android caps at 100,000 rows and 500 columns, and that cap applies too.
*/
const SHEET_CELL_BUDGET = 200_000;
const SHEET_LIMIT = { rows: 100_000, columns: 500 };

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.25;

const DROP_ACTIVE = ['border-primary', 'bg-primary-container/30'];

const IDLE_TITLE = 'Open a document';
const IDLE_HINT = 'Or drop it on this window. ODT, ODS, ODP, DOCX, XLSX, PPTX, PDF and more.';

const APP_NAME = 'OpenDocument Reader';

/* A "path" that asks a new window for an empty document of a type, such as
   `odr-new:ods`. No file path starts with it. */
const NEW_PREFIX = 'odr-new:';

/* The width of a line that the Draw tool makes. */
const INK_WIDTH = 2;

/*
  What the window says when the page refuses an edit. The page reports a
  reason and an English message for a console. The host chooses the words.
*/
const REFUSALS: Record<string, string> = {
  newLine: 'A line break inside a paragraph is more than an edit can hand back.',
  formula: 'That cell holds a formula that is shared with other cells, so it stays as it is.',
  formulaInput: 'This page cannot take a formula; a number or some text it can.',
  formulaInvalid: 'That formula does not parse, so the cell keeps what it had.',
  array:
    'That cell is part of an array formula, so it stays as it is, and rows and columns cannot be added or removed through it.',
  rich: 'That cell holds more than plain text, so it stays as it is.',
  shapes: 'That cell holds a drawing, so it stays as it is.',
  readOnly: 'This document cannot be edited.',
  unsupportedEdit: 'That kind of edit is not supported here.',
  range: 'An edit cannot reach over a picture or a table.',
  unnameableEdit: 'That edit landed where the engine cannot name it, so it was not taken.',
  outOfScope: 'That edit reaches past what this page offers.',
  sheetCut: 'That part of the sheet is past what the app shows, so it cannot be edited here.',
};

/* `#rrggbb` to the 0..1 rgb triple that the annotator takes. */
function rgbOf(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/*
  The function that `hostMessageHandler` names. The `host-bridge.js` of the
  renderer calls it with every `odr.on*` callback of the page as one JSON
  string, and it posts that string to this page unchanged.
*/
const HOST_HANDLER = 'odrHost.post';
const HOST_SCRIPT =
  "<script>window.odrHost={post:function(m){parent.postMessage({odrViewer:true,type:'page',message:m},'*')}};</script>";

/* The host function goes first in the head, and the bridge goes after the
   scripts of the renderer, at the end of the body. */
function withBridge(html: string) {
  const head = html.indexOf('<head>');
  const at = head < 0 ? 0 : head + '<head>'.length;
  html = html.slice(0, at) + HOST_SCRIPT + html.slice(at);
  const script = `<script>${bridgeSource}</script>`;
  const end = html.lastIndexOf('</body>');
  return end < 0 ? html + script : html.slice(0, end) + script + html.slice(end);
}

/* The print window shows the markup as a top-level page. It needs no script:
   the print render lays out everything, and the scripts are the editor. */
function withoutScripts(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const s of doc.querySelectorAll('script')) s.remove();
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}

/* A file to open: the bytes and the path they came from. A blank document
   has no bytes, and a document that was never saved has no path. */
interface Source {
  bytes: Uint8Array | null;
  name: string;
  path: string | null;
}

export interface ViewerOptions {
  root: HTMLElement;
  backend: Backend;
}

export function mountViewer({ root, backend }: ViewerOptions) {
  root.innerHTML = windowMarkup();

  const find = <T extends HTMLElement>(name: string) => {
    const el = root.querySelector<T>(`[data-viewer-${name}]`);
    if (!el) throw new Error(`viewer: no [data-viewer-${name}]`);
    return el;
  };
  const all = <T extends HTMLElement>(name: string) => [...root.querySelectorAll<T>(`[data-viewer-${name}]`)];

  const panel = find('panel');
  const zone = find('zone');
  const spinner = find('spinner');
  const idleIcon = find('idle-icon');
  const status = find('status');
  const hint = find('hint');
  const actions = find('actions');
  const passwordForm = find<HTMLFormElement>('password');
  const passwordInput = find<HTMLInputElement>('password-input');
  const passwordCancelBtn = find<HTMLButtonElement>('password-cancel');
  const uploadIcon = find('icon-upload');
  const lockIcon = find('icon-lock');
  const pickBtn = find<HTMLButtonElement>('pick');
  const blankBtns = all<HTMLButtonElement>('blank');
  const recentsBox = find('recents');
  const recentsList = find('recents-list');
  const recentsClearBtn = find<HTMLButtonElement>('recents-clear');
  const result = find('result');
  const frameHost = find('frame-host');
  const tabsBar = find('tabs');
  const filename = find('filename');
  const resetBtn = find<HTMLButtonElement>('reset');
  const zoomBar = find('zoom');
  const zoomOutBtn = find<HTMLButtonElement>('zoom-out');
  const zoomInBtn = find<HTMLButtonElement>('zoom-in');
  const zoomLabel = find<HTMLButtonElement>('zoom-level');
  const cutNote = find('cut');
  const staleNote = find('stale');
  const alertNote = find('alert');
  const penBtn = find<HTMLButtonElement>('pen');
  const penEdit = find('pen-edit');
  const penMark = find('pen-mark');
  const saveBtn = find<HTMLButtonElement>('save');
  const printBtn = find<HTMLButtonElement>('print');
  const tools = find('tools');
  const toolsHint = find('tools-hint');
  const formatGroup = find('format');
  const styleBtns = all<HTMLButtonElement>('style');
  const highlightBtn = find<HTMLButtonElement>('highlight');
  const colorInput = find<HTMLInputElement>('color');
  const colorBar = find('color-bar');
  const highlightColorInput = find<HTMLInputElement>('highlight-color');
  const highlightBar = find('highlight-bar');
  const highlightPick = find('highlight-pick');
  const fillBtn = find<HTMLButtonElement>('fill');
  const fillPick = find('fill-pick');
  const fillColorInput = find<HTMLInputElement>('fill-color');
  const fillBar = find('fill-bar');
  const alignBtns = all<HTMLButtonElement>('align');
  const structureGroup = find('structure');
  const structureBtns = all<HTMLButtonElement>('structure-call');
  const sizeSelect = find<HTMLSelectElement>('size');
  const markGroup = find('mark');
  const toolBtns = all<HTMLButtonElement>('tool');
  const toolColors = all<HTMLInputElement>('tool-color');
  const toolBars = all('tool-bar');
  const undoBtn = find<HTMLButtonElement>('undo');
  const redoBtn = find<HTMLButtonElement>('redo');
  const findOpenBtn = find<HTMLButtonElement>('find-open');
  const findStrip = find('find');
  const findText = find<HTMLInputElement>('find-text');
  const findCount = find('find-count');
  const findPreviousBtn = find<HTMLButtonElement>('find-previous');
  const findNextBtn = find<HTMLButtonElement>('find-next');
  const findCloseBtn = find<HTMLButtonElement>('find-close');
  const openOnly = all('open');

  let currentFrame: HTMLIFrameElement | null = null;
  let currentDoc: OpenDocument | null = null;
  /** The source of the open document. A save replaces the bytes and the path. */
  let source: Source | null = null;
  /** True from the start of an open until a document shows or the panel is back. */
  let busy = false;

  /** The views that the window shows, and the one on screen. */
  let views: View[] = [];
  let viewIndex = 0;

  let canEdit = false;
  let canFormat = false;
  let canMark = false;
  let plainText = false;
  let sheet = false;
  let editOnReady = false;
  let modeOn = false;
  let armedTool: string | null = null;
  /** What the log of the page holds, as the page reports it. */
  let editDirty = false;
  /** Edits that went into the engine but not into the file: from a sheet that
      the tabs left, or before a print. */
  let appliedUnsaved = false;
  let canUndo = false;
  let canRedo = false;
  let marks = 0;
  let savedMarks = 0;
  let currentZoom = 1;
  let canFind = false;

  let passwordAnswer: ((password: string | null) => void) | null = null;
  let encrypted = false;
  let savePassword: string | null = null;

  const asks = new Map<number, (payload: string | null) => void>();
  let nextAsk = 1;

  const dirty = () => editDirty || appliedUnsaved || marks !== savedMarks;
  const hasDocument = () => currentDoc !== null || busy;

  function send(message: Record<string, unknown>) {
    currentFrame?.contentWindow?.postMessage({ ...message, odrViewer: true }, '*');
  }

  /* A question with an answer: the frame replies with the same id. */
  function ask(type: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const id = nextAsk++;
      const timer = window.setTimeout(() => {
        asks.delete(id);
        reject(new Error('The document did not answer.'));
      }, 5000);
      asks.set(id, (payload) => {
        window.clearTimeout(timer);
        resolve(payload);
      });
      send({ type, id });
    });
  }

  function paintTitle() {
    if (!source || !currentDoc) {
      void platform.setTitle(APP_NAME);
      return;
    }
    void platform.setTitle(dirty() ? `${source.name} — Edited` : source.name);
  }

  function showResult(on: boolean) {
    panel.hidden = on;
    result.hidden = !on;
    for (const el of openOnly) el.hidden = !on;
    if (!on) paintRecents();
  }

  /** What the panel said, in order. The smoke mode reports it on a failure. */
  const trail: string[] = [];

  function setBusy(message: string) {
    trail.push(message);
    passwordForm.hidden = true;
    spinner.hidden = false;
    idleIcon.hidden = true;
    actions.hidden = true;
    hint.hidden = true;
    status.textContent = message;
    status.classList.remove('text-red-600', 'dark:text-red-400');
  }

  function setIdle(message: string, detail: string, isError = false) {
    trail.push(`${message} (${detail})`);
    passwordForm.hidden = true;
    uploadIcon.hidden = false;
    lockIcon.hidden = true;
    spinner.hidden = true;
    idleIcon.hidden = !isError;
    actions.hidden = false;
    hint.hidden = false;
    status.textContent = message;
    hint.textContent = detail;
    status.classList.toggle('text-red-600', isError);
    status.classList.toggle('dark:text-red-400', isError);
    paintRecents();
  }

  function paintRecents() {
    const list = platform.recents();
    recentsBox.hidden = list.length === 0;
    recentsList.replaceChildren();
    for (const r of list) {
      const holder = document.createElement('template');
      holder.innerHTML = recentItem().trim();
      const item = holder.content.firstElementChild as HTMLElement;
      item.querySelector('[data-viewer-recent-name]')!.textContent = r.name;
      item.querySelector('[data-viewer-recent-path]')!.textContent = platform.dirName(r.path);
      item.title = r.path;
      item.querySelector('[data-viewer-recent-open]')!.addEventListener('click', () => void openPath(r.path));
      item.querySelector('[data-viewer-recent-forget]')!.addEventListener('click', () => {
        platform.forgetRecent(r.path);
        paintRecents();
      });
      recentsList.append(item);
    }
  }

  /* Lets the busy message paint before the engine starts a long call. */
  const nextFrame = () =>
    new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      requestAnimationFrame(() => requestAnimationFrame(finish));
      setTimeout(finish, 50);
    });

  function askPassword(name: string, wrong: boolean): Promise<string | null> {
    spinner.hidden = true;
    idleIcon.hidden = false;
    actions.hidden = true;
    hint.hidden = false;
    status.textContent = wrong ? 'That password is not correct' : `${name} is password-protected`;
    hint.textContent = wrong
      ? `Type the password of ${name} again.`
      : 'Type its password. The document is decrypted on this computer.';
    status.classList.toggle('text-red-600', wrong);
    status.classList.toggle('dark:text-red-400', wrong);
    uploadIcon.hidden = true;
    lockIcon.hidden = false;
    passwordForm.hidden = false;
    passwordInput.value = '';
    passwordInput.focus();
    return new Promise((resolve) => {
      passwordAnswer = resolve;
    });
  }

  function friendlyError(e: any, name: string): [string, string] {
    switch (e?.name) {
      case 'UnsupportedFileType':
      case 'UnknownFileType':
        return [`${name} is not a format we can open`, 'Try an ODT, DOCX, XLSX, PPTX or PDF file.'];
      case 'FileEncrypted':
        return [`${name} is password-protected`, 'Open it again, and type its password.'];
      case 'FileNotFound':
      case 'NoDocumentFile':
        return [`${name} could not be read`, 'The file looks empty or truncated.'];
      default:
        return [`${name} could not be opened`, e?.message ? String(e.message) : 'Unknown error.'];
    }
  }

  function showCut(cut: View['sheetCut']) {
    if (!cut) {
      cutNote.hidden = true;
      return;
    }
    const n = (value: number) => value.toLocaleString();
    const parts: string[] = [];
    if (cut.renderedRows < cut.contentRows) parts.push(`the first ${n(cut.renderedRows)} of ${n(cut.contentRows)} rows`);
    if (cut.renderedColumns < cut.contentColumns)
      parts.push(`the first ${n(cut.renderedColumns)} of ${n(cut.contentColumns)} columns`);
    if (!parts.length) {
      cutNote.hidden = true;
      return;
    }
    cutNote.textContent = `This sheet is too large to show completely. The app shows ${parts.join(' and ')}. The rest stays in the file.`;
    cutNote.hidden = false;
  }

  const ALERT_TONES = {
    error: ['bg-red-50', 'text-red-700', 'dark:bg-red-950/40', 'dark:text-red-300'],
    warn: ['bg-amber-50', 'text-amber-800', 'dark:bg-amber-950/40', 'dark:text-amber-200'],
  };
  let alertTimer: number | undefined;
  function showAlert(message: string | null, tone: keyof typeof ALERT_TONES = 'error') {
    window.clearTimeout(alertTimer);
    alertNote.textContent = message ?? '';
    alertNote.hidden = !message;
    for (const t of Object.values(ALERT_TONES)) alertNote.classList.remove(...t);
    if (message) alertNote.classList.add(...ALERT_TONES[tone]);
    if (message && tone === 'warn') alertTimer = window.setTimeout(() => showAlert(null), 6000);
  }

  let staleCount = 0;
  function showStale(count: number) {
    staleCount = count;
    if (!count) {
      staleNote.hidden = true;
      return;
    }
    staleNote.textContent = `${count} formula ${count === 1 ? 'cell shows a result' : 'cells show results'} that the app could not compute after your edit. A save computes ${count === 1 ? 'it' : 'them'} again.`;
    staleNote.hidden = false;
  }

  function showUncomputed(recalc: any) {
    const count = (recalc?.unevaluated?.length ?? 0) + (recalc?.circular?.length ?? 0);
    if (!count) return;
    staleNote.textContent = `${count} formula ${count === 1 ? 'cell' : 'cells'} could not be computed here. A spreadsheet app computes ${count === 1 ? 'it' : 'them'} when it opens the saved file.`;
    staleNote.hidden = false;
  }

  function paintChrome() {
    const changeable = canEdit || canMark;
    penBtn.hidden = !changeable;
    saveBtn.hidden = !changeable;
    findOpenBtn.hidden = !canFind;
    penEdit.hidden = canMark;
    penMark.hidden = !canMark;
    const penLabel = canMark
      ? modeOn
        ? 'Put the marker down'
        : 'Mark up this PDF'
      : modeOn
        ? 'Stop editing'
        : 'Edit this document';
    penBtn.title = penLabel;
    penBtn.setAttribute('aria-label', penLabel);
    penBtn.setAttribute('aria-pressed', String(modeOn));
    penBtn.classList.toggle('bg-primary', modeOn);
    penBtn.classList.toggle('text-on-primary', modeOn);
    penBtn.classList.toggle('border-transparent', modeOn);
    penBtn.classList.toggle('border-outline', !modeOn);
    penBtn.classList.toggle('hover:bg-surface', !modeOn);

    // A document that was never saved has no file yet, so its first save is a
    // "Save As". That works also without changes.
    saveBtn.disabled = !(dirty() || (source !== null && source.path === null));

    tools.hidden = !modeOn;
    formatGroup.hidden = !canFormat;
    highlightBtn.hidden = sheet;
    highlightPick.hidden = sheet;
    fillBtn.hidden = !sheet;
    fillPick.hidden = !sheet;
    for (const b of alignBtns) b.hidden = sheet && b.dataset.viewerAlign === 'justify';
    structureGroup.hidden = !(canEdit && sheet);
    markGroup.hidden = !canMark;
    undoBtn.disabled = canMark ? marks === 0 : !canUndo;
    redoBtn.hidden = canMark;
    redoBtn.disabled = !canRedo;
    for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.viewerTool === armedTool));
    toolsHint.textContent = canMark
      ? 'Select text, then a tool, to mark it once. A pressed tool marks every selection; Draw draws on the page.'
      : sheet
        ? canFormat
          ? 'Type a value or a formula such as =SUM(B2:B4) into a cell. Drag over cells, or click a header, to format them or to add and remove rows and columns.'
          : 'Type into a cell; Enter keeps the value, Escape drops it. Click a header to add and remove rows and columns. A csv has no styles.'
        : canFormat
          ? 'Type into the document. Select some text for the buttons, or use the keyboard shortcuts for bold, italic and underline.'
          : 'Type into the file. It is plain text, so it saves as UTF-8 with no styles.';
    paintTitle();
  }

  function paintSelection(style: Record<string, unknown>) {
    for (const b of styleBtns) b.setAttribute('aria-pressed', String(style[b.dataset.viewerStyle ?? ''] === true));
    highlightBtn.setAttribute('aria-pressed', String(typeof style.highlight === 'string'));
    if (typeof style.color === 'string' && /^#[0-9a-f]{6}$/i.test(style.color)) colorInput.value = style.color;
    if (typeof style.highlight === 'string' && /^#[0-9a-f]{6}$/i.test(style.highlight))
      highlightColorInput.value = style.highlight;
    fillBtn.setAttribute('aria-pressed', String(typeof style.fill === 'string'));
    if (typeof style.fill === 'string' && /^#[0-9a-f]{6}$/i.test(style.fill)) fillColorInput.value = style.fill;
    for (const b of alignBtns) b.setAttribute('aria-pressed', String(style.align === b.dataset.viewerAlign));
    paintColor();
    paintHighlight();
    paintFill();
    const size = typeof style.size === 'string' ? style.size : '';
    sizeSelect.value = [...sizeSelect.options].some((o) => o.value === size) ? size : '';
  }

  function setMode(on: boolean) {
    showAlert(null);
    if (canMark) {
      modeOn = on;
      if (!on) sendTool(null);
      paintChrome();
    } else if (canEdit) {
      send({ type: 'edit', on });
    }
    if (on) currentFrame?.focus();
  }

  function colorOf(tool: string): string {
    return toolColors.find((i) => i.dataset.viewerToolColor === tool)?.value ?? '#000000';
  }

  function sendTool(tool: string | null, recolor = false) {
    const color = tool ? rgbOf(colorOf(tool)) : null;
    send({ type: 'tool', tool, color, width: INK_WIDTH, recolor });
  }

  /*
    Puts the edits of the page into the engine. After this, the page and the
    engine agree, so the log of the page starts again. The file on disk does
    not have the edits yet.
  */
  async function applyPageEdits() {
    if (!currentDoc || canMark || !editDirty) return;
    const payload = await ask('getOperations');
    if (!payload) throw new Error('The edits could not be read back.');
    if (JSON.parse(payload).ops.length) await currentDoc.edit(payload);
    appliedUnsaved = true;
    send({ type: 'committed' });
    editDirty = false;
  }

  /* The bytes of the document with every change of the page. */
  async function currentBytes(): Promise<{ bytes: Uint8Array; recalc: any }> {
    if (!currentDoc) throw new Error('No document is open.');
    if (canMark) {
      const payload = await ask('getAnnotations');
      if (!payload) throw new Error('The marks could not be read back.');
      return { bytes: await currentDoc.annotate(payload), recalc: null };
    }
    await applyPageEdits();
    const recalc = sheet ? await currentDoc.recalculate() : null;
    const bytes = encrypted ? await currentDoc.save(savePassword ?? '') : await currentDoc.save();
    return { bytes, recalc };
  }

  /*
    Writes the document to its file, or to a new file for "Save As" and for a
    document that was never saved. The file keeps the format it was opened
    as, so "Save As" offers only that extension.

    A sheet is recalculated before the save. If the page left formula cells
    stale, and the recalculation changed any cell, the sheet renders again,
    so the page shows what the file holds.
  */
  async function saveDocument(as = false) {
    if (!currentDoc || !source || !(canEdit || canMark)) return;
    showAlert(null);
    const extension = extensionOf(source.name);
    let target = source.path;
    if (as || !target) {
      target = await platform.pickSaveTarget(source.path ?? source.name, extension);
      if (!target) return;
    }
    saveBtn.disabled = true;
    await nextFrame();
    try {
      const { bytes, recalc } = await currentBytes();
      await platform.writeFile(target, bytes);
      source = { bytes, name: platform.baseName(target), path: target };
      platform.rememberRecent(target);
      filename.textContent = source.name;
      appliedUnsaved = false;
      savedMarks = marks;
      if (!canMark) {
        send({ type: 'committed' });
        if (staleCount && recalc && Object.values(recalc).some((cells: any) => cells.length)) await renderView(viewIndex);
        showUncomputed(recalc);
      }
    } catch (e: any) {
      const detail = e?.message || e?.name || String(e) || 'Unknown error.';
      showAlert(`${source.name} could not be saved: ${detail} Your changes are still here.`);
    } finally {
      paintChrome();
    }
  }

  /* True if the changes may go: there are none, or the user said so. */
  async function mayDiscard() {
    if (!currentDoc || !dirty()) return true;
    return platform.confirmDiscard(source?.name ?? 'This document');
  }

  function teardown() {
    passwordAnswer?.(null);
    passwordAnswer = null;
    encrypted = false;
    savePassword = null;
    for (const [, resolve] of asks) resolve(null);
    asks.clear();
    modeOn = false;
    canEdit = false;
    canFormat = false;
    canMark = false;
    plainText = false;
    sheet = false;
    editOnReady = false;
    editDirty = false;
    appliedUnsaved = false;
    canUndo = false;
    canRedo = false;
    marks = 0;
    savedMarks = 0;
    armedTool = null;
    canFind = false;
    views = [];
    viewIndex = 0;
    showFind(false);
    showAlert(null);
    showStale(0);
    void currentDoc?.close();
    currentDoc = null;
    source = null;
    frameHost.replaceChildren();
    tabsBar.replaceChildren();
    tabsBar.hidden = true;
    currentFrame = null;
    zoomBar.hidden = true;
    cutNote.hidden = true;
    paintChrome();
  }

  /* A new iframe for each render, in a container that is visible already. */
  function mountFrame(html: string) {
    const frame = document.createElement('iframe');
    frame.title = 'Rendered document';
    // `allow-scripts` without `allow-same-origin`: the scripts of the renderer
    // run, and the document gets an opaque origin. See the website viewer.
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.className = 'h-full w-full border-0';
    frameHost.replaceChildren(frame);
    currentFrame = frame;
    frame.srcdoc = withBridge(html);
  }

  /*
    Spreadsheets show one tab for each sheet. Every other format shows only
    its "document" view, if it has one. This is what Android does
    (`CoreLoader.selectViews`).
  */
  async function selectViews(doc: OpenDocument): Promise<View[]> {
    const all = await doc.listViews();
    const meta = await doc.meta().catch(() => ({}) as Record<string, unknown>);
    if (meta.documentType === 'spreadsheet') {
      const sheets = all.filter((v) => v.name !== 'document');
      if (sheets.length) return sheets;
    }
    const whole = all.filter((v) => v.name === 'document');
    return whole.length ? whole : all.slice(0, 1);
  }

  function paintTabs() {
    tabsBar.hidden = views.length < 2;
    tabsBar.replaceChildren();
    if (views.length < 2) return;
    views.forEach((view, i) => {
      const holder = document.createElement('template');
      holder.innerHTML = tabButton();
      const btn = holder.content.firstElementChild as HTMLButtonElement;
      btn.textContent = view.name;
      btn.setAttribute('aria-selected', String(i === viewIndex));
      btn.addEventListener('click', () => void switchView(i));
      tabsBar.append(btn);
    });
  }

  async function renderView(i: number) {
    if (!currentDoc) return;
    const html = (await currentDoc.render(views[i].index)).html;
    viewIndex = i;
    editOnReady = modeOn;
    modeOn = false;
    editDirty = false;
    canUndo = false;
    canRedo = false;
    showStale(0);
    showCut(views[i].sheetCut);
    paintTabs();
    paintChrome();
    mountFrame(html);
  }

  /* The edits of the sheet on screen go into the engine before another
     sheet renders, so no edit is lost. */
  async function switchView(i: number) {
    if (i === viewIndex || !currentDoc) return;
    try {
      await applyPageEdits();
      await renderView(i);
    } catch (e: any) {
      showAlert(`That sheet could not be shown: ${e?.message ?? e}`);
    }
  }

  window.addEventListener('message', (event) => {
    if (!currentFrame || event.source !== currentFrame.contentWindow) return;
    const m = event.data;
    if (!m || m.odrViewer !== true) return;
    switch (m.type) {
      case 'ready':
        if (m.background && !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(m.background)) {
          currentFrame.style.background = m.background;
        }
        canEdit = canEdit && m.editable === true;
        sheet = m.sheet === true;
        canFormat = canEdit && !plainText && !(sheet && m.sheetStyles === false);
        canMark = canMark && m.annotatable === true;
        canFind = m.searchable === true;
        if (canFind && !findStrip.hidden && findText.value) send({ type: 'search', text: findText.value, step: 0 });
        else if (!canFind) showFind(false);
        paintZoom(m.zoom);
        zoomBar.hidden = false;
        paintChrome();
        if (editOnReady && canEdit) setMode(true);
        editOnReady = false;
        onReady?.();
        break;
      case 'page':
        onPage(m.message);
        break;
      case 'tool':
        armedTool = typeof m.armed === 'string' ? m.armed : null;
        paintChrome();
        break;
      case 'escape':
        if (!findStrip.hidden) showFind(false);
        else if (modeOn) setMode(false);
        break;
      case 'find':
        if (canFind) showFind(true);
        break;
      case 'link':
        if (typeof m.href === 'string') platform.openLink(m.href);
        break;
      case 'operations':
      case 'annotations': {
        const resolve = asks.get(m.id);
        asks.delete(m.id);
        resolve?.(typeof m.payload === 'string' ? m.payload : null);
        break;
      }
    }
  });

  function onPage(message: unknown) {
    if (typeof message !== 'string') return;
    let type: unknown;
    let detail: any;
    try {
      ({ type, detail } = JSON.parse(message));
    } catch {
      return;
    }
    switch (type) {
      case 'zoomChange':
        paintZoom(Number(detail?.zoom) || 1);
        break;
      case 'editModeChange':
        modeOn = detail?.editing === true;
        if (detail?.reason) showAlert(REFUSALS[detail.reason] ?? detail.message, 'warn');
        paintChrome();
        break;
      case 'editChange':
        editDirty = detail?.dirty === true;
        canUndo = detail?.canUndo === true;
        canRedo = detail?.canRedo === true;
        paintChrome();
        break;
      case 'editRefused':
        showAlert(REFUSALS[detail?.reason] ?? detail?.message ?? 'That edit was not taken.', 'warn');
        break;
      case 'cellsStale':
        showStale(Array.isArray(detail?.cells) ? detail.cells.length : 0);
        break;
      case 'selectionChange':
        paintSelection(detail ?? {});
        break;
      case 'searchChange':
        paintFind(detail ?? {});
        break;
      case 'annotationChange':
        marks = Number(detail?.count) || 0;
        paintChrome();
        break;
      case 'error':
        console.warn(`renderer error ${detail?.code}: ${detail?.message}`);
        break;
    }
  }

  function paintZoom(zoom: number) {
    currentZoom = zoom;
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    zoomOutBtn.disabled = zoom <= ZOOM_MIN;
    zoomInBtn.disabled = zoom >= ZOOM_MAX;
  }

  function nudgeZoom(factor: number) {
    const value = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, currentZoom * factor));
    send({ type: 'setZoom', value });
  }

  let findTimer: number | undefined;
  function showFind(on: boolean) {
    window.clearTimeout(findTimer);
    findStrip.hidden = !on;
    findOpenBtn.setAttribute('aria-expanded', String(on));
    if (on) {
      findText.focus();
      findText.select();
      return;
    }
    if (findText.value) send({ type: 'search', text: '', step: 0 });
    findText.value = '';
    paintFind({});
  }

  function paintFind(state: { count?: number; current?: number; complete?: boolean }) {
    const count = Number(state.count) || 0;
    const more = state.complete === false;
    findPreviousBtn.disabled = count === 0;
    findNextBtn.disabled = count === 0;
    if (!findText.value) findCount.textContent = '';
    else if (count === 0) findCount.textContent = more ? 'Searching…' : 'No hits';
    else findCount.textContent = `${(state.current ?? 0) + 1} of ${count.toLocaleString()}${more ? '…' : ''}`;
  }

  function search(step: number) {
    window.clearTimeout(findTimer);
    send({ type: 'search', text: findText.value, step });
  }

  /* The types that a name asks for, for a format with no signature, such as
     markdown. Only types that render. */
  let askable: Map<string, number> | null = null;
  function askedType(name: string): number | undefined {
    if (!askable) {
      askable = new Map();
      for (const t of backend.fileTypes()) {
        if (t.capabilities?.detectByContent || !t.capabilities?.translateHtml) continue;
        for (const ext of t.extensions ?? []) askable.set(ext.toLowerCase(), t.fileType);
      }
    }
    return askable.get(extensionOf(name));
  }

  function typeInfo(fileType: number | undefined) {
    return fileType === undefined ? undefined : backend.fileTypes().find((t) => t.fileType === fileType);
  }

  function blankType(name: string): number | undefined {
    const ext = extensionOf(name);
    return backend.fileTypes().find((t) => t.capabilities?.create && t.extensions?.includes(ext))?.fileType;
  }

  /** Whether documents follow the dark mode of the system. */
  let darken = platform.setting('darken', true);

  /*
    Opens a source in this window. `knownPassword` is the password from an
    earlier open of the same file, for a render again.
  */
  async function open(src: Source, knownPassword: string | null = null) {
    teardown();
    busy = true;
    setBusy('Starting the engine…');

    try {
      await backend.load();
    } catch (e: any) {
      const detail = [e?.name, e?.message].filter(Boolean).join(': ');
      setIdle('The engine could not start', detail || 'Unknown error.', true);
      return;
    }

    setBusy(`Opening ${src.name}…`);
    await nextFrame();

    const enums = backend.enums();
    const asked = src.bytes ? askedType(src.name) : undefined;
    const blank = src.bytes ? undefined : blankType(src.name);
    let detected: number | undefined;
    if (src.bytes && asked === undefined) {
      try {
        detected = (await backend.detect(src.bytes)).at(-1);
      } catch {
        detected = undefined;
      }
    }
    const info = typeInfo(src.bytes ? (asked ?? detected) : blank);
    const editableFormat = Boolean(info?.capabilities?.edit && info?.capabilities?.save);
    const markableFormat = Boolean(info?.capabilities?.annotate);
    plainText = info?.category === enums.FileCategory.text;

    const scheme = darken && info?.capabilities?.colorScheme ? enums.HtmlColorScheme.system : enums.HtmlColorScheme.light;
    const options: OpenOptions = {
      lazyLayout: true,
      editable: editableFormat,
      editingScope: enums.HtmlEditingScope.document,
      spreadsheetCellLimit: SHEET_CELL_BUDGET,
      spreadsheetLimit: SHEET_LIMIT,
      textDocumentMargin: true,
      hostMessageHandler: HOST_HANDLER,
      pdfAnnotationMarkOnSelection: true,
      pdfEnforcePermissions: true,
      colorScheme: scheme,
      name: src.name,
    };
    if (asked !== undefined) options.fileType = asked;

    let doc: OpenDocument;
    try {
      if (src.bytes) {
        // The engine takes its own copy, and the window keeps these bytes for
        // a print and for a render again.
        doc = await backend.open(src.bytes.slice(), options);
      } else if (blank !== undefined) {
        doc = await backend.create(blank, options);
        editOnReady = true;
      } else {
        throw new Error('This engine cannot make that type of document.');
      }
    } catch (e) {
      const [msg, detail] = friendlyError(e, src.name);
      busy = false;
      setIdle(msg, detail, true);
      return;
    }
    currentDoc = doc;
    source = src;

    let password: string | null = null;
    if (await doc.isPasswordEncrypted()) {
      encrypted = true;
      let wrong = false;
      for (;;) {
        password = knownPassword ?? (await askPassword(src.name, wrong));
        knownPassword = null;
        if (password === null || currentDoc !== doc) {
          busy = false;
          return;
        }
        setBusy(`Decrypting ${src.name}…`);
        await nextFrame();
        if (currentDoc !== doc) return;
        try {
          await doc.decrypt(password);
          break;
        } catch (e: any) {
          if (e?.name !== 'WrongPassword') {
            const [msg, detail] = friendlyError(e, src.name);
            teardown();
            busy = false;
            setIdle(msg, detail, true);
            return;
          }
          wrong = true;
        }
      }
    }
    savePassword = password;

    const answers = async (question: () => Promise<boolean>) => {
      try {
        return (await question()) === true;
      } catch {
        return false;
      }
    };
    canEdit = editableFormat && (await answers(async () => (await doc.isEditable()) && (await doc.isSavable(encrypted))));
    canMark =
      markableFormat &&
      (await answers(async () => (await doc.isAnnotatable()) && (await doc.permissions())?.modifyAnnotations !== false));

    setBusy(`Rendering ${src.name}…`);
    await nextFrame();

    try {
      views = await selectViews(doc);
      if (!views.length) throw new Error('The document has nothing to show.');
      filename.textContent = src.name;
      showResult(true);
      await renderView(0);
    } catch (e) {
      const [msg, detail] = friendlyError(e, src.name);
      teardown();
      showResult(false);
      busy = false;
      setIdle(msg, detail, true);
      return;
    }
    busy = false;
    if (src.path) platform.rememberRecent(src.path);
  }

  async function openSafely(src: Source, knownPassword: string | null = null) {
    try {
      await open(src, knownPassword);
    } catch (e: any) {
      teardown();
      showResult(false);
      busy = false;
      setIdle(`${src.name} could not be opened`, e?.message ? String(e.message) : 'Something went wrong in the viewer.', true);
    }
  }

  /* Opens a file here if this window is empty, else in a new window. */
  async function openPath(path: string) {
    if (hasDocument()) {
      await platform.openWindows([path]);
      return;
    }
    const name = platform.baseName(path);
    showResult(false);
    setBusy(`Reading ${name}…`);
    let bytes: Uint8Array;
    try {
      bytes = await platform.readFile(path);
    } catch (e: any) {
      platform.forgetRecent(path);
      setIdle(`${name} could not be read`, String(e?.message ?? e), true);
      return;
    }
    await openSafely({ bytes, name, path });
  }

  async function openPaths(paths: string[]) {
    if (!paths.length) return;
    const [first, ...rest] = paths;
    if (rest.length) void platform.openWindows(rest);
    if (first.startsWith(NEW_PREFIX)) await newBlank(first.slice(NEW_PREFIX.length));
    else await openPath(first);
  }

  async function pickAndOpen() {
    const extensions = [...new Set(backend.fileTypes().flatMap((t) => (t.capabilities?.translateHtml ? t.extensions : [])))];
    const path = await platform.pickFile(extensions.length ? extensions : ['*']);
    if (path) await openPath(path);
  }

  async function newBlank(ext: string) {
    if (hasDocument()) {
      // A new window makes it, so the open document stays.
      await platform.openWindows([`${NEW_PREFIX}${ext}`]);
      return;
    }
    await openSafely({ bytes: null, name: `Untitled.${ext}`, path: null });
  }

  /*
    Prints the view on screen. The engine renders it once more, with every
    part laid out and with light colours, and a print window shows it as a
    top-level page. Tauri prints a top-level page on all three systems, but on
    macOS not a frame inside one.
  */
  async function print() {
    if (!currentDoc || !source) return;
    showAlert(null);
    let printDoc: OpenDocument | null = null;
    try {
      const bytes = dirty() || !source.bytes ? (await currentBytes()).bytes : source.bytes.slice();
      const enums = backend.enums();
      printDoc = await backend.open(bytes, {
        lazyLayout: false,
        editable: false,
        textDocumentMargin: true,
        spreadsheetCellLimit: SHEET_CELL_BUDGET,
        spreadsheetLimit: SHEET_LIMIT,
        colorScheme: enums.HtmlColorScheme.light,
        name: source.name,
      });
      if (encrypted && (await printDoc.isPasswordEncrypted())) await printDoc.decrypt(savePassword ?? '');
      const printViews = await selectViews(printDoc);
      const view = printViews.find((v) => v.name === views[viewIndex]?.name) ?? printViews[0];
      const html = (await printDoc.render(view.index)).html;
      await platform.startPrint(source.name, withoutScripts(html));
    } catch (e: any) {
      showAlert(`${source.name} could not be printed: ${e?.message ?? e}`);
    } finally {
      void printDoc?.close();
      paintChrome();
    }
  }

  /* Renders the open document again, for a new colour scheme. */
  async function reload() {
    if (!source || !currentDoc) return;
    if (dirty()) {
      showAlert('The new setting applies to the next document. Save this one first to see it here.', 'warn');
      return;
    }
    const again = source;
    const password = savePassword;
    await openSafely(again.bytes ? { ...again, bytes: again.bytes } : again, password);
  }

  async function closeDocument() {
    if (!(await mayDiscard())) return;
    teardown();
    showResult(false);
    setIdle(IDLE_TITLE, IDLE_HINT);
  }

  // The landing panel.
  pickBtn.addEventListener('click', () => void pickAndOpen());
  for (const btn of blankBtns) btn.addEventListener('click', () => void newBlank(btn.dataset.viewerBlank ?? 'odt'));
  recentsClearBtn.addEventListener('click', () => {
    platform.clearRecents();
    paintRecents();
  });

  passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const answer = passwordAnswer;
    passwordAnswer = null;
    const value = passwordInput.value;
    passwordInput.value = '';
    answer?.(value);
  });
  function cancelPassword() {
    teardown();
    busy = false;
    setIdle(IDLE_TITLE, IDLE_HINT);
  }
  passwordCancelBtn.addEventListener('click', cancelPassword);
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancelPassword();
  });

  resetBtn.addEventListener('click', () => void closeDocument());

  // Files dragged on the window. Tauri gives the paths, so a save can go back
  // to the same file.
  function highlight(on: boolean) {
    zone.classList.toggle('border-dashed', !on);
    for (const c of DROP_ACTIVE) zone.classList.toggle(c, on);
  }
  void platform.onDragDrop({
    enter: () => highlight(true),
    leave: () => highlight(false),
    drop: (paths) => void openPaths(paths),
  });

  penBtn.addEventListener('click', () => setMode(!modeOn));
  saveBtn.addEventListener('click', () => void saveDocument());
  printBtn.addEventListener('click', () => void print());

  /* A button in the strip must not take the focus from the frame, where the
     selection is. */
  const keepFocus = (e: Event) => e.preventDefault();
  for (const b of [...styleBtns, highlightBtn, fillBtn, ...alignBtns, ...structureBtns, ...toolBtns, undoBtn, redoBtn]) {
    b.addEventListener('mousedown', keepFocus);
  }
  for (const b of styleBtns) b.addEventListener('click', () => send({ type: 'toggle', property: b.dataset.viewerStyle }));
  highlightBtn.addEventListener('click', () => {
    const on = highlightBtn.getAttribute('aria-pressed') === 'true';
    send({ type: 'format', style: { highlight: on ? null : highlightColorInput.value } });
  });
  fillBtn.addEventListener('click', () => {
    const on = fillBtn.getAttribute('aria-pressed') === 'true';
    send({ type: 'format', style: { fill: on ? null : fillColorInput.value } });
  });
  for (const b of alignBtns) {
    b.addEventListener('click', () => {
      const off = sheet && b.getAttribute('aria-pressed') === 'true';
      send({ type: 'format', style: { align: off ? null : b.dataset.viewerAlign } });
    });
  }
  for (const b of structureBtns) {
    b.addEventListener('click', () =>
      send({ type: 'structure', call: b.dataset.viewerStructureCall, where: b.dataset.viewerStructureWhere }),
    );
  }
  sizeSelect.addEventListener('change', () => {
    if (sizeSelect.value) send({ type: 'format', style: { size: sizeSelect.value } });
  });
  for (const b of toolBtns) b.addEventListener('click', () => sendTool(b.dataset.viewerTool ?? 'highlight'));

  /* A colour control: a picker over a bar in its colour. See the website
     viewer for why a second press closes the picker this way. */
  function colourControl(input: HTMLInputElement, bar: HTMLElement | undefined, apply: () => void) {
    let isOpen = false;
    let applied = input.value;
    const paint = () => {
      if (bar) bar.style.background = input.value;
    };
    paint();
    input.addEventListener('input', paint);
    input.addEventListener('change', () => {
      if (input.value === applied) return;
      applied = input.value;
      apply();
    });
    input.addEventListener('click', (e) => {
      if (!isOpen) {
        isOpen = true;
        applied = input.value;
        return;
      }
      e.preventDefault();
      isOpen = false;
      input.type = 'text';
      input.type = 'color';
      input.blur();
      input.dispatchEvent(new Event('change'));
    });
    input.addEventListener('blur', () => {
      isOpen = false;
    });
    return paint;
  }

  const paintColor = colourControl(colorInput, colorBar, () => send({ type: 'format', style: { color: colorInput.value } }));
  const paintHighlight = colourControl(highlightColorInput, highlightBar, () =>
    send({ type: 'format', style: { highlight: highlightColorInput.value } }),
  );
  const paintFill = colourControl(fillColorInput, fillBar, () =>
    send({ type: 'format', style: { fill: fillColorInput.value } }),
  );
  for (const input of toolColors) {
    const tool = input.dataset.viewerToolColor ?? '';
    const bar = toolBars.find((b) => b.dataset.viewerToolBar === tool);
    colourControl(input, bar, () => sendTool(tool, true));
  }
  undoBtn.addEventListener('click', () => send({ type: 'undo' }));
  redoBtn.addEventListener('click', () => send({ type: 'redo' }));

  findOpenBtn.addEventListener('click', () => showFind(findStrip.hidden === true));
  findCloseBtn.addEventListener('click', () => showFind(false));
  findPreviousBtn.addEventListener('click', () => search(-1));
  findNextBtn.addEventListener('click', () => search(1));
  findText.addEventListener('input', () => {
    window.clearTimeout(findTimer);
    findTimer = window.setTimeout(() => search(0), 200);
  });
  findText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      search(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      showFind(false);
      currentFrame?.focus();
    }
  });

  zoomInBtn.addEventListener('click', () => nudgeZoom(ZOOM_STEP));
  zoomOutBtn.addEventListener('click', () => nudgeZoom(1 / ZOOM_STEP));
  zoomLabel.addEventListener('click', () => send({ type: 'resetZoom' }));

  // The menu bar.
  void platform.setMenuCheck('darken', darken);
  void platform.onMenu((id) => {
    switch (id) {
      case 'new-window':
        void platform.openWindows([]);
        break;
      case 'new-odt':
      case 'new-ods':
      case 'new-docx':
      case 'new-xlsx':
        void newBlank(id.slice(4));
        break;
      case 'open':
        void pickAndOpen();
        break;
      case 'save':
        void saveDocument(false);
        break;
      case 'save-as':
        void saveDocument(true);
        break;
      case 'print':
        void print();
        break;
      case 'close-document':
        void closeDocument();
        break;
      case 'find':
        if (canFind) showFind(true);
        break;
      case 'find-next':
        if (canFind && findText.value) search(1);
        break;
      case 'find-previous':
        if (canFind && findText.value) search(-1);
        break;
      case 'edit-mode':
        if (canEdit || canMark) setMode(!modeOn);
        break;
      case 'zoom-in':
        nudgeZoom(ZOOM_STEP);
        break;
      case 'zoom-out':
        nudgeZoom(1 / ZOOM_STEP);
        break;
      case 'zoom-fit':
        send({ type: 'resetZoom' });
        break;
      case 'darken':
        // The check item toggles itself. The window keeps the setting.
        darken = !darken;
        platform.setSetting('darken', darken);
        void platform.setMenuCheck('darken', darken);
        void reload();
        break;
    }
  });

  void platform.onCloseRequested(mayDiscard);

  showResult(false);
  setIdle(IDLE_TITLE, IDLE_HINT);
  paintTitle();

  /* Called once each time a frame reports that it is ready. */
  let onReady: (() => void) | null = null;

  return {
    openPaths,
    hasDocument,
    /** Opens the file, waits for the frame, and gives what the window shows. */
    async smoke(path: string, saveTo: string | null, password: string | null): Promise<string> {
      const ready = new Promise<void>((resolve) => {
        onReady = resolve;
      });
      await openSafely({ bytes: await platform.readFile(path), name: platform.baseName(path), path }, password);
      if (!currentDoc) throw new Error(trail.join(' > '));
      await Promise.race([
        ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('the frame did not report')), 30000)),
      ]);
      onReady = null;
      const names = views.map((v) => v.name).join('|');
      let saved = '';
      // Only a document that the window would save. A password-protected
      // file cannot be saved with its password, so the window offers no save.
      if (saveTo && (canEdit || canMark)) {
        const { bytes } = await currentBytes();
        await platform.writeFile(saveTo, bytes);
        const back = await platform.readFile(saveTo);
        if (back.length !== bytes.length) throw new Error(`wrote ${bytes.length} bytes, read ${back.length}`);
        saved = ` saved=${bytes.length}B`;
      }
      return `${source?.name}: views=[${names}] editable=${canEdit} markable=${canMark} searchable=${canFind} engine=${backend.version() || __ODR_VERSION__}${saved}`;
    },
  };
}
