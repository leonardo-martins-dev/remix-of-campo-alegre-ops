/** Normaliza valor monetário: NaN → 0; |n| < 0,5 centavo → 0 (evita R$ -0,00). */
export function normalizeMoney(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) < 0.005) return 0;
  return n;
}

/** Moeda sempre no padrão BR: R$ 13.261,00 */
export function formatBRL(value: number | null | undefined): string {
  return normalizeMoney(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Quando o valor é zero/ausente, devolve a mensagem de estado vazio
 * em vez de exibir R$ 0,00 como se fosse dado.
 */
export function formatBRLOrEmpty(
  value: number | null | undefined,
  emptyMessage = "—",
): string {
  const n = normalizeMoney(value);
  if (n === 0) return emptyMessage;
  return formatBRL(n);
}

export function formatPercentBR(
  value: number | null | undefined,
  digits = 1,
): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
