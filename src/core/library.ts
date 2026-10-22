import { decodeDocument, updateDocument, encodeDocument } from "./documents";
export type FileTree = Map<string, Uint8Array>;
export interface Build {
  id: string;
  path: string;
  version: string;
}
export interface Game {
  id: string;
  root: string;
  name: string;
  builds: Build[];
  indexPath?: string;
  images: string[];
  indexCandidates: string[];
}
export interface LibraryModel {
  games: Game[];
}
export const utf8 = (text: string) => new TextEncoder().encode(text);
export function parseVersions(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n|\r/)) {
    const match = /^\s*([a-f\d]{16})\t(.+?)\s*$/i.exec(line);
    if (match) entries.set(match[1].toUpperCase(), match[2]);
  }
  return entries;
}
export function serializeVersions(rows: [string, string][]): Uint8Array {
  const seen = new Set<string>();
  for (const [id, version] of rows) {
    if (
      !/^[a-f\d]{16}$/i.test(id) ||
      seen.has(id.toUpperCase()) ||
      !version.trim() ||
      /[\t\r\n]/.test(version)
    )
      throw new Error("invalidMapping");
    seen.add(id.toUpperCase());
  }
  return utf8(
    rows.map(([id, v]) => `${id.toUpperCase()}\t${v.trim()}`).join("\r\n") +
      (rows.length ? "\r\n" : ""),
  );
}
export function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
export function writeVersions(
  existing: Uint8Array | undefined,
  rows: [string, string][],
): Uint8Array {
  const bytes = serializeVersions(rows);
  if (!existing) return bytes;
  const doc = decodeDocument(existing);
  if (doc.encoding === "unsupported") throw new Error("encodingRequired");
  return encodeDocument(
    updateDocument(
      doc,
      decodeDocument(bytes).text.replace(/\r\n/g, doc.newline),
    ),
  );
}
export function normalizeGamePaths(
  files: FileTree,
  game: Game,
): { files: FileTree; root: string; renamed: string[] } {
  const root = game.root.slice(0, -game.id.length) + game.id,
    next = new Map(files),
    renamed: string[] = [];
  for (const [path, bytes] of files)
    if (path.startsWith(game.root + "/")) {
      let relative = path.slice(game.root.length + 1);
      relative = relative.replace(
        /^cheats\/([a-f\d]{16})\.txt$/i,
        (_, id: string) => `cheats/${id.toUpperCase()}.txt`,
      );
      const destination = root + "/" + relative;
      if (destination !== path) {
        if (files.has(destination)) throw new Error("exists");
        next.delete(path);
        next.set(destination, bytes);
        renamed.push(path, destination);
      }
    }
  return { files: next, root, renamed };
}
export function discoverLibrary(
  files: FileTree,
  overrides: Record<string, string> = {},
): LibraryModel {
  const roots = new Map<string, string>();
  for (const path of files.keys()) {
    const m = /^(.*?)([a-f\d]{15,16})\/(?:cheats\/)?[^/]+$/i.exec(path);
    if (m) roots.set(m[1] + m[2], m[2]);
  }
  const db = new Map<string, string>();
  for (const [path, bytes] of files)
    if (/(^|\/)GAMES\.md$/i.test(path)) {
      for (const line of decodeDocument(bytes).text.split("\n")) {
        const cols = line.split("|").map((x) => x.trim());
        const col = cols.findIndex((x) => /\[([a-f\d]{16})\]/i.test(x));
        if (col > 0) {
          const id = /\[([a-f\d]{16})\]/i.exec(cols[col])![1];
          db.set(id.toUpperCase(), cols[col - 1]);
        }
      }
    }
  const games: Game[] = [];
  for (const [root, id] of roots) {
    const prefix = root + "/",
      direct = [...files.keys()].filter(
        (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"),
      );
    const candidates = direct.filter((p) => /\.txt$/i.test(p));
    const indexPath =
      overrides[root] && candidates.includes(overrides[root])
        ? overrides[root]
        : candidates.length === 1
          ? candidates[0]
          : undefined;
    const mapping = indexPath
      ? parseVersions(decodeDocument(files.get(indexPath)!).text)
      : new Map<string, string>();
    const builds = [...files.keys()].flatMap((path) => {
      const rel = path.slice(prefix.length);
      const m =
        path.startsWith(prefix) && /^cheats\/([a-f\d]{16})\.txt$/i.exec(rel);
      return m
        ? [
            {
              path,
              id: m[1].toUpperCase(),
              version: mapping.get(m[1].toUpperCase()) ?? "",
            },
          ]
        : [];
    });
    builds.sort(
      (a, b) =>
        compareVersions(b.version, a.version) || a.id.localeCompare(b.id),
    );
    games.push({
      root,
      id: id.toUpperCase(),
      name: indexPath
        ? indexPath.slice(prefix.length, -4)
        : (db.get(id.toUpperCase()) ?? id.toUpperCase()),
      builds,
      indexPath,
      indexCandidates: candidates,
      images: direct.filter((p) => /\.(png|jpe?g|gif)$/i.test(p)),
    });
  }
  return { games: games.sort((a, b) => a.name.localeCompare(b.name)) };
}
export function safeName(name: string): string {
  if (
    !name.trim() ||
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error("invalidName");
  return name.trim();
}
export function checkId(id: string, length = 16): string {
  if (!new RegExp(`^[a-f\\d]{${length}}$`, "i").test(id))
    throw new Error("invalidId");
  return id.toUpperCase();
}
export function normalizeImportedTree(
  files: FileTree,
  titleId?: string,
): FileTree {
  if (discoverLibrary(files).games.length) return files;
  const entries = [...files];
  const hasBuilds = entries.some(([p]) =>
    /^(?:cheats\/)?[a-f\d]{16}\.txt$/i.test(p),
  );
  if (!hasBuilds || !titleId) return files;
  const id = checkId(titleId);
  return new Map(
    entries.map(([p, b]) => [
      `${id}/${/^[a-f\d]{16}\.txt$/i.test(p) ? "cheats/" : ""}${p}`,
      b,
    ]),
  );
}
