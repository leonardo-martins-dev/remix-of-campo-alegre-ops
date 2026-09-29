/**
 * NOP-129 (a) — linhas do resumo "Confirmar saída".
 * Só o que o operador declarou no passo de caixas (qtd > 0).
 * Não mexe em rótulos de unidade do pedido (NOP-129 b).
 */

export type CaixaDeclarada = {
  sigla: string;
  qtd: number;
};

export type ProdutoDeclaradoResumo = {
  item_pedido_id: string;
  produto: string;
  linhas: CaixaDeclarada[];
  totalCx: number;
};

export function resumoProdutosDeclarados<
  T extends { item_pedido_id: string; produto: string },
>(itens: T[], caixas: Record<string, CaixaDeclarada[]>): ProdutoDeclaradoResumo[] {
  const out: ProdutoDeclaradoResumo[] = [];
  for (const it of itens) {
    const linhas = (caixas[it.item_pedido_id] ?? [])
      .filter((e) => e.qtd > 0)
      .map((e) => ({ sigla: e.sigla, qtd: e.qtd }));
    if (linhas.length === 0) continue;
    out.push({
      item_pedido_id: it.item_pedido_id,
      produto: it.produto,
      linhas,
      totalCx: linhas.reduce((a, e) => a + e.qtd, 0),
    });
  }
  return out;
}
