export type NodeKind =
  "title" | "cheat" | "master" | "sectionStart" | "sectionEnd";
export interface CheatNode {
  id: string;
  kind: NodeKind;
  title: string;
  enabled: boolean;
  from: number;
  to: number;
  headerFrom: number;
  headerTo: number;
  line: number;
}
export interface Diagnostic {
  line: number;
  severity: "error" | "warning";
  code: string;
  detail?: string;
}
export type Encoding = "utf-8" | "utf-16le" | "utf-16be" | "unsupported";
export interface CheatDocument {
  originalBytes: Uint8Array;
  text: string;
  originalText: string;
  encoding: Encoding;
  bom: boolean;
  newline: "\r\n" | "\n" | "\r";
  nodes: CheatNode[];
  diagnostics: Diagnostic[];
  modified: boolean;
  converted?: boolean;
}

export function parseCheats(text: string): {
  nodes: CheatNode[];
  diagnostics: Diagnostic[];
} {
  const nodes: CheatNode[] = [],
    diagnostics: Diagnostic[] = [];
  const lines = [...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)].filter(
    (m) => m[0].length,
  );
  const sections: { title: string; line: number }[] = [];
  let current: CheatNode | undefined,
    count = 0;
  const endBlock = () => {
    if (count > 64 && current)
      diagnostics.push({
        line: current.line,
        severity: "warning",
        code: "lineLimit",
        detail: String(count),
      });
    count = 0;
  };
  lines.forEach((m, i) => {
    const value = m[1].trim(),
      from = m.index!,
      line = i + 1;
    const header = /^\[(.*)\]$/.exec(value);
    if (header) {
      endBlock();
      if (current) current.to = from;
      let title = header[1],
        kind: NodeKind = "cheat";
      const section = /^--Section(Start|End):(.*)--$/.exec(title);
      if (section) {
        title = section[2];
        kind = section[1] === "Start" ? "sectionStart" : "sectionEnd";
        if (kind === "sectionStart") sections.push({ title, line });
        else if (sections.at(-1)?.title === title) sections.pop();
        else
          diagnostics.push({
            line,
            severity: "error",
            code: "sectionMismatch",
            detail: title,
          });
      }
      const enabled = title.endsWith(":ENABLED");
      if (enabled) title = title.slice(0, -8);
      current = {
        id: `${from}`,
        kind,
        title,
        enabled,
        from,
        to: text.length,
        headerFrom: from + m[1].indexOf("["),
        headerTo: from + m[1].lastIndexOf("]") + 1,
        line,
      };
      nodes.push(current);
      return;
    }
    if (!value) return;
    if (/^\{.*\}$/.test(value)) {
      const nextCode = lines
        .slice(i + 1)
        .find((next) => next[1].trim())?.[1]
        .trim();
      if (
        (!current ||
          (current.kind === "cheat" &&
            nodes.length === 1 &&
            !current.enabled &&
            /master/i.test(value) &&
            !count &&
            !text.slice(current.headerTo, from).trim())) &&
        nextCode &&
        /^[\da-fA-F]{8}(?:\s+[\da-fA-F]{8}){0,3}$/.test(nextCode)
      ) {
        if (current) {
          current.kind = "title";
          current.to = from;
        }
        current = {
          id: `${from}`,
          kind: "master",
          title: value.slice(1, -1),
          enabled: false,
          from,
          to: text.length,
          headerFrom: from,
          headerTo: from + m[1].length,
          line,
        };
        nodes.push(current);
      }
      return;
    }
    if (/^[\[{]/.test(value))
      diagnostics.push({ line, severity: "error", code: "malformedHeader" });
    else if (!/^[\da-fA-F]{8}(?:\s+[\da-fA-F]{8}){0,3}$/.test(value))
      diagnostics.push({ line, severity: "error", code: "invalidCode" });
    else if (!current)
      diagnostics.push({ line, severity: "warning", code: "orphanCode" });
    else count++;
  });
  endBlock();
  for (const section of sections)
    diagnostics.push({
      line: section.line,
      severity: "error",
      code: "unclosedSection",
      detail: section.title,
    });
  if (nodes[0]?.kind === "cheat") {
    const first = nodes[0];
    if (
      !first.enabled &&
      text
        .slice(first.headerTo, first.to)
        .split(/\r\n|\n|\r/)
        .every((line) => !line.trim() || /^\{.*\}$/.test(line.trim()))
    )
      first.kind = "title";
  }
  return { nodes, diagnostics };
}

export function decodeDocument(bytes: Uint8Array): CheatDocument {
  let encoding: Encoding = "utf-8";
  const bom =
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) ||
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (encoding === "utf-8" && text.includes("\0")) throw new Error("binary");
  } catch {
    encoding = "unsupported";
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  const newline =
    (/\r\n|\n|\r/.exec(text)?.[0] as CheatDocument["newline"]) ?? "\r\n";
  return {
    originalBytes: bytes.slice(),
    text,
    originalText: text,
    encoding,
    bom,
    newline,
    ...parseCheats(text),
    modified: false,
  };
}
export function updateDocument(
  doc: CheatDocument,
  text: string,
): CheatDocument {
  return {
    ...doc,
    text,
    ...parseCheats(text),
    modified: !!doc.converted || text !== doc.originalText,
  };
}
export function encodeDocument(doc: CheatDocument): Uint8Array {
  if (!doc.modified) return doc.originalBytes.slice();
  if (doc.encoding === "unsupported") throw new Error("encodingRequired");
  if (doc.encoding === "utf-8") {
    const bytes = new TextEncoder().encode(doc.text);
    return doc.bom ? new Uint8Array([239, 187, 191, ...bytes]) : bytes;
  }
  const offset = doc.bom ? 2 : 0,
    bytes = new Uint8Array(doc.text.length * 2 + offset),
    view = new DataView(bytes.buffer),
    little = doc.encoding === "utf-16le";
  if (doc.bom) view.setUint16(0, 0xfeff, little);
  for (let i = 0; i < doc.text.length; i++)
    view.setUint16(offset + i * 2, doc.text.charCodeAt(i), little);
  return bytes;
}
export function convertDocument(doc: CheatDocument): CheatDocument {
  return {
    ...doc,
    encoding: "utf-8",
    bom: false,
    modified: true,
    converted: true,
  };
}
export function setEnabled(
  text: string,
  node: CheatNode,
  enabled: boolean,
): string {
  return (
    text.slice(0, node.headerFrom) +
    `[${node.title}${enabled ? ":ENABLED" : ""}]` +
    text.slice(node.headerTo)
  );
}
export function renameSection(
  text: string,
  node: CheatNode,
  title: string,
): string {
  if (!title.trim() || /[\r\n\[\]]/.test(title)) throw new Error("invalidName");
  const nodes = parseCheats(text).nodes;
  const index = nodes.findIndex((n) => n.id === node.id);
  let depth = 0,
    end: CheatNode | undefined;
  for (const n of nodes.slice(index + 1)) {
    if (n.kind === "sectionStart") depth++;
    if (n.kind === "sectionEnd") {
      if (!depth) {
        end = n;
        break;
      }
      depth--;
    }
  }
  if (!end || node.kind !== "sectionStart") throw new Error("sectionMismatch");
  const replace = (s: string, n: CheatNode, kind: string) =>
    s.slice(0, n.headerFrom) +
    `[--Section${kind}:${title.trim()}--]` +
    s.slice(n.headerTo);
  return replace(replace(text, end, "End"), node, "Start");
}
export function addSection(
  text: string,
  title: string,
  newline = "\r\n",
): string {
  if (!title.trim() || /[\r\n\[\]]/.test(title)) throw new Error("invalidName");
  return (
    text +
    (text && !/[\r\n]$/.test(text) ? newline : "") +
    `${newline}[--SectionStart:${title.trim()}--]${newline}00000000 00000000 00000000${newline}${newline}[--SectionEnd:${title.trim()}--]${newline}00000000 00000000 00000000${newline}`
  );
}
export function formatCheats(text: string, newline = "\r\n"): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => {
      const value = line.trim();
      return /^[\da-fA-F]{8}(?:\s+[\da-fA-F]{8}){0,3}$/.test(value)
        ? value.toUpperCase().replace(/\s+/g, " ")
        : line;
    })
    .join(newline);
}
export function diagnosticsFor(doc: CheatDocument): Diagnostic[] {
  const size =
    doc.encoding === "unsupported"
      ? doc.originalBytes.length
      : encodeDocument(doc).length;
  return [
    ...doc.diagnostics,
    ...(size >= 32768
      ? [
          {
            line: 1,
            severity: "warning" as const,
            code: "sizeLimit",
            detail: String(size),
          },
        ]
      : []),
  ];
}
export function editorText(raw: string): string {
  return raw.replace(/\r\n|\r/g, "\n");
}
export function applyEditorChanges(
  raw: string,
  changes: { from: number; to: number; insert: string }[],
  newline = /\r\n|\r|\n/.exec(raw)?.[0] ?? "\r\n",
): string {
  const offsets: number[] = [0];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "\r" && raw[i + 1] === "\n") i++;
    offsets.push(i + 1);
  }
  let result = raw;
  for (const change of [...changes].reverse()) {
    const from = offsets[change.from],
      to = offsets[change.to];
    if (from === undefined || to === undefined || from > to)
      throw new Error("invalidEditorRange");
    result =
      result.slice(0, from) +
      editorText(change.insert).replace(/\n/g, newline) +
      result.slice(to);
  }
  return result;
}
