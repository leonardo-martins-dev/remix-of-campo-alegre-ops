/**
 * NOP-457 — bun src/lib/pedidos-abertos.test.ts
 */
import {
  PEDIDO_STATUS_ABERTO,
  PEDIDO_STATUS_CONFERIDO,
  dataOperacionalPedido,
  datasDoGrupo,
  filterPorJanelaData,
  isPedidoConferido,
  janelaParaRange,
  sortPedidosMaisAntigosPrimeiro,
} from "./pedidos-abertos";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(dataOperacionalPedido({ data_pedido: "2026-09-20", data_prevista: "2026-09-21" }) === "2026-09-21", "usa prevista");
assert(dataOperacionalPedido({ data_pedido: "2026-09-20", data_prevista: null }) === "2026-09-20", "fallback emissão");
assert(dataOperacionalPedido({ data_pedido: "2026-09-20", data_prevista: "" }) === "2026-09-20", "prevista vazia");

const sorted = sortPedidosMaisAntigosPrimeiro([
  { data_pedido: "2026-09-28", data_prevista: "2026-09-28", id: "new" },
  { data_pedido: "2026-09-18", data_prevista: null, id: "old" },
  { data_pedido: "2026-09-22", data_prevista: "2026-09-23", id: "mid" },
]);
assert(sorted.map((p) => (p as { id: string }).id).join(",") === "old,mid,new", `ordem ${sorted.map((p) => (p as { id: string }).id)}`);

const datas = datasDoGrupo([
  { data_pedido: "2026-09-22", data_prevista: "2026-09-23" },
  { data_pedido: "2026-09-18", data_prevista: null },
  { data_pedido: "2026-09-22", data_prevista: "2026-09-23" },
]);
assert(datas.join(",") === "2026-09-18,2026-09-23", `datas ${datas}`);

const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + n));
  return dt.toISOString().slice(0, 10);
};
assert(janelaParaRange("todos", "2026-09-29", addDays).from === null, "todos sem from");
assert(janelaParaRange("hoje", "2026-09-29", addDays).from === "2026-09-29", "hoje");
assert(janelaParaRange("7d", "2026-09-29", addDays).from === "2026-09-23", "7d");

const base = [
  { data_pedido: "2026-09-18", data_prevista: null },
  { data_pedido: "2026-09-29", data_prevista: "2026-09-29" },
];
assert(filterPorJanelaData(base, null, null).length === 2, "sem janela");
assert(filterPorJanelaData(base, "2026-09-29", "2026-09-29").length === 1, "só hoje");
assert(filterPorJanelaData(base, "2026-09-01", "2026-09-20").length === 1, "só antigo");

// NOP-471 — conferidos (recebido/encerrado/conferido legado)
assert(isPedidoConferido("recebido"), "recebido é conferido");
assert(isPedidoConferido("encerrado"), "encerrado é conferido");
assert(isPedidoConferido("conferido"), "conferido legado conta");
assert(!isPedidoConferido("pendente"), "pendente não é conferido");
assert(!isPedidoConferido("parcial"), "parcial não é conferido");
assert(!isPedidoConferido("em_transito"), "em_transito não é conferido");
assert(!isPedidoConferido("divergencia"), "divergencia não é conferido");
assert(!isPedidoConferido("aguardando_vinculo"), "aguardando_vinculo não é conferido");
assert(
  PEDIDO_STATUS_CONFERIDO.length === 3,
  `3 status conferidos, veio ${PEDIDO_STATUS_CONFERIDO.length}`,
);
// abertos e conferidos não podem se sobrepor (dashboard depende de abertos só pendente)
assert(
  PEDIDO_STATUS_ABERTO.every((s) => !isPedidoConferido(s)),
  "abertos e conferidos disjuntos",
);
assert(
  PEDIDO_STATUS_ABERTO.join(",") === "pendente,parcial,em_transito",
  `abertos inalterado, veio ${PEDIDO_STATUS_ABERTO.join(",")}`,
);

// contador CONFERIDOS = recebido + encerrado + conferido no mesmo conjunto
const mistos = [
  { status: "pendente" },
  { status: "recebido" },
  { status: "recebido" },
  { status: "encerrado" },
  { status: "conferido" },
  { status: "divergencia" },
];
assert(mistos.filter((p) => isPedidoConferido(p.status)).length === 4, "conta 4 conferidos");

console.log("pedidos-abertos.test.ts: ok");
