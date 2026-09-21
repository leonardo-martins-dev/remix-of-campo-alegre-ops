import sql from "mssql";
import { env } from "../../env.js";
import { logger } from "../../lib/logger.js";

let pool: sql.ConnectionPool | null = null;

function config(): sql.config {
  return {
    server: env.MSSQL_HOST,
    port: env.MSSQL_PORT,
    database: env.MSSQL_DATABASE,
    user: env.MSSQL_USER,
    password: env.MSSQL_PASSWORD,
    options: {
      encrypt: env.MSSQL_ENCRYPT,
      trustServerCertificate: env.MSSQL_TRUST_SERVER_CERTIFICATE,
      enableArithAbort: true,
      readOnlyIntent: true,
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30_000,
    },
    requestTimeout: 120_000,
    connectionTimeout: 30_000,
  };
}

export async function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  pool = await new sql.ConnectionPool(config()).connect();
  logger.info({ host: env.MSSQL_HOST, database: env.MSSQL_DATABASE }, "mssql connected (read-only)");
  return pool;
}

export async function closeMssql(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

const LOCK_RETRY = 3;
const LOCK_DELAY_MS = 1500;

function isLockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /lock|deadlock|1205|1222/i.test(msg);
}

/** Execute read-only query with NOLOCK-friendly retries only on lock errors. */
export async function queryReadonly<T extends Record<string, unknown>>(
  queryText: string,
  params?: Record<string, string | number | boolean>,
): Promise<T[]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= LOCK_RETRY; attempt++) {
    try {
      const p = await getMssqlPool();
      const req = p.request();
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          req.input(k, v);
        }
      }
      const result = await req.query<T>(queryText);
      return result.recordset ?? [];
    } catch (err) {
      lastErr = err;
      if (!isLockError(err) || attempt === LOCK_RETRY) throw err;
      logger.warn({ attempt, err: err instanceof Error ? err.message : err }, "mssql lock — retry");
      await new Promise((r) => setTimeout(r, LOCK_DELAY_MS * attempt));
    }
  }
  throw lastErr;
}
