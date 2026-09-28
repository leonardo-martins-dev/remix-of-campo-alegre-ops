import { normalizeKey } from "@/lib/normalize";

/** Nomes de cadastro de teste (sem flag dedicada no banco). */
export function isFornecedorTeste(nome: string): boolean {
  const n = normalizeKey(nome);
  if (!n) return false;
  if (n.includes("teste")) return true;
  if (n === "test") return true;
  if (/\btest\b/.test(n)) return true;
  return false;
}

/**
 * Sugestão de mínimo = média semanal de caixas movimentadas no período,
 * arredondada para cima (mesmo critério da view v_giro_fornecedor_caixa).
 */
export function sugerirMinimoDoGiro(totalMovimentado: number, periodoDias: number): number {
  if (!Number.isFinite(totalMovimentado) || totalMovimentado <= 0) return 0;
  if (!Number.isFinite(periodoDias) || periodoDias <= 0) return 0;
  const semanas = Math.max(periodoDias / 7, 1);
  return Math.ceil(totalMovimentado / semanas);
}

export function textoAcaoAlerta(faltando: number, tipoCaixa: string): string {
  const n = Math.max(0, Math.floor(faltando));
  const tipo = (tipoCaixa || "").trim() || "?";
  return `Enviar ${n} caixa(s) tipo ${tipo}`;
}

export function countFornecedoresUnicos(
  rows: ReadonlyArray<{ fornecedor_id: string }>,
): number {
  return new Set(rows.map((r) => r.fornecedor_id)).size;
}

/** Elegível a alerta: ativo, não mesclado, não teste, não placeholder. */
export function isFornecedorElegivelAlerta(f: {
  nome: string;
  ativo?: boolean | null;
  mesclado_em_id?: string | null;
}): boolean {
  if (f.ativo === false) return false;
  if (f.mesclado_em_id) return false;
  if (f.nome === "Aguardando vínculo") return false;
  if (isFornecedorTeste(f.nome)) return false;
  return true;
}

export type GiroSugestaoInput = {
  fornecedor_id: string;
  tipo_caixa: string;
  sugestao_minimo?: number | null;
  total_movimentado?: number;
  periodo_dias?: number;
};

export type MinimoAtualInput = {
  fornecedor_id: string;
  tipo_caixa: string;
  qtd_minima: number;
};

/**
 * Pares fornecedor×tipo em que a sugestão do giro difere do mínimo gravado
 * (ou ainda não há mínimo). Usado para "Aplicar sugestões do giro" (NOP-323 QA).
 */
export function buildItensAplicarSugestaoGiro(
  giros: ReadonlyArray<GiroSugestaoInput>,
  minimos: ReadonlyArray<MinimoAtualInput>,
): { fornecedor_id: string; tipo_caixa: string; qtd_minima: number; qtd_atual: number | null }[] {
  const atual = new Map<string, number>();
  for (const m of minimos) {
    atual.set(`${m.fornecedor_id}:${m.tipo_caixa}`, m.qtd_minima);
  }
  const out: {
    fornecedor_id: string;
    tipo_caixa: string;
    qtd_minima: number;
    qtd_atual: number | null;
  }[] = [];
  const seen = new Set<string>();
  for (const g of giros) {
    const key = `${g.fornecedor_id}:${g.tipo_caixa}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sug =
      g.sugestao_minimo != null && Number.isFinite(g.sugestao_minimo)
        ? Math.max(0, Math.floor(Number(g.sugestao_minimo)))
        : sugerirMinimoDoGiro(
            Number(g.total_movimentado ?? 0),
            Number(g.periodo_dias ?? 0),
          );
    if (sug <= 0) continue;
    const qtdAtual = atual.has(key) ? (atual.get(key) as number) : null;
    if (qtdAtual === sug) continue;
    out.push({
      fornecedor_id: g.fornecedor_id,
      tipo_caixa: g.tipo_caixa,
      qtd_minima: sug,
      qtd_atual: qtdAtual,
    });
  }
  return out;
}
