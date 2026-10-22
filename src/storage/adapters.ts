import { unzipSync, zipSync } from "fflate";
import type { FileTree } from "../core/library";
import { captureBackup } from "./persistence";
export interface DirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(options: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;
  requestPermission(options: {
    mode: "read" | "readwrite";
  }): Promise<PermissionState>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
      id?: string;
    }) => Promise<DirectoryHandle>;
  }
}
export interface FileChange {
  path: string;
  bytes: Uint8Array | null;
  expected: string | null;
}
export interface ChangeSet {
  operations: FileChange[];
}
export interface ApplyResult {
  completed: string[];
  failed?: { path: string; code: string };
}
export interface StorageAdapter {
  name: string;
  capabilities: { direct: boolean };
  load(): Promise<FileTree>;
  apply(changes: ChangeSet): Promise<ApplyResult>;
}
const MAX_BYTES = 128 * 1024 * 1024,
  MAX_FILE = 32 * 1024 * 1024,
  MAX_FILES = 5000;
export function safePath(path: string): string {
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[<>:"|?*\x00-\x1f]/.test(p) ||
          /[. ]$/.test(p) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
      )
  )
    throw new Error("unsafePath");
  return path;
}
export function validateTree(files: FileTree): void {
  let size = 0;
  const names = new Set<string>();
  if (files.size > MAX_FILES) throw new Error("archiveLimit");
  for (const [path, bytes] of files) {
    safePath(path);
    const key = path.toLowerCase();
    if (names.has(key)) throw new Error("duplicatePath");
    names.add(key);
    size += bytes.length;
    if (bytes.length > MAX_FILE || size > MAX_BYTES)
      throw new Error("archiveLimit");
  }
}
export function importZip(bytes: Uint8Array): FileTree {
  if (bytes.length > MAX_BYTES) throw new Error("archiveLimit");
  let size = 0,
    count = 0;
  const seen = new Set<string>();
  const raw = unzipSync(bytes, {
    filter(file) {
      if (file.name.endsWith("/")) {
        safePath(file.name.slice(0, -1));
        return false;
      }
      safePath(file.name);
      const key = file.name.toLowerCase();
      if (seen.has(key)) throw new Error("duplicatePath");
      seen.add(key);
      size += file.originalSize;
      if (
        ++count > MAX_FILES ||
        file.originalSize > MAX_FILE ||
        size > MAX_BYTES
      )
        throw new Error("archiveLimit");
      return true;
    },
  });
  const tree = new Map(Object.entries(raw));
  validateTree(tree);
  return tree;
}
export function exportZip(files: FileTree): Uint8Array {
  validateTree(files);
  return zipSync(Object.fromEntries(files), { level: 6 });
}
export async function fingerprint(bytes: Uint8Array): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function diffTrees(
  before: FileTree,
  after: FileTree,
): Promise<ChangeSet> {
  const operations: FileChange[] = [];
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(path),
      b = after.get(path);
    if (
      a === b ||
      (a && b && a.length === b.length && a.every((v, i) => v === b[i]))
    )
      continue;
    operations.push({
      path: safePath(path),
      bytes: b ?? null,
      expected: a ? await fingerprint(a) : null,
    });
  }
  return {
    operations: operations.sort(
      (a, b) => Number(a.bytes === null) - Number(b.bytes === null),
    ),
  };
}
export class VirtualAdapter implements StorageAdapter {
  name: string;
  capabilities = { direct: false };
  constructor(
    public files: FileTree,
    name = "Workspace",
  ) {
    this.name = name;
  }
  async load() {
    return new Map(this.files);
  }
  async apply(changes: ChangeSet): Promise<ApplyResult> {
    for (const c of changes.operations) {
      safePath(c.path);
      const old = this.files.get(c.path);
      if ((old ? await fingerprint(old) : null) !== c.expected)
        throw new Error("conflict");
    }
    const result = new Map(this.files);
    for (const c of changes.operations)
      if (c.bytes) result.set(c.path, c.bytes);
      else result.delete(c.path);
    validateTree(result);
    this.files = result;
    return { completed: changes.operations.map((c) => c.path) };
  }
}
export class DirectoryAdapter implements StorageAdapter {
  capabilities = { direct: true };
  get name() {
    return this.handle.name;
  }
  constructor(
    public handle: DirectoryHandle,
    private backup = captureBackup,
    public mountPrefix = "",
  ) {}
  async permission(mode: "read" | "readwrite") {
    if (
      (await this.handle.queryPermission({ mode })) !== "granted" &&
      (await this.handle.requestPermission({ mode })) !== "granted"
    )
      throw new Error("permissionDenied");
  }
  async load(): Promise<FileTree> {
    await this.permission("read");
    const files: FileTree = new Map();
    let total = 0;
    const walk = async (dir: DirectoryHandle, prefix: string) => {
      for await (const h of dir.values()) {
        const path = safePath(prefix + h.name);
        if (h.kind === "directory")
          await walk(h as DirectoryHandle, path + "/");
        else {
          const file = await (h as FileSystemFileHandle).getFile();
          total += file.size;
          if (
            file.size > MAX_FILE ||
            total > MAX_BYTES ||
            files.size >= MAX_FILES
          )
            throw new Error("archiveLimit");
          files.set(path, new Uint8Array(await file.arrayBuffer()));
        }
      }
    };
    await walk(this.handle, this.mountPrefix);
    validateTree(files);
    return files;
  }
  private async parent(path: string, create: boolean) {
    safePath(path);
    if (!path.startsWith(this.mountPrefix)) throw new Error("outsideFolder");
    const parts = path.slice(this.mountPrefix.length).split("/"),
      name = parts.pop()!;
    let dir: FileSystemDirectoryHandle = this.handle;
    for (const part of parts)
      dir = await dir.getDirectoryHandle(part, { create });
    return { dir, name };
  }
  async read(path: string): Promise<Uint8Array | null> {
    try {
      const { dir, name } = await this.parent(path, false);
      const handle = await dir.getFileHandle(name);
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (e) {
      if ((e as DOMException).name === "NotFoundError") return null;
      throw e;
    }
  }
  async apply(changes: ChangeSet): Promise<ApplyResult> {
    await this.permission("readwrite");
    if (
      changes.operations.some(
        (c) =>
          c.bytes !== null &&
          c.expected === null &&
          changes.operations.some(
            (old) =>
              old.bytes === null &&
              old.path !== c.path &&
              old.path.toLowerCase() === c.path.toLowerCase(),
          ),
      )
    )
      throw new Error("caseRename");
    const originals: [string, Uint8Array | null][] = [];
    for (const c of changes.operations) {
      const old = await this.read(c.path);
      if ((old ? await fingerprint(old) : null) !== c.expected)
        throw new Error("conflict");
      originals.push([c.path, old]);
    }
    try {
      await this.backup(originals);
    } catch {
      throw new Error("backupFailed");
    }
    const result: ApplyResult = { completed: [] };
    for (const c of changes.operations) {
      try {
        const old = await this.read(c.path);
        if ((old ? await fingerprint(old) : null) !== c.expected)
          throw new Error("conflict");
        const { dir, name } = await this.parent(c.path, c.bytes !== null);
        if (c.bytes === null) {
          if (old) await dir.removeEntry(name);
        } else {
          const file = await dir.getFileHandle(name, { create: true }),
            stream = await file.createWritable();
          try {
            await stream.write(c.bytes.slice().buffer);
            await stream.close();
          } catch (e) {
            await stream.abort().catch(() => {});
            throw e;
          }
          const written = await this.read(c.path);
          if (
            !written ||
            (await fingerprint(written)) !== (await fingerprint(c.bytes))
          )
            throw new Error("writeFailed");
        }
        result.completed.push(c.path);
      } catch (error) {
        result.failed = { path: c.path, code: (error as Error).message };
        break;
      }
    }
    if (!result.failed) {
      const directories = new Set(
        changes.operations
          .filter((c) => c.bytes === null)
          .flatMap((c) => {
            const parts = c.path.slice(this.mountPrefix.length).split("/");
            parts.pop();
            return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
          }),
      );
      for (const path of [...directories].sort((a, b) => b.length - a.length)) {
        try {
          const { dir, name } = await this.parent(
            this.mountPrefix + path,
            false,
          );
          const child = await dir.getDirectoryHandle(name);
          if ((await child.values().next()).done) await dir.removeEntry(name);
        } catch {
          /* Keep nonempty or unavailable folders; no recursive cleanup. */
        }
      }
    }
    return result;
  }
}
export async function filesToTree(files: File[]): Promise<FileTree> {
  const tree: FileTree = new Map();
  let total = 0;
  if (files.length > MAX_FILES) throw new Error("archiveLimit");
  for (const file of files) {
    const path = safePath(file.webkitRelativePath || file.name);
    if (tree.has(path)) throw new Error("duplicatePath");
    total += file.size;
    if (file.size > MAX_FILE || total > MAX_BYTES)
      throw new Error("archiveLimit");
    tree.set(path, new Uint8Array(await file.arrayBuffer()));
  }
  validateTree(tree);
  return tree;
}
export function download(
  bytes: Uint8Array,
  name: string,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
