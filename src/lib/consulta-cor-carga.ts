/**
 * NOP-467 — consulta reversa de cor da carga.
 *
 * A cor é etiqueta da viagem ("de quem é esta carga?"), não dono da caixa vazia.
 * Unicidade: (produto, cor) → 1 fornecedor. Cor sozinha devolve lista por produto.
 */

import {
  FORNECEDOR_CORES,
  type FornecedorCorDef,
  type FornecedorCorId,
  isFornecedorCorId,
  labelFornecedorCor,
} from "./fornecedor-cores";

export type VinculoCorCarga = {
  fornecedorId: string;
  fornecedorNome: string;
  /** código/apelido opcional do fornecedor (exibição) */
  fornecedorCodigo?: string | null;
  cor: string;
  produtoId: string;
  produtoNome: string;
};

export type ItemListaPorCor = {
  produtoId: string;
  produtoNome: string;
  fornecedorId: string;
  fornecedorNome: string;
  alertaIrmao: boolean;
  irmaosNomes: string[];
};

export type SecaoFolhaProduto = {
  produtoId: string;
  produtoNome: string;
  alertaIrmao: boolean;
  irmaosNomes: string[];
  cores: {
    cor: string;
    corNome: string;
    hex: string;
    onHex: string;
    fornecedorId: string;
    fornecedorNome: string;
  }[];
};

const QUALIFICADORES =
  /\b(UND|UN|KG|CX|PCT|PC|PÇ|HIDROPONICO|HIDROPONICA|ORGANICO|ORGANICA|CONVENCIONAL)\b/gi;

/** Normaliza nome para agrupar irmãos visuais (ex.: crespa vs crespa hidropônico). */
export function stemProdutoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[-–—_/.,]+/g, " ")
    .replace(QUALIFICADORES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cores da paleta sem nenhum fornecedor ativo atribuído (livres para cadastro). */
export function coresLivresGlobais(
  vinculos: readonly VinculoCorCarga[],
  palette: readonly FornecedorCorDef[] = FORNECEDOR_CORES,
): FornecedorCorDef[] {
  const usadas = new Set(
    vinculos.map((v) => v.cor).filter((c): c is FornecedorCorId => isFornecedorCorId(c)),
  );
  // Também considerar fornecedores com cor mas sem produto: o chamador deve
  // passar vinculos ou um set separado. Aqui só o que está nos vínculos.
  return palette.filter((c) => !usadas.has(c.id));
}

/** Cores livres a partir do conjunto de cores já atribuídas a fornecedores ativos. */
export function coresLivresDeAtribuidas(
  coresAtribuidas: readonly (string | null | undefined)[],
  palette: readonly FornecedorCorDef[] = FORNECEDOR_CORES,
): FornecedorCorDef[] {
  const usadas = new Set(
    coresAtribuidas.filter((c): c is FornecedorCorId => isFornecedorCorId(c)),
  );
  return palette.filter((c) => !usadas.has(c.id));
}

/** (cor + produto) → no máximo um fornecedor. */
export function lookupCorProduto(
  vinculos: readonly VinculoCorCarga[],
  cor: string,
  produtoId: string,
): VinculoCorCarga | null {
  const hits = vinculos.filter((v) => v.cor === cor && v.produtoId === produtoId);
  if (hits.length === 0) return null;
  return hits[0] ?? null;
}

/** Mapa stem → nomes de produtos distintos nesse stem (só stems com ≥2 produtos). */
export function mapaIrmaosPorStem(
  produtos: readonly { id: string; nome: string }[],
): Map<string, string[]> {
  const porStem = new Map<string, { id: string; nome: string }[]>();
  for (const p of produtos) {
    const stem = stemProdutoNome(p.nome);
    if (!stem) continue;
    const list = porStem.get(stem) ?? [];
    if (!list.some((x) => x.id === p.id)) list.push(p);
    porStem.set(stem, list);
  }
  const out = new Map<string, string[]>();
  for (const [stem, list] of porStem) {
    if (list.length < 2) continue;
    out.set(
      stem,
      list.map((x) => x.nome).sort((a, b) => a.localeCompare(b, "pt-BR")),
    );
  }
  return out;
}

function irmaosDe(
  produtoId: string,
  produtoNome: string,
  irmaosPorStem: Map<string, string[]>,
): { alerta: boolean; nomes: string[] } {
  const stem = stemProdutoNome(produtoNome);
  const grupo = irmaosPorStem.get(stem);
  if (!grupo || grupo.length < 2) return { alerta: false, nomes: [] };
  const outros = grupo.filter((n) => n !== produtoNome);
  return { alerta: outros.length > 0, nomes: outros };
}

/**
 * Cor sozinha → lista por produto (nunca um nome só).
 * Ordenada por nome do produto.
 */
export function listaPorCor(
  vinculos: readonly VinculoCorCarga[],
  cor: string,
): ItemListaPorCor[] {
  const daCor = vinculos.filter((v) => v.cor === cor);
  // Incluir todos os produtos do mesmo stem que aparecem em qualquer vínculo,
  // para flagar irmãos mesmo se a cor filtrada não os inclui.
  const todosProdutos = [
    ...new Map(
      vinculos.map((v) => [v.produtoId, { id: v.produtoId, nome: v.produtoNome }]),
    ).values(),
  ];
  const irmaosPorStem = mapaIrmaosPorStem(todosProdutos);

  const byProduto = new Map<string, ItemListaPorCor>();
  for (const v of daCor) {
    if (byProduto.has(v.produtoId)) continue;
    const { alerta, nomes } = irmaosDe(v.produtoId, v.produtoNome, irmaosPorStem);
    byProduto.set(v.produtoId, {
      produtoId: v.produtoId,
      produtoNome: v.produtoNome,
      fornecedorId: v.fornecedorId,
      fornecedorNome: v.fornecedorNome,
      alertaIrmao: alerta,
      irmaosNomes: nomes,
    });
  }
  return [...byProduto.values()].sort((a, b) =>
    a.produtoNome.localeCompare(b.produtoNome, "pt-BR"),
  );
}

/** Folha da parede: uma seção por produto → cores + fornecedor. */
export function secoesFolhaPorProduto(
  vinculos: readonly VinculoCorCarga[],
): SecaoFolhaProduto[] {
  const todosProdutos = [
    ...new Map(
      vinculos.map((v) => [v.produtoId, { id: v.produtoId, nome: v.produtoNome }]),
    ).values(),
  ];
  const irmaosPorStem = mapaIrmaosPorStem(todosProdutos);

  const porProduto = new Map<string, SecaoFolhaProduto>();
  for (const v of vinculos) {
    let sec = porProduto.get(v.produtoId);
    if (!sec) {
      const { alerta, nomes } = irmaosDe(v.produtoId, v.produtoNome, irmaosPorStem);
      sec = {
        produtoId: v.produtoId,
        produtoNome: v.produtoNome,
        alertaIrmao: alerta,
        irmaosNomes: nomes,
        cores: [],
      };
      porProduto.set(v.produtoId, sec);
    }
    const def = FORNECEDOR_CORES.find((c) => c.id === v.cor);
    sec.cores.push({
      cor: v.cor,
      corNome: def?.nome ?? labelFornecedorCor(v.cor),
      hex: def?.hex ?? "#888",
      onHex: def?.onHex ?? "#fff",
      fornecedorId: v.fornecedorId,
      fornecedorNome: v.fornecedorNome,
    });
  }

  const secoes = [...porProduto.values()];
  for (const s of secoes) {
    s.cores.sort((a, b) => a.corNome.localeCompare(b.corNome, "pt-BR"));
  }
  // Irmãos com alerta primeiro agrupados (stem), depois alfabeticamente
  secoes.sort((a, b) => {
    if (a.alertaIrmao !== b.alertaIrmao) return a.alertaIrmao ? -1 : 1;
    const sa = stemProdutoNome(a.produtoNome);
    const sb = stemProdutoNome(b.produtoNome);
    if (a.alertaIrmao && b.alertaIrmao && sa !== sb) {
      return sa.localeCompare(sb, "pt-BR");
    }
    if (a.alertaIrmao && b.alertaIrmao && sa === sb) {
      return a.produtoNome.localeCompare(b.produtoNome, "pt-BR");
    }
    return a.produtoNome.localeCompare(b.produtoNome, "pt-BR");
  });
  return secoes;
}
