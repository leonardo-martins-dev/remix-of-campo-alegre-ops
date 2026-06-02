import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { BarRow } from "@/components/charts";
import { Percent, TrendingDown, AlertTriangle, DollarSign } from "lucide-react";
import { useFaltas, useFillRate, useConfigValor } from "@/hooks/use-pedidos";
import { exportToExcel } from "@/lib/excel";

export const Route = createFileRoute("/recebimento/faltas")({
  component: Page,
  head: () => ({ meta: [{ title: "Relatório de Faltas · Campo Alegre" }] }),
});

type FaltaRow = {
  id: string;
  quantidade_recebida: number;
  divergencia: string | null;
  quantidade_divergencia: number;
  tem_problema_qualidade: boolean;
  itens_pedido: {
    quantidade_pedida: number;
    produtos: { nome: string; unidade: string } | null;
    pedidos_recebimento: {
      codigo: string;
      fornecedores: { nome: string } | null;
    } | null;
  } | null;
};

function Page() {
  const { data: faltas = [], isLoading, error } = useFaltas();
  const { data: fillRate = [] } = useFillRate();
  const { data: valorUnitario = 4.5 } = useConfigValor("impacto_falta_por_unidade", 4.5);

  const faltasComImpacto = useMemo(() => {
    return (faltas as FaltaRow[]).map((f) => {
      const pedido = Number(f.itens_pedido?.quantidade_pedida ?? 0);
      const recebido = Number(f.quantidade_recebida);
      const falta = Math.max(0, pedido - recebido);
      const qtd = f.quantidade_divergencia > 0 ? Number(f.quantidade_divergencia) : falta;
      return {
        ...f,
        produto: f.itens_pedido?.produtos?.nome ?? "—",
        unid: f.itens_pedido?.produtos?.unidade ?? "un",
        fornecedor: f.itens_pedido?.pedidos_recebimento?.fornecedores?.nome ?? "—",
        codigo: f.itens_pedido?.pedidos_recebimento?.codigo ?? "—",
        pedido,
        recebido,
        falta: qtd,
        impacto: qtd * valorUnitario,
        tipo: f.divergencia ?? (f.tem_problema_qualidade ? "qualidade" : "falta"),
      };
    });
  }, [faltas, valorUnitario]);

  const impactoTotal = faltasComImpacto.reduce((a, i) => a + i.impacto, 0);

  const fillAvg =
    fillRate.length > 0
      ? fillRate.reduce((a, f) => a + (Number(f.fill_rate) || 0), 0) / fillRate.length
      : 0;

  const piorFornecedor = fillRate.length
    ? [...fillRate].sort((a, b) => (Number(a.fill_rate) || 0) - (Number(b.fill_rate) || 0))[0]
    : null;

  const exportExcel = () => {
    exportToExcel(
      `faltas-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Faltas",
      faltasComImpacto.map((i) => ({
        Pedido: i.codigo,
        Fornecedor: i.fornecedor,
        Produto: i.produto,
        Pedido_qtd: i.pedido,
        Recebido: i.recebido,
        Falta: i.falta,
        Tipo: i.tipo,
        "Impacto R$": i.impacto.toFixed(2),
      }))
    );
  };

  return (
    <div>
      <PageHeader
        title="Relatório de Faltas por Fornecedor"
        subtitle="Divergências do dia · base para cobrança e ajuste contratual"
        actions={
          <button
            type="button"
            onClick={exportExcel}
            disabled={!faltasComImpacto.length}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Exportar Excel
          </button>
        }
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          Erro ao carregar faltas: {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Itens em falta"
          value={isLoading ? "…" : String(faltasComImpacto.length)}
          icon={AlertTriangle}
        />
        <KpiCard
          label="Fill rate geral"
          value={isLoading ? "…" : `${fillAvg.toFixed(1)}%`}
          icon={Percent}
        />
        <KpiCard
          label="Pior fornecedor"
          value={piorFornecedor?.fornecedor ?? "—"}
          icon={TrendingDown}
        />
        <KpiCard
          label="Impacto estimado"
          value={
            isLoading
              ? "…"
              : `R$ ${impactoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
          }
          icon={DollarSign}
        />
      </div>

      <div className="card-base mb-5 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-bold text-navy">Recebido × Pedido — Itens com falta</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Produto</th>
              <th className="text-left px-4 py-3">Fornecedor</th>
              <th className="text-right px-4 py-3">Pedido</th>
              <th className="text-right px-4 py-3">Recebido</th>
              <th className="text-right px-4 py-3">Falta</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-right px-4 py-3">Impacto R$</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {!isLoading && faltasComImpacto.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma falta registrada
                </td>
              </tr>
            )}
            {faltasComImpacto.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="px-4 py-3 font-semibold text-navy">{i.produto}</td>
                <td className="px-4 py-3 text-ink">{i.fornecedor}</td>
                <td className="px-4 py-3 text-right">
                  {i.pedido} {i.unid}
                </td>
                <td className="px-4 py-3 text-right">
                  {i.recebido} {i.unid}
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: "var(--danger)" }}>
                  {i.falta}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`chip ${i.tipo === "qualidade" ? "chip-warn" : "chip-danger"}`}
                  >
                    {i.tipo}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-bold text-navy">
                  R$ {i.impacto.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-base p-5">
        <h3 className="text-sm font-bold text-navy mb-4">Confiabilidade por Fornecedor</h3>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left py-2">Fornecedor</th>
              <th className="text-left py-2 w-1/3">Fill rate acumulado</th>
              <th className="text-right py-2">Itens</th>
            </tr>
          </thead>
          <tbody>
            {fillRate.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-muted-foreground">
                  Sem dados de fill rate
                </td>
              </tr>
            )}
            {fillRate.map((f) => {
              const rate = Number(f.fill_rate) || 0;
              return (
                <tr key={f.fornecedor_id} className="border-t border-border">
                  <td className="py-3 font-semibold text-navy">{f.fornecedor}</td>
                  <td className="py-3 pr-6">
                    <BarRow
                      label=""
                      value={rate}
                      max={100}
                      suffix="%"
                      color={
                        rate >= 95 ? "var(--success)" : rate >= 90 ? "var(--warning)" : "var(--danger)"
                      }
                    />
                  </td>
                  <td className="py-3 text-right text-muted-foreground tabular-nums">
                    {f.itens_completos}/{f.total_itens}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
