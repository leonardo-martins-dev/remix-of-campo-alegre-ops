/**
 * NOP-129 (a) — bun src/lib/saida-roca-resumo.test.ts
 */
import { resumoProdutosDeclarados } from "./saida-roca-resumo";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const itens = [
  { item_pedido_id: "a", produto: "Tomate" },
  { item_pedido_id: "b", produto: "Alface" },
  { item_pedido_id: "c", produto: "Cebola" },
  { item_pedido_id: "d", produto: "Pepino" },
];

const caixas = {
  a: [
    { sigla: "V", qtd: 10 },
    { sigla: "M", qtd: 0 },
  ],
  b: [{ sigla: "V", qtd: 5 }],
  c: [
    { sigla: "V", qtd: 0 },
    { sigla: "P", qtd: 0 },
  ],
  d: [
    { sigla: "V", qtd: 2 },
    { sigla: "M", qtd: 3 },
  ],
};

const resumo = resumoProdutosDeclarados(itens, caixas);

assert(resumo.length === 3, `só produtos com caixas declaradas, got ${resumo.length}`);
assert(resumo.map((p) => p.produto).join(",") === "Tomate,Alface,Pepino", "ordem dos itens");
assert(resumo[0].linhas.length === 1 && resumo[0].linhas[0].sigla === "V" && resumo[0].linhas[0].qtd === 10, "omite tipo com qtd 0");
assert(resumo[0].totalCx === 10, "total do tomate");
assert(resumo[2].linhas.length === 2, "pepino tem dois tipos");
assert(resumo[2].totalCx === 5, "total do pepino");
assert(!resumo.some((p) => p.produto === "Cebola"), "produto zerado não entra no resumo");
assert(resumoProdutosDeclarados(itens, {}).length === 0, "sem declaração, lista vazia");

console.log("saida-roca-resumo ok");
