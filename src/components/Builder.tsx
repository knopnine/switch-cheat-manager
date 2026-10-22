import { useState } from "react";
import {
  calculateHex,
  convertNumber,
  generateInstruction,
  type InstructionSpec,
} from "../core/builder";
const families = [
  "Static memory write",
  "Memory conditional",
  "End / Else",
  "Loop",
  "Load static register",
  "Load memory register",
  "Store static through register",
  "Legacy arithmetic",
  "Button activator",
  "Register arithmetic",
  "Store register to memory",
];
const registers = "0123456789ABCDEF".split("").map((x) => [x, x]);
const buttons = [
  "A",
  "B",
  "X",
  "Y",
  "L stick",
  "R stick",
  "L",
  "R",
  "ZL",
  "ZR",
  "+",
  "−",
  "D-pad left",
  "D-pad up",
  "D-pad right",
  "D-pad down",
  "L stick left",
  "L stick up",
  "L stick right",
  "L stick down",
  "R stick left",
  "R stick up",
  "R stick right",
  "R stick down",
  "SL",
  "SR",
];
export function Builder({
  t,
  output,
  onOutput,
  insert,
  notify,
}: {
  t: (key: string) => string;
  output: string;
  onOutput: (text: string) => void;
  insert?: (text: string) => void;
  notify: (text: string) => void;
}) {
  const [v, setV] = useState<Record<string, string>>({
    family: "0",
    width: "4",
    register: "0",
    region: "0",
    address: "0",
    value: "0",
    comparison: "5",
    end: "0",
    else: "0",
    count: "1",
    increment: "0",
    useOffset: "0",
    offsetRegister: "0",
    relative: "0",
    operation: "0",
    left: "0",
    right: "0",
    immediate: "0",
    base: "0",
    mode: "0",
    mask: "0",
  });
  const [number, setNumber] = useState(""),
    [numberBase, setNumberBase] = useState<"hex" | "decimal">("hex"),
    [signed, setSigned] = useState(false),
    [conversion, setConversion] = useState("");
  const [left, setLeft] = useState(""),
    [right, setRight] = useState(""),
    [op, setOp] = useState<"+" | "-" | "*">("+"),
    [calculation, setCalculation] = useState("");
  const change = (key: string, value: string) => setV({ ...v, [key]: value });
  const select = (key: string, label: string, options: string[][]) => (
    <label className="field">
      <span>{t(label)}</span>
      <select
        aria-label={t(label)}
        value={v[key]}
        onChange={(e) => change(key, e.target.value)}
      >
        {options.map(([val, name]) => (
          <option key={val} value={val}>
            {t(name)}
          </option>
        ))}
      </select>
    </label>
  );
  const input = (key: string, label: string) => (
    <label className="field">
      <span>{t(label)}</span>
      <input
        value={v[key]}
        onChange={(e) => change(key, e.target.value)}
        spellCheck={false}
      />
    </label>
  );
  const check = (key: string, label: string) => (
    <label className="check">
      <input
        type="checkbox"
        checked={v[key] === "1"}
        onChange={(e) => change(key, e.target.checked ? "1" : "0")}
      />
      {t(label)}
    </label>
  );
  const family = v.family;
  const common = {
    width: Number(v.width) as 1 | 2 | 4 | 8,
    register: v.register,
    region: Number(v.region) as 0 | 1 | 2 | 3,
    address: v.address,
    value: v.value,
  };
  let spec: InstructionSpec;
  switch (family) {
    case "0":
      spec = { family, ...common };
      break;
    case "1":
      spec = {
        family,
        ...common,
        comparison: Number(v.comparison) as 1 | 2 | 3 | 4 | 5 | 6,
      };
      break;
    case "2":
      spec = { family, else: v.else === "1" };
      break;
    case "3":
      spec = {
        family,
        register: v.register,
        count: v.count,
        end: v.end === "1",
      };
      break;
    case "4":
      spec = { family, register: v.register, value: v.value };
      break;
    case "5":
      spec = { family, ...common, relative: v.relative === "1" };
      break;
    case "6":
      spec = {
        family,
        ...common,
        increment: v.increment === "1",
        offsetRegister: v.useOffset === "1" ? v.offsetRegister : undefined,
      };
      break;
    case "7":
      spec = { family, ...common, operation: Number(v.operation) };
      break;
    case "8":
      spec = { family, mask: v.mask };
      break;
    case "9":
      spec = {
        family,
        ...common,
        operation: Number(v.operation),
        left: v.left,
        right: v.right,
        immediate: v.immediate === "1",
      };
      break;
    default:
      spec = {
        family: "A",
        ...common,
        base: v.base,
        offsetRegister: v.offsetRegister,
        increment: v.increment === "1",
        mode: Number(v.mode) as 0 | 1 | 2 | 3 | 4 | 5,
      };
  }
  let generated = "",
    error = "";
  try {
    generated = generateInstruction(spec);
  } catch (e) {
    error = t((e as Error).message);
  }
  return (
    <div className="tool-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">0 — A</p>
          <h1>{t("Builder")}</h1>
        </div>
      </header>
      <div className="builder-grid">
        <section className="tool-panel">
          <h2>{t("Operation")}</h2>
          {select(
            "family",
            "Operation",
            families.map((name, i) => [
              i === 10 ? "A" : String(i),
              `${i === 10 ? "A" : i} · ${t(name)}`,
            ]),
          )}
          <div className="form-grid">
            {!["2", "3", "4", "8"].includes(family) &&
              select("width", "Width", [
                ["1", "8-bit"],
                ["2", "16-bit"],
                ["4", "32-bit"],
                ["8", "64-bit"],
              ])}
            {!["1", "2", "8"].includes(family) &&
              select("register", "Register", registers)}
            {["0", "1", "5", "A"].includes(family) &&
              select("region", "Memory region", [
                ["0", "Main NSO"],
                ["1", "Heap"],
                ["2", "Alias"],
                ["3", "ASLR"],
              ])}
            {["0", "1", "5"].includes(family) &&
              input("address", "Address / offset (hex)")}
            {["0", "1", "4", "6", "7"].includes(family) &&
              input("value", "Value (hex)")}
            {family === "1" &&
              select("comparison", "Comparison", [
                ["1", ">"],
                ["2", "≥"],
                ["3", "<"],
                ["4", "≤"],
                ["5", "="],
                ["6", "≠"],
              ])}
            {family === "2" &&
              select("else", "End / Else", [
                ["0", "End"],
                ["1", "Else"],
              ])}
            {family === "3" && (
              <>
                {select("end", "Loop", [
                  ["0", "Start"],
                  ["1", "End"],
                ])}
                {v.end === "0" && input("count", "Loop count (hex)")}
              </>
            )}
            {family === "5" && check("relative", "Register-relative")}
            {["6", "A"].includes(family) &&
              check("increment", "Increment register")}
            {family === "6" && (
              <>
                {check("useOffset", "Use offset register")}
                {v.useOffset === "1" &&
                  select("offsetRegister", "Offset register", registers)}
              </>
            )}
            {["7", "9"].includes(family) &&
              select("operation", "Operation", [
                ["0", "+"],
                ["1", "−"],
                ["2", "×"],
                ["3", "<<"],
                ["4", ">>"],
                ...(family === "9"
                  ? [
                      ["5", "AND"],
                      ["6", "OR"],
                      ["7", "NOT"],
                      ["8", "XOR"],
                      ["9", "MOVE"],
                    ]
                  : []),
              ])}
            {family === "9" && (
              <>
                {select("left", "Left register", registers)}
                {check("immediate", "Immediate value")}
                {v.immediate === "1"
                  ? input("value", "Value (hex)")
                  : select("right", "Right register", registers)}
              </>
            )}
            {family === "A" && (
              <>
                {select("mode", "Addressing mode", [
                  ["0", "No offset"],
                  ["1", "Offset register address"],
                  ["2", "Fixed offset"],
                  ["3", "Region + base register"],
                  ["4", "Region + address"],
                  ["5", "Region + address + register"],
                ])}
                {["3", "5"].includes(v.mode) &&
                  select("base", "Base register", registers)}
                {v.mode === "1" &&
                  select("offsetRegister", "Offset register", registers)}
                {["2", "4", "5"].includes(v.mode) &&
                  input("address", "Address / offset (hex)")}
              </>
            )}
          </div>
          {family === "8" && (
            <div className="button-mask">
              {buttons.map((name, i) => (
                <label className="check" key={name}>
                  <input
                    type="checkbox"
                    checked={!!(BigInt("0x" + v.mask) & (1n << BigInt(i)))}
                    onChange={(e) =>
                      change(
                        "mask",
                        (e.target.checked
                          ? BigInt("0x" + v.mask) | (1n << BigInt(i))
                          : BigInt("0x" + v.mask) & ~(1n << BigInt(i))
                        ).toString(16),
                      )
                    }
                  />
                  {name}
                </label>
              ))}
            </div>
          )}
          <label className="field">
            <span>{t("Generated instruction")}</span>
            <output className="instruction">{generated || "—"}</output>
          </label>
          {error && (
            <p className="error" role="status">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={!generated}
            onClick={() => onOutput(output + generated + "\r\n")}
          >
            {t("Add instruction")}
          </button>
        </section>
        <section className="tool-panel">
          <h2>{t("Output buffer")}</h2>
          <textarea
            className="output-buffer"
            aria-label={t("Output buffer")}
            value={output}
            onChange={(e) => onOutput(e.target.value)}
            spellCheck={false}
          />
          <div className="toolbar">
            <button
              disabled={!output}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(output);
                  notify(t("Copied to clipboard"));
                } catch {
                  notify(t("Download file"));
                }
              }}
            >
              {t("Copy output")}
            </button>
            <button disabled={!output} onClick={() => onOutput("")}>
              {t("Clear output")}
            </button>
            <button
              disabled={!output || !insert}
              onClick={() => insert?.(output)}
            >
              {t("Insert into editor")}
            </button>
          </div>
        </section>
      </div>
      <section className="tool-panel number-tools">
        <h2>{t("Number tools")}</h2>
        <div className="builder-grid">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const result = convertNumber(number, numberBase, signed);
                setConversion(`${result.hex} = ${result.decimal}`);
              } catch (err) {
                setConversion(t((err as Error).message));
              }
            }}
          >
            <div className="form-grid">
              <label className="field">
                <span>{t("Value (hex)") + " / " + t("Decimal")}</span>
                <input
                  aria-label="Conversion value"
                  required
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("Operation")}</span>
                <select
                  value={numberBase}
                  onChange={(e) =>
                    setNumberBase(e.target.value as "hex" | "decimal")
                  }
                >
                  <option value="hex">{t("Hexadecimal")}</option>
                  <option value="decimal">{t("Decimal")}</option>
                </select>
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={signed}
                onChange={(e) => setSigned(e.target.checked)}
              />
              {t(signed ? "Signed 64-bit" : "Unsigned 64-bit")}
            </label>
            <button>{t("Convert")}</button>
            <output className="number-result" aria-live="polite">
              {conversion}
            </output>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const result = calculateHex(left, right, op);
                setCalculation(
                  result.value +
                    (result.overflow ? ` · ${t("Outside 64-bit range")}` : ""),
                );
              } catch (err) {
                setCalculation(t((err as Error).message));
              }
            }}
          >
            <div className="form-grid">
              <label className="field">
                <span>{t("Left value (hex)")}</span>
                <input
                  required
                  value={left}
                  onChange={(e) => setLeft(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("Right value (hex)")}</span>
                <input
                  required
                  value={right}
                  onChange={(e) => setRight(e.target.value)}
                />
              </label>
            </div>
            <div className="toolbar">
              <select
                aria-label={t("Operation")}
                value={op}
                onChange={(e) => setOp(e.target.value as "+" | "-" | "*")}
              >
                <option>+</option>
                <option>-</option>
                <option>*</option>
              </select>
              <button>{t("Calculate")}</button>
            </div>
            <output className="number-result" aria-live="polite">
              {calculation}
            </output>
          </form>
        </div>
      </section>
    </div>
  );
}
