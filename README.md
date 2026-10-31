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

## Release

1. In a pull request, set the version in `package.json` (`npm version --no-git-tag-version 0.2.0`),
   and change the `Unreleased` heading of `CHANGELOG.md` to that version.
2. Run the `release` workflow with that version. `dry_run` builds only.
3. The workflow writes a draft release with the installers for macOS (universal),
   Windows (x64) and Linux (x64 and arm64). Publishing the draft writes the tag.

The macOS build is signed with Developer ID and notarized if the repository has
the secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER`, `APPLE_API_KEY` and
`APPLE_API_KEY_CONTENT`. Without them, it is signed ad hoc, and macOS asks the
user to confirm the first start. The Windows build is not signed.

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
