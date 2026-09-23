/**
 * NOP-360 — bun src/lib/fornecedor-cores.test.ts
 */
import {
  FORNECEDOR_CORES,
  FORNECEDOR_COR_IDS,
  fornecedorCorDef,
  isFornecedorCorId,
  msgConflitoCorFornecedor,
  nomeFornecedorCor,
} from "./fornecedor-cores";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(FORNECEDOR_CORES.length === 18, "18 cores na paleta");
assert(FORNECEDOR_COR_IDS.length === 18, "18 ids");
assert(isFornecedorCorId("verde"), "verde ok");
assert(!isFornecedorCorId("dourado"), "dourado fora");
assert(nomeFornecedorCor("verde") === "Verde", "nome Verde");
assert(fornecedorCorDef("azul_marinho")?.hex.startsWith("#"), "hex");
assert(
  msgConflitoCorFornecedor("Verde", "Ademir", "Alface") ===
    "Verde já é do fornecedor Ademir em Alface",
  "msg conflito",
);
assert(nomeFornecedorCor(null) === null, "null");
assert(FORNECEDOR_CORES.every((c) => c.nome && c.hex), "todas com nome+hex");

console.log("fornecedor-cores.test.ts: ok");
