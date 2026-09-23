/**
 * NOP-318 — helpers puros da tela Conferir chegada.
 * Mantém cabeçalho enxuto, vales só do pedido aberto e sem UI de vazias.
 */

/** Vales exibidos na conferência: só os do pedido aberto (fila completa fica em Vales). */
export function filterValesDoPedido<T extends { pedido_id: string }>(
  vales: T[],
  pedidoId: string,
): T[] {
  if (!pedidoId) return [];
  return vales.filter((v) => v.pedido_id === pedidoId);
}

/** Chips do topo na sessão multi: um por fornecedor escolhido (não lista de botões). */
export function chipsFornecedoresSessao(
  grupos: { fornecedorId: string; nome: string; pedidoIds: string[] }[],
): { fornecedorId: string; nome: string; pedidoIds: string[] }[] {
  return grupos.map((g) => ({
    fornecedorId: g.fornecedorId,
    nome: g.nome,
    pedidoIds: [...g.pedidoIds],
  }));
}

/** Remove pedidos de um fornecedor da sessão multi. */
export function removerFornecedorDaSessao(
  pedidoIds: string[],
  pedidoIdsDoFornecedor: string[],
): string[] {
  const drop = new Set(pedidoIdsDoFornecedor);
  return pedidoIds.filter((id) => !drop.has(id));
}

/**
 * Texto/aviso de caixas vazias não deve aparecer na conferência
 * (decisão 22/09: vazias só em Movimentação de caixas).
 */
export function isAvisoCaixasVazias(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("vazias") ||
    t.includes("caixa vazia") ||
    t.includes("caixas vazias") ||
    (t.includes("packing") && t.includes("fornecedor") && t.includes("moviment"))
  );
}
