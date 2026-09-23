/**
 * NOP-318 / NOP-327 / NOP-328 / NOP-340 — bun src/lib/conferir-chegada.test.ts
 */
import {
  caixasEsperadas,
  chipsFornecedoresSessao,
  faltamUnidades,
  filterValesDoPedido,
  isAvisoCaixasVazias,
  itemConferenciaQtyLocked,
  labelStatusItem,
  podeEditarConferenciaFinalizada,
  progressoItem,
  removerFornecedorDaSessao,
  resumoSelecao,
  statusItemConferencia,
  textoConversao,
  textoParcialCaixas,
  unidadesDeCaixas,
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

/* ───────── NOP-328 — passos 2 e 3 ───────── */

// Esperado em caixas vem do fator real (360 un ÷ 20 = 18 cx).
assert(caixasEsperadas(360, 20) === 18, "360/20 = 18 cx");
assert(caixasEsperadas(500, 80) === 7, "arredonda para cima (500/80 = 6,25 → 7)");
assert(caixasEsperadas(360, null) === null, "sem fator não inventa caixa");
assert(caixasEsperadas(360, 0) === null, "fator zero = sem conversão");
assert(caixasEsperadas(0, 20) === 0, "pedido zero = 0 cx");

assert(unidadesDeCaixas(3, 20) === 60, "3 cx × 20 = 60 un");
assert(unidadesDeCaixas(3, null) === 3, "sem fator a qty já é da unidade do pedido");
assert(unidadesDeCaixas(-2, 20) === 0, "caixa negativa não vira unidade");

assert(
  faltamUnidades({ pedidoUn: 360, jaRecebidoUn: 0, caixasRecebidas: 10, fator: 20 }) === 160,
  "faltam 160 un depois de 10 cx",
);
assert(
  faltamUnidades({ pedidoUn: 360, jaRecebidoUn: 100, caixasRecebidas: 10, fator: 20 }) === 60,
  "entrega anterior conta no faltam",
);
assert(
  faltamUnidades({ pedidoUn: 360, jaRecebidoUn: 0, caixasRecebidas: 30, fator: 20 }) === 0,
  "sobra não vira falta negativa",
);

const prog = progressoItem({ pedidoUn: 360, jaRecebidoUn: 0, caixasRecebidas: 9, fator: 20 });
assert(prog.recebidoUn === 180, `recebido 180 un, got ${prog.recebidoUn}`);
assert(prog.faltamUn === 180, "faltam 180 un");
assert(prog.pct === 50, `50%, got ${prog.pct}`);
assert(
  progressoItem({ pedidoUn: 360, jaRecebidoUn: 0, caixasRecebidas: 40, fator: 20 }).pct === 100,
  "barra trava em 100%",
);
assert(
  progressoItem({ pedidoUn: 0, jaRecebidoUn: 0, caixasRecebidas: 0, fator: 20 }).pct === 0,
  "pedido zero sem recebimento = 0%",
);

assert(
  statusItemConferencia({ conferido: true, atual: false, caixasRecebidas: 0 }) === "conferido",
  "conferido manda no chip",
);
assert(
  statusItemConferencia({ conferido: false, atual: true, caixasRecebidas: 0 }) === "em_andamento",
  "item aberto no passo 2 = em andamento",
);
assert(
  statusItemConferencia({ conferido: false, atual: false, caixasRecebidas: 4 }) === "em_andamento",
  "com caixa digitada = em andamento",
);
assert(
  statusItemConferencia({ conferido: false, atual: false, caixasRecebidas: 0 }) === "pendente",
  "sem toque = pendente",
);
assert(labelStatusItem("conferido") === "Conferido", "rótulo conferido");
assert(labelStatusItem("em_andamento") === "Em andamento", "rótulo em andamento");
assert(labelStatusItem("pendente") === "Pendente", "rótulo pendente");

assert(textoConversao(20, "un") === "1 caixa = 20 un", "conversão com fator real");
assert(textoConversao(12.5, "kg") === "1 caixa = 12,5 kg", "decimal em pt-BR");
assert(textoConversao(20, "") === "1 caixa = 20 un", "unidade vazia cai em un");
assert(textoConversao(null, "un") === null, "sem fator não mostra conversão");
assert(textoConversao(0, "un") === null, "fator zero não mostra conversão");

assert(resumoSelecao(3, 8) === "3 selecionados de 8", "contador do passo 1");

console.log("conferir-chegada.test.ts: ok");

/* ───────── NOP-340 — salvar parcial ───────── */
assert(textoParcialCaixas(7, 12) === "7 de 12 cx", "parcial com esperado");
assert(textoParcialCaixas(1, 1) === "1 de 1 cx", "parcial unitário");
assert(textoParcialCaixas(0, 12) === null, "zero caixas = sem parcial");
assert(textoParcialCaixas(3, null) === "3 cx", "sem esperado mostra só recebidas");
assert(textoParcialCaixas(-2, 10) === null, "negativo vira zero / null");

console.log("conferir-chegada NOP-340: ok");
