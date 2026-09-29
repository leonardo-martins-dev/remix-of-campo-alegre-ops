# NOP-325 — Fórmulas dos indicadores de caixas

Data de corte da conciliação de referência: **2026-09-28** (BRT).  
Código-fonte da função compartilhada: `src/lib/caixas-map.ts` → `capitalNaRua`.  
Ledger SQL: view `public.v_saldos_caixa` (migration `00019` / reexposta em `00065`).

> **Fora de escopo desta issue:** mudar fórmulas. Este documento descreve o que o sistema **já faz**.

---

## 1. Saldo por posição (`v_saldos_caixa`)

Para cada `(posicao_id, tipo_caixa)`:

```
saldo = Σ quantidade com destino = posição
      − Σ quantidade com origem  = posição
```

Só entram movimentos com `origem_posicao_id` ou `destino_posicao_id` preenchidos.

Colunas auxiliares (não alteram `saldo`):

| Coluna | Regra |
|--------|--------|
| `enviadas` | destino = posição e natureza ∈ {`envio`, `entrega_vazias`} |
| `retornadas` | origem = posição e natureza ∈ {`retorno`, `recebimento_cheias`} |
| `perdidas` | origem = posição e natureza = `perda` |
| `ajustes` | natureza ∈ {`ajuste`, `abertura`} (+destino / −origem) |

`transferencia` (ex.: saída na roça) **entra no saldo** (origem/−, destino/+) e **não** entra em enviadas/retornadas/ajustes.

Tipos de posição: `galpao`, `cliente`, `fornecedor`, `motorista`.

---

## 2. Capital na rua

Função TS `capitalNaRua(saldos, custos)` — usada no **Dashboard** e em **Saldo por parceiro**.

```
Entrada: linhas de v_saldos_caixa (ou equivalente)
Filtra:  posicao_tipo ∈ { cliente, fornecedor, galpao }
Ignora:  saldo ≤ 0   ← negativos NÃO entram e NÃO “invertem” o KPI
qty   = Σ saldo (só positivos)
valor = Σ saldo × custo_unitario[tipo_caixa]
```

Portanto:

- **Inclui galpão** (estoque físico no packing com valor).
- **Valor fora** = capital na rua − valor só do galpão  
  (equivale a clientes + fornecedores com saldo &gt; 0).
- **Valor no galpão** = mesma função restrita a `posicao_tipo = galpao` (ou soma manual dos saldos positivos do galpão × custo).

Custos de referência na base (tipos ativos): Vermelha `V` R$ 55,00 · Amarela `A` R$ 22,00.

---

## 3. Inventário de caixas (tela)

Soma **com sinal** (positivos e negativos) por `posicao_tipo` ∈ {`galpao`, `fornecedor`, `cliente`} a partir de `v_saldos_caixa`:

```
total_fisico_signed = Σ saldo(galpao) + Σ saldo(fornecedor) + Σ saldo(cliente)
```

Motorista fica de fora do quadro resumo da tela (aparece só se houver posição).

---

## 4. Saldo por parceiro (totais da página)

- Aba cliente: pivô de `v_saldo_caixas_cliente` (clientes ativos).
- KPI “Capital na rua” / total de caixas: **mesma** `capitalNaRua` sobre **todos** os saldos do ledger (não só a aba).
- Por isso o total “em aberto” da página alinha com o capital na rua do dashboard, não com o total signed do inventário.

---

## 5. Separação QA (NOP-325)

| Artefato | Papel |
|----------|--------|
| `is_teste` / `teste_motivo` em `fornecedores`, `clientes`, `posicoes_caixa`, `movimentacoes_caixa` | Flag soft; **sem delete** |
| `v_saldos_caixa` | Ledger completo + coluna `is_teste` da posição |
| `v_saldos_caixa_operacao` | Mesma fórmula, `WHERE NOT is_teste` |
| Backup | `scripts/nop325_backup_qa_flagged.json` |

Critérios conservadores de flag (só seeds óbvios): `BOB N`, `TESTE QA*`, `FORN *TEST*`, `Aguardando vínculo`.

---

## 6. Por que capital ≠ inventário (sem bug de fórmula)

Na data de corte:

| Indicador | Qtd | Observação |
|-----------|-----|------------|
| Capital na rua (positivos) | 8.691 | ignora −15 |
| Inventário signed | 8.676 | inclui −15 |
| Diferença | 15 | = \|saldo negativo CAMPO ALEGRE LAVOURA V\| |

Isso é diferença de **definição** (positivo-only vs signed), não de ledger.
