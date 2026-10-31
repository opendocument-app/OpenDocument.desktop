/*
  The one interface between the user interface and the core. The viewer calls
  only this, so the engine behind it can change: today the WebAssembly build
  in a worker, later perhaps the native core as a sidecar process.

  Every call is async, because no engine answers on the main thread.
*/
import type {
  EnumTables,
  FileTypeInfo,
  HtmlConfig,
  OpenOptions,
  PdfPermissions,
  Recalculation,
  Rendered,
  View,
} from '@opendocument/odr-core';

export type {
  EnumTables,
  FileTypeInfo,
  HtmlConfig,
  OpenOptions,
  PdfPermissions,
  Recalculation,
  Rendered,
  View,
};

/** An error of the engine. `name` is the C++ exception type, such as `WrongPassword`. */
export class EngineError extends Error {
  constructor(
    name: string,
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = name;
  }
}

export interface Backend {
  /** Starts the engine. The other calls wait for it. */
  load(): Promise<void>;
  /** The version of the engine. */
  version(): string;
  enums(): EnumTables;
  fileTypes(): FileTypeInfo[];
  /** The types that the bytes can be, the most specific last. */
  detect(bytes: Uint8Array): Promise<number[]>;
  /** Takes the bytes: the caller must not use them after the call. */
  open(bytes: Uint8Array, options: OpenOptions): Promise<OpenDocument>;
  create(fileType: number, config: HtmlConfig): Promise<OpenDocument>;
}

/** A document that the engine holds open. */
export interface OpenDocument {
  readonly fileType: number;
  isPasswordEncrypted(): Promise<boolean>;
  /** Throws `WrongPassword` for a wrong password. */
  decrypt(password: string): Promise<void>;
  /** What the document is now: after a decrypt, the type inside. Has
      `documentType`, such as `spreadsheet`, for a document file. */
  meta(): Promise<Record<string, unknown>>;
  isEditable(): Promise<boolean>;
  isSavable(encrypted: boolean): Promise<boolean>;
  isAnnotatable(): Promise<boolean>;
  permissions(): Promise<PdfPermissions | null>;
  listViews(): Promise<View[]>;
  render(index: number): Promise<Rendered>;
  /** Applies the operation log of the rendered page, a JSON string. */
  edit(operations: string): Promise<void>;
  recalculate(): Promise<Recalculation>;
  save(password?: string): Promise<Uint8Array>;
  /** The pdf with the marks of the rendered page, a JSON string. */
  annotate(annotations: string): Promise<Uint8Array>;
  close(): Promise<void>;
}
