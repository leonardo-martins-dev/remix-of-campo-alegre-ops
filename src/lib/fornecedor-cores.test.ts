/**
 * NOP-360 / NOP-463 — bun src/lib/fornecedor-cores.test.ts
 */
import {
  FORNECEDOR_CORES,
  FORNECEDOR_COR_IDS,
  PALETA_OPERACIONAL,
  fornecedorCorDef,
  isFornecedorCorId,
  labelFornecedorCor,
  msgConflitoCorFornecedor,
  nomeFornecedorCor,
} from "./fornecedor-cores";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// NOP-463: paleta operacional = 11 cores com adesivo físico.
assert(FORNECEDOR_CORES.length === 11, "11 cores na paleta");
assert(FORNECEDOR_COR_IDS.length === 11, "11 ids");
assert(PALETA_OPERACIONAL.length === 11, "paleta operacional com 11");

const esperados = [
  "preto",
  "amarelo",
  "azul",
  "ciano",
  "rosa",
  "verde",
  "branco",
  "lilas_claro",
  "cinza_palido",
  "vermelho",
  "laranja",
];
assert(
  FORNECEDOR_COR_IDS.join(",") === esperados.join(","),
  `ordem da paleta física: ${FORNECEDOR_COR_IDS.join(",")}`,
);

assert(isFornecedorCorId("verde"), "verde ok");
assert(isFornecedorCorId("branco"), "branco entrou");
assert(isFornecedorCorId("lilas_claro"), "lilas_claro entrou");
assert(isFornecedorCorId("cinza_palido"), "cinza_palido entrou");
assert(!isFornecedorCorId("dourado"), "dourado fora");

// As 10 cores sem adesivo físico saíram da paleta operacional.
for (const legado of [
  "bordo",
  "verde_limao",
  "verde_escuro",
  "azul_claro",
  "azul_marinho",
  "roxo",
  "lilas",
  "marrom",
  "bege",
  "cinza",
]) {
  assert(!isFornecedorCorId(legado), `${legado} saiu da paleta`);
  assert(nomeFornecedorCor(legado) === null, `${legado} sem nome na paleta`);
  assert(labelFornecedorCor(legado) === legado, `${legado} cai no label cru`);
}

assert(nomeFornecedorCor("verde") === "Verde", "nome Verde");
assert(nomeFornecedorCor("branco") === "Branco", "nome Branco");
assert(nomeFornecedorCor("lilas_claro") === "Lilás claro", "nome Lilás claro");
assert(nomeFornecedorCor("cinza_palido") === "Cinza pálido", "nome Cinza pálido");
assert(fornecedorCorDef("branco")?.hex === "#FAFAFA", "hex branco");
assert(fornecedorCorDef("branco")?.onHex === "#1a1a1a", "onHex branco legível");
assert(fornecedorCorDef("lilas_claro")?.hex === "#E1BEE7", "hex lilás claro");
assert(fornecedorCorDef("cinza_palido")?.hex === "#BDBDBD", "hex cinza pálido");
assert(fornecedorCorDef("azul")?.hex.startsWith("#"), "hex");
assert(
  msgConflitoCorFornecedor("Verde", "Ademir", "Alface") ===
    "Verde já é do fornecedor Ademir em Alface",
  "msg conflito",
);
assert(nomeFornecedorCor(null) === null, "null");
assert(labelFornecedorCor(null) === "—", "label null vira travessão");
assert(
  FORNECEDOR_CORES.every((c) => c.nome && c.hex && c.onHex),
  "todas com nome+hex+onHex",
);
assert(new Set(FORNECEDOR_CORES.map((c) => c.hex)).size === 11, "hex distintos");

console.log("fornecedor-cores.test.ts: ok");
