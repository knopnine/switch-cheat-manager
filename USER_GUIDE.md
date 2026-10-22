# Switch Cheats Manager — User Guide

Use this app to organize, edit, build and export Nintendo Switch cheat files. Your library, edits and recovery data stay on your device. The app edits files; a compatible console cheat tool is responsible for loading them in a game.

## Quick start

1. Open the app. For the current local preview, use `http://127.0.0.1:4173/`.
2. Choose **Open folder** in a supported desktop browser, or **Import ZIP**, **Import folder** or **Import files**.
3. Select a game in **Library**, then select its version/Build ID in **Builds**.
4. Edit the code or use the **Outline** to navigate and change enabled markers.
5. Click **Save changes**, review every affected file, and confirm.
6. If you imported files or a ZIP, use **Export game**, **Export library** or **Download file** to obtain files you can copy elsewhere. Saving an imported workspace does not update the original download.

**The most important distinction:** edits are staged until you confirm Save changes. Recovery drafts are separate from saving to a source folder. Exports include your current staged edits, even before Save changes.

## Choose how to open a library

| Action            | Use it for                                                                              | Where changes go                                               |
| ----------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Open folder**   | Editing an existing local library or an SD-card folder in supported desktop Chrome/Edge | Back to the selected folder, after Save changes and permission |
| **Import folder** | Loading a folder through the file-import fallback                                       | A browser workspace; export your result afterward              |
| **Import ZIP**    | Loading a downloaded archive or a ZIP you created earlier                               | A browser workspace; the original ZIP remains unchanged        |
| **Import files**  | Loading selected files, including individual Build ID text files                        | A browser workspace; a bare cheat file needs its Title ID      |
| **New workspace** | Starting a library from scratch                                                         | A browser workspace; create a game, save locally and export    |

If **Open folder** is unavailable, use the import options. An installed PWA has the same file-access restrictions as its browser.

You can open a library containing many game folders, a single Title ID folder, or its `cheats` folder. When opening just `cheats`, the app asks for the Title ID because the browser does not expose its parent directory.

Opening another library replaces the current workspace. Export work you want to keep first. The app does not automatically merge two imported libraries.

## Understand Title ID, Build ID and versions

| Term               | Meaning in this app                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Title ID / TID** | Identifies the game/title. Different releases or regions can have different IDs. New games require 16 hexadecimal characters. |
| **Build ID / BID** | Identifies the executable build a cheat file belongs to. Build filenames require 16 hexadecimal characters.                   |
| **Version**        | A readable label such as `1.3.0`, associated with a Build ID in the local version index.                                      |

Use cheats matching your game's actual Title ID and Build ID. A matching game name or version label alone is insufficient. Renaming a Build ID file or changing its version label does not adapt its memory addresses to another game update.

The app does not inspect the console or determine installed game IDs. Obtain them from your existing library or console tools.

Expected layout, using illustrative IDs:

```text
library/
  0100000000000001/
    Example Game.txt
    Example Game.jpg
    cheats/
      AAAAAAAAAAAAAAAA.txt
      BBBBBBBBBBBBBBBB.txt
```

The image is optional. The game-name text file is a version index, not a cheat file:

```text
AAAAAAAAAAAAAAAA	1.0.0
BBBBBBBBBBBBBBBB	1.1.0
```

Each row uses an actual **Tab** between the Build ID and the version. Other files in the game folder are preserved in game/library exports. Legacy 15-character Title ID folders can be imported; new Title IDs require 16 characters.

## Edit cheats and use the outline

Select a game and Build ID, then edit its text in **Editor**. An asterisk beside the filename indicates that document has unsaved edits. **Pending changes** counts affected files across the workspace, not the number of characters or cheats you changed.

The **Outline** lists recognized title, master, cheat and section headers:

- Click a name to move the editor to that location.
- Check a cheat to add `:ENABLED` to that specific header; uncheck it to remove the suffix.
- Use **Add section** to append a compatible subsection block to the document.
- Use **Rename** beside a section to rename its matching start/end pair.
- Use **Hide outline** to give the editor more room.

An enabled marker is a file convention for compatible overlays. Checking it does not activate a cheat on a connected console. The app does not connect to or control the console.

Existing comments, Unicode titles and unrecognized instructions remain editable. UTF-8 and UTF-16 files retain their supported encoding, BOM and existing line endings. New files use UTF-8 without a BOM and Windows-style CRLF line endings.

For an unsupported encoding, the editor is read-only until you choose **Convert encoding**, inspect the preview and confirm conversion to UTF-8.

Useful editor shortcuts:

| Shortcut                       | Action                                      |
| ------------------------------ | ------------------------------------------- |
| `Ctrl+F` / `Cmd+F`             | Search the editor                           |
| `Ctrl+Z` / `Cmd+Z`             | Undo text edits                             |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo text edits                             |
| `Tab`                          | Indent within the editor                    |
| `Escape`                       | Close a dialog when no operation is running |

Use the app's **Save changes** button for saving. Do not rely on the browser's Save Page command to save cheat files. Editor undo does not undo game/build deletion or other staged library operations; **Discard changes** resets all pending file edits and operations to the last saved state.

## Save, export and copy to an SD card

### Save changes

1. Click **Save changes** in the header.
2. Review the complete list of created, replaced and deleted files, plus any syntax or compatibility warnings.
3. Confirm **Apply changes** for a directly opened folder, or **Save changes** for an imported browser workspace.

This commits all listed pending changes, not just the selected build. Saving an imported workspace stores it in this browser; it does not replace the original files or ZIP on disk.

### Download and export

| Action                            | Result                                                                   |
| --------------------------------- | ------------------------------------------------------------------------ |
| **Download file**                 | The currently selected cheat file, including current edits               |
| **Export game**                   | A ZIP containing the selected Title ID directory and all its files       |
| **Export library**                | A ZIP of the current workspace, preserving its imported directory layout |
| **Settings → Download workspace** | A library ZIP, also useful for keeping a portable backup                 |

Exports include staged changes and do not themselves mark those changes as saved. Inspect the ZIP structure before extracting it: imported archives may contain wrapper directories such as `contents` or a repository name.

### Copy directly to an Atmosphère output folder

1. Connect the SD card or select another accessible destination drive.
2. Click **Choose output** and select the directory that should directly contain Title ID folders—normally `atmosphere/contents` on the card.
3. Choose **Copy file to output** for the current cheat, or **Copy game to output** for the selected game's entire folder.
4. Review the affected paths and confirm.

The app appends `<TitleID>/cheats/<BuildID>.txt` beneath the chosen output folder. It does not automatically find or add `atmosphere/contents`, so selecting the SD-card root would put the Title ID folder in the wrong place for that layout.

Copying a game replaces matching files and keeps unrelated destination files. Copying uses current edits, but does not commit pending source-library changes. For import/download mode, export the ZIP and manually copy its Title ID folders into the intended destination.

## Create and manage games, builds and metadata

**New game:** Enter the game name, Title ID, initial Build ID and version. The app stages a game directory, version index and initial cheat file. The initial file has a title header; add the actual cheat contents in Editor.

**New build:** Select a game, enter the new Build ID and version, and stage the change. The new build gets its own file and version-index entry.

**Rename build:** Update the Build ID and/or version label. The file and corresponding index entry change together. This is file management, not automatic conversion of the codes to another update.

**Delete build:** Review the filename. Confirming stages deletion and removes that build's version mapping. Save changes is still required to apply it.

The **Settings** disclosure beside the selected game's heading contains game actions; it is separate from the main Settings tab:

- **Rename game** renames its game-name metadata file while preserving its contents.
- **Edit mappings** opens the tab-separated Build ID/version index. IDs must be unique; different IDs may share a version label. Emptying the field removes all mappings, not the cheat files.
- **Attach image** stages PNG, JPEG or GIF files in the game directory. Existing names are not silently overwritten.
- **Format all builds** previews formatting for the current build and stages formatting for every build of this game. The displayed count states the scope; the preview does not show every file.
- **Delete game** lists all affected files, including images and unrecognized resources. Review carefully before staging and saving.

If multiple game-root `.txt` files make the version index ambiguous, select the intended **Metadata file** first.

## Format code and normalize IDs

**Format** previews formatting for the selected build. It uppercases instruction words and normalizes spacing. Names, Unicode text and comment order are retained. Confirm **Stage changes**, inspect the editor and Save changes when ready.

**Normalize IDs** stages uppercase Title ID directory names and Build ID filenames. It does not change the identity or meaning of an ID.

For a directly opened folder, the app refuses case-only path renames that the browser cannot apply safely. Use **Export library** or **Export game** to obtain the normalized paths and replace them manually, or **Discard changes** to retain the original paths and continue editing in place.

## Compare two builds

1. Select a game with at least two builds.
2. Open **Compare**.
3. Select **Left build** and **Right build**.
4. Read the highlighted changed text, added lines and removed lines.

Comparison uses the current workspace contents, including staged edits. It is read-only and does not merge changes. To change a file, return to Editor. Comparing differences cannot determine whether addresses remain valid between updates.

## Build instruction codes

Open **Builder** and select an operation family. Inputs labelled `(hex)` expect hexadecimal values; they are not decimal quantities. Registers range from `0` to `F`. Width selections are 8/16/32/64 bits; memory-region choices are Main NSO, Heap, Alias and ASLR where applicable.

| Family | Panel                         | Purpose                                                                   |
| ------ | ----------------------------- | ------------------------------------------------------------------------- |
| `0`    | Static memory write           | Write a value using a memory region, address/offset and register          |
| `1`    | Memory conditional            | Compare memory with a static value                                        |
| `2`    | End / Else                    | Generate an End or Else conditional marker                                |
| `3`    | Loop                          | Generate a loop start/count or loop end for a register                    |
| `4`    | Load static register          | Load a 64-bit value into a register                                       |
| `5`    | Load memory register          | Load a register from a region address or register-relative address        |
| `6`    | Store static through register | Store a value through a register, with optional increment/offset settings |
| `7`    | Legacy arithmetic             | Generate legacy register arithmetic                                       |
| `8`    | Button activator              | Combine selected buttons/directions into a button mask                    |
| `9`    | Register arithmetic           | Apply arithmetic/logic with register or immediate operands                |
| `A`    | Store register to memory      | Store a register using the selected addressing mode                       |

Workflow:

1. Fill the fields for the chosen family.
2. Check **Generated instruction**. Invalid or oversized fields show an error and disable **Add instruction**.
3. Click **Add instruction** to append it to **Output buffer**. Repeat as needed.
4. Use **Copy output** to copy the buffer, or **Insert into editor** to append it to the currently selected build and return to Editor.
5. Put the generated instructions under the appropriate cheat header and position conditionals/loops correctly. Insert into editor appends to the file; it does not insert at the cursor or choose a cheat block for you.
6. Review and Save changes, or download the edited file.

Create/select a build before inserting into Editor. **Clear output** empties the builder buffer. The builder constructs text for the listed families; it does not discover memory addresses, execute codes, create working cheats automatically or cover every newer opcode family.

## Use the number tools

In **Builder → Number tools**:

- Enter a value and select **Hexadecimal** or **Decimal** as its input base.
- Leave **Unsigned 64-bit** selected for values from `0` to `18446744073709551615`; check **Signed 64-bit** for values from `-9223372036854775808` to `9223372036854775807`.
- Click **Convert** to show both representations. For example, hexadecimal `FF` is decimal `255`. With signed interpretation, hexadecimal `FFFFFFFFFFFFFFFF` is decimal `-1`.
- The separate calculator takes two hexadecimal operands and performs addition, subtraction or multiplication. Results are exact integers; a result outside the supported 64-bit bounds is identified instead of silently losing precision.

The width of an individual generated instruction can be smaller than 64 bits. A successful number conversion does not mean the value fits an 8-bit builder field.

## Settings, recovery and offline use

The main **Settings** tab contains interface language, theme, preferred image language and four header/section highlight colors. Image-language preference chooses among filenames already present; it does not download covers or translate games.

Recovery drafts are saved automatically in browser storage. **Drafts recovered** means a previous workspace was restored. Reopened source/output folders may require permission again. Browser storage can be cleared, evicted or unavailable; regularly export important work.

Before destructive writes, the app attempts a local recovery backup. **Download latest backup** downloads the most recent affected-file snapshot. This is not necessarily a full library, and newly created files have no previous bytes to include. Keep a full Export library backup when you need one.

If recovery storage fails, the app requires a backup download and a separate **Backup saved — apply changes** confirmation before continuing. Cancel if the download was blocked or canceled. If an imported workspace still cannot be saved in browser storage, its edits remain pending so you can export them.

**Clear local data** removes this browser's workspace, drafts, backups and preferences. It does not delete source-folder files.

For offline/PWA use, first load the production app from localhost or HTTPS and wait for **Offline ready**. Use **Install app** when the browser offers it. **Update app** saves recovery data before requesting an application update; it does not save pending edits to the source folder. The Node development server is for development; the production/offline build is started with `npm run build` followed by `npm run preview`.

## Troubleshooting

| What you see                        | What to do                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No matching games                   | Clear the search, or search by the actual Title ID.                                                                                                                                                                      |
| No games after import               | Check for Title ID directories containing `cheats/<BuildID>.txt`. For a repository archive, import the relevant extracted folders.                                                                                       |
| Folder permission denied            | Reopen the folder and grant permission, or use import/download mode.                                                                                                                                                     |
| Folder/file unavailable             | Reconnect the device and reopen it. Export current edits before discarding the workspace.                                                                                                                                |
| External changes detected           | Download your edit, compare versions, or reload the external file. Reloading replaces that file's local pending edits.                                                                                                   |
| Some writes failed                  | Completed writes remain applied; remaining source changes stay pending. Reconnect/fix the issue and review again. For an output copy, repeat the copy action to reload the destination and review remaining differences. |
| Recovery could not be saved         | Download the current workspace before closing. Saving to a directly opened folder and saving browser recovery data are separate operations.                                                                              |
| Import limit reached                | Use fewer files/games: up to 5,000 files, 32 MiB per file and 128 MiB total.                                                                                                                                             |
| Duplicate or case-conflicting paths | Remove ambiguous duplicates from the imported archive/folder before retrying.                                                                                                                                            |
| Syntax warnings                     | Inspect the indicated line. The 64-line/32-KiB notices are legacy compatibility warnings; passing checks does not prove a cheat works.                                                                                   |
| Insert into editor is disabled      | Open a library and select a build first; unsupported text encoding must be converted before editing.                                                                                                                     |

## Online cheat databases: what is supported?

The original **solleo1989/SwitchCheatCodeManager** implementation inspected for this port reads a local `GAMES.md` for game-name recognition. I found no connected online cheat-search, database-download or automatic-update workflow in that source. Its FTP helper only lists directory details and is not wired into the interface.

Other tools do provide online updates. **Switch Cheats Updater** describes downloading cheats for installed games and directs users to **AIO Switch Updater** as its replacement. These are separate projects.

The web app currently supports **manual import** of externally downloaded cheats. It does not automatically search or fetch a database.

A practical manual workflow:

1. Visit the [switch-cheats-db repository](https://github.com/HamletDuFromage/switch-cheats-db) and its [release downloads](https://github.com/HamletDuFromage/switch-cheats-db/releases/latest).
2. Its README lists `contents.zip` for gameplay cheats in the Atmosphère layout and `contents_complete.zip` for gameplay plus graphics codes. `titles.zip` is the legacy layout. Check the selected release's date and assets rather than assuming a particular update frequency.
3. Download and extract the archive. A complete database may exceed this app's 5,000-file or size limits; put only the Title ID folders you need into a smaller local library.
4. Use **Open folder** or **Import folder** for that extracted library, or import a smaller ZIP you made from it.
5. Select cheats matching the game's actual Title ID and Build ID. Compare changes and back up custom edits before replacing existing codes.
6. Export/copy the intended files using the workflows above.

Adding online search/download inside this app would be an additional feature. It is not part of the current manual-import workflow.

## References

- [Original manager source: local GAMES.md loader](https://github.com/solleo1989/SwitchCheatCodeManager/blob/8dcfae8af324b07da823b480bff5ddecc40c17b9/SwitchCheatCodeManager/Helper/ActionHelper.cs#L98-L126).
- [Original manager FTP helper](https://github.com/solleo1989/SwitchCheatCodeManager/blob/8dcfae8af324b07da823b480bff5ddecc40c17b9/SwitchCheatCodeManager/Model/FtpUtility.cs).
- [Switch Cheats Updater](https://github.com/HamletDuFromage/switch-cheats-updater).
- [AIO Switch Updater](https://github.com/HamletDuFromage/aio-switch-updater).
- [switch-cheats-db](https://github.com/HamletDuFromage/switch-cheats-db).

Source/database references checked on October 21, 2026. This guide describes the implemented web app, not a claim that any particular cheat works on a game or console.
