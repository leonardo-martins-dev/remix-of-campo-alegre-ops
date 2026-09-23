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
