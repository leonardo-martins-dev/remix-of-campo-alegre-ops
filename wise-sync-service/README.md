# wise-sync-service

Serviço Hono que puxa **1×/dia** do SQL Server CMP218 (Wisecloud, somente leitura) e grava no Supabase do packing house via RPCs.

## Por que `mssql`?

`mssql` **não** está no `company-standards/dependencies.md`. É cliente de **integração externa read-only** (mesma categoria NFe/SEFAZ): o app continua com fonte única no Postgres do Supabase; o CMP218 só é origem de extração. Toda linha passa por **zod** antes de virar domínio.

## Endpoints

| Método | Path | Auth |
|---|---|---|
| GET | `/health` | público |
| POST | `/v1/sync/compra` | `X-Cron-Secret` |
| POST | `/v1/sync/venda` | `X-Cron-Secret` |
| POST | `/v1/sync/all` | `X-Cron-Secret` |
| GET | `/v1/sync/coverage` | `X-Cron-Secret` |

## Setup

```bash
cp .env.example .env   # preencher credenciais por canal seguro
npm install
npm run typecheck
npm test
npm run build
npm run pm2:start
```

## Cron (America/Sao_Paulo ≈ 06:00)

```cron
0 6 * * * curl -fsS -X POST -H "X-Cron-Secret: $CRON_SECRET" http://127.0.0.1:3021/v1/sync/all >> /var/log/wise-sync.log 2>&1
```

## Seed aliases (cobertura)

```bash
npm run seed:aliases
```

Lê `PRODUTO`/`ENTIDADE` no CMP218 (NOLOCK) e faz upsert em `aliases` cruzando com cadastro local.
