/** NOP-325 — soft-exclusion de linhas marcadas is_teste. */

/** Aceita qualquer row; filtra quando `is_teste` estiver presente e true. */
export function excludeTesteSaldos<T>(rows: T[] | null | undefined): T[] {
  const list = rows ?? [];
  if (!list.some((r) => r != null && typeof r === "object" && "is_teste" in (r as object))) {
    return list;
  }
  return list.filter((r) => !(r as { is_teste?: boolean | null }).is_teste);
}

/** Heurística conservadora de nome de fornecedor QA (espelha migration 00065). */
export function isQaParceiroNome(nome: string | null | undefined): boolean {
  const n = (nome ?? "").trim();
  if (/^BOB\s*\d+$/i.test(n)) return true;
  if (/^TESTE\s*QA/i.test(n)) return true;
  if (/^FORN\s+.*TEST/i.test(n)) return true;
  const k = n.toLowerCase();
  return k === "aguardando vínculo" || k === "aguardando vinculo";
}
