import { describe, expect, it, vi } from "vitest";
import { zipSync } from "fflate";
import {
  DirectoryAdapter,
  VirtualAdapter,
  diffTrees,
  exportZip,
  fingerprint,
  importZip,
  safePath,
  type DirectoryHandle,
} from "./adapters";
import { utf8 } from "../core/library";
class FakeDir {
  name = "contents";
  kind = "directory";
  files = new Map<string, Uint8Array>();
  directories = new Map<string, FakeDir>();
  denied = false;
  failure = "";
  async queryPermission() {
    return this.denied ? "denied" : "granted";
  }
  async requestPermission() {
    return this.denied ? "denied" : "granted";
  }
  async *values(): AsyncGenerator<unknown> {
    for (const name of this.files.keys()) yield await this.getFileHandle(name);
    for (const dir of this.directories.values()) yield dir;
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    if (!this.directories.has(name) && options?.create) {
      const dir = new FakeDir();
      dir.name = name;
      this.directories.set(name, dir);
    }
    const dir = this.directories.get(name);
    if (!dir) throw new DOMException("Missing", "NotFoundError");
    return dir;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name) && !options?.create)
      throw new DOMException("Missing", "NotFoundError");
    const source = this;
    return {
      kind: "file",
      name,
      async getFile() {
        return new File([source.files.get(name)!.slice().buffer], name);
      },
      async createWritable() {
        if (source.failure === name)
          throw new DOMException("Disconnected", "NotFoundError");
        let pending = new Uint8Array();
        return {
          async write(data: ArrayBuffer) {
            pending = new Uint8Array(data);
          },
          async close() {
            source.files.set(name, pending);
          },
          async abort() {},
        };
      },
    };
  }
  async removeEntry(name: string) {
    this.files.delete(name);
  }
}
describe("import/export boundaries", () => {
  it.each([
    "../bad.txt",
    "/absolute",
    "a/../../bad",
    "a\\b",
    "C:/bad",
    "CON.txt",
  ])("rejects %s", (path) =>
    expect(() => safePath(path)).toThrow("unsafePath"),
  );
  it("preserves every unknown file byte-for-byte in ZIP roundtrips", () => {
    const tree = new Map([
      ["0100000000000001/readme.bin", new Uint8Array([0, 255, 2])],
      [
        "0100000000000001/cheats/AAAAAAAAAAAAAAAA.txt",
        utf8("[A]\r\nF0000000\r\n"),
      ],
    ]);
    expect(importZip(exportZip(tree))).toEqual(tree);
  });
  it("rejects unsafe and case-conflicting ZIP paths before extraction", () => {
    expect(() => importZip(zipSync({ "../bad": utf8("x") }))).toThrow(
      "unsafePath",
    );
    expect(() =>
      importZip(zipSync({ "A.txt": utf8("x"), "a.txt": utf8("y") })),
    ).toThrow("duplicatePath");
  });
  it("applies the aggregate limit before extracting oversized entries", () => {
    const zip = zipSync({ "huge.txt": new Uint8Array(33 * 1024 * 1024) });
    expect(() => importZip(zip)).toThrow("archiveLimit");
  });
});
describe("storage transactions", () => {
  it("stops native case-only renames before touching the original", async () => {
    const dir = new FakeDir();
    dir.files.set("a.txt", utf8("old"));
    const adapter = new DirectoryAdapter(
      dir as unknown as DirectoryHandle,
      async () => {},
    );
    const changes = await diffTrees(
      new Map([["a.txt", utf8("old")]]),
      new Map([["A.txt", utf8("old")]]),
    );
    await expect(adapter.apply(changes)).rejects.toThrow("caseRename");
    expect(dir.files.get("a.txt")).toEqual(utf8("old"));
  });
  it("keeps unrelated files when a virtual tree is merged", async () => {
    const before = new Map([
        ["keep.bin", utf8("keep")],
        ["replace.txt", utf8("old")],
      ]),
      next = new Map(before);
    next.set("replace.txt", utf8("new"));
    const adapter = new VirtualAdapter(before);
    await adapter.apply(await diffTrees(before, next));
    expect(await adapter.load()).toEqual(next);
    await expect(
      adapter.apply({
        operations: [
          {
            path: "replace.txt",
            bytes: utf8("stale"),
            expected: await fingerprint(utf8("old")),
          },
        ],
      }),
    ).rejects.toThrow("conflict");
  });
  it("rejects native conflicts before creating backups or writing", async () => {
    const dir = new FakeDir();
    dir.files.set("a.txt", utf8("external"));
    const backup = vi.fn();
    const adapter = new DirectoryAdapter(
      dir as unknown as DirectoryHandle,
      backup,
    );
    await expect(
      adapter.apply({
        operations: [
          {
            path: "a.txt",
            bytes: utf8("edit"),
            expected: await fingerprint(utf8("old")),
          },
        ],
      }),
    ).rejects.toThrow("conflict");
    expect(backup).not.toHaveBeenCalled();
    expect(dir.files.get("a.txt")).toEqual(utf8("external"));
  });
  it("denies writes if permission or recovery storage is unavailable", async () => {
    const dir = new FakeDir(),
      changes = await diffTrees(new Map(), new Map([["a.txt", utf8("new")]]));
    dir.denied = true;
    await expect(
      new DirectoryAdapter(dir as unknown as DirectoryHandle).apply(changes),
    ).rejects.toThrow("permissionDenied");
    dir.denied = false;
    const adapter = new DirectoryAdapter(
      dir as unknown as DirectoryHandle,
      async () => {
        throw new Error("quota");
      },
    );
    await expect(adapter.apply(changes)).rejects.toThrow("backupFailed");
    expect(dir.files.size).toBe(0);
  });
  it("reports exactly the files completed before a disconnection", async () => {
    const dir = new FakeDir();
    dir.failure = "b.txt";
    const backup = vi.fn(async () => {}),
      adapter = new DirectoryAdapter(dir as unknown as DirectoryHandle, backup);
    const result = await adapter.apply(
      await diffTrees(
        new Map(),
        new Map([
          ["a.txt", utf8("a")],
          ["b.txt", utf8("b")],
          ["c.txt", utf8("c")],
        ]),
      ),
    );
    expect(result.completed).toEqual(["a.txt"]);
    expect(result.failed?.path).toBe("b.txt");
    expect(dir.files.has("c.txt")).toBe(false);
    expect(backup).toHaveBeenCalledOnce();
  });
  it("maps a selected game directory to its virtual root without escaping", async () => {
    const dir = new FakeDir();
    dir.name = "0100000000000001";
    dir.files.set("Game.txt", utf8(""));
    const adapter = new DirectoryAdapter(
      dir as unknown as DirectoryHandle,
      async () => {},
      dir.name + "/",
    );
    expect((await adapter.load()).has(dir.name + "/Game.txt")).toBe(true);
    await expect(adapter.read("0100000000000002/Other.txt")).rejects.toThrow(
      "outsideFolder",
    );
  });
});
