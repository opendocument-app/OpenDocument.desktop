/*
  The markup of the window, ported from the viewer of the website
  (`src/components/viewer/Chrome.astro`, `Panel.astro` and `pages/tryit.astro`).
  The viewer finds every control by its `data-viewer-*` attribute.

  The desktop has no samples. The landing panel shows the recent documents
  instead, and a document can have one tab for each sheet.
*/
import { icon, logo, type IconName } from './icons';

const swatch =
  'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface';
const chevron =
  'relative -ml-0.5 flex h-7 w-4 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface';
const round =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-outline transition-colors hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent';
const tool =
  'flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border border-transparent px-1.5 text-sm leading-none transition-colors hover:bg-surface aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary disabled:opacity-40';

/* Point sizes that documents often use. */
const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

const aligns: { align: string; label: string; icon: IconName }[] = [
  { align: 'left', label: 'Align left', icon: 'alignLeft' },
  { align: 'center', label: 'Centre', icon: 'alignCenter' },
  { align: 'right', label: 'Align right', icon: 'alignRight' },
  { align: 'justify', label: 'Justify', icon: 'alignJustify' },
];

const structure: { call: string; where: string; label: string; icon: IconName }[] = [
  { call: 'insertRows', where: 'above', label: 'Insert rows above', icon: 'rowAbove' },
  { call: 'insertRows', where: 'below', label: 'Insert rows below', icon: 'rowBelow' },
  { call: 'deleteRows', where: '', label: 'Delete rows', icon: 'rowDelete' },
  { call: 'insertColumns', where: 'left', label: 'Insert columns to the left', icon: 'columnLeft' },
  { call: 'insertColumns', where: 'right', label: 'Insert columns to the right', icon: 'columnRight' },
  { call: 'deleteColumns', where: '', label: 'Delete columns', icon: 'columnDelete' },
];

/* The marks of a pdf, in the names of the annotator, with their first colour. */
const marks: { tool: string; label: string; icon: IconName; color: string }[] = [
  { tool: 'highlight', label: 'Highlight', icon: 'highlighter', color: '#ffe633' },
  { tool: 'underline', label: 'Underline', icon: 'underline', color: '#e53935' },
  { tool: 'strikeOut', label: 'Strike out', icon: 'strike', color: '#e53935' },
  { tool: 'squiggly', label: 'Squiggly underline', icon: 'squiggle', color: '#e53935' },
  { tool: 'ink', label: 'Draw', icon: 'scribble', color: '#1e88e5' },
];

/* The types that a new, empty document can have. */
export const BLANKS: { ext: string; tone: 'text' | 'sheet' }[] = [
  { ext: 'odt', tone: 'text' },
  { ext: 'ods', tone: 'sheet' },
  { ext: 'docx', tone: 'text' },
  { ext: 'xlsx', tone: 'sheet' },
];

const tones = { text: 'text-brand-text', sheet: 'text-brand-sheet' } as const;

function bar() {
  return `
<div class="flex shrink-0 items-center gap-3 border-b border-outline-variant bg-surface-container px-3 py-2">
  <div data-viewer-open hidden class="flex min-w-0 flex-1 items-center gap-3">
    <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-sheet"></span>
    <p data-viewer-filename class="min-w-0 flex-1 truncate text-sm font-medium"></p>

    <button data-viewer-find-open hidden type="button" title="Search this document" aria-label="Search this document" aria-expanded="false" class="${round}">${icon('search')}</button>

    <div data-viewer-zoom hidden class="flex shrink-0 items-center gap-0.5">
      <button data-viewer-zoom-out type="button" aria-label="Zoom out" title="Zoom out" class="${round}">&minus;</button>
      <button data-viewer-zoom-level type="button" title="Fit to window" class="min-w-[3.25rem] rounded-full px-1 py-1 text-xs font-medium tabular-nums transition-colors hover:bg-surface">100%</button>
      <button data-viewer-zoom-in type="button" aria-label="Zoom in" title="Zoom in" class="${round}">+</button>
    </div>

    <button data-viewer-pen hidden type="button" class="${round}">
      <span data-viewer-pen-edit class="flex">${icon('pencil')}</span>
      <span data-viewer-pen-mark hidden class="flex">${icon('highlighter')}</span>
    </button>
    <button data-viewer-save hidden disabled type="button" title="Save" aria-label="Save" class="${round}">${icon('save')}</button>
    <button data-viewer-print type="button" title="Print" aria-label="Print" class="${round}">${icon('printer')}</button>
    <button data-viewer-reset type="button" aria-label="Close this document" title="Close this document" class="${round}">${icon('close')}</button>
  </div>
</div>

<div data-viewer-find hidden class="flex shrink-0 items-center gap-2 border-b border-outline-variant bg-surface-container px-4 py-1.5">
  ${icon('search', 'h-4 w-4 shrink-0 text-on-surface-variant')}
  <input data-viewer-find-text type="search" aria-label="Search for" placeholder="Search" autocomplete="off" spellcheck="false" class="h-7 min-w-0 flex-1 rounded-full border border-outline bg-surface px-3 text-sm outline-none focus:border-primary" />
  <p data-viewer-find-count aria-live="polite" class="shrink-0 text-xs tabular-nums text-on-surface-variant"></p>
  <button data-viewer-find-previous type="button" disabled title="Previous hit (Shift+Enter)" aria-label="Previous hit" class="${round}">${icon('chevron', 'h-4 w-4 rotate-180')}</button>
  <button data-viewer-find-next type="button" disabled title="Next hit (Enter)" aria-label="Next hit" class="${round}">${icon('chevron')}</button>
  <button data-viewer-find-close type="button" title="Close the search (Escape)" aria-label="Close the search" class="${round}">${icon('close')}</button>
</div>

<div data-viewer-tools hidden class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-outline-variant bg-surface-container px-3 py-1.5">
  <div data-viewer-format hidden class="flex items-center gap-0.5">
    <button data-viewer-style="bold" type="button" title="Bold" aria-pressed="false" class="${tool}"><span class="font-bold">B</span></button>
    <button data-viewer-style="italic" type="button" title="Italic" aria-pressed="false" class="${tool}"><span class="italic">I</span></button>
    <button data-viewer-style="underline" type="button" title="Underline" aria-pressed="false" class="${tool}"><span class="underline">U</span></button>
    <button data-viewer-style="strikethrough" type="button" title="Strikethrough" aria-pressed="false" class="${tool}"><span class="line-through">S</span></button>
    <label title="Text colour" class="${swatch}">
      <span class="sr-only">Text colour</span>
      <span aria-hidden="true" class="flex flex-col items-center text-sm font-semibold leading-none">A<span data-viewer-color-bar class="mt-0.5 h-1 w-4 rounded-sm ring-1 ring-outline-variant"></span></span>
      <input data-viewer-color type="color" value="#191c1e" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </label>
    <button data-viewer-highlight type="button" title="Highlight" aria-pressed="false" class="${tool}">
      <span aria-hidden="true" class="flex flex-col items-center">${icon('highlighter', 'h-3.5 w-3.5')}<span data-viewer-highlight-bar class="mt-0.5 h-1 w-4 rounded-sm"></span></span>
    </button>
    <label data-viewer-highlight-pick title="Highlight colour" class="${chevron}">
      <span class="sr-only">Highlight colour</span>${icon('chevron', 'h-3 w-3')}
      <input data-viewer-highlight-color type="color" value="#fff59d" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </label>
    <button data-viewer-fill type="button" title="Cell fill" aria-pressed="false" class="${tool}">
      <span aria-hidden="true" class="flex flex-col items-center">${icon('fill', 'h-3.5 w-3.5')}<span data-viewer-fill-bar class="mt-0.5 h-1 w-4 rounded-sm"></span></span>
    </button>
    <label data-viewer-fill-pick title="Cell fill colour" class="${chevron}">
      <span class="sr-only">Cell fill colour</span>${icon('chevron', 'h-3 w-3')}
      <input data-viewer-fill-color type="color" value="#c8e6c9" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </label>
    <select data-viewer-size title="Font size" class="ml-1 h-6 cursor-pointer rounded-md border border-transparent bg-transparent py-0 pl-1.5 pr-1 text-xs text-on-surface-variant transition-colors hover:bg-surface">
      <option value="">Size</option>
      ${sizes.map((s) => `<option value="${s}pt">${s} pt</option>`).join('')}
    </select>
    <span class="ml-1 flex items-center gap-0.5">
      ${aligns
        .map(
          (a) =>
            `<button data-viewer-align="${a.align}" type="button" title="${a.label}" aria-label="${a.label}" aria-pressed="false" class="${tool}">${icon(a.icon, 'h-3.5 w-3.5')}</button>`,
        )
        .join('')}
    </span>
  </div>

  <div data-viewer-structure hidden class="flex items-center gap-0.5">
    ${structure
      .map(
        (s) =>
          `<button data-viewer-structure-call="${s.call}" data-viewer-structure-where="${s.where}" type="button" title="${s.label}" aria-label="${s.label}" class="${tool}">${icon(s.icon)}</button>`,
      )
      .join('')}
  </div>

  <div data-viewer-mark hidden class="flex flex-wrap items-center gap-x-1 gap-y-0.5">
    ${marks
      .map(
        (m) => `<span class="flex items-center">
      <button data-viewer-tool="${m.tool}" type="button" title="${m.label}" aria-label="${m.label}" aria-pressed="false" class="${tool}">
        <span aria-hidden="true" class="flex flex-col items-center">${icon(m.icon, 'h-3.5 w-3.5')}<span data-viewer-tool-bar="${m.tool}" class="mt-0.5 h-1 w-4 rounded-sm"></span></span>
      </button>
      <label title="${m.label} colour" class="${chevron}">
        <span class="sr-only">${m.label} colour</span>${icon('chevron', 'h-3 w-3')}
        <input data-viewer-tool-color="${m.tool}" type="color" value="${m.color}" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
    </span>`,
      )
      .join('')}
  </div>

  <div class="flex items-center gap-0.5">
    <button data-viewer-undo type="button" disabled title="Undo" aria-label="Undo" class="${tool}">${icon('undo')}</button>
    <button data-viewer-redo type="button" disabled title="Redo" aria-label="Redo" class="${tool}">${icon('redo')}</button>
  </div>

  <p data-viewer-tools-hint class="min-w-0 flex-1 truncate text-xs text-on-surface-variant"></p>
</div>

<p data-viewer-alert hidden class="shrink-0 border-b border-outline-variant px-4 py-2 text-xs leading-relaxed"></p>
<p data-viewer-stale hidden class="shrink-0 border-b border-outline-variant bg-surface-variant/40 px-4 py-2 text-xs leading-relaxed text-on-surface-variant"></p>
<p data-viewer-cut hidden class="shrink-0 border-b border-outline-variant bg-surface-variant/40 px-4 py-2 text-xs leading-relaxed text-on-surface-variant"></p>`;
}

function panel() {
  return `
<div data-viewer-panel class="flex h-full p-5">
  <div data-viewer-zone class="flex h-full w-full flex-col items-center justify-center-safe overflow-y-auto rounded-xl border-2 border-dashed border-outline-variant px-6 py-10 text-center transition-colors">
    <div class="mb-4">${logo('h-14 w-14')}</div>

    <div data-viewer-spinner hidden class="mb-5 h-10 w-10 animate-spin rounded-full border-[3px] border-outline-variant border-t-primary"></div>
    <div data-viewer-idle-icon hidden class="mb-5 rounded-full bg-primary-container p-4 text-on-primary-container">
      <span data-viewer-icon-upload class="block">${icon('upload', 'h-7 w-7')}</span>
      <span data-viewer-icon-lock hidden class="block">${icon('lock', 'h-7 w-7')}</span>
    </div>

    <p data-viewer-status class="text-lg font-medium">Open a document</p>
    <p data-viewer-hint class="mt-2 text-sm text-on-surface-variant">Or drop it on this window. ODT, ODS, ODP, DOCX, XLSX, PPTX, PDF and more.</p>

    <form data-viewer-password hidden class="mt-6 flex w-full max-w-sm flex-col items-center gap-3">
      <label class="sr-only" for="viewer-password">Password</label>
      <input data-viewer-password-input id="viewer-password" type="password" autocomplete="off" spellcheck="false" placeholder="Password" class="w-full rounded-full border border-outline-variant bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary" />
      <div class="flex items-center gap-3">
        <button type="submit" class="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-opacity hover:opacity-90">Open</button>
        <button data-viewer-password-cancel type="button" class="rounded-full border border-outline-variant px-5 py-2.5 text-sm font-medium transition-colors hover:bg-surface-container">Cancel</button>
      </div>
    </form>

    <div data-viewer-actions class="mt-7 flex w-full max-w-xl flex-col items-center gap-6">
      <button data-viewer-pick type="button" class="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary transition-opacity hover:opacity-90">Open a file…</button>

      <div class="flex flex-wrap items-center justify-center gap-2">
        <p class="text-xs text-on-surface-variant">Or start an empty one:</p>
        ${BLANKS.map(
          (b) =>
            `<button data-viewer-blank="${b.ext}" type="button" title="A new, empty ${b.ext.toUpperCase()} file" class="rounded-full border border-outline-variant px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-wide transition-colors hover:bg-surface-container ${tones[b.tone]}">${b.ext}</button>`,
        ).join('')}
      </div>

      <div data-viewer-recents hidden class="w-full text-left">
        <div class="mb-2 flex items-center justify-between px-1">
          <p class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">Recent documents</p>
          <button data-viewer-recents-clear type="button" class="rounded-full px-2 py-0.5 text-xs text-on-surface-variant transition-colors hover:bg-surface-container">Clear</button>
        </div>
        <ul data-viewer-recents-list class="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant"></ul>
      </div>
    </div>
  </div>
</div>`;
}

export function windowMarkup() {
  return `
${bar()}
<main class="min-h-0 flex-1">
  ${panel()}
  <div data-viewer-result hidden class="flex h-full flex-col">
    <div data-viewer-frame-host class="min-h-0 w-full flex-1 bg-surface-container"></div>
    <nav data-viewer-tabs hidden aria-label="Sheets" class="flex shrink-0 gap-0.5 overflow-x-auto border-t border-outline-variant bg-surface-container px-2 py-1"></nav>
  </div>
</main>`;
}

/* The viewer fills the name and the folder as text, never as markup. */
export function recentItem() {
  return `
<li class="group flex items-center bg-surface transition-colors hover:bg-surface-container">
  <button data-viewer-recent-open type="button" class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
    ${icon('file', 'h-4 w-4 shrink-0 text-on-surface-variant')}
    <span class="min-w-0 flex-1">
      <span data-viewer-recent-name class="block truncate text-sm"></span>
      <span data-viewer-recent-path class="block truncate text-xs text-on-surface-variant"></span>
    </span>
  </button>
  <button data-viewer-recent-forget type="button" title="Remove from the list" aria-label="Remove from the list" class="mr-2 hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface group-hover:flex">${icon('close', 'h-3.5 w-3.5')}</button>
</li>`;
}

export function tabButton() {
  return `<button type="button" class="shrink-0 rounded-md px-3 py-1 text-xs transition-colors hover:bg-surface aria-selected:bg-surface aria-selected:font-medium aria-selected:text-primary" role="tab" aria-selected="false"></button>`;
}
