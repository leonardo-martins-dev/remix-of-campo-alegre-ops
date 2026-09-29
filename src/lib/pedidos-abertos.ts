/**
 * NOP-457 — pedidos abertos para conferência (qualquer data).
 * data operacional = data_prevista ?? data_pedido.
 */

export const PEDIDO_STATUS_ABERTO = ["pendente", "parcial", "em_transito"] as const;

/**
 * NOP-471 — pedidos com conferência finalizada. `conferido` é legado (antes de
 * `recebido`/`encerrado`) e segue contando para não sumir histórico.
 */
export const PEDIDO_STATUS_CONFERIDO = ["recebido", "encerrado", "conferido"] as const;

/** true quando o pedido já teve a conferência finalizada (inclui encerrado e legado). */
export function isPedidoConferido(status: string): boolean {
  return (PEDIDO_STATUS_CONFERIDO as readonly string[]).includes(status);
}

export type PedidoComDatas = {
  data_pedido: string;
  data_prevista?: string | null;
};

/** Data usada na operação de recebimento (prevista, senão emissão). */
export function dataOperacionalPedido(p: PedidoComDatas): string {
  return p.data_prevista || p.data_pedido;
}

/** Ordena mais antigo → mais recente pela data operacional. */
export function sortPedidosMaisAntigosPrimeiro<T extends PedidoComDatas>(pedidos: T[]): T[] {
  return [...pedidos].sort((a, b) => {
    const da = dataOperacionalPedido(a);
    const db = dataOperacionalPedido(b);
    if (da !== db) return da.localeCompare(db);
    return a.data_pedido.localeCompare(b.data_pedido);
  });
}

/** Datas distintas de um grupo, já formatáveis (YYYY-MM-DD), ordem cronológica. */
export function datasDoGrupo(pedidos: PedidoComDatas[]): string[] {
  const set = new Set(pedidos.map(dataOperacionalPedido));
  return [...set].sort((a, b) => a.localeCompare(b));
}

export type JanelaPedidos = "hoje" | "7d" | "30d" | "todos";

export function janelaParaRange(
  janela: JanelaPedidos,
  hoje: string,
  addDays: (date: string, days: number) => string,
): { from: string | null; to: string | null } {
  if (janela === "todos") return { from: null, to: null };
  if (janela === "hoje") return { from: hoje, to: hoje };
  if (janela === "7d") return { from: addDays(hoje, -6), to: hoje };
  return { from: addDays(hoje, -29), to: hoje };
}

/** Filtra pela data operacional dentro de [from, to] (inclusive). Sem bounds = todos. */
export function filterPorJanelaData<T extends PedidoComDatas>(
  pedidos: T[],
  from: string | null,
  to: string | null,
): T[] {
  if (!from && !to) return pedidos;
  return pedidos.filter((p) => {
    const d = dataOperacionalPedido(p);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function labelJanela(janela: JanelaPedidos): string {
  if (janela === "hoje") return "Hoje";
  if (janela === "7d") return "Últimos 7 dias";
  if (janela === "30d") return "Últimos 30 dias";
  return "Todos os pendentes";
}
