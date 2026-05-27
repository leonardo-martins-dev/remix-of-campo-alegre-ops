import { createFileRoute } from "@tanstack/react-router";
import { Clock, PackageCheck, Truck, RotateCcw, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { tempoCargaPorLoja, ciclo } from "@/lib/mock";

export const Route = createFileRoute("/indicadores")({
  component: Page,
  head: () => ({ meta: [{ title: "Indicadores · Campo Alegre" }] }),
});

function Page() {
  return (
    <div>
      <PageHeader title="Indicadores — Tempos & Ciclo" subtitle="Métricas geradas automaticamente pelos timestamps das operações" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Tempo médio de conferência" value="38 min" icon={PackageCheck} delta={-3.2} spark={[42,40,41,39,38,38,37]}/>
        <KpiCard label="Tempo médio de carga" value="48 min" icon={Truck} delta={-1.8} spark={[52,51,50,49,49,48,48]}/>
        <KpiCard label="Ciclo total médio" value="2h 28m" icon={Clock} delta={-2.4} spark={[150,148,146,145,148,148,148]}/>
        <KpiCard label="Retorno médio de caixa" value="7.0 d" icon={RotateCcw} delta={-0.5} positiveIsGood={false} spark={[8,8,7,7,7,7,7]}/>
      </div>

      <div className="card-base p-6 mb-5">
        <h3 className="text-sm font-bold text-navy mb-6">Linha do ciclo operacional</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {ciclo.map((e, i) => (
            <div key={e.etapa} className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col items-center gap-2 w-40">
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: i === 0 ? "var(--info)" : i === ciclo.length-1 ? "var(--brand-green)" : "var(--primary)" }}>
                  {i+1}
                </div>
                <div className="text-xs font-semibold text-navy text-center">{e.etapa}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{e.tempo === 0 ? "T0" : `+${formatMin(e.tempo)}`}</div>
              </div>
              {i < ciclo.length - 1 && (
                <div className="flex flex-col items-center text-muted-foreground">
                  <ChevronRight size={20}/>
                  <span className="text-[10px]">{formatMin(ciclo[i+1].tempo - e.tempo)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base overflow-hidden">
          <div className="p-4 border-b border-border"><h3 className="text-sm font-bold text-navy">Tempo de carregamento por loja</h3></div>
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Loja</th>
                <th className="text-right px-3 py-3">Início</th>
                <th className="text-right px-3 py-3">Fim</th>
                <th className="text-right px-3 py-3">Duração</th>
                <th className="text-right px-4 py-3">Itens/min</th>
              </tr>
            </thead>
            <tbody>
              {tempoCargaPorLoja.map(t => (
                <tr key={t.loja} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-navy">{t.loja}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground font-mono">{t.inicio}</td>
                  <td className="px-3 py-3 text-right text-muted-foreground font-mono">{t.fim}</td>
                  <td className="px-3 py-3 text-right font-semibold">{t.duracao}min</td>
                  <td className="px-4 py-3 text-right font-bold text-primary-dark">{t.ipm.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card-base overflow-hidden">
          <div className="p-4 border-b border-border"><h3 className="text-sm font-bold text-navy">Tempo de conferência por pedido</h3></div>
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Pedido</th>
                <th className="text-left px-3 py-3">Fornecedor</th>
                <th className="text-right px-3 py-3">Duração</th>
                <th className="text-right px-4 py-3">Itens</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["PC-2041","Hortifruti São José", 42, 18],
                ["PC-2042","Sítio Boa Vista", 28, 12],
                ["PC-2043","Verduras Modelo", 51, 24],
                ["PC-2044","Folhas Premium", 22, 9],
              ].map((r:any) => (
                <tr key={r[0]} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-navy">{r[0]}</td>
                  <td className="px-3 py-3 text-ink">{r[1]}</td>
                  <td className="px-3 py-3 text-right font-semibold">{r[2]}min</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatMin(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m/60), r = m%60;
  return r ? `${h}h${r}m` : `${h}h`;
}
