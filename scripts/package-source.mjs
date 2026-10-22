import {
  readFileSync,
  readdirSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import "./build-guide.mjs";

const source = {};
function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile())
      source[path.replaceAll("\\", "/")] = new Uint8Array(readFileSync(path));
  }
}
for (const dir of ["src", "tests", "scripts"]) collect(dir);
for (const file of [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "vite.config.ts",
  "playwright.config.ts",
  "index.html",
  "LICENSE",
  "ATTRIBUTION.md",
  "README.md",
  "USER_GUIDE.md",
  "DESIGN.md",
  ".gitignore",
  "public/icon.svg",
  "public/icon-192.png",
  "public/icon-512.png",
])
  source[file] = new Uint8Array(readFileSync(file));
writeFileSync("public/source.zip", zipSync(source, { level: 6 }));
copyFileSync("LICENSE", "public/LICENSE.txt");
copyFileSync("ATTRIBUTION.md", "public/ATTRIBUTION.txt");
