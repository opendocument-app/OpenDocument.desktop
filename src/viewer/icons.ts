/* Stroke icons, from the website (`src/components/Icon.astro`). */
export const ICONS = {
  lock: 'M5 11V8a7 7 0 0 1 14 0v3M5 11h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35',
  pencil: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM17 21v-8H7v8M7 3v5h8',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8Z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  close: 'M18 6 6 18M6 6l12 12',
  chevron: 'm6 9 6 6 6-6',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
  redo: 'M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13',
  highlighter: 'm9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4l8 8Z',
  underline: 'M7 3v6a5 5 0 0 0 10 0V3M4 20h16',
  strike: 'M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16',
  squiggle: 'M7 3v6a5 5 0 0 0 10 0V3M3 20c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0',
  scribble: 'M3 17c2-4 4.5-9 6.5-8.5S8 16 10.5 16.5 15 10 17 10.5 15 17 21 15',
  alignLeft: 'M21 6H3M15 12H3M17 18H3',
  alignCenter: 'M21 6H3M17 12H7M19 18H5',
  alignRight: 'M21 6H3M21 12H9M21 18H7',
  alignJustify: 'M3 6h18M3 12h18M3 18h18',
  fill: 'm19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11ZM5 2l5 5M2 13h15M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z',
  rowAbove: 'M3 14h18v6H3zM12 3v7M8.5 6.5h7',
  rowBelow: 'M3 4h18v6H3zM12 14v7M8.5 17.5h7',
  rowDelete: 'M3 8h18v8H3zM10 10l4 4M14 10l-4 4',
  columnLeft: 'M14 3h6v18h-6zM3 12h7M6.5 8.5v7',
  columnRight: 'M4 3h6v18H4zM14 12h7M17.5 8.5v7',
  columnDelete: 'M8 3h8v18H8zM10 10l4 4M14 10l-4 4',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, className = 'h-4 w-4') {
  return `<svg viewBox="0 0 24 24" class="${className}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;
}

/* The launcher icon as a vector, from the website (`src/components/Logo.astro`). */
export function logo(className = 'h-9 w-9') {
  return `<svg viewBox="0 0 48 48" class="${className}" aria-hidden="true" fill="none">
  <rect x="5" y="14" width="24" height="29" rx="2.5" fill="var(--brand-slide)" />
  <rect x="10" y="10" width="25" height="30" rx="2.5" fill="var(--brand-sheet)" />
  <path d="M17.5 5h13.1L40 14.2v20.3A2.5 2.5 0 0 1 37.5 37h-20A2.5 2.5 0 0 1 15 34.5v-27A2.5 2.5 0 0 1 17.5 5Z" fill="var(--brand-text)" />
  <path d="M27.5 5h3.1L40 14.2v20.3A2.5 2.5 0 0 1 37.5 37h-10V5Z" fill="#42a0d0" />
  <path d="M30.6 5 40 14.2h-7a2.4 2.4 0 0 1-2.4-2.4V5Z" fill="#a9bac7" />
  <g fill="#fff"><rect x="19.5" y="24.5" width="16" height="2.1" rx="1.05" /><rect x="19.5" y="29" width="16" height="2.1" rx="1.05" /></g>
  <text x="27.5" y="21" text-anchor="middle" fill="#fff" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" letter-spacing="-0.3">ODR</text>
</svg>`;
}
