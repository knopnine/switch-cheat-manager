type Width = 1 | 2 | 4 | 8;
interface Common {
  width: Width;
  register: string;
  region: 0 | 1 | 2 | 3;
  address: string;
  value: string;
}
export type InstructionSpec =
  | (Common & { family: "0" })
  | (Common & { family: "1"; comparison: 1 | 2 | 3 | 4 | 5 | 6 })
  | { family: "2"; else: boolean }
  | { family: "3"; register: string; count: string; end: boolean }
  | { family: "4"; register: string; value: string }
  | (Common & { family: "5"; relative: boolean })
  | (Common & { family: "6"; increment: boolean; offsetRegister?: string })
  | (Common & { family: "7"; operation: number })
  | { family: "8"; mask: string }
  | (Common & {
      family: "9";
      operation: number;
      left: string;
      right: string;
      immediate: boolean;
    })
  | (Common & {
      family: "A";
      base: string;
      offsetRegister: string;
      increment: boolean;
      mode: 0 | 1 | 2 | 3 | 4 | 5;
    });
export function hex(input: string, digits: number): string {
  const clean = input.trim().replace(/^0x/i, "");
  if (
    !/^[a-f\d]+$/i.test(clean) ||
    BigInt("0x" + clean) >= 1n << BigInt(digits * 4)
  )
    throw new Error("outOfRange");
  return BigInt("0x" + clean)
    .toString(16)
    .toUpperCase()
    .padStart(digits, "0");
}
const reg = (value: string) => hex(value, 1);
const words = (value: string) => value.match(/.{8}/g)!.join(" ");
export function generateInstruction(s: InstructionSpec): string {
  if (s.family === "2") return s.else ? "21000000" : "20000000";
  if (s.family === "3")
    return s.end
      ? `310${reg(s.register)}0000`
      : `300${reg(s.register)}0000 ${hex(s.count, 8)}`;
  if (s.family === "4")
    return `400${reg(s.register)}0000 ${words(hex(s.value, 16))}`;
  if (s.family === "8") return "8" + hex(s.mask, 7);
  if (![1, 2, 4, 8].includes(s.width) || ![0, 1, 2, 3].includes(s.region))
    throw new Error("outOfRange");
  const w = s.width,
    r = reg(s.register),
    m = s.region;
  const val = () => {
    hex(s.value, w * 2);
    return words(hex(s.value, w === 8 ? 16 : 8));
  };
  if (s.family === "0") {
    const a = hex(s.address, 10);
    return `0${w}${m}${r}00${a.slice(0, 2)} ${a.slice(2)} ${val()}`;
  }
  if (s.family === "1") {
    if (![1, 2, 3, 4, 5, 6].includes(s.comparison))
      throw new Error("outOfRange");
    const a = hex(s.address, 10);
    return `1${w}${m}${s.comparison}00${a.slice(0, 2)} ${a.slice(2)} ${val()}`;
  }
  if (s.family === "5") {
    const a = hex(s.address, 10);
    return `5${w}${s.relative ? 0 : m}${r}${s.relative ? 1 : 0}0${a.slice(0, 2)} ${a.slice(2)}`;
  }
  if (s.family === "6") {
    hex(s.value, w * 2);
    return `6${w}0${r}${Number(s.increment)}${s.offsetRegister !== undefined ? `1${reg(s.offsetRegister)}` : "00"}0 ${words(hex(s.value, 16))}`;
  }
  if (s.family === "7") {
    if (!Number.isInteger(s.operation) || s.operation < 0 || s.operation > 4)
      throw new Error("outOfRange");
    return `7${w}0${r}${s.operation}000 ${hex(s.value, 8)}`;
  }
  if (s.family === "9") {
    if (!Number.isInteger(s.operation) || s.operation < 0 || s.operation > 9)
      throw new Error("outOfRange");
    return `9${w}${s.operation}${r}${reg(s.left)}${s.immediate ? `100 ${val()}` : `0${reg(s.right)}0`}`;
  }
  const inc = Number(s.increment),
    mode = s.mode;
  if (mode === 0) return `A${w}${r}0${inc}000`;
  if (mode === 1) return `A${w}${r}0${inc}1${reg(s.offsetRegister)}0`;
  if (mode === 3) return `A${w}${r}${reg(s.base)}${inc}3${m}0`;
  if (![2, 4, 5].includes(mode)) throw new Error("outOfRange");
  const a = hex(s.address, 9);
  return `A${w}${r}${mode === 5 ? reg(s.base) : 0}${inc}${mode}${mode === 2 ? 0 : m}${a[0]} ${a.slice(1)}`;
}
export function convertNumber(
  value: string,
  from: "hex" | "decimal",
  signed: boolean,
): { hex: string; decimal: string } {
  if (!(from === "hex" ? /^(?:0x)?[a-f\d]+$/i : /^-?\d+$/).test(value.trim()))
    throw new Error("invalidNumber");
  let n = BigInt(
    from === "hex" ? "0x" + value.trim().replace(/^0x/i, "") : value.trim(),
  );
  if (from === "hex") {
    if (n < 0 || n > (1n << 64n) - 1n) throw new Error("outOfRange");
    if (signed) n = BigInt.asIntN(64, n);
  }
  const min = signed ? -(1n << 63n) : 0n,
    max = signed ? (1n << 63n) - 1n : (1n << 64n) - 1n;
  if (n < min || n > max) throw new Error("outOfRange");
  return {
    hex: "0x" + BigInt.asUintN(64, n).toString(16).toUpperCase(),
    decimal: n.toString(),
  };
}
export function calculateHex(
  left: string,
  right: string,
  op: "+" | "-" | "*",
): { value: string; overflow: boolean } {
  const a = BigInt("0x" + hex(left, 16)),
    b = BigInt("0x" + hex(right, 16)),
    n = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return {
    value:
      (n < 0n ? "-0x" : "0x") + (n < 0n ? -n : n).toString(16).toUpperCase(),
    overflow: n < -(1n << 63n) || n >= 1n << 64n,
  };
}
