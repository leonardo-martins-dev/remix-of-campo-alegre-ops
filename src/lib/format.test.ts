import { formatBRL, formatBRLOrEmpty, formatPercentBR, normalizeMoney } from "./format";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(normalizeMoney(-0) === 0, "-0 → 0");
assert(normalizeMoney(0.004) === 0, "0.004 → 0");
assert(normalizeMoney(-0.004) === 0, "-0.004 → 0");
assert(normalizeMoney(0.01) === 0.01, "0.01 ok");
assert(normalizeMoney(NaN) === 0, "NaN → 0");
assert(normalizeMoney(null) === 0, "null → 0");

assert(formatBRL(13261) === "R$\u00a013.261,00" || formatBRL(13261) === "R$ 13.261,00", `13261 => ${formatBRL(13261)}`);
assert(formatBRL(-0) === "R$\u00a00,00" || formatBRL(-0) === "R$ 0,00", `-0 => ${formatBRL(-0)}`);
assert(formatBRL(50) === "R$\u00a050,00" || formatBRL(50) === "R$ 50,00", `50 => ${formatBRL(50)}`);
assert(formatBRL(NaN) === "R$\u00a00,00" || formatBRL(NaN) === "R$ 0,00", `NaN => ${formatBRL(NaN)}`);

assert(formatBRLOrEmpty(0, "Nenhuma perda") === "Nenhuma perda", "empty message");
assert(formatBRLOrEmpty(10).includes("10"), `10 => ${formatBRLOrEmpty(10)}`);

assert(formatPercentBR(12.5, 1).includes("12"), `pct => ${formatPercentBR(12.5, 1)}`);

console.log("format ok");
