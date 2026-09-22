import { env } from "../../env.js";
import { logger } from "../../lib/logger.js";
import { queryReadonly } from "./mssql-client.js";
import { parseVendaRows } from "../../schemas/wise.js";
import {
  groupVendaToRpc,
  loadAliases,
  loadClientesByCodigo,
  stableHash,
} from "./aliases.js";
import { getSupabase } from "../../lib/supabase.js";

function empresasInClause(): string {
  return env.WISE_EMPRESAS.join(",");
}

export async function fetchVendaRows() {
  const days = env.WISE_WINDOW_DAYS;
  const sqlText = `
SELECT
  CAST(v.ID AS varchar(50)) AS wise_carregamento_id,
  v.DATA_EMBARQUE,
  v.DATA_ENTREGA,
  v.DATA_EMISSAO,
  v.EMPRESA,
  CAST(v.ENTIDADE AS varchar(50)) AS cliente_wise,
  e.RAZAO AS cliente_nome,
  CAST(e.CODIGO AS varchar(50)) AS cliente_codigo,
  v.CANCELADO,
  CAST(i.CODIGO AS varchar(50)) AS produto_wise,
  pr.DESCRICAO AS produto_nome,
  i.QTDE
FROM VENDA v WITH (NOLOCK)
JOIN VENDA_ITEM i WITH (NOLOCK) ON i.ID_VENDA = v.ID
LEFT JOIN ENTIDADE e WITH (NOLOCK) ON e.ID = v.ENTIDADE AND (e.EMPRESA = v.EMPRESA OR e.EMPRESA IS NULL)
LEFT JOIN PRODUTO pr WITH (NOLOCK) ON pr.ID = i.CODIGO
WHERE COALESCE(v.DATA_EMBARQUE, v.DATA_ENTREGA, v.DATA_EMISSAO)
        >= DATEADD(day, -@windowDays, CAST(GETDATE() AS date))
  AND v.EMPRESA IN (${empresasInClause()})
  AND ISNULL(v.CANCELADO, 'N') <> 'S'
`;
  const raw = await queryReadonly<Record<string, unknown>>(sqlText, {
    windowDays: days,
  });
  return parseVendaRows(raw);
}

export type SyncVendaResult = {
  ok: boolean;
  empty_window?: boolean;
  rows: number;
  cargas: number;
  hash: string;
  rpc?: Record<string, unknown>;
  error?: string;
};

export async function syncVenda(): Promise<SyncVendaResult> {
  const started = Date.now();
  logger.info({ windowDays: env.WISE_WINDOW_DAYS }, "sync venda start");

  const rows = await fetchVendaRows();
  if (!rows.length) {
    logger.warn("sync venda: janela vazia");
    return { ok: true, empty_window: true, rows: 0, cargas: 0, hash: "" };
  }

  const [aliases, clientes] = await Promise.all([loadAliases(), loadClientesByCodigo()]);
  const cargas = groupVendaToRpc(rows, aliases, clientes);
  const hash = stableHash(cargas);
  const arquivo = `wise-sync-venda-${new Date().toISOString().slice(0, 10)}`;

  const sb = getSupabase();
  const { data, error } = await sb.rpc("importar_cargas_wise", {
    p_arquivo: arquivo,
    p_formato: "wise-sync",
    p_hash: hash,
    p_cargas: cargas,
    p_ignoradas: [],
  });

  if (error) {
    logger.error({ err: error.message }, "sync venda RPC failed");
    return {
      ok: false,
      rows: rows.length,
      cargas: cargas.length,
      hash,
      error: error.message,
    };
  }

  const elapsed_ms = Date.now() - started;
  logger.info(
    {
      elapsed_ms,
      rows: rows.length,
      cargas: cargas.length,
      hash,
      rpc: data,
    },
    "sync venda done",
  );

  return {
    ok: true,
    rows: rows.length,
    cargas: cargas.length,
    hash,
    rpc: (data ?? {}) as Record<string, unknown>,
  };
}
