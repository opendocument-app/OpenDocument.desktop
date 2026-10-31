# OpenDocument Reader for desktop

OpenDocument Reader for Windows, macOS and Linux. It opens OpenDocument,
Microsoft Office, PDF, Apple iWork and many other files, and it edits and saves
the formats that [OpenDocument.core](https://github.com/opendocument-app/OpenDocument.core)
can write. The documents stay on the computer.

The app is a [Tauri 2](https://tauri.app) shell around the WebAssembly build of
the core, [`@opendocument/odr-core`](https://www.npmjs.com/package/@opendocument/odr-core).
The website demo at <https://opendocument.app/tryit> uses the same build.

## Build

You need Node 22 (`.nvmrc`), a stable Rust toolchain, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) of your system.

```sh
npm install
npm run tauri dev     # starts the app with hot reload
npm run tauri build   # writes the installers to src-tauri/target/release/bundle/
```

`npm run check` type-checks the frontend. After a build,
`node test/smoke.mjs src-tauri/target/release/opendocument-desktop` opens each
document in `test/documents/` in the app and saves a copy.

## Layout

| Path | What |
|---|---|
| `src/` | the frontend: TypeScript, Vite and Tailwind |
| `src-tauri/` | the Rust shell: windows, menus, file access, bundling |
| `scripts/sync-odr.mjs` | copies the core from `node_modules` into `public/odr/` |
| `test/` | the smoke test and its documents |

[`AGENTS.md`](AGENTS.md) describes the architecture and the rules.

## License

[Mozilla Public License 2.0](LICENSE).
