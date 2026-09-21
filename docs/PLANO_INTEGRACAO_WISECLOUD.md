# Plano de Integração Wisecloud → Campo Alegre Ops

**Objetivo:** puxar do ERP Wisecloud (SQL Server `CMP218`) dois fluxos:
- **Pedido de compra + itens** → alimenta a **Conferência de Recebimento**
- **Pedido de venda (por loja)** → alimenta a **Expedição**

Data: 21/09/2026 · Base: `remix-of-campo-alegre-ops` (TanStack Start + Supabase + Cloudflare)

---

## 1. Situação atual (o que já existe no repo)

A integração **já foi esqueletada** — só que contra uma API que não existe.

- Enum `origem_pedido` já tem o valor **`wisetec`**.
- `pedidos_recebimento.wise_pedido_id` e `cargas.wise_carregamento_id` já existem.
- `clientes.codigo` = código Wise da loja (migration 00038, seed em `scripts/seed-lojas-wise.mjs`).
- RPC **`importar_pedidos_wise(p_arquivo, p_formato, p_hash, p_pedidos jsonb, p_ignoradas)`** — importação atômica, idempotente por `wise_pedido_id`, com camada de pendências (`pendencias_vinculo`) e preservação de entregas já conferidas.
- Edge functions **`sync-wise-pedidos`** e **`sync-wise-cargas`**.

**O gap:** as duas edge functions chamam `WISE_API_URL`/`WISE_API_KEY` e fazem *probe* em `/pedidos-compra`, `/carregamentos` etc. **O Wisecloud não tem API REST.** Só existe o **SQL Server `CMP218` (somente leitura)**. Hoje elas caem no fallback manual (`body.rows` colado pelo usuário).

> **A tarefa real: trocar a "API Wise imaginária" por um pull diário direto do CMP218, entregando no mesmo contrato que já existe.**

---

## 2. A regra que não se quebra (do handoff da Campo Alegre)

`20.206.161.176` é o banco de **produção** da Wisetec, acesso **compartilhado**. Uso abusivo derruba o acesso dos dois lados.

- ❌ **Nunca** Edge Function consultando o CMP218 por request (isso é DirectQuery disfarçado).
- ✅ **1× por dia**, em horário combinado (a carga deles roda 08:45–18:37 → agendar **~06:00**).
- ✅ `WITH (NOLOCK)` em toda leitura; janela de **48h** (não 24h) para pegar pedido que entrou após a virada.
- ✅ Filtrar cancelados; casar `ENTIDADE` sempre por **`ID` + `EMPRESA`** (são 2 empresas/CNPJs).

---

## 3. Arquitetura alvo

```
CMP218 (SQL Server, prod Wisetec)          Supabase (Campo Alegre Ops)
        │  1×/dia, NOLOCK, 48h                        ▲
        ▼                                             │ RPC (service-role)
  ┌──────────────────────────┐  linhas (zod)     ┌──┴───────────────────┐
  │  wise-sync-service (Hono) │ ─────────────────▶ │ importar_pedidos_wise│ → recebimento
  │  cliente mssql (só fonte) │                    │ importar_cargas_wise │ → expedição
  │  PM2 na VPS · cron 06:00  │                    └──────────────────────┘
  └──────────────────────────┘
```

**É um serviço Hono, não um worker solto** — molde `<projeto>-service` do `company-standards/backend.md`, igual ao `noponto-nfe-service` (referência) e ao `espiao-sync-nfe` já presente neste repo:

- `src/env.ts` valida env com **zod** no boot (falha cedo); `pino` para log; `/health`.
- Rota de cron protegida por **`X-Cron-Secret`** (§4 auth de serviço); nunca expõe porta pública.
- Build `tsup` + dev `tsx`; roda por **PM2** na VPS (`/srv/apps`, `ecosystem.config.cjs`).
- **CMP218 entra como integração externa** (§7): cliente tipado em `src/services/wise/`, e **todo retorno do SQL Server é validado com zod** antes de virar domínio. Não é "banco paralelo" — o dado do app continua 100% no Supabase; o CMP218 é só leitura de origem.
- Escrita **exclusivamente no Postgres do Supabase via service-role** (as RPCs), nunca um segundo modelo de dados.

**Por que serviço na VPS e não Edge:** o driver `mssql` (TDS) precisa de TCP direto ao 1433 e o job tem estado/janela — `backend.md` §1 manda serviço Hono nesse caso, não Edge Function. Um serviço único agendado respeita o "1×/dia" por construção.

> ⚠️ **`mssql` não está no `dependencies.md`** → abrir com justificativa no PR (integração externa read-only, mesma categoria de NFe/SEFAZ). Não usar `pg`/Prisma/SQLite paralelo.

> ⚠️ As edge functions atuais `sync-wise-pedidos`/`sync-wise-cargas` apontam para uma API REST Wise inexistente. Aposentar ou reduzir a trigger fino que chama o serviço; a lógica de pull vai para o serviço Hono.

---

## 4. Fluxo A — Pedido de compra → Conferência de Recebimento

**Origem:** `PEDFORN` (cabeçalho) + `PEDFORN_ITEM` (itens) · **Destino:** `pedidos_recebimento` + `itens_pedido` via `importar_pedidos_wise`.

### Mapa de campos

| Destino (Supabase)            | Origem (CMP218)                    | Obs |
|---|---|---|
| `wise_pedido_id` / `codigo`   | `PEDFORN.ID`                       | chave idempotente |
| `fornecedor_id`               | `PEDFORN.ENTIDADE` → de-para        | ⚠️ resolver via mapa (ver §6) |
| `data_prevista`               | `PEDFORN.DATA_PREV_ENTREGA`         | |
| `data_pedido`                 | `PEDFORN.DATA_EMISSAO`              | |
| `origem`                      | fixo `'wisetec'`                    | |
| **itens[].produto_id**        | `PEDFORN_ITEM.CODIGO` → `aliases`   | ⚠️ resolver via `aliases` (§6) |
| **itens[].quantidade**        | `PEDFORN_ITEM.QTDE`                 | |
| **itens[].preco_unitario**    | `PEDFORN_ITEM.TOTAL / QTDE`         | coluna nova do 00016 |
| **itens[].unidade**           | unidade do `PRODUTO`                | coluna nova do 00016 |
| **itens[].produto_nome / codigo_produto** | `PRODUTO.DESCRICAO` / `PRODUTO.ID` | identidade Wise, guardada mesmo sem match |

**Join:** `PEDFORN_ITEM.ID_PEDFORN = PEDFORN.ID`; fornecedor `ENTIDADE e ON e.ID = PEDFORN.ENTIDADE AND e.EMPRESA = PEDFORN.EMPRESA`; produto `PEDFORN_ITEM.CODIGO → PRODUTO.ID`.

**Filtro:** `PEDFORN.DATA_EMISSAO >= hoje-2d` · `STATUS` não cancelado/baixado (validar valores reais de `STATUS`) · `EMPRESA IN (1,2)`.

**Rateio por loja:** se um pedido de compra já vem repartido por destinatário no Wise, mapear para `itens_pedido_rateio` (destinatario_id). Confirmar se o Wise traz isso ou se o rateio é feito no packing house.

---

## 5. Fluxo B — Pedido de venda → Expedição

**Origem:** `VENDA` (cabeçalho) + `VENDA_ITEM` (itens) · **Destino:** `cargas` + `romaneio_itens`.

### Mapa de campos

| Destino (Supabase)              | Origem (CMP218)                  | Obs |
|---|---|---|
| `cargas.wise_carregamento_id`   | `VENDA.ID`                       | chave idempotente |
| `cargas.codigo`                 | `VENDA.ID` (ou `NR_PED_ENT`)     | |
| `cargas.cliente_id`             | `VENDA.ENTIDADE` → `clientes.codigo` | ⚠️ loja, via de-para |
| `cargas.data_carga`             | `VENDA.DATA_EMBARQUE`/`DATA_ENTREGA`/`DATA_EMISSAO` | escolher a coluna certa |
| **romaneio_itens.produto_id**   | `VENDA_ITEM.CODIGO` → `aliases`  | ⚠️ resolver via `aliases` (§6) |
| **romaneio_itens.quantidade_romaneio** | `VENDA_ITEM.QTDE`         | qtde crua; a conversão faz as caixas |
| `romaneio_itens.caixas` (JSONB) | **não enviar** — derivado         | fator de conversão (00024/00035) calcula |

**Join:** `VENDA_ITEM.ID_VENDA = VENDA.ID`; cliente `ENTIDADE e ON e.ID = VENDA.ENTIDADE AND e.EMPRESA = VENDA.EMPRESA` → `e.CODIGO` casa com `clientes.codigo`; produto `VENDA_ITEM.CODIGO → PRODUTO.ID`.

**Filtro (armadilhas do handoff):**
- `ISNULL(VENDA.CANCELADO,'N') <> 'S'` (venda cancelada continua na tabela)
- só lojas ativas (`clientes.ativo = true`)
- `DATA_* >= hoje-2d` · `EMPRESA IN (1,2)`

**Falta uma RPC de destino:** existe `importar_pedidos_wise` (recebimento) mas **não** há equivalente para cargas. Criar `importar_cargas_wise(p_cargas jsonb)` **espelhando o padrão do packing house**:
- idempotente por `wise_carregamento_id`; produto resolvido via `aliases`, loja via `clientes.codigo`, com `pendencias_vinculo` para o que não casar;
- **preserva carga já iniciada** (não sobrescreve o que a expedição já mexeu — mesmo princípio do item conferido no recebimento);
- grava `quantidade_romaneio` cru; `caixas` (JSONB) fica para a conversão por fator.

A ponte `00012_expedicao_bridge.sql` é o ponto de partida.

---

## 6. Camada de-para — usar o mecanismo do packing house (`aliases`)

⚠️ **Não criar `codigo_wise` novo.** O packing house (00016) já tem o de-para oficial: a tabela **`aliases`**.

```
aliases (tipo, nome_externo, codigo_externo, entidade_id, origem='wise')
   tipo ∈ ('fornecedor','produto','destinatario')   UNIQUE (tipo, origem, nome_externo)
```

- **Produtos/fornecedores/destinatários** → resolvidos via `aliases` (nome/código Wise → `entidade_id` UUID).
- **Lojas/clientes (expedição)** → via `clientes.codigo` (Wise), já seedado (00038 / seed-lojas-wise.mjs).

**O conector resolve ANTES de chamar a RPC** (a RPC não consulta `aliases`):
1. Para cada produto/fornecedor Wise, buscar em `aliases`. Achou → manda `produto_id`/`fornecedor_id` (UUID).
2. Não achou → manda o UUID como `null`, mantém `produto_nome`/`codigo_produto` no item, e adiciona `{tipo, nome, codigo}` ao array **`pendencias`** do pedido.
3. A RPC grava o item com `nome_externo`/`codigo_externo` e abre `pendencias_vinculo` (status `aberta`). Pedido nasce `aguardando_vinculo` — **sem quebrar a carga**.

**Formato exato que a RPC `importar_pedidos_wise` consome** (contrato do packing house):

```jsonc
{ "wise_pedido_id": "PEDFORN.ID", "fornecedor_id": "uuid|null",
  "data_prevista": "YYYY-MM-DD",
  "itens": [ { "produto_id":"uuid|null", "quantidade":0, "preco_unitario":0,
               "unidade":"cx", "produto_nome":"...", "codigo_produto":"..." } ],
  "pendencias": [ { "tipo":"produto|fornecedor", "nome":"...", "codigo":"..." } ] }
```

**Seed inicial (Fase 0):** popular `aliases` a partir de `PRODUTO` (363, catálogo 00021) e dos fornecedores de `ENTIDADE`. Tela de resolução de pendências: confirmar se já existe no front; senão entra no escopo.

> ⚠️ Armadilha 3.1 do handoff: casar `ENTIDADE` sem `EMPRESA` gera resultado plausível e errado. A geração dos aliases precisa considerar `EMPRESA`.

---

## 7. Fases de entrega

| Fase | Entrega | Estimativa |
|---|---|---|
| **0. De-para** | seed da tabela `aliases` (produtos/fornecedores a partir de `PRODUTO`/`ENTIDADE`); validar cobertura de lojas em `clientes.codigo` | 1–2 dias |
| **1. Serviço base** | `wise-sync-service` (Hono, molde nfe-service): `env.ts` zod, `pino`, `/health`, `X-Cron-Secret`, cliente `mssql` read-only NOLOCK, PM2 06:00 | 1–2 dias |
| **2. Fluxo A (compra)** | Query PEDFORN→normalização→`importar_pedidos_wise`; testar idempotência e pendências | 2 dias |
| **3. RPC + Fluxo B (venda)** | `importar_cargas_wise` + query VENDA→cargas/romaneio | 2–3 dias |
| **4. Observabilidade** | Cartão "atualizado em" (MIN), tela de pendências, alerta de falha/janela vazia | 1–2 dias |
| **5. Cancelamentos** | Refletir pedido/venda cancelado após import (melhoria sobre o manual atual) | 1 dia |

**Total: ~8–11 dias úteis** (com de-para limpo; +tempo se os cadastros estiverem sujos).

---

## 8. Riscos e perguntas em aberto

- **`NR_NOTA`/`ID` únicos por EMPRESA**, não global — sempre carregar `EMPRESA` junto da chave.
- **Cadastros desalinhados** (produto/fornecedor sem código) → volume de pendências no dia 1. Mitigar na Fase 0.
- **`STATUS` do PEDFORN**: preciso confirmar os valores reais (quais = pedido aberto vs. baixado/cancelado) — 1 query.
- **Qual data usar na expedição** (`DATA_EMBARQUE` × `DATA_ENTREGA` × `DATA_EMISSAO`)? Definir com a operação.
- **Rateio de compra por loja**: vem do Wise ou é feito no packing house?
- **Reprocesso M-1**: nos primeiros dias do mês, dado atrasado precisa de re-pull (o incremental não re-lê linha antiga).
- **Manter o upload manual** como contingência (já existe) enquanto o conector estabiliza.

---

## 9. Conformidade com `company-standards`

| Regra do padrão | Como o plano cumpre |
|---|---|
| Backend = **Hono** (não Express/worker solto) | `wise-sync-service` no molde `<projeto>-service` |
| **service-role** contra o Postgres do Supabase; sem banco paralelo | escrita só via RPC; CMP218 é integração externa read-only |
| Integração externa validada com **zod** (§7) | parser zod entre o SQL Server e o domínio |
| Auth de cron por **`X-Cron-Secret`** (§4) | rota de sync protegida; sem porta pública |
| Log **pino**, `/health`, `env.ts` no boot | itens da Fase 1 |
| **Idempotência** nos jobs (§5) | upsert por `wise_pedido_id` / `wise_carregamento_id` |
| Janela e limites (§5) | 48h, `America/Sao_Paulo`, 1×/dia |
| Migrations versionadas | seguir a numeração do repo (`00041_...`) |
| **Lib nova exige justificativa no PR** | `mssql` — justificar como integração externa |
| **Compatível com o packing house (00016)** | usa `aliases`/`pendencias_vinculo`, contrato exato da `importar_pedidos_wise`, preserva item conferido; expedição espelha o padrão |

**Desvios registrados (não resolvidos por este plano):**
- Edge functions `sync-wise-*` atuais estão fora do padrão (probe de API inexistente) → aposentar.
- Repo Campo Alegre é single-tenant; o padrão pede multi-tenant por `company_id` — dívida técnica pré-existente, fora do escopo desta integração.

---

## 10. Query-fonte (rascunho, Fluxo A — compra)

```sql
SELECT p.ID AS wise_pedido_id, p.DATA_EMISSAO, p.DATA_PREV_ENTREGA, p.EMPRESA,
       p.ENTIDADE AS fornecedor_wise, e.RAZAO AS fornecedor_nome, e.CODIGO AS fornecedor_codigo,
       i.ID AS item_id, i.CODIGO AS produto_wise, pr.DESCRICAO AS produto_nome,
       i.QTDE, i.TOTAL
FROM PEDFORN p WITH (NOLOCK)
JOIN PEDFORN_ITEM i WITH (NOLOCK) ON i.ID_PEDFORN = p.ID
LEFT JOIN ENTIDADE e WITH (NOLOCK) ON e.ID = p.ENTIDADE AND e.EMPRESA = p.EMPRESA
LEFT JOIN PRODUTO pr WITH (NOLOCK) ON pr.ID = i.CODIGO
WHERE p.DATA_EMISSAO >= DATEADD(day,-2,CAST(GETDATE() AS date))
  AND p.EMPRESA IN (1,2);
```

*(Fluxo B análogo em VENDA/VENDA_ITEM, com o filtro de cancelamento.)*
