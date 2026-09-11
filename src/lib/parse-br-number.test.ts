import { parseBrNumber, parseBrNumberOrNull } from "./parse-br-number";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const br = parseBrNumber("1.234,50");
assert(br.ok && br.value === 1234.5, `1.234,50 => ${JSON.stringify(br)}`);

const comma = parseBrNumber("2,50");
assert(comma.ok && comma.value === 2.5, `2,50 => ${JSON.stringify(comma)}`);

const us = parseBrNumber("1234.50");
assert(us.ok && us.value === 1234.5, `1234.50 => ${JSON.stringify(us)}`);

const plain = parseBrNumber("1234");
assert(plain.ok && plain.value === 1234, `1234 => ${JSON.stringify(plain)}`);

const thousand = parseBrNumber("1.234");
assert(thousand.ok && thousand.value === 1234, `1.234 milhar => ${JSON.stringify(thousand)}`);

const num = parseBrNumber(100);
assert(num.ok && num.value === 100, `number 100 => ${JSON.stringify(num)}`);

const bad = parseBrNumber("1.234,50x");
assert(!bad.ok, `1.234,50x deveria falhar`);

assert(parseBrNumberOrNull("") === null, "vazio => null");
assert(parseBrNumberOrNull(null) === null, "null => null");

console.log("parseBrNumber ok");
