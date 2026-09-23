/**
 * NOP-322 — Contagem "não informado", rascunho e confirmação.
 *
 * Campo de contagem em branco significa **não informado** — nunca zero. Por
 * isso o mapa guarda só as chaves que o usuário realmente informou: chave
 * ausente = não contou, e o tipo fica de fora do payload de fechamento.
 * O zero só existe quando digitado, e aí vale como contagem de verdade.
 *
 * O rascunho vai para o localStorage (mesmo padrão das filas offline) para a
 * contagem sobreviver a sair e voltar da tela no meio do galpão.
 */

/** Só as chaves informadas; ausente = não informado. */
export type ContagemValues = Record<string, number>;

export type ItemConfirmacao = {
  id: string;
  label: string;
  informado: boolean;
  qtd: number | null;
  esperado: number;
};

export type Confirmacao = {
  tipo: "zero" | "diff";
  label: string;
  qtd: number;
  esperado: number;
  diff: number;
};

export type ContagemRascunho = {
  values: ContagemValues;
  updatedAt: string;
  data?: string;
  observacao?: string;
};

const RASCUNHO_PREFIX = "campo-alegre-rascunho-";

/** Rascunho da contagem de embalagens (só existe o Packing, chave global). */
export const RASCUNHO_EMBALAGENS_KEY = `${RASCUNHO_PREFIX}embalagens`;

/** Rascunho da contagem de caixas, por posição. */
export function rascunhoCaixasKey(posicaoId: string): string {
  return `${RASCUNHO_PREFIX}caixas:${posicaoId}`;
}

/** Rascunho velho não volta: a contagem é semanal, 7 dias já é outra semana. */
export const RASCUNHO_MAX_IDADE_MS = 7 * 24 * 60 * 60 * 1000;

export function isInformado(map: ContagemValues, key: string): boolean {
  const v: number | undefined = map[key];
  return typeof v === "number" && Number.isFinite(v);
}

export function countInformados(
  map: ContagemValues,
  keys: string[]
): { contados: number; total: number } {
  let contados = 0;
  for (const k of keys) if (isInformado(map, k)) contados++;
  return { contados, total: keys.length };
}

/**
 * O que precisa de confirmação antes de fechar: zerar um saldo que era
 * positivo, ou uma diferença maior que a tolerância configurada.
 */
export function buildConfirmacoes(itens: ItemConfirmacao[], threshold: number): Confirmacao[] {
  const tol = Number.isFinite(threshold) ? Math.abs(threshold) : 0;
  const out: Confirmacao[] = [];
  for (const it of itens) {
    if (!it.informado || it.qtd == null || !Number.isFinite(it.qtd)) continue;
    const esperado = Number.isFinite(it.esperado) ? it.esperado : 0;
    const diff = it.qtd - esperado;
    if (it.qtd === 0 && esperado > 0) {
      out.push({ tipo: "zero", label: it.label, qtd: it.qtd, esperado, diff });
      continue;
    }
    if (Math.abs(diff) > tol) {
      out.push({ tipo: "diff", label: it.label, qtd: it.qtd, esperado, diff });
    }
  }
  return out;
}

export function textoConfirmacao(c: Confirmacao): string {
  if (c.tipo === "zero") {
    return `${c.label}: contagem 0 com ${c.esperado} esperado(s) — vai zerar o saldo.`;
  }
  return `${c.label}: contado ${c.qtd} · esperado ${c.esperado} · diferença ${
    c.diff > 0 ? "+" : ""
  }${c.diff}.`;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function sanitizeValues(raw: unknown): ContagemValues {
  const out: ContagemValues = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export function loadRascunho(key: string, agora = Date.now()): ContagemRascunho | null {
  const ls = storage();
  if (!ls) return null;
  const raw = ls.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ContagemRascunho>;
    const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
    const ts = updatedAt ? Date.parse(updatedAt) : NaN;
    if (!Number.isFinite(ts) || agora - ts > RASCUNHO_MAX_IDADE_MS) {
      ls.removeItem(key);
      return null;
    }
    return {
      values: sanitizeValues(parsed.values),
      updatedAt,
      data: typeof parsed.data === "string" ? parsed.data : undefined,
      observacao: typeof parsed.observacao === "string" ? parsed.observacao : undefined,
    };
  } catch {
    ls.removeItem(key);
    return null;
  }
}

/**
 * Salva o rascunho. Rascunho sem nada informado e sem observação é apagado —
 * não faz sentido guardar "o usuário abriu a tela".
 */
export function saveRascunho(
  key: string,
  data: { values: ContagemValues; data?: string; observacao?: string }
): void {
  const ls = storage();
  if (!ls) return;
  const values = sanitizeValues(data.values);
  const observacao = data.observacao?.trim() ? data.observacao : undefined;
  if (Object.keys(values).length === 0 && !observacao) {
    ls.removeItem(key);
    return;
  }
  const payload: ContagemRascunho = {
    values,
    updatedAt: new Date().toISOString(),
    data: data.data,
    observacao,
  };
  try {
    ls.setItem(key, JSON.stringify(payload));
  } catch {
    // Cota estourada / modo privado: rascunho é conveniência, não bloqueia a contagem.
  }
}

export function clearRascunho(key: string): void {
  storage()?.removeItem(key);
}
