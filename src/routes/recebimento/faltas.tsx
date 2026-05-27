import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Sparkline, BarRow } from "@/components/charts";
import { Percent, TrendingDown, AlertTriangle, DollarSign } from "lucide-react";
import { fillRateFornecedor, itensPedido } from "@/lib/mock";

export const Route = createFileRoute("/recebimento/faltas")({
  component: Page,
  head: () => ({ meta: [{ title: "Relatório de Faltas · Campo Alegre" }] }),
});

function Page() {
  const faltasComImpacto = itensPedido
    .filter(i => i.recebido < i.pedido)
    .map(i => ({ ...i, falta: i.pedido - i.recebido, impacto: (i.pedido - i.recebido) * 4.5 }));
  const impactoTotal = faltasComImpacto.reduce((a,i)=>a+i.impacto, 0);

  return (
    <div>
      <PageHeader
        title="Relatório de Faltas por Fornecedor"
        subtitle="Divergências do dia · base para cobrança e ajuste contratual"
        actions={
          <button className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark">
            <FileSpreadsheet size={14}/> Exportar Excel
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Itens em falta" value="18" icon={AlertTriangle} delta={4.2} positiveIsGood={false} spark={[12,14,15,13,16,17,18]} />
        <KpiCard label="Fill rate geral" value="94.3%" icon={Percent} delta={-1.2} positiveIsGood={false} spark={[96,95,94,95,93,94,94]}/>
        <KpiCard label="Pior fornecedor" value="Verduras Modelo" icon={TrendingDown} />
        <KpiCard label="Impacto estimado" value={`R$ ${impactoTotal.toLocaleString("pt-BR",{maximumFractionDigits:0})}`} icon={DollarSign} delta={2.4} positiveIsGood={false} spark={[100,110,115,120,125,130,138]} />
      </div>

      <div className="card-base mb-5 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-bold text-navy">Recebido × Pedido — Itens com falta</h3>
          <button className="text-xs text-primary-dark font-semibold inline-flex items-center gap-1"><Download size={12}/> Baixar</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Produto</th>
              <th className="text-right px-4 py-3">Pedido</th>
              <th className="text-right px-4 py-3">Recebido</th>
              <th className="text-right px-4 py-3">Falta</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-right px-4 py-3">Impacto R$</th>
            </tr>
          </thead>
          <tbody>
            {faltasComImpacto.map((i,idx) => (
              <tr key={idx} className="border-t border-border">
                <td className="px-4 py-3 font-semibold text-navy">{i.produto}</td>
                <td className="px-4 py-3 text-right">{i.pedido} {i.unid}</td>
                <td className="px-4 py-3 text-right">{i.recebido} {i.unid}</td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: "var(--danger)" }}>{i.falta}</td>
                <td className="px-4 py-3"><span className={`chip ${i.div?.tipo === "qualidade" ? "chip-warn" : "chip-danger"}`}>{i.div?.tipo ?? "falta"}</span></td>
                <td className="px-4 py-3 text-right font-bold text-navy">R$ {i.impacto.toFixed(2)}</td>
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
              <th className="text-left py-2">Tendência 7d</th>
              <th className="text-left py-2">Última divergência</th>
            </tr>
          </thead>
          <tbody>
            {fillRateFornecedor.map(f => (
              <tr key={f.fornecedor} className="border-t border-border">
                <td className="py-3 font-semibold text-navy">{f.fornecedor}</td>
                <td className="py-3 pr-6">
                  <BarRow label="" value={f.fill} max={100} suffix="%"
                    color={f.fill >= 95 ? "var(--success)" : f.fill >= 90 ? "var(--warning)" : "var(--danger)"} />
                </td>
                <td className="py-3"><Sparkline data={f.trend}/></td>
                <td className="py-3">
                  <span className={`chip ${f.ultimaDiv === "Hoje" ? "chip-danger" : "chip-muted"}`}>{f.ultimaDiv}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
