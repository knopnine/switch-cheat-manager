import { useEffect, useMemo, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import {
  addSection,
  convertDocument,
  decodeDocument,
  diagnosticsFor,
  encodeDocument,
  formatCheats,
  renameSection,
  setEnabled,
  updateDocument,
  type CheatDocument,
} from "./core/documents";
import {
  checkId,
  discoverLibrary,
  normalizeImportedTree,
  parseVersions,
  safeName,
  serializeVersions,
  utf8,
  writeVersions,
  normalizeGamePaths,
  type FileTree,
  type Game,
} from "./core/library";
import { defaultSettings, translator, type Settings } from "./i18n";
import {
  DirectoryAdapter,
  VirtualAdapter,
  diffTrees,
  download,
  exportZip,
  filesToTree,
  fingerprint,
  importZip,
  type ChangeSet,
  type DirectoryHandle,
  type StorageAdapter,
} from "./storage/adapters";
import {
  captureBackup,
  clearLocal,
  loadLocal,
  saveLocal,
} from "./storage/persistence";
import { CodeEditor, Comparison } from "./components/CodeEditor";
import { Dialog, type DialogRequest } from "./components/Dialog";
import { Builder } from "./components/Builder";
import { foreground } from "./core/contrast";
interface Snapshot {
  baseline: [string, Uint8Array][];
  work: [string, Uint8Array][];
  docs: [string, CheatDocument][];
  sourceName: string;
  game: string;
  build: string;
  builderOutput: string;
  overrides: Record<string, string>;
  handle?: DirectoryHandle;
  mountPrefix?: string;
  outputHandle?: DirectoryHandle;
}
type View = "editor" | "compare" | "builder" | "settings";
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<unknown>;
}
export default function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings),
    t = translator(settings.language);
  const [baseline, setBaseline] = useState<FileTree>(new Map()),
    [work, setWork] = useState<FileTree>(new Map()),
    [docs, setDocs] = useState<Map<string, CheatDocument>>(new Map());
  const [active, setActive] = useState(false),
    [sourceName, setSourceName] = useState(""),
    [gameRoot, setGameRoot] = useState(""),
    [path, setPath] = useState(""),
    [view, setView] = useState<View>("editor");
  const [filter, setFilter] = useState(""),
    [dialog, setDialog] = useState<DialogRequest | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [recoveryError, setRecoveryError] = useState(false),
    [recovered, setRecovered] = useState(false);
  const [outputHandle, setOutputHandle] = useState<DirectoryHandle>(),
    [overrides, setOverrides] = useState<Record<string, string>>({}),
    [builderOutput, setBuilderOutput] = useState("");
  const [outline, setOutline] = useState(true),
    [reveal, setReveal] = useState<{ line: number; nonce: number }>(),
    [leftPath, setLeftPath] = useState(""),
    [rightPath, setRightPath] = useState("");
  const [conflict, setConflict] = useState<{
      path: string;
      external: Uint8Array | null;
    }>(),
    [updateAvailable, setUpdateAvailable] = useState(false),
    [offlineReady, setOfflineReady] = useState(false),
    [installEvent, setInstallEvent] = useState<InstallEvent>();
  const adapter = useRef<StorageAdapter>(new VirtualAdapter(new Map())),
    fileInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null),
    zipInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    updateSW = useRef<((reload?: boolean) => Promise<void>) | undefined>(
      undefined,
    ),
    restored = useRef(false);
  const snapshot = useRef<Snapshot>(null);
  const library = useMemo(
    () => discoverLibrary(work, overrides),
    [work, overrides],
  );
  const game =
    library.games.find((g) => g.root === gameRoot) ?? library.games[0];
  const builds = game?.builds ?? [],
    selected = builds.find((b) => b.path === path) ?? builds[0],
    selectedPath = selected?.path ?? "";
  const doc = selectedPath
    ? (docs.get(selectedPath) ?? decodeDocument(work.get(selectedPath)!))
    : undefined;
  const [pending, setPending] = useState<ChangeSet>({ operations: [] });
  function currentTree(): FileTree {
    const tree = new Map(work);
    for (const [p, d] of docs)
      if (tree.has(p) && d.modified && d.encoding !== "unsupported")
        tree.set(p, encodeDocument(d));
    return tree;
  }
  const tree = currentTree();
  useEffect(() => {
    let stale = false;
    diffTrees(baseline, tree)
      .then((changes) => {
        if (!stale) setPending(changes);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [baseline, work, docs]);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    (async () => {
      try {
        const savedSettings = await loadLocal<Settings>("settings");
        if (savedSettings)
          setSettings({ ...defaultSettings, ...savedSettings });
        const saved = await loadLocal<Snapshot>("workspace");
        if (saved) {
          setBaseline(new Map(saved.baseline));
          setWork(new Map(saved.work));
          setDocs(new Map(saved.docs));
          setSourceName(saved.sourceName);
          setGameRoot(saved.game);
          setPath(saved.build);
          setBuilderOutput(saved.builderOutput ?? "");
          setOverrides(saved.overrides ?? {});
          setOutputHandle(saved.outputHandle);
          adapter.current = saved.handle
            ? new DirectoryAdapter(
                saved.handle,
                captureBackup,
                saved.mountPrefix ?? "",
              )
            : new VirtualAdapter(new Map(saved.baseline), saved.sourceName);
          setActive(true);
          setRecovered(true);
        }
      } catch {
        setRecoveryError(true);
      } finally {
        setReady(true);
      }
    })();
  }, []);
  snapshot.current = {
    baseline: [...baseline],
    work: [...work],
    docs: [...docs],
    sourceName,
    game: game?.root ?? "",
    build: selectedPath,
    builderOutput,
    overrides,
    handle:
      adapter.current instanceof DirectoryAdapter
        ? adapter.current.handle
        : undefined,
    mountPrefix:
      adapter.current instanceof DirectoryAdapter
        ? adapter.current.mountPrefix
        : undefined,
    outputHandle,
  };
  async function persist() {
    if (active && snapshot.current)
      await saveLocal("workspace", snapshot.current);
    await saveLocal("settings", settings);
  }
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      persist()
        .then(() => setRecoveryError(false))
        .catch(() => setRecoveryError(true));
    }, 450);
    return () => clearTimeout(timer);
  }, [
    ready,
    baseline,
    work,
    docs,
    sourceName,
    gameRoot,
    path,
    settings,
    outputHandle,
    builderOutput,
    overrides,
    active,
  ]);
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        settings.theme === "system"
          ? system.matches
            ? "dark"
            : "light"
          : settings.theme;
    };
    apply();
    system.addEventListener("change", apply);
    document.documentElement.lang = settings.language === "zh" ? "zh-CN" : "en";
    return () => system.removeEventListener("change", apply);
  }, [settings.theme, settings.language]);
  useEffect(() => {
    updateSW.current = registerSW({
      onNeedRefresh: () => setUpdateAvailable(true),
      onOfflineReady: () => setOfflineReady(true),
      onRegisterError: () => {},
    });
    const install = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", install);
    return () => window.removeEventListener("beforeinstallprompt", install);
  }, []);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (pending.operations.length || recoveryError) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [pending, recoveryError]);
  function changeText(text: string) {
    if (!selectedPath || !doc) return;
    setDocs((previous) =>
      new Map(previous).set(selectedPath, updateDocument(doc, text)),
    );
  }
  function stage(next: FileTree, affected: string[] = []) {
    setWork(next);
    if (affected.length)
      setDocs((previous) => {
        const result = new Map(previous);
        affected.forEach((p) => result.delete(p));
        return result;
      });
    setMessage(t("Stage changes"));
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if ((e as DOMException).name !== "AbortError")
        setError(
          t((e as Error).message) !== (e as Error).message
            ? t((e as Error).message)
            : t((e as DOMException).name) !== (e as DOMException).name
              ? t((e as DOMException).name)
              : `${t("Operation failed")}: ${(e as Error).message}`,
        );
    } finally {
      setBusy(false);
    }
  }
  function adopt(files: FileTree, source: StorageAdapter, name: string) {
    adapter.current = source;
    setBaseline(new Map(files));
    setWork(new Map(files));
    setDocs(new Map());
    setOverrides({});
    setGameRoot("");
    setPath("");
    setSourceName(name);
    setActive(true);
    setView("editor");
    setConflict(undefined);
    setFilter("");
    setRecovered(false);
    setMessage("");
  }
  function replaceWorkspace(action: () => void | Promise<void>) {
    if (active)
      setDialog({
        title: "Discard workspace?",
        description: "Export any unsaved work before opening another library.",
        submit: "Open another library",
        action,
      });
    else void action();
  }
  async function openFolder() {
    await run(async () => {
      if (!window.showDirectoryPicker) return;
      const handle = await window.showDirectoryPicker({
        id: "cheat-library",
        mode: "readwrite",
      });
      const prefix = /^[a-f\d]{15,16}$/i.test(handle.name)
        ? handle.name + "/"
        : "";
      const source = new DirectoryAdapter(handle, captureBackup, prefix),
        files = await source.load();
      if (
        !discoverLibrary(files).games.length &&
        handle.name.toLowerCase() === "cheats"
      ) {
        setDialog({
          title: "Title ID",
          description: "A Title ID is needed for this cheats folder.",
          fields: [{ key: "id", label: "Title ID" }],
          action: ({ id }) => {
            const p = checkId(id) + "/cheats/";
            source.mountPrefix = p;
            adopt(
              new Map([...files].map(([path, bytes]) => [p + path, bytes])),
              source,
              handle.name,
            );
          },
        });
      } else adopt(files, source, handle.name);
    });
  }
  async function imported(files: FileTree, name: string) {
    if (
      !discoverLibrary(files).games.length &&
      [...files.keys()].some((p) => /^(?:cheats\/)?[a-f\d]{16}\.txt$/i.test(p))
    ) {
      setDialog({
        title: "Title ID",
        description: "A Title ID is needed for this cheats folder.",
        fields: [{ key: "id", label: "Title ID" }],
        action: ({ id }) => {
          const next = normalizeImportedTree(files, id);
          adopt(next, new VirtualAdapter(next, name), name);
        },
      });
    } else adopt(files, new VirtualAdapter(files, name), name);
  }
  function requestFileImport(kind: "file" | "folder" | "zip") {
    replaceWorkspace(() =>
      (kind === "file"
        ? fileInput
        : kind === "folder"
          ? folderInput
          : zipInput
      ).current?.click(),
    );
  }
  function newGame() {
    setDialog({
      title: "New game",
      fields: [
        { key: "name", label: "Game name" },
        { key: "id", label: "Title ID" },
        { key: "build", label: "Build ID" },
        { key: "version", label: "Version", value: "1.0.0" },
      ],
      submit: "Stage changes",
      action: (values) => {
        const id = checkId(values.id),
          bid = checkId(values.build),
          name = safeName(values.name);
        const prefix =
          adapter.current instanceof DirectoryAdapter
            ? adapter.current.mountPrefix
            : "";
        if (prefix) throw new Error("outsideFolder");
        if (library.games.some((g) => g.id === id)) throw new Error("exists");
        const next = currentTree(),
          root = id,
          buildPath = `${root}/cheats/${bid}.txt`;
        next.set(
          `${root}/${name}.txt`,
          serializeVersions([[bid, values.version]]),
        );
        next.set(buildPath, utf8(`[${name}]\r\n`));
        stage(next);
        setGameRoot(root);
        setPath(buildPath);
        setActive(true);
        if (!sourceName) setSourceName(t("New library"));
      },
    });
  }
  function requireIndex(g: Game): string {
    if (!g.indexPath && g.indexCandidates.length > 1)
      throw new Error("noMetadata");
    return g.indexPath ?? `${g.root}/${safeName(g.name)}.txt`;
  }
  function newBuild() {
    if (!game) return;
    setDialog({
      title: "New build",
      fields: [
        { key: "id", label: "Build ID" },
        { key: "version", label: "Version", value: "1.0.0" },
      ],
      submit: "Stage changes",
      action: (values) => {
        const id = checkId(values.id),
          next = currentTree(),
          p = `${game.root}/cheats/${id}.txt`;
        if (next.has(p) || game.builds.some((b) => b.id === id))
          throw new Error("exists");
        const index = requireIndex(game),
          rows = parseVersions(
            next.has(index) ? decodeDocument(next.get(index)!).text : "",
          );
        rows.set(id, values.version);
        next.set(index, writeVersions(next.get(index), [...rows]));
        next.set(p, utf8(`[${game.name}]\r\n`));
        stage(next, [index]);
        setPath(p);
      },
    });
  }
  function editMappings() {
    if (!game) return;
    try {
      const index = requireIndex(game);
      const original = work.get(index);
      if (original) {
        const document = decodeDocument(original);
        if (document.encoding === "unsupported") {
          setDialog({
            title: "Convert encoding",
            description:
              "This encoding is unsupported. Review the decoded preview before converting to UTF-8.",
            body: <pre className="encoding-preview">{document.text}</pre>,
            action: () => {
              const next = currentTree();
              next.set(index, encodeDocument(convertDocument(document)));
              stage(next, [index]);
            },
          });
          return;
        }
      }
      setDialog({
        title: "Version mappings",
        description: "One Build ID and version per line, separated by a tab.",
        fields: [
          {
            key: "mapping",
            label: "Version mappings",
            allowEmpty: true,
            multiline: true,
            value: work.has(index)
              ? decodeDocument(work.get(index)!).text
              : game.builds
                  .map((b) => `${b.id}\t${b.version || "1.0.0"}`)
                  .join("\n"),
          },
        ],
        action: (values) => {
          const rows = values.mapping.trim()
            ? values.mapping
                .trim()
                .split(/\r?\n/)
                .map((line) => {
                  const cols = line.split("\t");
                  if (cols.length !== 2) throw new Error("invalidMapping");
                  return [cols[0].trim(), cols[1].trim()] as [string, string];
                })
            : [];
          const next = currentTree();
          next.set(index, writeVersions(next.get(index), rows));
          stage(next, [index]);
        },
      });
    } catch (e) {
      setError(t((e as Error).message));
    }
  }
  function renameGame() {
    if (!game) return;
    setDialog({
      title: "Rename game",
      fields: [{ key: "name", label: "Game name", value: game.name }],
      action: (values) => {
        const name = safeName(values.name),
          old = requireIndex(game),
          p = `${game.root}/${name}.txt`,
          next = currentTree();
        if (p !== old && next.has(p)) throw new Error("exists");
        const bytes =
          next.get(old) ??
          serializeVersions(
            game.builds.map((b) => [b.id, b.version || "1.0.0"]),
          );
        next.delete(old);
        next.set(p, bytes);
        stage(next, [old, p]);
        setOverrides({ ...overrides, [game.root]: p });
      },
    });
  }
  function renameBuild() {
    if (!game || !selected) return;
    setDialog({
      title: "Rename build",
      fields: [
        { key: "id", label: "Build ID", value: selected.id },
        {
          key: "version",
          label: "Version",
          value: selected.version || "1.0.0",
        },
      ],
      action: (values) => {
        const id = checkId(values.id),
          next = currentTree(),
          p = `${game.root}/cheats/${id}.txt`;
        if (
          p !== selectedPath &&
          (next.has(p) || game.builds.some((b) => b.id === id))
        )
          throw new Error("exists");
        const index = requireIndex(game),
          mapping = parseVersions(
            next.has(index) ? decodeDocument(next.get(index)!).text : "",
          );
        mapping.delete(selected.id);
        mapping.set(id, values.version);
        const content = next.get(selectedPath)!;
        next.delete(selectedPath);
        next.set(p, content);
        next.set(index, writeVersions(next.get(index), [...mapping]));
        stage(next, [selectedPath, p, index]);
        setPath(p);
      },
    });
  }
  function removeGameOrBuild(wholeGame: boolean) {
    if (!game || (!selected && !wholeGame)) return;
    const paths = wholeGame
      ? [...work.keys()].filter((p) => p.startsWith(game.root + "/"))
      : [selectedPath];
    setDialog({
      title: wholeGame ? "Delete game" : "Delete build",
      danger: true,
      body: (
        <ul className="file-list">
          {paths.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ),
      submit: "Stage changes",
      action: () => {
        const next = currentTree();
        paths.forEach((p) => next.delete(p));
        const affected = [...paths];
        if (!wholeGame) {
          const index = requireIndex(game);
          const mapping = parseVersions(
            next.has(index) ? decodeDocument(next.get(index)!).text : "",
          );
          mapping.delete(selected!.id);
          next.set(index, writeVersions(next.get(index), [...mapping]));
          affected.push(index);
        }
        stage(next, affected);
      },
    });
  }
  function format(all: boolean) {
    if (!doc) return;
    const candidates = all ? builds.map((b) => b.path) : [selectedPath];
    const next = currentTree();
    for (const p of candidates) {
      const d = docs.get(p) ?? decodeDocument(next.get(p)!);
      if (d.encoding === "unsupported") {
        setError(t("encodingRequired"));
        return;
      }
      next.set(
        p,
        encodeDocument(updateDocument(d, formatCheats(d.text, d.newline))),
      );
    }
    setDialog({
      title: "Format preview",
      body: (
        <>
          <p>
            {candidates.length} {t("Builds")}
          </p>
          <Comparison
            left={doc.text}
            right={decodeDocument(next.get(selectedPath)!).text}
          />
        </>
      ),
      submit: "Stage changes",
      action: () => stage(next, candidates),
    });
  }
  function normalizeIds() {
    if (!game) return;
    try {
      const normalized = normalizeGamePaths(currentTree(), game);
      setDialog({
        title: "Normalize IDs",
        description:
          "Uppercase Title ID folders and Build ID filenames. Export a ZIP for case-only renames on a native folder.",
        body: (
          <ul className="file-list">
            {normalized.renamed.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        ),
        submit: "Stage changes",
        action: () => {
          stage(normalized.files, normalized.renamed);
          setGameRoot(normalized.root);
          setPath(
            selectedPath
              .replace(game.root + "/", normalized.root + "/")
              .replace(
                /\/([a-f\d]{16})\.txt$/i,
                (_, id: string) => "/" + id.toUpperCase() + ".txt",
              ),
          );
        },
      });
    } catch (e) {
      setError(t((e as Error).message));
    }
  }
  async function findConflict(changes: ChangeSet) {
    if (!(adapter.current instanceof DirectoryAdapter)) return;
    for (const c of changes.operations) {
      const external = await adapter.current.read(c.path);
      if ((external ? await fingerprint(external) : null) !== c.expected) {
        setConflict({ path: c.path, external });
        setView("compare");
        return;
      }
    }
  }
  async function applyChanges(
    changes: ChangeSet,
    next: FileTree,
    skipBackup = false,
  ) {
    const source = adapter.current;
    try {
      if (!source.capabilities.direct && !skipBackup)
        await captureBackup(
          changes.operations.map((c) => [c.path, baseline.get(c.path) ?? null]),
        ).catch(() => {
          throw new Error("backupFailed");
        });
      const target =
        skipBackup && source instanceof DirectoryAdapter
          ? new DirectoryAdapter(
              source.handle,
              async () => {},
              source.mountPrefix,
            )
          : source;
      const result = await target.apply(changes),
        committed = new Map(baseline);
      for (const p of result.completed)
        if (next.has(p)) committed.set(p, next.get(p)!);
        else committed.delete(p);
      if (!source.capabilities.direct) {
        const remainingDocs = new Map(docs);
        result.completed.forEach((p) => remainingDocs.delete(p));
        try {
          await saveLocal("workspace", {
            ...snapshot.current!,
            baseline: [...committed],
            work: [...next],
            docs: [...remainingDocs],
          } satisfies Snapshot);
        } catch {
          if (source instanceof VirtualAdapter)
            source.files = new Map(baseline);
          setRecoveryError(true);
          throw new Error("recoveryUnavailable");
        }
      }
      setBaseline(committed);
      setDocs((previous) => {
        const updated = new Map(previous);
        result.completed.forEach((p) => updated.delete(p));
        return updated;
      });
      setWork(next);
      setMessage(
        t(
          result.failed
            ? "Some writes failed; remaining changes are still pending."
            : "Saved",
        ),
      );
      if (result.failed) {
        setError(`${result.failed.path}: ${t(result.failed.code)}`);
        if (result.failed.code === "conflict") await findConflict(changes);
      }
    } catch (e) {
      if ((e as Error).message === "conflict") {
        await findConflict(changes);
        return;
      }
      if ((e as Error).message === "backupFailed") {
        setTimeout(
          () =>
            setDialog({
              title: "Backup required",
              description:
                "Recovery storage is unavailable. Download a backup before applying changes.",
              submit: "Download backup and continue",
              action: async () => {
                download(
                  exportZip(baseline),
                  "cheats-before-changes.zip",
                  "application/zip",
                );
                setDialog({
                  title: "Confirm backup saved",
                  description:
                    "Finish saving the downloaded backup before applying changes. Cancel if the download was blocked or canceled.",
                  submit: "Backup saved — apply changes",
                  action: () => applyChanges(changes, next, true),
                });
              },
            }),
          0,
        );
        return;
      }
      throw e;
    }
  }
  async function reviewChanges() {
    await run(async () => {
      if (
        [...docs.values()].some(
          (d) => d.modified && d.encoding === "unsupported",
        )
      )
        throw new Error("encodingRequired");
      const next = currentTree(),
        changes = await diffTrees(baseline, next);
      if (!changes.operations.length) {
        setMessage(t("No changes"));
        return;
      }
      setDialog({
        title: "Review changes",
        description:
          "These file operations will be applied. Multi-file writes can finish partially if a device disconnects.",
        body: (
          <>
            <div className="review-diagnostics">
              {changes.operations
                .filter((c) => c.bytes && /\/cheats\/[^/]+\.txt$/i.test(c.path))
                .flatMap((c) =>
                  diagnosticsFor(decodeDocument(c.bytes!)).map((d, i) => (
                    <p
                      key={c.path + i}
                      className={d.severity === "error" ? "error" : ""}
                    >
                      {c.path.split("/").at(-1)} · {t("Line")} {d.line}:{" "}
                      {t(d.code)}
                    </p>
                  )),
                )}
            </div>
            <ul className="file-list">
              {changes.operations.map((c) => (
                <li key={c.path}>
                  <strong>
                    {t(
                      c.bytes === null
                        ? "Deleted"
                        : c.expected === null
                          ? "Created"
                          : "Replaced",
                    )}
                  </strong>{" "}
                  {c.path}
                </li>
              ))}
            </ul>
          </>
        ),
        submit: adapter.current.capabilities.direct
          ? "Apply changes"
          : "Save changes",
        action: async () => applyChanges(changes, next),
      });
    });
  }
  function reloadConflict() {
    if (!conflict) return;
    const next = new Map(work),
      committed = new Map(baseline);
    if (conflict.external) {
      next.set(conflict.path, conflict.external);
      committed.set(conflict.path, conflict.external);
    } else {
      next.delete(conflict.path);
      committed.delete(conflict.path);
    }
    stage(next, [conflict.path]);
    setBaseline(committed);
    setConflict(undefined);
  }
  async function copyToOutput(wholeGame: boolean) {
    if (!game || !outputHandle) return;
    await run(async () => {
      const source = new DirectoryAdapter(outputHandle),
        before = await source.load(),
        next = new Map(before),
        working = currentTree();
      for (const [p, bytes] of working)
        if (wholeGame ? p.startsWith(game.root + "/") : p === selectedPath)
          next.set(game.id + "/" + p.slice(game.root.length + 1), bytes);
      const changes = await diffTrees(before, next);
      const applyOutput = async (skipBackup = false): Promise<void> => {
        try {
          const target = skipBackup
            ? new DirectoryAdapter(outputHandle, async () => {})
            : source;
          const result = await target.apply(changes);
          if (result.failed) {
            setMessage(
              t("Some writes failed; remaining changes are still pending."),
            );
            throw new Error(`${result.failed.path}: ${t(result.failed.code)}`);
          }
          setMessage(t("Operation completed"));
        } catch (e) {
          if ((e as Error).message === "backupFailed") {
            setDialog({
              title: "Backup required",
              description:
                "Recovery storage is unavailable. Download a backup before applying changes.",
              submit: "Download backup and continue",
              action: async () => {
                download(
                  exportZip(before),
                  "output-before-changes.zip",
                  "application/zip",
                );
                setDialog({
                  title: "Confirm backup saved",
                  description:
                    "Finish saving the downloaded backup before applying changes. Cancel if the download was blocked or canceled.",
                  submit: "Backup saved — apply changes",
                  action: () => applyOutput(true),
                });
              },
            });
            return;
          }
          if ((e as Error).message === "conflict") {
            for (const c of changes.operations) {
              const external = await source.read(c.path);
              if (
                (external ? await fingerprint(external) : null) !== c.expected
              ) {
                setDialog({
                  title: "External changes detected",
                  description:
                    "Another program changed this file. Review the versions before continuing.",
                  body: (
                    <>
                      <p>{c.path}</p>
                      <Comparison
                        left={external ? decodeDocument(external).text : ""}
                        right={c.bytes ? decodeDocument(c.bytes).text : ""}
                      />
                      <button
                        type="button"
                        onClick={() => copyToOutput(wholeGame)}
                      >
                        {t("Reload destination")}
                      </button>
                    </>
                  ),
                  submit: "Download my edit",
                  action: () =>
                    download(
                      exportZip(
                        new Map(
                          changes.operations
                            .filter((c) => c.bytes)
                            .map((c) => [c.path, c.bytes!]),
                        ),
                      ),
                      "output-pending.zip",
                      "application/zip",
                    ),
                });
                return;
              }
            }
          }
          throw e;
        }
      };
      setDialog({
        title: "Review output copy",
        description:
          "Matching files will be replaced. Unrelated destination files will remain.",
        body: (
          <ul className="file-list">
            {changes.operations.map((c) => (
              <li key={c.path}>{c.path}</li>
            ))}
          </ul>
        ),
        action: () => applyOutput(),
      });
    });
  }
  function exportLibrary(onlyGame = false) {
    try {
      const contents = currentTree();
      if (onlyGame && game) {
        const selectedTree = new Map(
          [...contents]
            .filter(([p]) => p.startsWith(game.root + "/"))
            .map(([p, b]) => [
              game.id + "/" + p.slice(game.root.length + 1),
              b,
            ]),
        );
        download(exportZip(selectedTree), `${game.id}.zip`, "application/zip");
      } else
        download(exportZip(contents), "switch-cheats.zip", "application/zip");
    } catch (e) {
      setError(t((e as Error).message));
    }
  }
  const left = leftPath && tree.has(leftPath) ? leftPath : builds[0]?.path,
    right = rightPath && tree.has(rightPath) ? rightPath : builds[1]?.path;
  const imagePath =
    game?.images.find((p) =>
      p.toLowerCase().includes(settings.imageLanguage.toLowerCase()),
    ) ?? game?.images[0];
  const imageUrl = useMemo(
    () =>
      imagePath && work.get(imagePath)
        ? URL.createObjectURL(new Blob([work.get(imagePath)!.slice().buffer]))
        : undefined,
    [imagePath, work],
  );
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  const updateSetting = <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => setSettings((previous) => ({ ...previous, [key]: value }));
  const importControls = (
    <>
      <button
        onClick={() => replaceWorkspace(openFolder)}
        disabled={!window.showDirectoryPicker || busy}
      >
        {t("Open folder")}
      </button>
      <button onClick={() => requestFileImport("zip")} disabled={busy}>
        {t("Import ZIP")}
      </button>
      <button onClick={() => requestFileImport("folder")} disabled={busy}>
        {t("Import folder")}
      </button>
      <button onClick={() => requestFileImport("file")} disabled={busy}>
        {t("Import files")}
      </button>
    </>
  );
  return (
    <div
      className="app"
      style={
        {
          "--header-color": settings.headerColor,
          "--header-ink": foreground(settings.headerColor),
          "--enabled-color": settings.enabledColor,
          "--enabled-ink": foreground(settings.enabledColor),
          "--start-color": settings.startColor,
          "--start-ink": foreground(settings.startColor),
          "--end-color": settings.endColor,
          "--end-ink": foreground(settings.endColor),
        } as React.CSSProperties
      }
    >
      <a className="skip-link" href="#workspace">
        {t("Editor")}
      </a>
      <header className="app-header">
        <div className="brand">
          <img src="./icon.svg" width="32" height="32" alt="" />
          <div>
            <strong>{t("Switch Cheats Manager")}</strong>
            <small>{t("Local workspace")}</small>
          </div>
        </div>
        <nav aria-label={t("Local workspace")}>
          {(["editor", "compare", "builder", "settings"] as View[]).map(
            (item) => (
              <button
                key={item}
                aria-current={view === item ? "page" : undefined}
                onClick={() => setView(item)}
              >
                {t(item[0].toUpperCase() + item.slice(1))}
              </button>
            ),
          )}
        </nav>
        <div className="header-actions">
          <a
            className="help-link"
            href="./user-guide.html"
            target="_blank"
            rel="noreferrer"
          >
            {t("User guide")}
          </a>
          {installEvent && (
            <button
              onClick={() =>
                run(async () => {
                  await installEvent.prompt();
                  setInstallEvent(undefined);
                })
              }
            >
              {t("Install app")}
            </button>
          )}
          <button
            className="primary"
            onClick={reviewChanges}
            disabled={!pending.operations.length || busy}
          >
            {t("Save changes")}
            {pending.operations.length > 0 && (
              <span className="count">{pending.operations.length}</span>
            )}
          </button>
        </div>
      </header>
      {active && pending.operations.length > 0 && (
        <div className="pending-strip">
          <span>
            {pending.operations.length} {t("Pending changes")}
          </span>
          <button
            onClick={() =>
              setDialog({
                title: "Discard changes",
                description: "Discard pending edits and operations?",
                danger: true,
                action: () => {
                  setWork(new Map(baseline));
                  setDocs(new Map());
                  setConflict(undefined);
                  setMessage(t("No changes"));
                },
              })
            }
          >
            {t("Discard changes")}
          </button>
        </div>
      )}
      {updateAvailable && (
        <div className="banner">
          <span>
            {t("Update available")} ·{" "}
            {t("Update after drafts are saved locally.")}
          </span>
          <button
            onClick={() =>
              run(async () => {
                await persist();
                await updateSW.current?.(true);
              })
            }
          >
            {t("Update app")}
          </button>
        </div>
      )}
      {recovered && (
        <div className="banner">
          <div>
            <strong>{t("Drafts recovered")}</strong>
            <span>
              {" "}
              {t(
                "Your workspace was restored from this browser. Folder access may need permission again.",
              )}
            </span>
          </div>
          <button onClick={() => setRecovered(false)}>{t("Close")}</button>
        </div>
      )}
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")}>{t("Close")}</button>
        </div>
      )}
      {conflict && (
        <div className="banner warning">
          <div>
            <strong>{t("External changes detected")}</strong>
            <p>
              {conflict.path} ·{" "}
              {t(
                "Another program changed this file. Review the versions before continuing.",
              )}
            </p>
            <div className="toolbar">
              <button onClick={reloadConflict}>
                {t("Reload external file")}
              </button>
              <button
                onClick={() => {
                  const bytes = tree.get(conflict.path);
                  if (bytes) download(bytes, conflict.path.split("/").at(-1)!);
                }}
              >
                {t("Download my edit")}
              </button>
              <button onClick={() => setView("compare")}>
                {t("Compare external file")}
              </button>
            </div>
          </div>
        </div>
      )}
      <main id="workspace" tabIndex={-1}>
        {!ready ? (
          <div className="empty-state">
            <h1>{t("Loading library…")}</h1>
          </div>
        ) : view === "builder" ? (
          <Builder
            t={t}
            output={builderOutput}
            onOutput={setBuilderOutput}
            insert={
              doc && doc.encoding !== "unsupported"
                ? (text) => {
                    changeText(
                      doc.text +
                        (doc.text.endsWith("\n") ? "" : doc.newline) +
                        text,
                    );
                    setView("editor");
                  }
                : undefined
            }
            notify={setMessage}
          />
        ) : view === "settings" ? (
          <div className="tool-page settings-page">
            <header className="page-heading">
              <div>
                <p className="eyebrow">{t("Local workspace")}</p>
                <h1>{t("Settings")}</h1>
              </div>
            </header>
            <div className="builder-grid">
              <section className="tool-panel">
                <h2>{t("Appearance")}</h2>
                <label className="field">
                  <span>{t("Language")}</span>
                  <select
                    aria-label={t("Language")}
                    value={settings.language}
                    onChange={(e) =>
                      updateSetting(
                        "language",
                        e.target.value as Settings["language"],
                      )
                    }
                  >
                    <option value="en">English</option>
                    <option value="zh">简体中文</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t("Theme")}</span>
                  <select
                    aria-label={t("Theme")}
                    value={settings.theme}
                    onChange={(e) =>
                      updateSetting(
                        "theme",
                        e.target.value as Settings["theme"],
                      )
                    }
                  >
                    {["system", "light", "dark"].map((s) => (
                      <option key={s} value={s}>
                        {t(s[0].toUpperCase() + s.slice(1))}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t("Preferred image language")}</span>
                  <select
                    aria-label={t("Preferred image language")}
                    value={settings.imageLanguage}
                    onChange={(e) =>
                      updateSetting("imageLanguage", e.target.value)
                    }
                  >
                    {["English", "Chinese", "Japanese"].map((s) => (
                      <option key={s} value={s}>
                        {t(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  {(
                    [
                      ["headerColor", "Header color"],
                      ["enabledColor", "Enabled header color"],
                      ["startColor", "Section start color"],
                      ["endColor", "Section end color"],
                    ] as const
                  ).map(([key, name]) => (
                    <label className="field color-field" key={key}>
                      <span>{t(name)}</span>
                      <input
                        type="color"
                        value={settings[key]}
                        onChange={(e) => updateSetting(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>
              <section className="tool-panel">
                <h2>{t("Local data")}</h2>
                <p>
                  {t("No network transfers. Your files stay on this device.")}
                </p>
                <p>
                  {t(
                    "Browser storage can be cleared or evicted. Export important files regularly.",
                  )}
                </p>
                <div className="toolbar">
                  <button disabled={!active} onClick={() => exportLibrary()}>
                    {t("Download workspace")}
                  </button>
                  <button
                    onClick={() =>
                      run(async () => {
                        const backups =
                          await loadLocal<
                            { files: [string, Uint8Array | null][] }[]
                          >("backups");
                        if (!backups?.length) {
                          setMessage(t("No backup yet"));
                          return;
                        }
                        download(
                          exportZip(
                            new Map(
                              backups
                                .at(-1)!
                                .files.filter(
                                  (x): x is [string, Uint8Array] =>
                                    x[1] !== null,
                                ),
                            ),
                          ),
                          "cheats-backup.zip",
                          "application/zip",
                        );
                      })
                    }
                  >
                    {t("Download latest backup")}
                  </button>
                </div>
                <button
                  className="danger"
                  onClick={() =>
                    setDialog({
                      title: "Clear local data",
                      description:
                        "Clear drafts, backups and preferences from this browser? Local source files are not deleted.",
                      danger: true,
                      action: async () => {
                        await clearLocal();
                        adapter.current = new VirtualAdapter(new Map());
                        setBaseline(new Map());
                        setWork(new Map());
                        setDocs(new Map());
                        setActive(false);
                        setSettings(defaultSettings);
                        setSourceName("");
                        setOutputHandle(undefined);
                        setBuilderOutput("");
                        setRecovered(false);
                        setConflict(undefined);
                        setRecoveryError(false);
                      },
                    })
                  }
                >
                  {t("Clear local data")}
                </button>
                <p>
                  <a
                    href="https://github.com/solleo1989/SwitchCheatCodeManager"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("GPL-3.0 · Source and attribution")}
                  </a>
                </p>
                <p>
                  <a
                    href="./source.zip"
                    download="switch-cheats-manager-source.zip"
                  >
                    {t("Download source")}
                  </a>{" "}
                  ·{" "}
                  <a href="./LICENSE.txt" target="_blank" rel="noreferrer">
                    GPL-3.0
                  </a>
                </p>
              </section>
            </div>
          </div>
        ) : !active ? (
          <section className="welcome">
            <div className="welcome-mark" aria-hidden="true">
              {"{ }"}
            </div>
            <p className="eyebrow">{t("Local workspace")}</p>
            <h1>{t("Your cheats. Your files.")}</h1>
            <p>
              {t(
                "Open a local folder or import a library to begin. Editing and recovery stay on this device.",
              )}
            </p>
            <div className="toolbar">{importControls}</div>
            <button
              className="text-button"
              onClick={() => {
                adopt(
                  new Map(),
                  new VirtualAdapter(new Map(), t("New library")),
                  t("New library"),
                );
              }}
            >
              {t("New workspace")}
            </button>
            <div className="welcome-note">
              <strong>{t("Direct folder access")}</strong>
              <p>
                {t(
                  window.showDirectoryPicker
                    ? "A folder permission is required to read or write files."
                    : "Direct access is unavailable in this browser. Import files or a ZIP, then download your changes.",
                )}
              </p>
            </div>
          </section>
        ) : (
          <div className="workspace">
            <aside className="library-panel">
              <div className="panel-heading">
                <h2>{t("Library")}</h2>
                <span>{library.games.length}</span>
              </div>
              <div className="library-tools">
                <input
                  aria-label={t("Search games")}
                  placeholder={t("Search games")}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <button onClick={newGame}>{t("New game")}</button>
              </div>
              <div className="game-list">
                {library.games
                  .filter((g) =>
                    `${g.name} ${g.id}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  )
                  .map((g) => (
                    <button
                      className={`game-row ${game?.root === g.root ? "selected" : ""}`}
                      key={g.root}
                      onClick={() => {
                        setGameRoot(g.root);
                        setPath("");
                      }}
                    >
                      <strong>{g.name}</strong>
                      <code>{g.id}</code>
                      <span>
                        {g.builds.length} {t("Builds")}
                      </span>
                    </button>
                  ))}
                {!library.games.length ? (
                  <div className="panel-empty">
                    <strong>{t("No games yet")}</strong>
                    <p>{t("Create a game or import your cheat library.")}</p>
                  </div>
                ) : (
                  !library.games.some((g) =>
                    `${g.name} ${g.id}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  ) && (
                    <div className="panel-empty">
                      <strong>{t("No matching games")}</strong>
                      <p>{t("Try a different name or Title ID.")}</p>
                    </div>
                  )
                )}
              </div>
              <details className="library-import">
                <summary>{t("Open another library")}</summary>
                <div className="stack">
                  {importControls}
                  <button
                    onClick={() =>
                      replaceWorkspace(() =>
                        adopt(
                          new Map(),
                          new VirtualAdapter(new Map()),
                          t("New library"),
                        ),
                      )
                    }
                  >
                    {t("New workspace")}
                  </button>
                </div>
              </details>
            </aside>
            <section className="workspace-content">
              {!game ? (
                <div className="empty-state">
                  <h1>{t("No games yet")}</h1>
                  <p>{t("Create a game or import your cheat library.")}</p>
                  <button className="primary" onClick={newGame}>
                    {t("New game")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="game-heading">
                    {imageUrl && (
                      <img
                        className="game-image"
                        src={imageUrl}
                        alt={game.name}
                      />
                    )}
                    <div>
                      <p className="eyebrow">{game.id}</p>
                      <h1>{game.name}</h1>
                    </div>
                    <details className="game-actions">
                      <summary>{t("Settings")}</summary>
                      <div className="action-menu">
                        <button onClick={renameGame}>{t("Rename game")}</button>
                        <button onClick={editMappings}>
                          {t("Edit mappings")}
                        </button>
                        <button onClick={() => imageInput.current?.click()}>
                          {t("Attach image")}
                        </button>
                        <button onClick={() => format(true)} disabled={!doc}>
                          {t("Format all builds")}
                        </button>
                        <button
                          className="danger"
                          onClick={() => removeGameOrBuild(true)}
                        >
                          {t("Delete game")}
                        </button>
                      </div>
                    </details>
                  </div>
                  {game.indexCandidates.length > 1 && !game.indexPath && (
                    <div className="banner warning">
                      <label>
                        {t(
                          "Several metadata files were found. Select the version index to edit mappings.",
                        )}
                        <select
                          aria-label={t("Metadata file")}
                          value=""
                          onChange={(e) =>
                            setOverrides({
                              ...overrides,
                              [game.root]: e.target.value,
                            })
                          }
                        >
                          <option value="">{t("Choose metadata file")}</option>
                          {game.indexCandidates.map((p) => (
                            <option key={p} value={p}>
                              {p.split("/").at(-1)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  <div className="build-toolbar">
                    <label className="build-selector">
                      <span>{t("Builds")}</span>
                      <select
                        aria-label={t("Builds")}
                        value={selectedPath}
                        onChange={(e) => setPath(e.target.value)}
                      >
                        {builds.map((b) => (
                          <option key={b.path} value={b.path}>
                            {b.version ? `v${b.version} · ` : ""}
                            {b.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button onClick={newBuild}>{t("New build")}</button>
                    <button onClick={renameBuild} disabled={!selected}>
                      {t("Rename build")}
                    </button>
                    <button onClick={normalizeIds}>{t("Normalize IDs")}</button>
                    <button
                      onClick={() => removeGameOrBuild(false)}
                      disabled={!selected}
                    >
                      {t("Delete build")}
                    </button>
                  </div>
                  {view === "compare" ? (
                    <section className="compare-page">
                      {conflict ? (
                        <>
                          <div className="comparison-labels">
                            <strong>{t("External file")}</strong>
                            <strong>{t("Your edit")}</strong>
                          </div>
                          <Comparison
                            left={
                              conflict.external
                                ? decodeDocument(conflict.external).text
                                : ""
                            }
                            right={
                              tree.has(conflict.path)
                                ? decodeDocument(tree.get(conflict.path)!).text
                                : ""
                            }
                          />
                        </>
                      ) : builds.length > 1 ? (
                        <>
                          <div className="comparison-labels">
                            <label>
                              {t("Left build")}
                              <select
                                value={left}
                                onChange={(e) => setLeftPath(e.target.value)}
                              >
                                {builds.map((b) => (
                                  <option key={b.path} value={b.path}>
                                    {b.version || b.id}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              {t("Right build")}
                              <select
                                value={right}
                                onChange={(e) => setRightPath(e.target.value)}
                              >
                                {builds.map((b) => (
                                  <option key={b.path} value={b.path}>
                                    {b.version || b.id}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <Comparison
                            left={decodeDocument(tree.get(left)!).text}
                            right={decodeDocument(tree.get(right)!).text}
                          />
                        </>
                      ) : (
                        <div className="empty-state">
                          <h2>{t("Select two builds")}</h2>
                          <p>
                            {t(
                              "Import or create a second build to compare files.",
                            )}
                          </p>
                          <button onClick={newBuild}>{t("New build")}</button>
                        </div>
                      )}
                    </section>
                  ) : doc ? (
                    <>
                      <div className="editor-toolbar">
                        <span className="filename">
                          {selected!.id}.txt{doc.modified && " *"}
                        </span>
                        <div className="toolbar">
                          <button
                            onClick={() => format(false)}
                            disabled={doc.encoding === "unsupported"}
                          >
                            {t("Format")}
                          </button>
                          <button
                            onClick={() =>
                              download(
                                encodeDocument(doc),
                                selected!.id + ".txt",
                              )
                            }
                          >
                            {t("Download file")}
                          </button>
                          <button onClick={() => setOutline(!outline)}>
                            {t(outline ? "Hide outline" : "Show outline")}
                          </button>
                        </div>
                      </div>
                      {doc.encoding === "unsupported" && (
                        <div className="banner warning">
                          <p>
                            {t(
                              "This encoding is unsupported. Review the decoded preview before converting to UTF-8.",
                            )}
                          </p>
                          <button
                            onClick={() =>
                              setDialog({
                                title: "Convert encoding",
                                description:
                                  "This encoding is unsupported. Review the decoded preview before converting to UTF-8.",
                                body: (
                                  <pre className="encoding-preview">
                                    {doc.text}
                                  </pre>
                                ),
                                action: () =>
                                  setDocs(
                                    new Map(docs).set(
                                      selectedPath,
                                      convertDocument(doc),
                                    ),
                                  ),
                              })
                            }
                          >
                            {t("Convert encoding")}
                          </button>
                        </div>
                      )}
                      <div
                        className={`editor-layout ${outline ? "" : "without-outline"}`}
                      >
                        <div className="editor-pane">
                          <CodeEditor
                            key={selectedPath}
                            value={doc.text}
                            readOnly={doc.encoding === "unsupported"}
                            onChange={changeText}
                            reveal={reveal}
                            label={t("Editor")}
                          />
                        </div>
                        {outline && (
                          <aside className="outline">
                            <div className="panel-heading">
                              <h2>{t("Outline")}</h2>
                            </div>
                            <button
                              disabled={doc.encoding === "unsupported"}
                              onClick={() =>
                                setDialog({
                                  title: "Add section",
                                  fields: [{ key: "name", label: "Name" }],
                                  action: (values) =>
                                    changeText(
                                      addSection(
                                        doc.text,
                                        values.name,
                                        doc.newline,
                                      ),
                                    ),
                                })
                              }
                            >
                              {t("Add section")}
                            </button>
                            <div className="outline-list">
                              {doc.nodes
                                .filter((n) => n.kind !== "sectionEnd")
                                .map((n) => (
                                  <div
                                    key={n.id}
                                    className={`outline-row ${n.kind}`}
                                  >
                                    <button
                                      className="outline-title"
                                      onClick={() =>
                                        setReveal({
                                          line: n.line,
                                          nonce: Date.now(),
                                        })
                                      }
                                    >
                                      {n.title || "—"}
                                    </button>
                                    {n.kind === "cheat" && (
                                      <input
                                        type="checkbox"
                                        aria-label={`${t("Enabled")}: ${n.title}`}
                                        checked={n.enabled}
                                        disabled={
                                          doc.encoding === "unsupported"
                                        }
                                        onChange={(e) =>
                                          changeText(
                                            setEnabled(
                                              doc.text,
                                              n,
                                              e.target.checked,
                                            ),
                                          )
                                        }
                                      />
                                    )}
                                    {n.kind === "sectionStart" && (
                                      <button
                                        className="mini"
                                        onClick={() =>
                                          setDialog({
                                            title: "Rename section",
                                            fields: [
                                              {
                                                key: "name",
                                                label: "Name",
                                                value: n.title,
                                              },
                                            ],
                                            action: (values) =>
                                              changeText(
                                                renameSection(
                                                  doc.text,
                                                  n,
                                                  values.name,
                                                ),
                                              ),
                                          })
                                        }
                                      >
                                        {t("Rename")}
                                      </button>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </aside>
                        )}
                      </div>
                      <details
                        className="diagnostics"
                        open={doc.diagnostics.some(
                          (d) => d.severity === "error",
                        )}
                      >
                        <summary>
                          {t("Syntax checks")} ·{" "}
                          {diagnosticsFor(doc).length || t("No syntax issues")}
                        </summary>
                        <p>
                          {t(
                            "Syntax checks do not prove that a cheat works for your game.",
                          )}
                        </p>
                        {diagnosticsFor(doc).map((d, i) => (
                          <button
                            key={i}
                            className={`diagnostic ${d.severity}`}
                            onClick={() =>
                              setReveal({ line: d.line, nonce: Date.now() })
                            }
                          >
                            {t("Line")} {d.line}: {t(d.code)}
                            {d.detail ? ` (${d.detail})` : ""}
                          </button>
                        ))}
                      </details>
                    </>
                  ) : (
                    <div className="empty-state">
                      <h2>{t("No builds")}</h2>
                      <p>{t("Select a build to edit its cheats.")}</p>
                      <button onClick={newBuild}>{t("New build")}</button>
                    </div>
                  )}
                  <div className="export-bar">
                    <div className="toolbar">
                      <button onClick={() => exportLibrary(true)}>
                        {t("Export game")}
                      </button>
                      <button onClick={() => exportLibrary()}>
                        {t("Export library")}
                      </button>
                    </div>
                    <div className="toolbar">
                      <span>
                        {t("Output")}: {outputHandle?.name ?? t("Download")}
                      </span>
                      <button
                        disabled={!window.showDirectoryPicker}
                        onClick={() =>
                          run(async () => {
                            const handle = await window.showDirectoryPicker!({
                              id: "cheat-output",
                              mode: "readwrite",
                            });
                            setOutputHandle(handle);
                          })
                        }
                      >
                        {t("Choose output")}
                      </button>
                      <button
                        disabled={!outputHandle || !selected}
                        onClick={() => copyToOutput(false)}
                      >
                        {t("Copy file to output")}
                      </button>
                      <button
                        disabled={!outputHandle}
                        onClick={() => copyToOutput(true)}
                      >
                        {t("Copy game to output")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>
      <footer className="statusbar">
        <span>
          {busy ? t("Working…") : message || sourceName || t("Local workspace")}
        </span>
        <span aria-live="polite">
          {recoveryError
            ? t(
                "Recovery could not be saved. Download your work before closing.",
              )
            : t("Recovery saved locally")}{" "}
          · {pending.operations.length} {t("Pending changes")}
          {offlineReady ? ` · ${t("Offline ready")}` : ""}
        </span>
      </footer>
      <input
        hidden
        ref={fileInput}
        type="file"
        multiple
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          void run(async () =>
            imported(await filesToTree(files), t("Imported workspace")),
          );
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={folderInput}
        type="file"
        multiple
        {...{ webkitdirectory: "" }}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          void run(async () =>
            imported(
              await filesToTree(files),
              files[0]?.webkitRelativePath.split("/")[0] ??
                t("Imported workspace"),
            ),
          );
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={zipInput}
        type="file"
        accept=".zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            void run(async () =>
              imported(
                importZip(new Uint8Array(await file.arrayBuffer())),
                file.name,
              ),
            );
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        multiple
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (game)
            void run(async () => {
              const next = currentTree();
              for (const f of files) {
                const p = `${game.root}/${safeName(f.name)}`;
                if (next.has(p)) throw new Error("exists");
                if (f.size > 32 * 1024 * 1024) throw new Error("archiveLimit");
                next.set(p, new Uint8Array(await f.arrayBuffer()));
              }
              stage(next);
            });
          e.target.value = "";
        }}
      />
      {dialog && (
        <Dialog
          key={dialog.title + dialog.fields?.map((f) => f.value).join("")}
          request={dialog}
          close={() =>
            setDialog((current) => (current === dialog ? null : current))
          }
          t={t}
        />
      )}
    </div>
  );
}
