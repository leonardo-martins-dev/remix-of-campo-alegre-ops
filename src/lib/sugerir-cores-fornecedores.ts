/**
 * NOP-463 — sugestão de cor para todos os fornecedores ativos sem cor.
 *
 * Função pura (sem Supabase): o painel de gestão busca os dados, roda isto,
 * mostra a proposta, deixa o admin trocar manualmente e só então grava via RPC.
 *
 * Regra do galpão: dois fornecedores do MESMO produto não podem ter a mesma cor
 * (é assim que o conferente sabe de quem é a caixa). Isso é uma coloração de
 * grafo: vértices = fornecedores, aresta = compartilham ≥1 produto.
 */

export type FornecedorCorInput = {
  id: string;
  nome: string;
  cor: string | null;
  /** product ids linked via conversoes_fornecedor ativos */
  produtoIds: string[];
  /** optional: circulating box count for heuristics */
  caixasCirculando?: number;
};

export type SugestaoCor = {
  fornecedorId: string;
  fornecedorNome: string;
  corSugerida: string;
  produtoIds: string[];
  motivo: "grafo" | "sem_vinculo_menos_usada";
};

function uniq(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/** produto → ids de fornecedores (todos, com ou sem cor) que o fornecem. */
function mapaProdutoFornecedores(
  fornecedores: readonly FornecedorCorInput[],
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const f of fornecedores) {
    for (const p of uniq(f.produtoIds)) {
      const list = m.get(p) ?? [];
      if (!list.includes(f.id)) list.push(f.id);
      m.set(p, list);
    }
  }
  return m;
}

/** vizinhos = outros fornecedores que compartilham ≥1 produto. */
function mapaVizinhos(
  fornecedores: readonly FornecedorCorInput[],
  porProduto: Map<string, string[]>,
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const f of fornecedores) m.set(f.id, new Set());
  for (const ids of porProduto.values()) {
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        m.get(a)?.add(b);
      }
    }
  }
  return m;
}

/**
 * Sugere cor para cada fornecedor com `cor == null`. Quem já tem cor entra como
 * restrição fixa (nunca é sugerido nem alterado).
 *
 * Ordem de atendimento: produtos com mais fornecedores primeiro (o gargalo —
 * ex.: COUVE MANTEIGA com 11 fornecedores consome a paleta inteira), depois
 * quem tem mais vizinhos. Fornecedores sem vínculo ficam para o fim e recebem
 * a cor menos usada globalmente, para a paleta seguir equilibrada.
 */
export function sugerirCoresFornecedores(
  fornecedores: readonly FornecedorCorInput[],
  palette: readonly string[],
): SugestaoCor[] {
  if (palette.length === 0) return [];

  const porProduto = mapaProdutoFornecedores(fornecedores);
  const vizinhos = mapaVizinhos(fornecedores, porProduto);

  /** cor efetiva (fixa ou já sugerida nesta rodada) */
  const atribuida = new Map<string, string>();
  const usoPorCor = new Map<string, number>(palette.map((c) => [c, 0]));
  for (const f of fornecedores) {
    if (f.cor) {
      atribuida.set(f.id, f.cor);
      usoPorCor.set(f.cor, (usoPorCor.get(f.cor) ?? 0) + 1);
    }
  }

  const grauProduto = (produtoId: string) => porProduto.get(produtoId)?.length ?? 0;
  const grauMaxProduto = (f: FornecedorCorInput) =>
    uniq(f.produtoIds).reduce((max, p) => Math.max(max, grauProduto(p)), 0);

  const semCor = fornecedores.filter((f) => !f.cor);
  const comVinculo = semCor.filter((f) => uniq(f.produtoIds).length > 0);
  const semVinculo = semCor.filter((f) => uniq(f.produtoIds).length === 0);

  comVinculo.sort((a, b) => {
    const dp = grauMaxProduto(b) - grauMaxProduto(a);
    if (dp !== 0) return dp;
    const dv = (vizinhos.get(b.id)?.size ?? 0) - (vizinhos.get(a.id)?.size ?? 0);
    if (dv !== 0) return dv;
    return a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id);
  });

  const registrar = (id: string, cor: string) => {
    atribuida.set(id, cor);
    usoPorCor.set(cor, (usoPorCor.get(cor) ?? 0) + 1);
  };

  /** cor menos usada até agora; empate resolve pela ordem da paleta. */
  const menosUsada = (proibidas?: Set<string>) => {
    let melhor = palette[0];
    let melhorUso = Number.POSITIVE_INFINITY;
    for (const c of palette) {
      if (proibidas?.has(c)) continue;
      const uso = usoPorCor.get(c) ?? 0;
      if (uso < melhorUso) {
        melhor = c;
        melhorUso = uso;
      }
    }
    return melhor;
  };

  const out: SugestaoCor[] = [];

  for (const f of comVinculo) {
    const proibidas = new Set<string>();
    for (const vid of vizinhos.get(f.id) ?? []) {
      const c = atribuida.get(vid);
      if (c) proibidas.add(c);
    }
    // Primeira cor livre na ordem da paleta; se todas estiverem tomadas
    // (mais de `palette.length` fornecedores no mesmo produto), cai para a
    // menos usada — a proposta segue visível e o admin troca na mão.
    const cor = palette.find((c) => !proibidas.has(c)) ?? menosUsada();
    registrar(f.id, cor);
    out.push({
      fornecedorId: f.id,
      fornecedorNome: f.nome,
      corSugerida: cor,
      produtoIds: uniq(f.produtoIds),
      motivo: "grafo",
    });
  }

  semVinculo.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id));
  for (const f of semVinculo) {
    const cor = menosUsada();
    registrar(f.id, cor);
    out.push({
      fornecedorId: f.id,
      fornecedorNome: f.nome,
      corSugerida: cor,
      produtoIds: [],
      motivo: "sem_vinculo_menos_usada",
    });
  }

  // devolve na ordem do cadastro para a tabela do painel ficar previsível
  const ordem = new Map(fornecedores.map((f, i) => [f.id, i]));
  out.sort((a, b) => (ordem.get(a.fornecedorId) ?? 0) - (ordem.get(b.fornecedorId) ?? 0));
  return out;
}

/**
 * Cores da paleta que ninguém usa naquele produto — as opções válidas para
 * resolver um conflito sem criar outro.
 */
export function coresLivresNoProduto(
  produtoId: string,
  fornecedores: readonly FornecedorCorInput[],
  palette: readonly string[],
): string[] {
  const usadas = new Set<string>();
  for (const f of fornecedores) {
    if (!f.cor) continue;
    if (uniq(f.produtoIds).includes(produtoId)) usadas.add(f.cor);
  }
  return palette.filter((c) => !usadas.has(c));
}

export type ConflitoCorDetectado = {
  produtoId: string;
  cor: string;
  fornecedorAId: string;
  fornecedorANome: string;
  fornecedorBId: string;
  fornecedorBNome: string;
  /** quem sai mais barato trocar (ver sugerirQuemTrocar) */
  sugeridoTrocarId: string;
};

/** Pares de fornecedores que dividem produto E cor (o que o vínculo agora aceita). */
export function detectarConflitosCor(
  fornecedores: readonly FornecedorCorInput[],
): ConflitoCorDetectado[] {
  const porProduto = mapaProdutoFornecedores(fornecedores);
  const byId = new Map(fornecedores.map((f) => [f.id, f]));
  const out: ConflitoCorDetectado[] = [];

  const produtos = [...porProduto.keys()].sort();
  for (const produtoId of produtos) {
    const ids = (porProduto.get(produtoId) ?? []).slice().sort();
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = byId.get(ids[i]);
        const b = byId.get(ids[j]);
        if (!a || !b || !a.cor || a.cor !== b.cor) continue;
        out.push({
          produtoId,
          cor: a.cor,
          fornecedorAId: a.id,
          fornecedorANome: a.nome,
          fornecedorBId: b.id,
          fornecedorBNome: b.nome,
          sugeridoTrocarId: sugerirQuemTrocar(a, b),
        });
      }
    }
  }
  return out;
}

export type LadoConflito = { id: string; nome: string; caixasCirculando?: number };

/**
 * Quem trocar de cor: quem tem MENOS caixas circulando (menos adesivo já solto
 * no campo para refazer). Empate → nome em ordem alfabética, para o servidor e
 * a tela chegarem sempre no mesmo lado.
 *
 * Heurística provisória: ainda não existe contagem de adesivos emitidos
 * (NOP-466); o saldo de caixas na posição do fornecedor é o melhor proxy hoje.
 */
export function sugerirQuemTrocar(a: LadoConflito, b: LadoConflito): string {
  const ca = Number(a.caixasCirculando ?? 0);
  const cb = Number(b.caixasCirculando ?? 0);
  if (ca !== cb) return ca < cb ? a.id : b.id;
  return a.nome.localeCompare(b.nome, "pt-BR") <= 0 ? a.id : b.id;
}

export type GrupoSelecionadoCor = { fornecedorId: string; nome: string; cor: string | null };

export type AvisoCorSelecao = {
  cor: string;
  fornecedores: { fornecedorId: string; nome: string }[];
};

/**
 * Conferir chegada: dois fornecedores no mesmo caminhão com a mesma cor —
 * o conferente precisa saber antes de descarregar, mesmo que os produtos
 * sejam diferentes.
 */
export function conflitosCorNaSelecao(grupos: readonly GrupoSelecionadoCor[]): AvisoCorSelecao[] {
  const porCor = new Map<string, { fornecedorId: string; nome: string }[]>();
  const vistos = new Set<string>();
  for (const g of grupos) {
    if (!g.cor) continue;
    if (vistos.has(g.fornecedorId)) continue;
    vistos.add(g.fornecedorId);
    const list = porCor.get(g.cor) ?? [];
    list.push({ fornecedorId: g.fornecedorId, nome: g.nome });
    porCor.set(g.cor, list);
  }
  return [...porCor.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([cor, list]) => ({
      cor,
      fornecedores: list.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    }))
    .sort((a, b) => a.cor.localeCompare(b.cor));
}
