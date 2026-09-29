/**
 * NOP-319 — rótulo honesto do responsável no cadastro da posição.
 * Não inventa nome a partir de quem contou / usuários.
 */
export function labelResponsavelPosicao(responsavel: string | null | undefined): string {
  const t = typeof responsavel === "string" ? responsavel.trim() : "";
  return t || "sem responsável";
}

/** Normaliza para gravação: string vazia → null. */
export function normalizeResponsavelPosicao(value: string | null | undefined): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  return t || null;
}
