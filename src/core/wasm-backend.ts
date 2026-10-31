/*
  The `Backend` over the WebAssembly core in a worker. See `wasm-worker.ts`.
*/
import {
  EngineError,
  type Backend,
  type EnumTables,
  type FileTypeInfo,
  type HtmlConfig,
  type OpenDocument,
  type OpenOptions,
} from './backend';

export class WasmBackend implements Backend {
  private worker: Worker | null = null;
  private calls = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private nextCall = 1;
  private loading: Promise<void> | null = null;
  private info: { version: string; enums: EnumTables; fileTypes: FileTypeInfo[] } | null = null;

  private start() {
    const worker = new Worker(new URL('./wasm-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent) => {
      const { id, ok, result, error } = event.data;
      const call = this.calls.get(id);
      this.calls.delete(id);
      if (!call) return;
      if (ok) call.resolve(result);
      else call.reject(new EngineError(error.name, error.message, error.code));
    };
    worker.onerror = (event) => {
      // A worker that fails to start answers nothing. Fail every open call.
      const error = new EngineError('WorkerError', event.message || 'The engine stopped.');
      for (const call of this.calls.values()) call.reject(error);
      this.calls.clear();
    };
    return worker;
  }

  call<T>(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
    this.worker ??= this.start();
    const id = this.nextCall++;
    return new Promise<T>((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
      this.worker!.postMessage({ ...message, id }, transfer);
    });
  }

  load(): Promise<void> {
    this.loading ??= this.call<typeof this.info>({ op: 'load' }).then(
      (info) => {
        this.info = info;
      },
      (e) => {
        // A failed start can be tried again.
        this.loading = null;
        throw e;
      },
    );
    return this.loading;
  }

  private loaded() {
    if (!this.info) throw new Error('The engine is not loaded.');
    return this.info;
  }

  version() {
    return this.loaded().version;
  }

  enums() {
    return this.loaded().enums;
  }

  fileTypes() {
    return this.loaded().fileTypes;
  }

  detect(bytes: Uint8Array) {
    // A copy, because the caller keeps its bytes.
    return this.call<number[]>({ op: 'detect', bytes: bytes.slice() });
  }

  async open(bytes: Uint8Array, options: OpenOptions): Promise<OpenDocument> {
    const { handle, fileType } = await this.call<{ handle: number; fileType: number }>(
      { op: 'open', bytes, options },
      [bytes.buffer as ArrayBuffer],
    );
    return new WasmDocument(this, handle, fileType);
  }

  async create(fileType: number, config: HtmlConfig): Promise<OpenDocument> {
    const created = await this.call<{ handle: number; fileType: number }>({ op: 'create', fileType, config });
    return new WasmDocument(this, created.handle, created.fileType);
  }
}

class WasmDocument implements OpenDocument {
  constructor(
    private backend: WasmBackend,
    private handle: number,
    readonly fileType: number,
  ) {}

  private call<T>(method: string, ...args: unknown[]) {
    return this.backend.call<T>({ op: 'call', handle: this.handle, method, args });
  }

  isPasswordEncrypted() {
    return this.call<boolean>('isPasswordEncrypted');
  }
  decrypt(password: string) {
    return this.call<void>('decrypt', password);
  }
  meta() {
    return this.call<Record<string, unknown>>('meta');
  }
  isEditable() {
    return this.call<boolean>('isEditable');
  }
  isSavable(encrypted: boolean) {
    return this.call<boolean>('isSavable', encrypted);
  }
  isAnnotatable() {
    return this.call<boolean>('isAnnotatable');
  }
  permissions() {
    return this.call<any>('permissions');
  }
  listViews() {
    return this.call<any[]>('listViews');
  }
  render(index: number) {
    return this.call<any>('render', index);
  }
  edit(operations: string) {
    return this.call<void>('edit', operations);
  }
  recalculate() {
    return this.call<any>('recalculate');
  }
  save(password?: string) {
    return password === undefined ? this.call<Uint8Array>('save') : this.call<Uint8Array>('save', password);
  }
  annotate(annotations: string) {
    return this.call<Uint8Array>('annotate', annotations);
  }
  close() {
    return this.backend.call<void>({ op: 'close', handle: this.handle });
  }
}
