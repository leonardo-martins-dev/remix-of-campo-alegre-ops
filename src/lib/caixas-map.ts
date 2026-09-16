export type TipoCaixa = {
  id: string;
  sigla: string;
  nome: string;
  custo_unitario: number;
  ordem: number;
  ativo: boolean;
};

export type CaixasMap = Record<string, number>;

export function emptyCaixas(tipos: TipoCaixa[], onlyActive = true): CaixasMap {
  const list = onlyActive ? tipos.filter((t) => t.ativo) : tipos;
  return Object.fromEntries(list.map((t) => [t.sigla, 0]));
}

export function mergeCaixas(base: CaixasMap, extra?: CaixasMap | null): CaixasMap {
  return { ...base, ...(extra ?? {}) };
}

export function fromLegacyColumns(row: {
  caixas?: CaixasMap | null;
  caixas_g?: number | null;
  caixas_i?: number | null;
  caixas_p?: number | null;
}): CaixasMap {
  const fromJson = row.caixas && Object.keys(row.caixas).length ? row.caixas : {};
  return {
    G: Number(fromJson.G ?? row.caixas_g ?? 0),
    I: Number(fromJson.I ?? row.caixas_i ?? 0),
    P: Number(fromJson.P ?? row.caixas_p ?? 0),
    ...fromJson,
  };
}

export function toLegacyColumns(map: CaixasMap) {
  return {
    caixas: map,
    caixas_g: Number(map.G ?? 0),
    caixas_i: Number(map.I ?? 0),
    caixas_p: Number(map.P ?? 0),
  };
}

export function sumCaixas(map: CaixasMap): number {
  return Object.values(map).reduce((a, n) => a + Number(n || 0), 0);
}

export function sortedTipos(tipos: TipoCaixa[], includeInactive = false): TipoCaixa[] {
  return [...tipos]
    .filter((t) => includeInactive || t.ativo)
    .sort((a, b) => a.ordem - b.ordem || a.sigla.localeCompare(b.sigla));
}

export const TIPO_COLORS = [
  "var(--primary-dark)",
  "var(--info)",
  "var(--brand-green)",
  "var(--warning)",
  "var(--navy)",
  "var(--danger)",
];

export function tipoColor(index: number): string {
  return TIPO_COLORS[index % TIPO_COLORS.length];
}

export type SaldoPosicao = {
  posicao_tipo: string;
  tipo_caixa: string;
  saldo: number;
};

/** Taxa de retorno honesta: nunca passa de 100% em silêncio. */
export function taxaRetornoHonesta(enviadas: number, retornadas: number): {
  pct: number;
  overflow: boolean;
  enviadas: number;
  retornadas: number;
  label: string;
} {
  const env = Number(enviadas) || 0;
  const ret = Number(retornadas) || 0;
  const overflow = ret > env && env > 0;
  const pct = env <= 0 ? 0 : (Math.min(ret, env) / env) * 100;
  return {
    pct,
    overflow,
    enviadas: env,
    retornadas: ret,
    label: env <= 0 ? "0 / 0" : `${ret} / ${env}`,
  };
}

/** Estoque de caixas com valor: clientes + fornecedores + galpão.
 * Saldo negativo (ex.: recebimento sem vazias prévias) é ignorado — não inverte o KPI. */
export function capitalNaRua(
  saldos: SaldoPosicao[],
  custos: Record<string, number>
): { qty: number; valor: number } {
  let qty = 0;
  let valor = 0;
  for (const s of saldos) {
    if (
      s.posicao_tipo !== "cliente" &&
      s.posicao_tipo !== "fornecedor" &&
      s.posicao_tipo !== "galpao"
    ) {
      continue;
    }
    const n = Number(s.saldo ?? 0);
    if (n <= 0) continue;
    qty += n;
    valor += n * (custos[s.tipo_caixa] ?? 0);
  }
  return { qty, valor };
}

export type AgingRow = {
  partnerKind: "cliente" | "fornecedor";
  partnerId: string;
  tipo: string;
  saldo: number;
  oldestDays: number;
};

/** FIFO age of remaining boxes at cliente (envio − retorno) or fornecedor (vazias − cheias). */
export function computeFifoAging(
  movs: {
    data_movimento: string;
    quantidade: number;
    tipo_caixa: string;
    tipo?: string | null;
    natureza?: string | null;
    cliente_id?: string | null;
    fornecedor_id?: string | null;
  }[],
  today = new Date()
): AgingRow[] {
  type Lot = { date: string; qty: number };
  const lots = new Map<string, Lot[]>();

  const keyOf = (kind: AgingRow["partnerKind"], id: string, tipo: string) => `${kind}:${id}:${tipo}`;

  const add = (key: string, date: string, qty: number) => {
    if (qty <= 0) return;
    const list = lots.get(key) ?? [];
    list.push({ date, qty });
    lots.set(key, list);
  };

  const consume = (key: string, qty: number) => {
    let left = qty;
    const list = lots.get(key) ?? [];
    list.sort((a, b) => a.date.localeCompare(b.date));
    for (const lot of list) {
      if (left <= 0) break;
      const take = Math.min(lot.qty, left);
      lot.qty -= take;
      left -= take;
    }
    lots.set(key, list.filter((l) => l.qty > 0));
  };

  const ordered = [...movs].sort((a, b) => a.data_movimento.localeCompare(b.data_movimento));
  for (const m of ordered) {
    const nat = m.natureza || m.tipo || "";
    const qty = Number(m.quantidade ?? 0);
    if (!qty || !m.tipo_caixa) continue;
    if (m.cliente_id && (nat === "envio" || m.tipo === "envio")) {
      add(keyOf("cliente", m.cliente_id, m.tipo_caixa), m.data_movimento, qty);
    } else if (m.cliente_id && (nat === "retorno" || m.tipo === "retorno")) {
      consume(keyOf("cliente", m.cliente_id, m.tipo_caixa), qty);
    } else if (m.fornecedor_id && nat === "entrega_vazias") {
      add(keyOf("fornecedor", m.fornecedor_id, m.tipo_caixa), m.data_movimento, qty);
    } else if (m.fornecedor_id && nat === "recebimento_cheias") {
      consume(keyOf("fornecedor", m.fornecedor_id, m.tipo_caixa), qty);
    }
  }

  const todayISO = today.toISOString().slice(0, 10);
  const rows: AgingRow[] = [];
  for (const [key, list] of lots) {
    const [kind, partnerId, tipo] = key.split(":");
    const saldo = list.reduce((a, l) => a + l.qty, 0);
    if (saldo <= 0) continue;
    const oldest = list.reduce((min, l) => (l.date < min ? l.date : min), list[0].date);
    const oldestDays = Math.max(
      0,
      Math.floor((new Date(todayISO).getTime() - new Date(oldest).getTime()) / 86_400_000)
    );
    rows.push({
      partnerKind: kind as AgingRow["partnerKind"],
      partnerId,
      tipo,
      saldo,
      oldestDays,
    });
  }
  return rows;
}
