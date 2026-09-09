export function formatBRL(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
