# NOP-325 — Relatório de conciliação (caixas / capital na rua)

**Para:** Ygor Soares  
**De:** Leonardo Martins (fila Packing House)  
**Issue:** [NOP-325](https://linear.app/noponto/issue/NOP-325)  
**Data de corte:** 2026-09-28 (America/Sao_Paulo)  
**HEAD base (pré-entrega):** `0930f76`  
**Escopo respeitado:** sem mudança de fórmula; sem mass-delete; só flag `is_teste` + docs + este relatório.

---

## 1. Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| Os indicadores da revisão 22/09 estavam “errados” por fórmula? | **Não.** Capital na rua e inventário usam definições diferentes (positivos vs signed). |
| Há contaminação de QA nos saldos atuais? | Seeds QA (`BOB*`, `TESTE QA 1`, `FORN *TEST*`, `Aguardando vínculo`) existem, mas com **saldo 0 e 0 movimentos**. Não explicam a diferença de R$/qtd. |
| Abrir bug de cálculo da fórmula capital/inventário? | **Não.** Diferença 8.691 − 8.676 = 15 totalmente explicada pelo negativo ignorado. |
| Abrir outro bug? | **Sim, recomendado:** postagem de envio da carga `150986` numa posição `cliente` com `ref_id` NULL (60 caixas “em clientes” órfãs). Ver §5. |

---

## 2. Totais na mesma data de corte

Custos: **V** R$ 55,00 · **A** R$ 22,00.

### 2.1 Capital na rua (só saldos &gt; 0; cliente + fornecedor + galpão)

| Posição | V | A | Qty | Valor (R$) |
|---------|---|---|-----|------------|
| Galpão | 7.713 | 906 | 8.619 | 444.147,00 |
| Cliente | 54 | 6 | 60 | 3.102,00 |
| Fornecedor (só &gt;0) | 6 | 6 | 12 | 462,00 |
| **Total capital na rua** | | | **8.691** | **447.711,00** |

Confere com o card: capital R$ 447.711 × galpão R$ 444.147 (7.713 V + 906 A).

**Valor fora do galpão** = 447.711 − 444.147 = **R$ 3.564,00** (= 60×custo clientes + 12×custo forn positivos).

### 2.2 Inventário (signed)

| Posição | Qty signed | Notas |
|---------|------------|-------|
| Galpão | 8.619 | |
| Cliente | 60 | ver órfão §5 |
| Fornecedor | −3 | 12 positivos + (−15) CAL |
| **Total físico signed** | **8.676** | bate o card |

### 2.3 Ajustes de teste

| Item | Qty no saldo | Ação NOP-325 |
|------|--------------|--------------|
| Fornecedores BOB 1–4, TESTE QA 1, FORN REGRESS/V4 TEST, Aguardando vínculo | 0 | Flag `is_teste` + backup JSON |
| Movimentos `__demo__` | 0 na base atual | Flag se reaparecerem |
| Posição cliente `ref_id` NULL | 60 | **Não** flagada como teste (estoque operacional mal postado) |

Backup: `scripts/nop325_backup_qa_flagged.json`.

---

## 3. Explicação dos saldos negativos (antes de qualquer fórmula)

Único negativo material na data de corte:

| Parceiro | Tipo | Saldo | Origem no ledger |
|----------|------|-------|------------------|
| **CAMPO ALEGRE LAVOURA** | V | **−15** | `transferencia` “Saída na roça”: 11 (2026-09-20) + 4 (2026-09-22) saindo da posição fornecedor → motorista |

Não há `entrega_vazias` prévia nesse fornecedor/tipo. A RPC `confirmar_saida_roca` debita o fornecedor ao confirmar a saída (NOP-129). O saldo negativo significa: saíram vazias/cheias na roça **sem estoque de vazias lançado antes** — comportamento de processo/ledger, não inversão de KPI.

`capitalNaRua` **ignora** esse −15 (comentário no código: “não inverte o KPI”).  
Inventário **inclui** o −15. Daí 8.691 vs 8.676.

Fornecedor signed −3 = (HIDROPONIA 4+4 + APARECIDO 2+2) + (−15) = 12 − 15.

---

## 4. Soma por tipo/posição × livro de movimentos

A view `v_saldos_caixa` **é** o livro agregado (destino − origem). Amostragem na data de corte:

- Galpão V/A: bate o inventário físico reportado na revisão.
- CAL V −15: bate a soma das transferências de saída na roça (§3).
- Fornecedores com entrega_vazias (HIDROPONIA, APARECIDO): saldos = envios de vazias sem retorno ainda.
- Cliente 54 V + 6 A: **não** estão na posição correta do cliente da carga (ver §5); o ledger da posição órfã fecha com os 2 envios.

Script reproduzível: `scripts/nop325_reconciliacao.mjs` (lê Supabase via env).

---

## 5. Anomalia operacional (recomendar bug separado — não é fórmula capital/inventário)

| Campo | Valor |
|-------|--------|
| Posição | `3afbbdb4-82e3-4a21-a860-b39d928952df` · tipo `cliente` · **`ref_id` NULL** |
| Movimentos | 2× `envio` em 2026-09-21 (criados 2026-09-22 02:12 UTC) |
| Documento | carga `150986` (`2ef5ac26-…`) · cliente real **SÃO VICENTE LOJA 20** |
| Posição correta existente | `9d65fd25-…` (cliente SV Loja 20) |
| Efeito nos KPIs | 60 caixas aparecem como “em clientes” sem nome de parceiro |

**Não** marcado `is_teste`: esconderia estoque real.  
**Recomendação:** abrir issue de correção de postagem/reconciliação da carga 150986 (apontar envios para a posição do cliente ou estornar + relançar). Só depois disso o “60 em clientes” some de forma limpa.

---

## 6. O que foi entregue em código

1. Migration `00065_nop325_qa_is_teste.sql` — colunas `is_teste`/`teste_motivo`; seed flags; `v_saldos_caixa` expõe `is_teste`; view `v_saldos_caixa_operacao`; views cliente/fornecedor excluem masters teste.
2. Docs de fórmulas: `docs/NOP-325_FORMULAS_INDICADORES_CAIXAS.md`.
3. Este relatório + backup JSON + script de reconciliação.
4. Helper TS `excludeTesteSaldos` e hooks preferindo operação limpa (com fallback se a migration ainda não estiver aplicada).

**Aplicar a migration no Supabase** para materializar as flags na base. Até lá o backup JSON já documenta quem será marcado.

---

## 7. Aceite vs status

| Critério | Status |
|----------|--------|
| Base operação sem registros de teste (+ backup) | Flag + backup prontos; aplicar `00065` no banco |
| Fórmulas documentadas | Sim |
| Totais batem ou diferença explicada | Sim — explicada (§2–§3); sem bug de fórmula |
| Relatório ao Ygor | Este arquivo (anexar/comentar em NOP-325) |
