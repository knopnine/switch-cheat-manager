import { describe, expect, it } from "vitest";
import { contrast, foreground } from "./contrast";
import {
  addSection,
  convertDocument,
  decodeDocument,
  diagnosticsFor,
  encodeDocument,
  formatCheats,
  parseCheats,
  renameSection,
  setEnabled,
  updateDocument,
  editorText,
  applyEditorChanges,
} from "./documents";
import {
  calculateHex,
  convertNumber,
  generateInstruction,
  type InstructionSpec,
} from "./builder";
import {
  checkId,
  discoverLibrary,
  normalizeImportedTree,
  parseVersions,
  serializeVersions,
  writeVersions,
  normalizeGamePaths,
  utf8,
} from "./library";

describe("lossless cheat documents", () => {
  it("keeps brace comments inside ordinary cheats, including immediately after the header", () => {
    const text =
      "[Coins]\n{Keep this comment here}\n04000000 00000000 00000001\n[Other]\n{Another comment}\nF0000000\n";
    const parsed = parseCheats(text);
    expect(parsed.nodes.map((n) => n.kind)).toEqual(["cheat", "cheat"]);
    expect(setEnabled(text, parsed.nodes[0], true)).toContain(
      "[Coins:ENABLED]\n{Keep this comment here}",
    );
  });
  it("maps editor edits back to raw CRLF and mixed line-ending offsets", () => {
    const raw =
      "[标题]\r\nF0000000\n{é}\r[Money]\r\n04000000 00000000 00000001\r\n";
    const pos = editorText(raw).indexOf("Money");
    expect(
      applyEditorChanges(raw, [{ from: pos, to: pos + 5, insert: "Coins" }]),
    ).toBe(raw.replace("Money", "Coins"));
    const last = editorText(raw).lastIndexOf("00000001");
    expect(
      applyEditorChanges(raw, [
        { from: pos, to: pos + 5, insert: "Coins" },
        { from: last, to: last + 8, insert: "00000002" },
      ]),
    ).toBe(raw.replace("Money", "Coins").replace("00000001", "00000002"));
  });
  it("retains untouched bytes, BOM, mixed line endings and unknown opcodes", () => {
    const bytes = new Uint8Array([
      239,
      187,
      191,
      ...utf8(
        "[游戏]\r\n\n{Mastercode}\r\n04000000 00000100 00000001\r\n\r\n[Unknown]\nF0000000\r",
      ),
    ]);
    const doc = decodeDocument(bytes);
    expect(encodeDocument(doc)).toEqual(bytes);
    expect(doc.bom).toBe(true);
    expect(doc.nodes.map((n) => n.kind)).toEqual(["title", "master", "cheat"]);
    const changed = updateDocument(
      doc,
      doc.text.replace("F0000000", "F0000001"),
    );
    expect(encodeDocument(changed).slice(0, 3)).toEqual(
      new Uint8Array([239, 187, 191]),
    );
    expect(decodeDocument(encodeDocument(changed)).text).toContain("游戏");
  });
  it.each(["utf-16le", "utf-16be"] as const)(
    "retains %s including BOM",
    (encoding) => {
      const base = {
        ...decodeDocument(utf8("[钱]\r\n04000000 00000000 00000001\r\n")),
        encoding,
        bom: true,
        modified: true,
      };
      const encoded = encodeDocument(base);
      const loaded = decodeDocument(encoded);
      expect(loaded.encoding).toBe(encoding);
      expect(loaded.text).toBe(base.text);
      expect(encodeDocument(loaded)).toEqual(encoded);
      expect(
        decodeDocument(
          encodeDocument(updateDocument(loaded, loaded.text + "\r\n")),
        ).text,
      ).toBe(loaded.text + "\r\n");
    },
  );
  it("requires explicit conversion for invalid UTF-8 and keeps conversion on further edits", () => {
    const doc = decodeDocument(new Uint8Array([91, 233, 93]));
    expect(doc.encoding).toBe("unsupported");
    expect(encodeDocument(doc)).toEqual(doc.originalBytes);
    expect(() => encodeDocument(updateDocument(doc, "[é]\n"))).toThrow(
      "encodingRequired",
    );
    const converted = updateDocument(convertDocument(doc), doc.text);
    expect(encodeDocument(converted)).not.toEqual(doc.originalBytes);
  });
  it("updates only one duplicate header", () => {
    const text =
      "[Same]\n04000000 00000000 00000001\n[Same]\n04000000 00000000 00000002\n";
    const nodes = parseCheats(text).nodes;
    expect(setEnabled(text, nodes[1], true)).toBe(
      "[Same]\n04000000 00000000 00000001\n[Same:ENABLED]\n04000000 00000000 00000002\n",
    );
  });
  it("renames the selected duplicate section pair only", () => {
    const text = addSection(addSection("", "Same", "\n"), "Same", "\n");
    const node = parseCheats(text).nodes.filter(
      (n) => n.kind === "sectionStart",
    )[1];
    const result = renameSection(text, node, "New");
    expect(result.match(/SectionStart:Same/g)).toHaveLength(1);
    expect(result).toContain("SectionEnd:New");
  });
  it("formats instructions without moving comments or rewriting titles", () => {
    expect(
      formatCheats(
        "[Café MAX]\n04000000   abcdef00  0000000a\n{注释}\nF0000000\n",
        "\n",
      ),
    ).toBe("[Café MAX]\n04000000 ABCDEF00 0000000A\n{注释}\nF0000000\n");
    expect(formatCheats("{Mastercode}\nF0000000\n", "\n")).not.toContain("[]");
  });
  it("reports malformed and mismatched headers without crashing", () => {
    expect(
      parseCheats(
        "[broken\n000\n[--SectionStart:One--]\n00000000\n[--SectionEnd:Two--]",
      ).diagnostics.map((d) => d.code),
    ).toEqual(
      expect.arrayContaining([
        "malformedHeader",
        "invalidCode",
        "sectionMismatch",
        "unclosedSection",
      ]),
    );
  });
  it("checks line counts inside sections and size before saving", () => {
    const text =
      "[--SectionStart:A--]\n00000000 00000000 00000000\n[Long]\n" +
      "04000000 00000000 00000001\n".repeat(65) +
      "[--SectionEnd:A--]\n00000000 00000000 00000000\n";
    expect(
      parseCheats(text).diagnostics.some((d) => d.code === "lineLimit"),
    ).toBe(true);
    expect(
      diagnosticsFor(decodeDocument(utf8(" ".repeat(32768)))),
    ).toContainEqual(expect.objectContaining({ code: "sizeLimit" }));
  });
});
describe("instruction layout fixtures", () => {
  const common = {
    width: 4 as const,
    register: "A",
    region: 1 as const,
    address: "100",
    value: "10",
  };
  const fixtures: [InstructionSpec, string][] = [
    [
      {
        ...common,
        family: "0",
        register: "F",
        address: "123456789",
        value: "FF",
      },
      "041F0001 23456789 000000FF",
    ],
    [
      {
        ...common,
        family: "1",
        width: 8,
        region: 2,
        comparison: 5,
        address: "FF00000000",
        value: "1122334455667788",
      },
      "182500FF 00000000 11223344 55667788",
    ],
    [{ family: "2", else: false }, "20000000"],
    [{ family: "2", else: true }, "21000000"],
    [
      { family: "3", register: "A", count: "10", end: false },
      "300A0000 00000010",
    ],
    [{ family: "3", register: "F", count: "0", end: true }, "310F0000"],
    [
      { family: "4", register: "F", value: "FFFFFFFFFFFFFFFF" },
      "400F0000 FFFFFFFF FFFFFFFF",
    ],
    [{ ...common, family: "5", relative: false }, "541A0000 00000100"],
    [{ ...common, family: "5", relative: true }, "540A1000 00000100"],
    [
      {
        ...common,
        family: "6",
        register: "F",
        increment: true,
        offsetRegister: "A",
        value: "1",
      },
      "640F11A0 00000000 00000001",
    ],
    [{ ...common, family: "7", operation: 2 }, "740A2000 00000010"],
    [{ family: "8", mask: "3000001" }, "83000001"],
    [
      {
        ...common,
        family: "9",
        operation: 8,
        left: "B",
        right: "F",
        immediate: false,
      },
      "948AB0F0",
    ],
    [
      {
        ...common,
        family: "9",
        operation: 0,
        left: "F",
        right: "0",
        immediate: true,
      },
      "940AF100 00000010",
    ],
    [
      {
        ...common,
        family: "A",
        base: "B",
        offsetRegister: "F",
        increment: false,
        mode: 0,
      },
      "A4A00000",
    ],
    [
      {
        ...common,
        family: "A",
        base: "B",
        offsetRegister: "F",
        increment: true,
        mode: 1,
      },
      "A4A011F0",
    ],
    [
      {
        ...common,
        family: "A",
        base: "B",
        offsetRegister: "F",
        increment: false,
        mode: 2,
      },
      "A4A00200 00000100",
    ],
    [
      {
        ...common,
        family: "A",
        base: "B",
        offsetRegister: "F",
        increment: true,
        mode: 3,
      },
      "A4AB1310",
    ],
    [
      {
        ...common,
        family: "A",
        base: "B",
        offsetRegister: "F",
        increment: false,
        mode: 4,
      },
      "A4A00410 00000100",
    ],
    [
      {
        ...common,
        family: "A",
        base: "B",
        offsetRegister: "F",
        increment: true,
        mode: 5,
      },
      "A4AB1510 00000100",
    ],
  ];
  it.each(fixtures)("encodes $family: %j", (spec, expected) =>
    expect(generateInstruction(spec)).toBe(expected),
  );
  it("rejects overflow without silently truncating", () => {
    expect(() =>
      generateInstruction({ ...common, family: "0", width: 1, value: "100" }),
    ).toThrow("outOfRange");
    expect(() =>
      generateInstruction({ ...common, family: "0", address: "10000000000" }),
    ).toThrow("outOfRange");
    expect(() =>
      generateInstruction({ family: "4", register: "10", value: "0" }),
    ).toThrow("outOfRange");
  });
  it("calculates full 64-bit values without Number coercion", () => {
    expect(convertNumber("FFFFFFFFFFFFFFFF", "hex", true).decimal).toBe("-1");
    expect(convertNumber("18446744073709551615", "decimal", false).hex).toBe(
      "0xFFFFFFFFFFFFFFFF",
    );
    expect(() => convertNumber("9223372036854775808", "decimal", true)).toThrow(
      "outOfRange",
    );
    expect(calculateHex("FFFFFFFFFFFFFFFF", "1", "+")).toEqual({
      value: "0x10000000000000000",
      overflow: true,
    });
  });
});
describe("library metadata", () => {
  it("retains supported metadata encoding and BOM on mapping changes", () => {
    const source = encodeDocument({
      ...decodeDocument(utf8("AAAAAAAAAAAAAAAA\t1.0\n")),
      encoding: "utf-16be",
      bom: true,
      modified: true,
    });
    const updated = writeVersions(source, [["AAAAAAAAAAAAAAAA", "1.1"]]);
    const doc = decodeDocument(updated);
    expect(doc.encoding).toBe("utf-16be");
    expect(doc.bom).toBe(true);
    expect(doc.text).toBe("AAAAAAAAAAAAAAAA\t1.1\n");
  });
  it("normalizes game paths without changing unknown resource bytes", () => {
    const files = new Map([
      ["01000000000000ab/Game.txt", utf8("")],
      ["01000000000000ab/cheats/aaaaaaaaaaaaaaaa.txt", utf8("F0000000")],
      ["01000000000000ab/cover.bin", new Uint8Array([0, 255])],
    ]);
    const normalized = normalizeGamePaths(
      files,
      discoverLibrary(files).games[0],
    );
    expect(
      normalized.files.has("01000000000000AB/cheats/AAAAAAAAAAAAAAAA.txt"),
    ).toBe(true);
    expect(normalized.files.get("01000000000000AB/cover.bin")).toEqual(
      new Uint8Array([0, 255]),
    );
  });
  it("preserves duplicate version labels while rejecting duplicate IDs", () => {
    const bytes = serializeVersions([
      ["AAAAAAAAAAAAAAAA", "1.0"],
      ["BBBBBBBBBBBBBBBB", "1.0"],
    ]);
    expect(parseVersions(decodeDocument(bytes).text).size).toBe(2);
    expect(() =>
      serializeVersions([
        ["AAAAAAAAAAAAAAAA", "1"],
        ["aaaaaaaaaaaaaaaa", "2"],
      ]),
    ).toThrow("invalidMapping");
  });
  it("discovers legacy roots, empty games and version ordering", () => {
    const files = new Map([
      [
        "wrapper/010000000000001/游戏.txt",
        utf8("AAAAAAAAAAAAAAAA\t1.9\nBBBBBBBBBBBBBBBB\t1.10"),
      ],
      ["wrapper/010000000000001/cheats/AAAAAAAAAAAAAAAA.txt", utf8("")],
      ["wrapper/010000000000001/cheats/BBBBBBBBBBBBBBBB.txt", utf8("")],
      ["0100000000000002/Empty.txt", utf8("")],
    ]);
    const games = discoverLibrary(files).games;
    expect(games).toHaveLength(2);
    expect(games.find((g) => g.name === "游戏")!.builds[0].version).toBe(
      "1.10",
    );
    expect(() => checkId("010000000000001")).toThrow();
  });
  it("does not silently choose between ambiguous metadata files", () => {
    const tree = new Map([
      ["0100000000000001/A.txt", utf8("")],
      ["0100000000000001/B.txt", utf8("")],
    ]);
    expect(discoverLibrary(tree).games[0].indexPath).toBeUndefined();
  });
  it("mounts a bare cheats import under the entered Title ID", () => {
    expect([
      ...normalizeImportedTree(
        new Map([["AAAAAAAAAAAAAAAA.txt", utf8("")]]),
        "0100000000000001",
      ).keys(),
    ]).toEqual(["0100000000000001/cheats/AAAAAAAAAAAAAAAA.txt"]);
  });
});

describe("theme accessibility", () => {
  it.each([
    ["#22252b", "#ffffff"],
    ["#5e6169", "#f5f4f1"],
    ["#ffffff", "#b4232d"],
    ["#f0efeb", "#202328"],
    ["#b4b6be", "#17191d"],
    ["#301215", "#f18d93"],
  ])("keeps text contrast for %s on %s", (ink, surface) =>
    expect(contrast(ink, surface)).toBeGreaterThanOrEqual(4.5),
  );
  it.each([
    "#e8e5df",
    "#f6d8d6",
    "#d6e6ed",
    "#dfe1e5",
    "#000000",
    "#ffffff",
    "#888888",
  ])("chooses readable ink for a custom header %s", (surface) =>
    expect(contrast(foreground(surface), surface)).toBeGreaterThanOrEqual(4.5),
  );
  it.each([
    ["#80838b", "#ffffff"],
    ["#858a94", "#202328"],
  ])("keeps control boundaries visible", (edge, surface) =>
    expect(contrast(edge, surface)).toBeGreaterThanOrEqual(3),
  );
});
