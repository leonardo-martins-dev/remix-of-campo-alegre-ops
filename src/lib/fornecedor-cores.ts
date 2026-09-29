/**
 * NOP-360 / NOP-463 — paleta fechada de cores de fornecedor.
 *
 * NOP-463: a paleta operacional passou a ser exatamente as 11 cores físicas
 * que existem de adesivo no galpão (na ordem em que chegaram do fornecedor de
 * adesivos). As 10 cores da paleta antiga de 18 que não têm adesivo físico
 * (bordô, verde-limão, verde escuro, azul claro, azul-marinho, roxo, lilás,
 * marrom, bege, cinza) saíram do seletor, da sugestão em lote e do CHECK do
 * banco — nenhum fornecedor tinha cor gravada, então não há legado a migrar.
 *
 * Chaves estáveis no banco; rótulos em pt-BR para UI e erros.
 */

export type FornecedorCorId =
  | "preto"
  | "amarelo"
  | "azul"
  | "ciano"
  | "rosa"
  | "verde"
  | "branco"
  | "lilas_claro"
  | "cinza_palido"
  | "vermelho"
  | "laranja";

export type FornecedorCorDef = {
  id: FornecedorCorId;
  nome: string;
  /** hex sólido para círculo / faixa */
  hex: string;
  /** texto sobre o círculo (contraste) */
  onHex: string;
};

export const FORNECEDOR_CORES: readonly FornecedorCorDef[] = [
  { id: "preto", nome: "Preto", hex: "#212121", onHex: "#fff" },
  { id: "amarelo", nome: "Amarelo", hex: "#F9A825", onHex: "#1a1a1a" },
  { id: "azul", nome: "Azul", hex: "#1565C0", onHex: "#fff" },
  { id: "ciano", nome: "Ciano", hex: "#00838F", onHex: "#fff" },
  { id: "rosa", nome: "Rosa", hex: "#E91E8C", onHex: "#fff" },
  { id: "verde", nome: "Verde", hex: "#2E7D32", onHex: "#fff" },
  { id: "branco", nome: "Branco", hex: "#FAFAFA", onHex: "#1a1a1a" },
  { id: "lilas_claro", nome: "Lilás claro", hex: "#E1BEE7", onHex: "#1a1a1a" },
  { id: "cinza_palido", nome: "Cinza pálido", hex: "#BDBDBD", onHex: "#1a1a1a" },
  { id: "vermelho", nome: "Vermelho", hex: "#C62828", onHex: "#fff" },
  { id: "laranja", nome: "Laranja", hex: "#EF6C00", onHex: "#fff" },
] as const;

const BY_ID = new Map(FORNECEDOR_CORES.map((c) => [c.id, c]));

export const FORNECEDOR_COR_IDS: readonly FornecedorCorId[] = FORNECEDOR_CORES.map((c) => c.id);

/**
 * NOP-463 — paleta operacional usada pelo seletor e pela sugestão em lote.
 * Alias explícito de `FORNECEDOR_COR_IDS` para deixar claro nos chamadores
 * (algoritmo de coloração, RPC) que são as 11 cores com adesivo físico.
 */
export const PALETA_OPERACIONAL: readonly string[] = FORNECEDOR_COR_IDS;

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

/** Rótulo para exibição mesmo quando a chave não é da paleta atual (histórico/auditoria). */
export function labelFornecedorCor(id: string | null | undefined): string {
  return nomeFornecedorCor(id) ?? id ?? "—";
}

/** Mensagem de conflito (espelha o servidor). */
export function msgConflitoCorFornecedor(
  corNome: string,
  fornecedorNome: string,
  produtoNome: string,
): string {
  return `${corNome} já é do fornecedor ${fornecedorNome} em ${produtoNome}`;
}
