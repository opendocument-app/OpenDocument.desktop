/*
  Runs the WebAssembly core off the main thread. A large pdf takes seconds to
  render, and the window must stay responsive meanwhile.

  The worker holds the open documents by a number. The main thread sends
  `{id, op, ...}` and gets `{id, ok, result}` or `{id, ok: false, error}`.
*/
/// <reference lib="webworker" />

// Imported by URL, from the copy that `scripts/sync-odr.mjs` makes. The glue
// finds `odr-core.wasm` beside itself.
const ODR_ENTRY = `/odr/${__ODR_VERSION__}/index.js`;

/** The calls that a document takes over the worker boundary. */
const DOCUMENT_CALLS = new Set([
  'isPasswordEncrypted',
  'decrypt',
  'meta',
  'isEditable',
  'isSavable',
  'isAnnotatable',
  'permissions',
  'listViews',
  'render',
  'edit',
  'recalculate',
  'save',
  'annotate',
]);

let odr: any = null;
const documents = new Map<number, any>();
let nextHandle = 1;

function keep(document: any) {
  const handle = nextHandle++;
  documents.set(handle, document);
  return { handle, fileType: document.fileType as number };
}

async function run(message: any): Promise<unknown> {
  switch (message.op) {
    case 'load': {
      if (!odr) {
        const module = await import(/* @vite-ignore */ new URL(ODR_ENTRY, self.location.origin).href);
        odr = await module.Odr.load();
      }
      return { version: odr.version(), enums: odr.enums, fileTypes: odr.fileTypes() };
    }
    case 'detect':
      return odr.detect(message.bytes).fileTypes;
    case 'open':
      return keep(odr.open(message.bytes, message.options));
    case 'create':
      return keep(odr.create(message.fileType, message.config));
    case 'close': {
      documents.get(message.handle)?.close();
      documents.delete(message.handle);
      return undefined;
    }
    case 'call': {
      const document = documents.get(message.handle);
      if (!document) throw Object.assign(new Error('The document is closed.'), { name: 'Closed' });
      if (!DOCUMENT_CALLS.has(message.method)) throw new Error(`No call ${message.method}.`);
      const result = document[message.method](...message.args);
      // A call that returns the document itself has nothing to send back.
      return result === document ? undefined : result;
    }
    default:
      throw new Error(`No operation ${message.op}.`);
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { id } = event.data;
  try {
    const result = await run(event.data);
    const transfer: Transferable[] = [];
    if (result instanceof Uint8Array) transfer.push(result.buffer as ArrayBuffer);
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (e: any) {
    self.postMessage({
      id,
      ok: false,
      error: { name: e?.name ?? 'Error', message: e?.message ?? String(e), code: e?.code },
    });
  }
};
