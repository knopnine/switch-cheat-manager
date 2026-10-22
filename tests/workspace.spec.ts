import { test, expect, type Page } from "@playwright/test";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
const tid = "0100000000000001",
  a = "AAAAAAAAAAAAAAAA",
  b = "BBBBBBBBBBBBBBBB";
const cheat = "[Fixture Game]\r\n\r\n[Coins]\r\n04000000 00000100 00000001\r\n";
const zip = zipSync({
  [`${tid}/Fixture Game.txt`]: strToU8(`${a}\t1.10\r\n${b}\t1.9\r\n`),
  [`${tid}/cheats/${a}.txt`]: strToU8(cheat),
  [`${tid}/cheats/${b}.txt`]: strToU8(
    "[Coins]\n04000000 00000100 00000002\n[Extra]\nF0000000\n",
  ),
  [`${tid}/notes.bin`]: new Uint8Array([0, 255, 3]),
});
async function importFixture(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your cheats. Your files." }),
  ).toBeVisible();
  await page.locator('input[type=file][accept=".zip"]').setInputFiles({
    name: "fixture.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zip),
  });
  await expect(
    page.getByRole("heading", { name: "Fixture Game", exact: true }),
  ).toBeVisible();
}
test("imports, edits duplicate-safe outline, exports current bytes and recovers offline", async ({
  page,
  context,
  browserName,
}) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:4173/") &&
      !/^(blob:|data:)/.test(request.url())
    )
      externalRequests.push(request.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await importFixture(page);
  await expect(page.getByLabel("Builds", { exact: true })).toHaveValue(
    `${tid}/cheats/${a}.txt`,
  );
  await page.getByRole("checkbox", { name: "Enabled: Coins" }).check();
  await expect(
    page.getByRole("textbox", { name: "Editor", exact: true }),
  ).toContainText("[Coins:ENABLED]");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export library", exact: true })
    .click();
  const download = await downloadEvent;
  const exported = unzipSync(
    new Uint8Array(await readFile((await download.path())!)),
  );
  expect(strFromU8(exported[`${tid}/cheats/${a}.txt`])).toContain(
    "[Coins:ENABLED]",
  );
  expect(exported[`${tid}/notes.bin`]).toEqual(new Uint8Array([0, 255, 3]));
  await expect(page.locator(".statusbar")).toContainText("1 Pending changes");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(
    page.getByText("Drafts recovered", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Editor", exact: true }),
  ).toContainText(":ENABLED");
  await page
    .getByRole("button", { name: "Save changes", exact: false })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toContainText("Replaced");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.locator(".statusbar")).toContainText("0 Pending changes");
  if (browserName === "chromium") {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForTimeout(500);
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Fixture Game", exact: true }),
    ).toBeVisible();
    await context.setOffline(false);
  }
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
test("creates games, stages builds and maintains mappings", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New game", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Game name").fill("New Game");
  await dialog.getByLabel("Title ID").fill(tid);
  await dialog.getByLabel("Build ID").fill(a);
  await dialog.getByRole("button", { name: "Stage changes" }).click();
  await expect(
    page.getByRole("heading", { name: "New Game", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New build", exact: true }).click();
  await dialog.getByLabel("Build ID").fill(b);
  await dialog.getByLabel("Version", { exact: true }).fill("1.2.0");
  await dialog.getByRole("button", { name: "Stage changes" }).click();
  await expect(
    page.getByLabel("Builds", { exact: true }).locator("option"),
  ).toHaveCount(2);
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export library", exact: true })
    .click();
  const files = unzipSync(
    new Uint8Array(await readFile((await (await event).path())!)),
  );
  expect(strFromU8(files[`${tid}/New Game.txt`])).toContain(`${b}\t1.2.0`);
  expect(files[`${tid}/cheats/${b}.txt`]).toBeDefined();
});
test("builder fixes, comparison, themes, Chinese and narrow layout", async ({
  page,
}, info) => {
  await importFixture(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-desktop.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.locator(".cm-mergeView")).toBeVisible();
  await expect(page.locator(".comparison")).toContainText("Extra");
  await page.getByRole("button", { name: "Builder", exact: true }).click();
  const panel = page.locator(".tool-panel").first();
  await panel.getByLabel("Operation", { exact: true }).selectOption("2");
  await expect(panel.locator(".instruction")).toHaveText("20000000");
  await panel.getByLabel("End / Else", { exact: true }).selectOption("1");
  await expect(panel.locator(".instruction")).toHaveText("21000000");
  await panel.getByRole("button", { name: "Add instruction" }).click();
  await expect(
    page.getByRole("textbox", { name: "Output buffer", exact: true }),
  ).toHaveValue("21000000\n");
  await page.getByRole("button", { name: "Insert into editor" }).click();
  await expect(
    page.getByRole("textbox", { name: "Editor", exact: true }),
  ).toContainText("21000000");
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Language", { exact: true }).selectOption("zh");
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "编辑器", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-mobile.png`,
    fullPage: true,
  });
});

test("typing preserves source line endings and keyboard dialogs restore focus", async ({
  page,
}) => {
  await importFixture(page);
  const editor = page.getByRole("textbox", { name: "Editor", exact: true });
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("F0000000");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download file", exact: true })
    .click();
  const text = (await readFile((await (await event).path())!)).toString("utf8");
  expect(text).toContain("F0000000");
  expect(text.replaceAll("\r\n", "")).not.toContain("\n");
  const newBuild = page.getByRole("button", { name: "New build", exact: true });
  await newBuild.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").getByLabel("Build ID")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(newBuild).toBeFocused();
});

test("storage exhaustion requires a backup and leaves edits pending", async ({
  page,
}) => {
  await importFixture(page);
  await page.getByRole("checkbox", { name: "Enabled: Coins" }).check();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function (): IDBRequest {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await page
    .getByRole("button", { name: "Save changes", exact: false })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Backup required" }),
  ).toBeVisible();
  const backup = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Download backup and continue" })
    .click();
  await backup;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Backup saved — apply changes" })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Your edits remain pending",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.locator(".statusbar")).toContainText("1 Pending changes");
  const exportEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export library", exact: true })
    .click();
  const contents = unzipSync(
    new Uint8Array(await readFile((await (await exportEvent).path())!)),
  );
  expect(strFromU8(contents[`${tid}/cheats/${a}.txt`])).toContain(":ENABLED");
});

test("denied folder permission gives an actionable fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open folder", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Folder permission was denied",
  );
  await expect(
    page.getByRole("button", { name: "Import ZIP", exact: true }),
  ).toBeEnabled();
});
