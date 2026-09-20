import { normalizeKey } from "./normalize";

/** Cadastros que o seletor sabe listar (NOP-131). */
export type SeletorTipo =
  | "fornecedor"
  | "produto"
  | "cliente"
  | "rota"
  | "motorista"
  | "caminhao"
  | "tipo_caixa";

export type SeletorItemMeta = {
  familia?: string | null;
  familiaId?: string | null;
  unidade?: string | null;
  rota?: string | null;
  /** cor de fundo do chip (tipo de caixa) */
  cor?: string | null;
  ultimaEntrega?: string | null;
  placa?: string | null;
  sigla?: string | null;
};

export type SeletorItem = {
  id: string;
  nome: string;
  /** código Wise (produto) */
  codigo?: string | null;
  cnpj?: string | null;
  ativo?: boolean;
  meta?: SeletorItemMeta;
};

export const SELETOR_LABEL: Record<
  SeletorTipo,
  { singular: string; plural: string; placeholder: string }
> = {
  fornecedor: { singular: "Fornecedor", plural: "Fornecedores", placeholder: "Buscar fornecedor…" },
  produto: { singular: "Produto", plural: "Produtos", placeholder: "Buscar produto ou código…" },
  cliente: {
    singular: "Supermercado",
    plural: "Supermercados",
    placeholder: "Buscar loja ou CNPJ…",
  },
  rota: { singular: "Rota", plural: "Rotas", placeholder: "Buscar rota…" },
  motorista: { singular: "Motorista", plural: "Motoristas", placeholder: "Buscar motorista…" },
  caminhao: { singular: "Caminhão", plural: "Caminhões", placeholder: "Buscar placa ou modelo…" },
  tipo_caixa: { singular: "Tipo de caixa", plural: "Tipos de caixa", placeholder: "Buscar tipo…" },
};

/** Cadastros-fantasma criados pela importação — nunca aparecem no seletor. */
const NOMES_OCULTOS = [
  "aguardando vinculo",
  "aguardando vinculacao",
  "fornecedor nao reconhecido",
  "nao reconhecido",
];

export function isAguardandoVinculo(nome: string | null | undefined): boolean {
  const k = normalizeKey(nome ?? "");
  if (!k) return true;
  return NOMES_OCULTOS.some((alvo) => k.includes(alvo));
}

export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** Nome, código Wise ou CNPJ — sem acento, sem caixa, em qualquer parte. */
export function matchSeletor(item: SeletorItem, termo: string): boolean {
  const alvo = normalizeKey(termo);
  if (!alvo) return true;

  if (normalizeKey(item.nome).includes(alvo)) return true;
  if (item.codigo && normalizeKey(item.codigo).includes(alvo)) return true;
  if (item.meta?.sigla && normalizeKey(item.meta.sigla).includes(alvo)) return true;
  if (item.meta?.placa && normalizeKey(item.meta.placa).includes(alvo)) return true;
  if (item.meta?.familia && normalizeKey(item.meta.familia).includes(alvo)) return true;

  const digitos = soDigitos(termo);
  if (digitos) {
    if (item.cnpj && soDigitos(item.cnpj).includes(digitos)) return true;
    if (item.codigo && soDigitos(item.codigo).includes(digitos)) return true;
    // Muito cadastro traz o CNPJ no próprio nome ("35.527.016 JOSUE…").
    if (soDigitos(item.nome).includes(digitos)) return true;
  }
  return false;
}

/** Ativos, sem cadastro-fantasma, sem id repetido, em ordem alfabética. */
export function prepararItens(
  items: SeletorItem[],
  opts?: { incluirInativos?: boolean },
): SeletorItem[] {
  const vistos = new Set<string>();
  const out: SeletorItem[] = [];
  for (const item of items) {
    if (!item?.id || vistos.has(item.id)) continue;
    if (!opts?.incluirInativos && item.ativo === false) continue;
    if (isAguardandoVinculo(item.nome)) continue;
    vistos.add(item.id);
    out.push(item);
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function filtrarItens(items: SeletorItem[], termo: string): SeletorItem[] {
  if (!termo.trim()) return items;
  return items.filter((i) => matchSeletor(i, termo));
}

/** Nomes repetidos ganham destaque do código/CNPJ na linha secundária. */
export function nomesDuplicados(items: SeletorItem[]): Set<string> {
  const contagem = new Map<string, number>();
  for (const i of items) {
    const k = normalizeKey(i.nome);
    contagem.set(k, (contagem.get(k) ?? 0) + 1);
  }
  return new Set([...contagem.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

export function letraDe(nome: string): string {
  const k = normalizeKey(nome);
  const c = k.charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

export function agruparPorLetra(items: SeletorItem[]): { letra: string; itens: SeletorItem[] }[] {
  const map = new Map<string, SeletorItem[]>();
  for (const item of items) {
    const letra = letraDe(item.nome);
    const lista = map.get(letra) ?? [];
    lista.push(item);
    map.set(letra, lista);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([letra, itens]) => ({ letra, itens }));
}

export function iniciaisDe(nome: string): string {
  const partes = normalizeKey(nome).split(" ").filter(Boolean).slice(0, 2);
  if (!partes.length) return "?";
  return partes.map((p) => p.charAt(0).toUpperCase()).join("");
}

/** Cor estável por nome — o mesmo fornecedor tem sempre o mesmo círculo. */
export function corDoNome(nome: string): string {
  let hash = 0;
  const k = normalizeKey(nome);
  for (let i = 0; i < k.length; i++) hash = (hash * 31 + k.charCodeAt(i)) % 360;
  return `hsl(${hash} 55% 42%)`;
}
