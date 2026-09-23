/**
 * NOP-318 / NOP-328 — helpers puros da tela Conferir chegada.
 * Mantém cabeçalho enxuto, vales só do pedido aberto e sem UI de vazias.
 */

/** Vales exibidos na conferência: só os do pedido aberto (fila completa fica em Vales). */
export function filterValesDoPedido<T extends { pedido_id: string }>(
  vales: T[],
  pedidoId: string,
): T[] {
  if (!pedidoId) return [];
  return vales.filter((v) => v.pedido_id === pedidoId);
}

/** Chips do topo na sessão multi: um por fornecedor escolhido (não lista de botões). */
export function chipsFornecedoresSessao(
  grupos: { fornecedorId: string; nome: string; pedidoIds: string[] }[],
): { fornecedorId: string; nome: string; pedidoIds: string[] }[] {
  return grupos.map((g) => ({
    fornecedorId: g.fornecedorId,
    nome: g.nome,
    pedidoIds: [...g.pedidoIds],
  }));
}

/** Remove pedidos de um fornecedor da sessão multi. */
export function removerFornecedorDaSessao(
  pedidoIds: string[],
  pedidoIdsDoFornecedor: string[],
): string[] {
  const drop = new Set(pedidoIdsDoFornecedor);
  return pedidoIds.filter((id) => !drop.has(id));
}

/**
 * Texto/aviso de caixas vazias não deve aparecer na conferência
 * (decisão 22/09: vazias só em Movimentação de caixas).
 */
export function isAvisoCaixasVazias(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("vazias") ||
    t.includes("caixa vazia") ||
    t.includes("caixas vazias") ||
    (t.includes("packing") && t.includes("fornecedor") && t.includes("moviment"))
  );
}

/** NOP-327: só ADM reabre conferência já finalizada. */
export function podeEditarConferenciaFinalizada(isAdmin: boolean): boolean {
  return !!isAdmin;
}

/**
 * NOP-327: enquanto a conferência está aberta, o conferente edita livremente
 * (inclusive itens já conferidos). Depois de finalizada, qty só libera no modo
 * edição ADM. Vale pendente continua travando o item.
 */
export function itemConferenciaQtyLocked(opts: {
  conferenciaAberta: boolean;
  editando: boolean;
  readOnly: boolean;
  conferido: boolean;
  temValePendente: boolean;
}): boolean {
  if (opts.editando) return false;
  if (opts.conferenciaAberta) return opts.temValePendente;
  return opts.readOnly || opts.conferido || opts.temValePendente;
}

/* ───────────────────────── NOP-328 — 3 passos do descarregamento ───────── */

/** Número em pt-BR sem casas inúteis: 80 → "80"; 12.5 → "12,5". */
function numeroBR(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/**
 * Caixas esperadas do item = unidades do pedido ÷ fator do cadastro (arredonda
 * para cima, como a sugestão). Sem fator cadastrado devolve `null` — a tela
 * mostra "sem conversão", nunca um fator inventado.
 */
export function caixasEsperadas(
  quantidadeUnidades: number,
  fator: number | null | undefined,
): number | null {
  if (fator == null || !(fator > 0)) return null;
  if (!(quantidadeUnidades > 0)) return 0;
  return Math.ceil(quantidadeUnidades / fator);
}

/** Unidades que N caixas representam. Sem fator, a qty já está na unidade do pedido. */
export function unidadesDeCaixas(caixas: number, fator: number | null | undefined): number {
  const cx = Math.max(0, Number(caixas) || 0);
  if (fator == null || !(fator > 0)) return cx;
  return cx * fator;
}

/** Quanto ainda falta receber (un) contando entregas anteriores. Nunca negativo. */
export function faltamUnidades(opts: {
  pedidoUn: number;
  jaRecebidoUn: number;
  caixasRecebidas: number;
  fator: number | null | undefined;
}): number {
  const recebido =
    Math.max(0, opts.jaRecebidoUn) + unidadesDeCaixas(opts.caixasRecebidas, opts.fator);
  return Math.max(0, Math.max(0, opts.pedidoUn) - recebido);
}

/** Barra "Recebido até agora" + "Faltam" do item aberto no passo 2. */
export function progressoItem(opts: {
  pedidoUn: number;
  jaRecebidoUn: number;
  caixasRecebidas: number;
  fator: number | null | undefined;
}): { recebidoUn: number; faltamUn: number; pct: number } {
  const recebidoUn =
    Math.max(0, opts.jaRecebidoUn) + unidadesDeCaixas(opts.caixasRecebidas, opts.fator);
  const faltamUn = faltamUnidades(opts);
  const pedido = Math.max(0, opts.pedidoUn);
  const bruto = pedido > 0 ? (recebidoUn / pedido) * 100 : recebidoUn > 0 ? 100 : 0;
  return { recebidoUn, faltamUn, pct: Math.min(100, Math.max(0, Math.round(bruto))) };
}

export type StatusItemConferencia = "conferido" | "em_andamento" | "pendente";

/** Status do item na fila do passo 3. */
export function statusItemConferencia(opts: {
  conferido: boolean;
  atual: boolean;
  caixasRecebidas: number;
}): StatusItemConferencia {
  if (opts.conferido) return "conferido";
  if (opts.atual || opts.caixasRecebidas > 0) return "em_andamento";
  return "pendente";
}

export function labelStatusItem(status: StatusItemConferencia): string {
  if (status === "conferido") return "Conferido";
  if (status === "em_andamento") return "Em andamento";
  return "Pendente";
}


/**
 * NOP-349 — rótulo da unidade de mercadoria (Pedido / Conversão / Recebido / Faltam).
 * Normaliza UND/UN/PC → "un"; nunca devolve "cx"/"caixa" (isso é só Esperado / Caixas recebidas).
 * Preserva kg, g, maço e demais unidades do cadastro.
 */
export function labelUnidadeProduto(unidade: string | null | undefined): string {
  const raw = (unidade ?? "").trim();
  if (!raw) return "un";
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  // NFD: "pç" → "pc". UND/UN/PC do cadastro/Wise viram "un".
  const asUn = new Set([
    "un",
    "und",
    "unid",
    "unidade",
    "unidades",
    "pc",
    "pcs",
    "peca",
    "pecas",
  ]);
  if (asUn.has(key)) return "un";

  // Sinônimos de caixa NÃO são unidade de mercadoria nesta tela (NOP-349).
  if (key === "cx" || key === "caixa" || key === "caixas") return "un";

  if (key === "kg" || key === "quilograma" || key === "quilogramas") return "kg";
  if (key === "g" || key === "grama" || key === "gramas") return "g";
  if (key === "maco" || key === "macos") return "maço";

  // Mantém o texto do cadastro (ex.: "bdj", "fd"); short forms em minúsculas.
  return raw.length <= 4 ? key : raw;
}

/**
 * Bloco "Conversão" do passo 2: só com fator real do cadastro.
 * Sem fator devolve `null` — nunca "1 caixa = 1 unidade" de mentira.
 */
export function textoConversao(
  fator: number | null | undefined,
  unidade: string | null | undefined,
): string | null {
  if (fator == null || !(fator > 0)) return null;
  const un = labelUnidadeProduto(unidade);
  return `1 caixa = ${numeroBR(fator)} ${un}`;
}

/** Contador do passo 1: "3 selecionados de 8". */
export function resumoSelecao(selecionados: number, total: number): string {
  return `${Math.max(0, selecionados)} selecionados de ${Math.max(0, total)}`;
}


/** Snapshot local do item na conferência (caixas + flags). */
export type DraftConferenciaSnapshot = {
  caixas: number;
  conferido: boolean;
  qualidade: boolean;
};

/**
 * NOP-340 — item "sujo" só quando o valor mudou vs. o último gravado/hidratado.
 * Abrir e sair sem digitar → false (não cria parcial nem muda status).
 */
export function draftConferenciaDirty(
  current: DraftConferenciaSnapshot | null | undefined,
  saved: DraftConferenciaSnapshot | null | undefined,
): boolean {
  if (!current) return false;
  const base = saved ?? { caixas: 0, conferido: false, qualidade: false };
  return (
    Number(current.caixas) !== Number(base.caixas) ||
    !!current.conferido !== !!base.conferido ||
    !!current.qualidade !== !!base.qualidade
  );
}

/**
 * NOP-340 — parcial na fila: "7 de 12 cx". Sem esperado, só as recebidas.
 */
export function textoParcialCaixas(
  caixasRecebidas: number,
  esperadoCaixas: number | null | undefined,
): string | null {
  const recebidas = Math.max(0, Math.round(Number(caixasRecebidas) || 0));
  if (recebidas <= 0) return null;
  if (esperadoCaixas == null || !(esperadoCaixas > 0)) {
    return `${recebidas} ${recebidas === 1 ? "cx" : "cx"}`;
  }
  const esp = Math.max(0, Math.round(Number(esperadoCaixas)));
  return `${recebidas} de ${esp} cx`;
}
