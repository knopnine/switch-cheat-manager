# Switch Cheats Manager — Web

A local-first browser/PWA port of [solleo1989/SwitchCheatCodeManager](https://github.com/solleo1989/SwitchCheatCodeManager). Files are processed on your device. No account, telemetry, cloud storage or runtime CDN is used.

Web app source: [knopnine/switch-cheat-manager](https://github.com/knopnine/switch-cheat-manager).

## User documentation

Read [the full user guide](USER_GUIDE.md) for opening libraries, editing/saving, exports and SD-card output, game/build management, formatting, comparison, all eleven builder panels, number tools, recovery and troubleshooting. The production app has a **User guide** link in its header; that HTML edition is available offline after caching. The guide also explains online database support and the current manual-download/import workflow.

For the current local preview, open [the guide](http://127.0.0.1:4173/user-guide.html). Run `npm run build` to regenerate the HTML guide and include both editions in the source distribution. External database sites require an internet connection; reading the cached guide does not.

## Run

Use Node.js 22.12+ (Node 24 is recommended).

```sh
npm ci
npm run dev
```

Open the printed localhost URL. For the production/offline build:

```sh
npm run build
npm run preview
```

The PWA requires localhost or HTTPS. Offline support becomes available after the production service worker caches the app. Browser installation is exposed when supported. Updates require an explicit click and first save recovery data.

## Files and workflow

- Open a directory in desktop Chrome/Edge, or import a folder/files/ZIP in other browsers.
- Libraries use `<TitleID>/cheats/<BuildID>.txt`, with optional `<TitleID>/Game Name.txt` tab-separated Build ID/version mappings, images, and library-root `GAMES.md`.
- Opening a game directory or its `cheats` directory is supported; the latter needs a Title ID because browsers do not expose its parent.
- Edits, enabled toggles, formatting and structural changes are staged. **Save changes** shows all pending operations before applying them. Imported workspaces save locally; use **Export library** to obtain a portable ZIP.
- Source and destination folders are independent. Copying a game merges all its files and preserves unrelated destination content. Exports include the current edits.
- Recovery drafts, preferences and up to ten operation backups use IndexedDB. Browser data may be cleared/evicted. Export important work regularly. Backups can be downloaded in Settings; a backup includes affected paths, not a full-library snapshot.
- **Normalize IDs** stages uppercase Title ID directories and Build ID filenames. Case-only renames on a native directory require ZIP export and manual replacement; the app refuses ambiguous browser filesystem writes. Discard staged changes to return to the original paths.
- Conflict checks stop overwrites of externally changed files. Compare, export your edit, or reload the external file. Interrupted operations report completed files and retain the remainder as pending. Multi-file writes are not atomic.
- Import limits: 5,000 files, 32 MiB per file and 128 MiB total; unsafe and case-conflicting paths are rejected.

## Compatibility

The reference is downloadable v1.1.0 and main source revision `8dcfae8af324b07da823b480bff5ddecc40c17b9`. The v1.1.0 source tag predates features present in the downloadable DLL. See `investigation/PORT-REPORT.txt` for evidence; investigation artifacts are excluded from the application build.

The web engine preserves untouched files byte-for-byte, retains UTF-8/UTF-16 BOMs and line endings when editing, and requires explicit conversion of unsupported encodings. Formatting normalizes instruction words without transliterating names, relocating comments or inventing empty headers. New files use UTF-8/CRLF. Legacy 15-character Title IDs load; new IDs require 16 characters.

Intentional fixes include valid End/Else output, hexadecimal registers A–F, complete line comparisons, explicit destructive changes, range validation, pre-write compatibility warnings and export of current edits. The 64-line/32-KiB warnings reflect legacy compatibility checks, not proof of a console limit. Validation cannot prove that codes are correct for a game. Unknown instructions remain editable. The builder covers families 0–9 and A; it is not a full modern cheat assembler.

Automatic drive enumeration, operating-system folder launching and FTP are excluded from this browser release. Native folder behavior depends on browser support and permissions; Firefox/Safari use import and download fallback.

## Verification

The implementation has automated coverage for byte preservation, opcode fixtures, storage conflicts, partial writes, recovery exhaustion, permission errors, localization, themes, keyboard dialogs and narrow layouts. Chromium, Microsoft Edge and Playwright WebKit run on this Windows host. The downloaded Firefox executable fails at process launch (`spawn UNKNOWN`), so Firefox acceptance remains unverified here. WebKit coverage is not a claim of testing the Safari application on Apple hardware. Real file-picker/SD-card acceptance remains a manual check.

```sh
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

Browser tests exercise the virtual import/export workflow, editing, bilingual settings and offline recovery. Directory adapter tests use a controlled filesystem double for conflicts, permissions and interrupted writes. Real picker/SD-card checks are manual: use a disposable library, save a file, edit it externally to check conflict handling, deny/revoke permission, remove/reconnect the device, and copy to an output folder containing unrelated files. Do not infer physical-device acceptance from automated tests.

## License and attribution

GPL-3.0-only; see LICENSE and ATTRIBUTION.md. This port derives behavior and opcode layouts from SwitchCheatCodeManager by solleo1989 and its contributors. It has no Nintendo affiliation. Code dependencies retain their own licenses in the lockfile/package distributions.
