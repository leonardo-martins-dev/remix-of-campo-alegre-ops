import { env } from "../../env.js";
import { logger } from "../../lib/logger.js";
import { queryReadonly } from "./mssql-client.js";
import { parseCompraRows } from "../../schemas/wise.js";
import {
  groupCompraToRpc,
  loadAliases,
  stableHash,
} from "./aliases.js";
import { getSupabase } from "../../lib/supabase.js";

function empresasInClause(): string {
  return env.WISE_EMPRESAS.join(",");
}

function statusExcludeSql(): { clause: string; params: Record<string, string> } {
  const list = env.WISE_PEDFORN_STATUS_EXCLUIDOS;
  if (!list.length) return { clause: "", params: {} };
  const params: Record<string, string> = {};
  const placeholders = list.map((s, i) => {
    const key = `st${i}`;
    params[key] = s;
    return `@${key}`;
  });
  return {
    clause: ` AND (p.STATUS IS NULL OR UPPER(LTRIM(RTRIM(p.STATUS))) NOT IN (${placeholders.join(",")}))`,
    params,
  };
}

export async function fetchCompraRows() {
  const days = env.WISE_WINDOW_DAYS;
  const { clause, params } = statusExcludeSql();
  const sqlText = `
SELECT
  CAST(p.ID AS varchar(50)) AS wise_pedido_id,
  p.DATA_EMISSAO,
  p.DATA_PREV_ENTREGA,
  p.EMPRESA,
  CAST(p.ENTIDADE AS varchar(50)) AS fornecedor_wise,
  e.RAZAO AS fornecedor_nome,
  CAST(e.CODIGO AS varchar(50)) AS fornecedor_codigo,
  p.STATUS,
  CAST(i.ID AS varchar(50)) AS item_id,
  CAST(i.CODIGO AS varchar(50)) AS produto_wise,
  pr.DESCRICAO AS produto_nome,
  i.QTDE,
  i.TOTAL,
  CAST(NULL AS varchar(10)) AS unidade
FROM PEDFORN p WITH (NOLOCK)
JOIN PEDFORN_ITEM i WITH (NOLOCK) ON i.ID_PEDFORN = p.ID
LEFT JOIN ENTIDADE e WITH (NOLOCK) ON e.ID = p.ENTIDADE AND (e.EMPRESA = p.EMPRESA OR e.EMPRESA IS NULL)
LEFT JOIN PRODUTO pr WITH (NOLOCK) ON pr.ID = i.CODIGO
WHERE p.DATA_EMISSAO >= DATEADD(day, -@windowDays, CAST(GETDATE() AS date))
  AND p.EMPRESA IN (${empresasInClause()})
  ${clause}
`;
  const raw = await queryReadonly<Record<string, unknown>>(sqlText, {
    windowDays: days,
    ...params,
  });

  // Log distinct statuses in window for ops tuning
  const statuses = [...new Set(raw.map((r) => String(r.STATUS ?? "").trim().toUpperCase()).filter(Boolean))];
  logger.info({ statuses, rows: raw.length }, "PEDFORN STATUS distinct (janela)");

  return parseCompraRows(raw);
}

export type SyncCompraResult = {
  ok: boolean;
  empty_window?: boolean;
  rows: number;
  pedidos: number;
  hash: string;
  rpc?: Record<string, unknown>;
  error?: string;
};

export async function syncCompra(): Promise<SyncCompraResult> {
  const started = Date.now();
  logger.info({ windowDays: env.WISE_WINDOW_DAYS }, "sync compra start");

  const rows = await fetchCompraRows();
  if (!rows.length) {
    logger.warn("sync compra: janela vazia");
    return { ok: true, empty_window: true, rows: 0, pedidos: 0, hash: "" };
  }

  const aliases = await loadAliases();
  const pedidos = groupCompraToRpc(rows, aliases);
  const hash = stableHash(pedidos);
  const arquivo = `wise-sync-compra-${new Date().toISOString().slice(0, 10)}`;

  const sb = getSupabase();
  const { data, error } = await sb.rpc("importar_pedidos_wise", {
    p_arquivo: arquivo,
    p_formato: "wise-sync",
    p_hash: hash,
    p_pedidos: pedidos,
    p_ignoradas: [],
  });

  if (error) {
    logger.error({ err: error.message }, "sync compra RPC failed");
    return {
      ok: false,
      rows: rows.length,
      pedidos: pedidos.length,
      hash,
      error: error.message,
    };
  }

  const elapsed_ms = Date.now() - started;
  logger.info(
    {
      elapsed_ms,
      rows: rows.length,
      pedidos: pedidos.length,
      hash,
      rpc: data,
    },
    "sync compra done",
  );

  return {
    ok: true,
    rows: rows.length,
    pedidos: pedidos.length,
    hash,
    rpc: (data ?? {}) as Record<string, unknown>,
  };
}
