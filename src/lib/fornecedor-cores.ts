/**
 * NOP-360 — paleta fechada de cores de fornecedor (sólidas, legíveis a distância).
 * Chaves estáveis no banco; rótulos em pt-BR para UI e erros.
 */

export type FornecedorCorId =
  | "vermelho"
  | "bordo"
  | "rosa"
  | "laranja"
  | "amarelo"
  | "verde_limao"
  | "verde"
  | "verde_escuro"
  | "ciano"
  | "azul_claro"
  | "azul"
  | "azul_marinho"
  | "roxo"
  | "lilas"
  | "marrom"
  | "bege"
  | "cinza"
  | "preto";

export type FornecedorCorDef = {
  id: FornecedorCorId;
  nome: string;
  /** hex sólido para círculo / faixa */
  hex: string;
  /** texto sobre o círculo (contraste) */
  onHex: string;
};

export const FORNECEDOR_CORES: readonly FornecedorCorDef[] = [
  { id: "vermelho", nome: "Vermelho", hex: "#C62828", onHex: "#fff" },
  { id: "bordo", nome: "Bordô", hex: "#6A1B2A", onHex: "#fff" },
  { id: "rosa", nome: "Rosa", hex: "#E91E8C", onHex: "#fff" },
  { id: "laranja", nome: "Laranja", hex: "#EF6C00", onHex: "#fff" },
  { id: "amarelo", nome: "Amarelo", hex: "#F9A825", onHex: "#1a1a1a" },
  { id: "verde_limao", nome: "Verde-limão", hex: "#C0CA33", onHex: "#1a1a1a" },
  { id: "verde", nome: "Verde", hex: "#2E7D32", onHex: "#fff" },
  { id: "verde_escuro", nome: "Verde escuro", hex: "#1B5E20", onHex: "#fff" },
  { id: "ciano", nome: "Ciano", hex: "#00838F", onHex: "#fff" },
  { id: "azul_claro", nome: "Azul claro", hex: "#29B6F6", onHex: "#1a1a1a" },
  { id: "azul", nome: "Azul", hex: "#1565C0", onHex: "#fff" },
  { id: "azul_marinho", nome: "Azul-marinho", hex: "#0D47A1", onHex: "#fff" },
  { id: "roxo", nome: "Roxo", hex: "#6A1B9A", onHex: "#fff" },
  { id: "lilas", nome: "Lilás", hex: "#9575CD", onHex: "#1a1a1a" },
  { id: "marrom", nome: "Marrom", hex: "#5D4037", onHex: "#fff" },
  { id: "bege", nome: "Bege", hex: "#D7CCC8", onHex: "#1a1a1a" },
  { id: "cinza", nome: "Cinza", hex: "#616161", onHex: "#fff" },
  { id: "preto", nome: "Preto", hex: "#212121", onHex: "#fff" },
] as const;

const BY_ID = new Map(FORNECEDOR_CORES.map((c) => [c.id, c]));

export const FORNECEDOR_COR_IDS: readonly FornecedorCorId[] = FORNECEDOR_CORES.map((c) => c.id);

export function isFornecedorCorId(v: unknown): v is FornecedorCorId {
  return typeof v === "string" && BY_ID.has(v as FornecedorCorId);
}

export function fornecedorCorDef(id: string | null | undefined): FornecedorCorDef | null {
  if (!id) return null;
  return BY_ID.get(id as FornecedorCorId) ?? null;
}

export function nomeFornecedorCor(id: string | null | undefined): string | null {
  return fornecedorCorDef(id)?.nome ?? null;
}

/** Mensagem de conflito (espelha o servidor). */
export function msgConflitoCorFornecedor(
  corNome: string,
  fornecedorNome: string,
  produtoNome: string,
): string {
  return `${corNome} já é do fornecedor ${fornecedorNome} em ${produtoNome}`;
}
