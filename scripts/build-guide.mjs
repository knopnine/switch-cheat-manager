import { readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";

const markdown = readFileSync("USER_GUIDE.md", "utf8");
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
marked.use({
  renderer: {
    heading(token) {
      return `<h${token.depth} id="${slug(token.text)}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
    },
  },
});
const escape = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const contents = marked
  .lexer(markdown)
  .filter((token) => token.type === "heading" && token.depth === 2)
  .map(
    (token) =>
      `<li><a href="#${slug(token.text)}">${escape(token.text)}</a></li>`,
  )
  .join("");
const html = marked
  .parse(markdown)
  .replaceAll("<table>", '<div class="table-scroll"><table>')
  .replaceAll("</table>", "</table></div>");
writeFileSync(
  "public/user-guide.html",
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>User guide · Switch Cheats Manager</title><link rel="icon" href="./icon.svg"><style>
:root{color-scheme:light dark;--bg:#f5f4f1;--surface:#fff;--ink:#22252b;--muted:#555961;--line:#858990;--accent:#b4232d}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.75 system-ui,sans-serif}header,main,footer{max-width:980px;margin:auto;padding:24px}header{display:flex;gap:20px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}a{color:var(--accent);text-underline-offset:3px}a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}header a{min-height:44px;display:inline-flex;align-items:center}h1{font-size:clamp(1.8rem,4vw,2.7rem);line-height:1.2;letter-spacing:-.04em;margin:28px 0}h2{font-size:1.45rem;line-height:1.35;scroll-margin-top:20px;margin:48px 0 18px}h3{font-size:1.1rem;margin-top:28px}p,li{overflow-wrap:anywhere}li{margin:8px 0}code{font: .9em ui-monospace,Consolas,monospace;background:var(--bg);padding:2px 4px}pre{background:var(--surface);border:1px solid var(--line);padding:16px;overflow:auto;line-height:1.6}pre code{padding:0;background:none}.table-scroll{overflow:auto;border:1px solid var(--line);margin:22px 0}table{border-collapse:collapse;width:100%;min-width:560px;background:var(--surface);text-align:left}th,td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top;font-size:.92rem}th{background:var(--bg)}nav{background:var(--surface);border:1px solid var(--line);padding:16px 22px;margin:28px 0}nav summary{cursor:pointer;font-weight:600;min-height:44px}nav ol{columns:2;padding-left:24px}nav a{display:inline-block;padding:3px 0}footer{color:var(--muted);border-top:1px solid var(--line);font-size:.85rem}@media(prefers-color-scheme:dark){:root{--bg:#17191d;--surface:#202328;--ink:#f0efeb;--muted:#b4b6be;--line:#858a94;--accent:#f18d93}}@media(max-width:620px){header,main,footer{padding:18px}nav ol{columns:1}h2{margin-top:36px}header{flex-wrap:wrap}}@media print{header,nav{display:none}body{background:white;color:black;font-size:11pt}a{color:inherit}main{max-width:none}pre,table{background:white}h2,h3{break-after:avoid}.table-scroll{overflow:visible}table{min-width:0}}
</style></head><body><header><strong>Switch Cheats Manager</strong><a href="./index.html">Open the app</a><a href="./USER_GUIDE.md" download>Download Markdown guide</a></header><main><nav aria-label="Guide contents"><details open><summary>In this guide</summary><ol>${contents}</ol></details></nav>${html}</main><footer>Local documentation · English · Source references checked October 21, 2026</footer></body></html>`,
);
writeFileSync("public/USER_GUIDE.md", markdown);
