import { openDB } from "idb";
let connection: ReturnType<typeof openDB> | undefined;
function db() {
  return (connection ??= openDB("switch-cheats-local", 1, {
    upgrade(database) {
      database.createObjectStore("local");
    },
  }));
}
export async function loadLocal<T>(key: string): Promise<T | undefined> {
  return (await db()).get("local", key);
}
export async function saveLocal(key: string, value: unknown): Promise<void> {
  await (await db()).put("local", value, key);
}
export async function clearLocal(): Promise<void> {
  await (await db()).clear("local");
}
export async function captureBackup(
  files: [string, Uint8Array | null][],
): Promise<void> {
  const backups =
    (await loadLocal<{ date: string; files: [string, Uint8Array | null][] }[]>(
      "backups",
    )) ?? [];
  await saveLocal("backups", [
    ...backups.slice(-9),
    { date: new Date().toISOString(), files },
  ]);
}
