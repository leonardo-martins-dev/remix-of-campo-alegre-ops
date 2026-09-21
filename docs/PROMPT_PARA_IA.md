# Prompt — Integração Wisecloud (enviar junto com a documentação)

> Cole este prompt e anexe: `docs/PLANO_INTEGRACAO_WISECLOUD.md`, a pasta `company-standards/` inteira, e o `mapa_banco_atualizado.json` do handoff. Trabalhe **dentro do repo `remix-of-campo-alegre-ops`**.

---

## Papel e objetivo

Você é um engenheiro sênior no ecossistema **NoPonto**. Vai implementar, no repositório **`remix-of-campo-alegre-ops`** (Campo Alegre — módulo packing house), a integração que puxa dados do ERP **Wisecloud (SQL Server `CMP218`, somente leitura)** para dois fluxos:

- **Pedido de compra + itens** (`PEDFORN` / `PEDFORN_ITEM`) → alimenta a **Conferência de Recebimento**.
- **Pedido de venda por loja** (`VENDA` / `VENDA_ITEM`) → alimenta a **Expedição**.

A especificação completa está em **`docs/PLANO_INTEGRACAO_WISECLOUD.md`**. Leia-a inteira antes de escrever qualquer linha.

## Antes de codar (obrigatório)

1. Leia, nesta ordem: `company-standards/architecture.md`, `company-standards/naming-conventions.md`, `company-standards/project-structure.md`, `company-standards/backend.md`, `company-standards/dependencies.md`, `company-standards/supabase.md`.
2. Leia `docs/PLANO_INTEGRACAO_WISECLOUD.md` e as migrations `00016_rodada2_packing_house.sql`, `00020_rodada6_importacao.sql`, `00012_expedicao_bridge.sql`.
3. Inspecione as edge functions existentes `supabase/functions/sync-wise-pedidos` e `sync-wise-cargas`.
4. **Devolva primeiro um plano de execução curto** (arquivos que vai criar/alterar, ordem, migrations). **Não gere código ainda** — espere meu OK.

## Restrições inegociáveis

**A. Padrões da casa (`company-standards`):**
- Backend = **serviço Hono** no molde `<projeto>-service` (referência: `noponto-nfe-service`), **não** worker solto nem Express. Estrutura: `src/index.ts`, `src/env.ts` (zod valida env no boot), `src/lib/{supabase,logger}.ts`, `src/middlewares`, `src/services/wise/`, `src/routes/`.
- **TypeScript estrito.** `pino` para log (sem `console.log`). `zod` em toda borda. `/health`. Build `tsup`, dev `tsx`. Processo por **PM2**.
- Rota de sincronização protegida por header **`X-Cron-Secret`** (nunca porta pública, nunca service-role vindo do browser).
- **Escrita exclusivamente no Postgres do Supabase via service-role** (chamando as RPCs). Nada de `pg`/Prisma/SQLite paralelo.
- `mssql` é dependência nova (fora do `dependencies.md`): use-a **só** como cliente de integração externa read-only e **justifique no PR**. Todo retorno do SQL Server passa por um parser **zod** antes de virar domínio.
- Migrations versionadas seguindo a numeração do repo (`00041_...`). Banco nunca alterado à mão.

**B. Regra do banco de produção (handoff Wisetec):**
- O `CMP218` é produção **compartilhada**. A extração roda **1×/dia**, agendada (~06:00), **nunca** por request e **nunca** de dentro de uma Edge Function.
- `WITH (NOLOCK)` em toda leitura. Janela de **48h**. Timezone `America/Sao_Paulo`. Retry só em erro de lock.

**C. Contrato do packing house (não quebrar):**
- De-para via tabela **`aliases`** (`tipo` produto/fornecedor/destinatario, `nome_externo`+`codigo_externo` → `entidade_id`, `origem='wise'`). **Não crie coluna `codigo_wise`.** Loja/cliente resolve por `clientes.codigo`.
- O **conector resolve os aliases ANTES** de chamar a RPC. Sem match: manda o UUID `null`, guarda `produto_nome`/`codigo_produto`, e adiciona ao array `pendencias`.
- Fluxo de compra usa a RPC **existente** `importar_pedidos_wise(p_arquivo, p_formato, p_hash, p_pedidos jsonb, p_ignoradas)`. Respeite o JSON exato do §6 do plano. A RPC **preserva item já conferido** — a idempotência depende disso; não a contorne.
- Casar `ENTIDADE` sempre por `ID` **+ `EMPRESA`** (são 2 empresas). Filtrar venda cancelada (`ISNULL(VENDA.CANCELADO,'N')<>'S'`).

## O que entregar (em fases, uma PR por fase)

1. **Serviço `wise-sync-service`** (Hono): `env.ts`, `/health`, `X-Cron-Secret`, `pino`, cliente `mssql` read-only, `.env.example`, `ecosystem.config` PM2. Sem lógica de negócio ainda.
2. **Seed de `aliases`** (produtos/fornecedores a partir de `PRODUTO`/`ENTIDADE`) como migration + script idempotente. Relatório de cobertura (quantos casaram / pendências).
3. **Fluxo A — compra:** query `PEDFORN`/`PEDFORN_ITEM` (§10 do plano) → normalização zod → resolução de aliases → chamada `importar_pedidos_wise`. Testes de idempotência e de pendência.
4. **RPC `importar_cargas_wise`** (migration nova, espelhando `importar_pedidos_wise`: idempotente por `wise_carregamento_id`, aliases + `clientes.codigo`, `pendencias_vinculo`, **preserva carga iniciada**, `caixas` JSONB derivado) + **Fluxo B — venda** (`VENDA`/`VENDA_ITEM`).
5. **Observabilidade:** log início/fim/contagem, cartão "atualizado em" (MIN das sync), tela/consulta de pendências, alerta de falha ou janela vazia.
6. **Aposentar/reduzir** as edge functions `sync-wise-*` (hoje apontam para uma API REST Wise inexistente) a um trigger fino que chama o serviço, ou removê-las.

## Pare e pergunte — NÃO adivinhe

Estes pontos não estão decididos. Se precisar deles, **pare e pergunte**; não invente valor plausível (o handoff mostra que chute aqui vira relatório errado que não estoura):

1. **`PEDFORN.STATUS`** — quais valores contam como pedido aberto vs. baixado/cancelado no filtro.
2. **Data da expedição** — usar `VENDA.DATA_EMBARQUE`, `DATA_ENTREGA` ou `DATA_EMISSAO`.
3. **Rateio de compra por loja** — vem do Wise (`itens_pedido_rateio`) ou é feito no packing house.
4. **Segredos** (creds `CMP218`, `SUPABASE_SERVICE_ROLE_KEY`, `X-Cron-Secret`) — virão por canal seguro; deixe em `.env.example`, nunca hardcode.

## Definição de pronto

- [ ] Plano de execução aprovado antes do código.
- [ ] `env.ts` valida tudo no boot; `/health` responde 200; sem secret no código nem no log.
- [ ] Toda leitura do CMP218 com `NOLOCK`, janela 48h, e validada por zod.
- [ ] Escrita só via RPC (service-role); de-para por `aliases`; pendências geradas corretamente.
- [ ] Re-rodar a sync duas vezes não duplica dado nem sobrescreve item conferido / carga iniciada.
- [ ] `pm2:*` scripts, `.env.example` completo, migration numerada, PR com justificativa do `mssql`.
- [ ] Nenhuma Edge Function consultando o CMP218.
