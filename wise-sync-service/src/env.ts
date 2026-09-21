import "dotenv/config";
import { z } from "zod";

const csvNumbers = z
  .string()
  .default("1,2")
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n)),
  );

const csvStrings = z
  .string()
  .default("C,X,B,N,F,CANCELADO,BAIXADO,ANULADO")
  .transform((s) =>
    s
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean),
  );

const envSchema = z.object({
  PORT: z.coerce.number().default(3021),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  TZ: z.string().default("America/Sao_Paulo"),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  CRON_SECRET: z.string().min(16),

  MSSQL_HOST: z.string().min(1),
  MSSQL_PORT: z.coerce.number().default(1433),
  MSSQL_DATABASE: z.string().min(1),
  MSSQL_USER: z.string().min(1),
  MSSQL_PASSWORD: z.string().min(1),
  MSSQL_ENCRYPT: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  MSSQL_TRUST_SERVER_CERTIFICATE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  WISE_WINDOW_DAYS: z.coerce.number().int().min(1).max(30).default(2),
  WISE_EMPRESAS: csvNumbers,
  WISE_PEDFORN_STATUS_EXCLUIDOS: csvStrings,
});

export const env = envSchema.parse(process.env);

export function isDev(): boolean {
  return env.NODE_ENV === "development";
}
