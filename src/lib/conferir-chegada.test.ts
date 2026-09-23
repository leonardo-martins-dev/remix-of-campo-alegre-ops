/**
 * NOP-318 / NOP-327 — bun src/lib/conferir-chegada.test.ts
 */
import {
  chipsFornecedoresSessao,
  filterValesDoPedido,
  isAvisoCaixasVazias,
  itemConferenciaQtyLocked,
  podeEditarConferenciaFinalizada,
  removerFornecedorDaSessao,
} from "./conferir-chegada";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const vales = [
  { id: "1", pedido_id: "p30523", status: "pendente" },
  { id: "2", pedido_id: "p30500", status: "recusado" },
  { id: "3", pedido_id: "p30523", status: "aplicado" },
];

const so30523 = filterValesDoPedido(vales, "p30523");
assert(so30523.length === 2, `esperado 2 vales do 30523, got ${so30523.length}`);
assert(
  so30523.every((v) => v.pedido_id === "p30523"),
  "não pode vazar vale de outro pedido",
);
assert(filterValesDoPedido(vales, "p30500").length === 1, "30500 tem 1");
assert(filterValesDoPedido(vales, "").length === 0, "pedido vazio => []");
assert(filterValesDoPedido(vales, "outro").length === 0, "pedido inexistente => []");

const chips = chipsFornecedoresSessao([
  { fornecedorId: "f1", nome: "A", pedidoIds: ["p1", "p2"] },
  { fornecedorId: "f2", nome: "B", pedidoIds: ["p3"] },
]);
assert(chips.length === 2, "2 chips");
assert(chips[0].pedidoIds.join(",") === "p1,p2", "pedidoIds preservados");

const next = removerFornecedorDaSessao(["p1", "p2", "p3"], ["p1", "p2"]);
assert(next.join(",") === "p3", `restou p3, got ${next.join(",")}`);

assert(
  isAvisoCaixasVazias("Packing → fornecedor só na Movimentação ou inventário"),
  "aviso packing→fornecedor é de vazias",
);
assert(isAvisoCaixasVazias("Caixas vazias devolvidas"), "menção explícita");
assert(!isAvisoCaixasVazias("cheias → galpão"), "resumo de cheias ok");
assert(!isAvisoCaixasVazias("Resumo de caixas desta entrega"), "título resumo ok");

assert(podeEditarConferenciaFinalizada(true), "ADM edita finalizada");
assert(!podeEditarConferenciaFinalizada(false), "conferente não edita finalizada");

assert(
  !itemConferenciaQtyLocked({
    conferenciaAberta: true,
    editando: false,
    readOnly: false,
    conferido: true,
    temValePendente: false,
  }),
  "aberto + conferido = editável",
);
assert(
  itemConferenciaQtyLocked({
    conferenciaAberta: true,
    editando: false,
    readOnly: false,
    conferido: false,
    temValePendente: true,
  }),
  "vale pendente trava mesmo aberta",
);
assert(
  itemConferenciaQtyLocked({
    conferenciaAberta: false,
    editando: false,
    readOnly: true,
    conferido: true,
    temValePendente: false,
  }),
  "finalizada readOnly trava",
);
assert(
  !itemConferenciaQtyLocked({
    conferenciaAberta: false,
    editando: true,
    readOnly: false,
    conferido: true,
    temValePendente: false,
  }),
  "modo edição ADM libera",
);

console.log("conferir-chegada.test.ts: ok");
