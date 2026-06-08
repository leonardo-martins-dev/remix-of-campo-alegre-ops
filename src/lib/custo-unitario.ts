import type { TipoCaixa } from "@/hooks/use-tipos-caixa";

export function parseCustoValor(
  tipo: TipoCaixa,
  draftCustos: Record<string, string>
): number | null {
  const raw = draftCustos[tipo.id];
  const valor = raw !== undefined ? parseFloat(raw) : tipo.custo_unitario;
  if (Number.isNaN(valor)) return null;
  return valor;
}

export function shouldSaveCusto(tipo: TipoCaixa, valor: number): boolean {
  return valor !== tipo.custo_unitario;
}
