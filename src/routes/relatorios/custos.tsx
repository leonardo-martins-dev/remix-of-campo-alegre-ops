import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DollarSign, Package, AlertTriangle, Scale, ClipboardList, FileSpreadsheet, TrendingDown, Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TableWrapper } from "@/components/table-wrapper";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { exportToExcel } from "@/lib/excel";
import { formatBRL } from "@/lib/format";
import { useFornecedores, useClientes } from "@/hooks/use-cadastros";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import {
  useCustoPerdaCaixas,
  useCustoPerdaRota,
  useCustoRecebimento,
  useCustoQuebra,
  useFatorRealDesvio,
  useContagemPendente,
  useRankingFornecedor,
  useRankingCliente,
  useRotas,
  useMotoristas,
  type CustoFilters,
} from "@/hooks/use-custos-operacionais";

export const Route = createFileRoute("/relatorios/custos")({
  component: Page,
  head: () => ({ meta: [{ title: "Custos operacionais · Campo Alegre" }] }),
});

function Page() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const [fornecedorId, setFornecedorId] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [rotaId, setRotaId] = useState<string | null>(null);
  const [motoristaId, setMotoristaId] = useState<string | null>(null);
  const [tipoCaixa, setTipoCaixa] = useState<string | null>(null);

  const filters: CustoFilters = {
    period,
    fornecedorId,
    clienteId,
    rotaId,
    motoristaId,
    tipoCaixa,
  };

  const { data: fornecedores = [] } = useFornecedores();
  const { data: clientes = [] } = useClientes();
  const { data: rotas = [] } = useRotas();
  const { data: motoristas = [] } = useMotoristas();
  const { data: tiposCaixa = [] } = useTiposCaixa();

  const { data: perdaCaixas = [], isLoading: loadingPerda } = useCustoPerdaCaixas(filters);
  const { data: perdaRota = [] } = useCustoPerdaRota(filters);
  const { data: recebimento = [], isLoading: loadingReceb } = useCustoRecebimento(filters);
  const { data: quebra = [], isLoading: loadingQuebra } = useCustoQuebra(filters);
  const { data: fatorReal = [] } = useFatorRealDesvio(filters);
  const { data: contagensPendentes = [] } = useContagemPendente(filters);
  const { data: rankingFornecedor = [] } = useRankingFornecedor(filters);
  const { data: rankingCliente = [] } = useRankingCliente(filters);

  const totais = useMemo(() => {
    const custoPerda = perdaCaixas.reduce((a, r) => a + Number(r.valor_perda ?? 0), 0);
    const caixasPerdidas = perdaCaixas.reduce((a, r) => a + Number(r.quantidade ?? 0), 0);

    const custoFalta = recebimento
      .filter((r) => r.divergencia === "falta")
      .reduce((a, r) => a + Number(r.valor_divergencia ?? 0), 0);
    const custoQualidade = recebimento
      .filter((r) => r.divergencia === "qualidade")
      .reduce((a, r) => a + Number(r.valor_divergencia ?? 0), 0);

    const custoQuebra = quebra.reduce((a, r) => a + Number(r.valor ?? 0), 0);
    const ocorrenciasQuebra = quebra.length;

    const contagensPend = contagensPendentes.length;
    const divergenciasAbertas = contagensPendentes.reduce((a, r) => a + Number(r.total_diferenca ?? 0), 0);

    const custoTotal = custoPerda + custoFalta + custoQualidade + custoQuebra;

    return {
      custoPerda,
      caixasPerdidas,
      custoFalta,
      custoQualidade,
      custoQuebra,
      ocorrenciasQuebra,
      contagensPend,
      divergenciasAbertas,
      custoTotal,
    };
  }, [perdaCaixas, recebimento, quebra, contagensPendentes]);

  const perdaPorPosicao = useMemo(() => {
    const map = new Map<string, { posicao: string; tipo: string; valor: number; quantidade: number }>();
    for (const r of perdaCaixas) {
      const key = r.posicao_nome ?? "Desconhecido";
      const cur = map.get(key) ?? { posicao: key, tipo: r.posicao_tipo ?? "", valor: 0, quantidade: 0 };
      cur.valor += Number(r.valor_perda ?? 0);
      cur.quantidade += Number(r.quantidade ?? 0);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.valor - a.valor);
  }, [perdaCaixas]);

  const perdaPorRotaMotorista = useMemo(() => {
    return perdaRota
      .filter((r) => r.valor_perda_total > 0)
      .sort((a, b) => Number(b.valor_perda_total) - Number(a.valor_perda_total))
      .slice(0, 10);
  }, [perdaRota]);

  const recebimentoPorFornecedor = useMemo(() => {
    const map = new Map<string, { fornecedor: string; faltas: number; qualidade: number; total: number }>();
    for (const r of recebimento) {
      const key = r.fornecedor_id ?? "";
      const cur = map.get(key) ?? { fornecedor: r.fornecedor_nome ?? "", faltas: 0, qualidade: 0, total: 0 };
      const val = Number(r.valor_divergencia ?? 0);
      if (r.divergencia === "falta") cur.faltas += val;
      else if (r.divergencia === "qualidade") cur.qualidade += val;
      cur.total += val;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [recebimento]);

  const quebraPorFornecedor = useMemo(() => {
    const map = new Map<string, { fornecedor: string; valor: number; ocorrencias: number }>();
    for (const r of quebra) {
      const key = r.fornecedor_id ?? "";
      const cur = map.get(key) ?? { fornecedor: r.fornecedor_nome ?? "", valor: 0, ocorrencias: 0 };
      cur.valor += Number(r.valor ?? 0);
      cur.ocorrencias += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.valor - a.valor).slice(0, 10);
  }, [quebra]);

  const fatorRealTop = useMemo(() => {
    return fatorReal
      .filter((r) => Math.abs(Number(r.desvio_pct ?? 0)) > 5)
      .slice(0, 10);
  }, [fatorReal]);

  const clearFilters = () => {
    setFornecedorId(null);
    setClienteId(null);
    setRotaId(null);
    setMotoristaId(null);
    setTipoCaixa(null);
  };

  const handleExport = () => {
    const data = [
      { bloco: "Resumo", metrica: "Custo total", valor: totais.custoTotal },
      { bloco: "Resumo", metrica: "Perda de caixas", valor: totais.custoPerda },
      { bloco: "Resumo", metrica: "Faltas recebimento", valor: totais.custoFalta },
      { bloco: "Resumo", metrica: "Qualidade recebimento", valor: totais.custoQualidade },
      { bloco: "Resumo", metrica: "Quebra/qualidade galpão", valor: totais.custoQuebra },
      ...perdaPorPosicao.map((r) => ({
        bloco: "Perda por posição",
        metrica: r.posicao,
        valor: r.valor,
        quantidade: r.quantidade,
      })),
      ...recebimentoPorFornecedor.map((r) => ({
        bloco: "Recebimento por fornecedor",
        metrica: r.fornecedor,
        valor: r.total,
        faltas: r.faltas,
        qualidade: r.qualidade,
      })),
      ...quebraPorFornecedor.map((r) => ({
        bloco: "Quebra por fornecedor",
        metrica: r.fornecedor,
        valor: r.valor,
        ocorrencias: r.ocorrencias,
      })),
      ...rankingFornecedor.slice(0, 20).map((r) => ({
        bloco: "Ranking fornecedor",
        metrica: r.fornecedor_nome,
        custo_perda: r.custo_perda,
        custo_recebimento: r.custo_recebimento,
        custo_quebra: r.custo_quebra,
        custo_total: r.custo_total,
      })),
      ...rankingCliente.slice(0, 20).map((r) => ({
        bloco: "Ranking supermercado",
        metrica: r.cliente_nome,
        custo_perda: r.custo_perda,
        divergencias_abertas: r.divergencias_abertas,
        custo_total: r.custo_total,
      })),
    ];
    exportToExcel(`custos-operacionais-${new Date().toISOString().slice(0, 10)}.xlsx`, "Custos", data);
  };

  const isLoading = loadingPerda || loadingReceb || loadingQuebra;

  return (
    <div>
      <PageHeader
        title="Custos operacionais"
        subtitle="Onde o custo acontece: caixas, recebimento, quebra e inventário"
        actions={
          <Button onClick={handleExport} disabled={isLoading} size="sm">
            <FileSpreadsheet size={14} className="mr-1" /> Exportar
          </Button>
        }
      />

      {/* Filtros */}
      <div className="card-base p-4 mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["today", "week", "month"] as const).map((p) => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
              {p === "today" ? "Hoje" : p === "week" ? "7 dias" : "30 dias"}
            </Button>
          ))}
        </div>
        <select
          className="h-8 rounded-md border px-2 text-sm"
          value={fornecedorId ?? ""}
          onChange={(e) => setFornecedorId(e.target.value || null)}
        >
          <option value="">Todos fornecedores</option>
          {fornecedores.map((f) => (
            <option key={f.id} value={f.id}>{f.nome}</option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border px-2 text-sm"
          value={clienteId ?? ""}
          onChange={(e) => setClienteId(e.target.value || null)}
        >
          <option value="">Todos supermercados</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border px-2 text-sm"
          value={rotaId ?? ""}
          onChange={(e) => setRotaId(e.target.value || null)}
        >
          <option value="">Todas rotas</option>
          {rotas.map((r) => (
            <option key={r.id} value={r.id}>{r.nome}</option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border px-2 text-sm"
          value={motoristaId ?? ""}
          onChange={(e) => setMotoristaId(e.target.value || null)}
        >
          <option value="">Todos motoristas</option>
          {motoristas.map((m) => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border px-2 text-sm"
          value={tipoCaixa ?? ""}
          onChange={(e) => setTipoCaixa(e.target.value || null)}
        >
          <option value="">Todos tipos caixa</option>
          {tiposCaixa.map((t) => (
            <option key={t.id} value={t.sigla}>{t.nome} ({t.sigla})</option>
          ))}
        </select>
        {(fornecedorId || clienteId || rotaId || motoristaId || tipoCaixa) && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>Limpar filtros</Button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Carregando custos...</p>
        </div>
      )}

      {!isLoading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <KpiCard label="Custo total" value={formatBRL(totais.custoTotal)} icon={DollarSign} positiveIsGood={false} />
            <KpiCard label="Perda de caixas" value={formatBRL(totais.custoPerda)} icon={Package} positiveIsGood={false} />
            <KpiCard label="Faltas + qualidade" value={formatBRL(totais.custoFalta + totais.custoQualidade)} icon={TrendingDown} positiveIsGood={false} />
            <KpiCard label="Quebra galpão" value={formatBRL(totais.custoQuebra)} icon={AlertTriangle} positiveIsGood={false} />
          </div>

          {/* Bloco 1: Perda de caixas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div className="card-base p-4">
              <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
                <Package size={16} /> Perda de caixas por posição
              </h3>
              {perdaPorPosicao.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma perda no período.</p>
              ) : (
                <TableWrapper stickyFirstColumn>
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase">
                      <tr>
                        <th className="text-left px-3 py-2 whitespace-nowrap">Posição</th>
                        <th className="text-right px-3 py-2 whitespace-nowrap">Caixas</th>
                        <th className="text-right px-3 py-2 whitespace-nowrap">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perdaPorPosicao.map((r) => (
                        <tr key={r.posicao} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">{r.posicao}</td>
                          <td className="px-3 py-2 text-right">{r.quantidade}</td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatBRL(r.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              )}
            </div>
            <div className="card-base p-4">
              <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
                <Package size={16} /> Perda por rota/motorista
              </h3>
              {perdaPorRotaMotorista.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados de perda por rota.</p>
              ) : (
                <TableWrapper stickyFirstColumn>
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase">
                      <tr>
                        <th className="text-left px-3 py-2 whitespace-nowrap">Rota</th>
                        <th className="text-left px-3 py-2 whitespace-nowrap">Motorista</th>
                        <th className="text-right px-3 py-2 whitespace-nowrap">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perdaPorRotaMotorista.map((r) => (
                        <tr key={r.carga_id} className="border-t">
                          <td className="px-3 py-2 whitespace-nowrap">{r.rota_nome ?? "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.motorista_nome ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatBRL(Number(r.valor_perda_total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              )}
            </div>
          </div>

          {/* Bloco 2: Recebimento */}
          <div className="card-base p-4 mb-5">
            <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
              <TrendingDown size={16} /> Recebimento — divergências por fornecedor
            </h3>
            {recebimentoPorFornecedor.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma divergência no período.</p>
            ) : (
              <TableWrapper stickyFirstColumn>
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2 whitespace-nowrap">Fornecedor</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Faltas</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Qualidade</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recebimentoPorFornecedor.map((r) => (
                      <tr key={r.fornecedor} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">{r.fornecedor}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{formatBRL(r.faltas)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{formatBRL(r.qualidade)}</td>
                        <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatBRL(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </div>

          {/* Bloco 3: Quebra e qualidade */}
          <div className="card-base p-4 mb-5">
            <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
              <AlertTriangle size={16} /> Quebra e falta de qualidade por fornecedor
            </h3>
            {quebraPorFornecedor.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma quebra no período.</p>
            ) : (
              <TableWrapper stickyFirstColumn>
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2 whitespace-nowrap">Fornecedor</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Ocorrências</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quebraPorFornecedor.map((r) => (
                      <tr key={r.fornecedor} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">{r.fornecedor}</td>
                        <td className="px-3 py-2 text-right">{r.ocorrencias}</td>
                        <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatBRL(r.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </div>

          {/* Bloco 4: Fator real × cadastrado */}
          <div className="card-base p-4 mb-5">
            <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
              <Scale size={16} /> Fator real × cadastrado — itens com desvio {">"} 5%
            </h3>
            {fatorRealTop.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item com desvio significativo.</p>
            ) : (
              <TableWrapper stickyFirstColumn>
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2 whitespace-nowrap">Fornecedor</th>
                      <th className="text-left px-3 py-2 whitespace-nowrap">Produto</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Entregas</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Desvio %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fatorRealTop.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">{r.fornecedor_nome}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.produto_nome}</td>
                        <td className="px-3 py-2 text-right">{r.entregas}</td>
                        <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${Number(r.desvio_pct) < 0 ? "text-destructive" : "text-[var(--success)]"}`}>
                          {Number(r.desvio_pct) > 0 ? "+" : ""}{Number(r.desvio_pct).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </div>

          {/* Bloco 5: Contagem */}
          <div className="card-base p-4 mb-5">
            <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
              <ClipboardList size={16} /> Contagens pendentes e divergências abertas
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Contagens pendentes</div>
                <div className="text-2xl font-bold text-navy">{totais.contagensPend}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Divergências abertas (caixas)</div>
                <div className="text-2xl font-bold text-navy">{totais.divergenciasAbertas}</div>
              </div>
            </div>
            {contagensPendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma contagem pendente.</p>
            ) : (
              <TableWrapper stickyFirstColumn>
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2 whitespace-nowrap">Posição</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Dias pend.</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contagensPendentes.slice(0, 10).map((r) => (
                      <tr key={r.contagem_id} className="border-t">
                        <td className="px-3 py-2 whitespace-nowrap">{r.posicao_nome}</td>
                        <td className="px-3 py-2 text-right">{r.dias_pendente}</td>
                        <td className="px-3 py-2 text-right font-semibold">{r.total_diferenca ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card-base p-4">
              <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
                <Building2 size={16} /> Ranking fornecedores por custo total
              </h3>
              {rankingFornecedor.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <TableWrapper stickyFirstColumn>
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase">
                      <tr>
                        <th className="text-left px-3 py-2">#</th>
                        <th className="text-left px-3 py-2 whitespace-nowrap">Fornecedor</th>
                        <th className="text-right px-3 py-2 whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingFornecedor.slice(0, 10).map((r, i) => (
                        <tr key={r.fornecedor_id} className="border-t">
                          <td className="px-3 py-2 font-semibold">{i + 1}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.fornecedor_nome}</td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatBRL(r.custo_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              )}
            </div>
            <div className="card-base p-4">
              <h3 className="font-semibold text-navy mb-3 flex items-center gap-2">
                <Building2 size={16} /> Ranking supermercados por custo total
              </h3>
              {rankingCliente.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <TableWrapper stickyFirstColumn>
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-xs uppercase">
                      <tr>
                        <th className="text-left px-3 py-2">#</th>
                        <th className="text-left px-3 py-2 whitespace-nowrap">Supermercado</th>
                        <th className="text-right px-3 py-2 whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingCliente.slice(0, 10).map((r, i) => (
                        <tr key={r.cliente_id} className="border-t">
                          <td className="px-3 py-2 font-semibold">{i + 1}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.cliente_nome}</td>
                          <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{formatBRL(r.custo_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrapper>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
