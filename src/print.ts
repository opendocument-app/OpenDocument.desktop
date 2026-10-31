/*
  The print window. It takes the markup that the document window gave the
  shell, makes it this page, and opens the print dialog. On macOS, Tauri
  replaces `window.print` with the native print of the web view.

  The markup has no scripts: the document window removed them.
*/
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface PrintJob {
  title: string;
  html: string;
}

const job = await invoke<PrintJob | null>('take_print');
if (job) {
  document.open();
  document.write(job.html);
  document.close();
  document.title = job.title;
  await getCurrentWindow().setTitle(`Print — ${job.title}`);
  // Images and fonts are inline, but they decode after the parse.
  await document.fonts.ready;
  await new Promise((resolve) => setTimeout(resolve, 300));
  window.print();
}
