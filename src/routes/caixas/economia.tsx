import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DollarSign, TrendingDown, PiggyBank, FileSpreadsheet, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Sparkline } from "@/components/charts";
import { perdaPorCliente, tiposCaixaInit } from "@/lib/mock";

export const Route = createFileRoute("/caixas/economia")({
  component: Page,
  head: () => ({ meta: [{ title: "Custo & Perda · Campo Alegre" }] }),
});

function Page() {
  const [custos, setCustos] = useState(tiposCaixaInit);
  const custoMedio = (custos[0].custo + custos[1].custo + custos[2].custo) / 3;

  const dados = useMemo(() => perdaPorCliente.map(c => ({
    ...c,
    custoPerda: c.perdidas * (c.pior === "Grande" ? custos[0].custo : c.pior === "Isopor" ? custos[1].custo : custos[2].custo),
  })), [custos]);

  const perdaTotal = dados.reduce((a,c)=>a+c.custoPerda, 0);
  const taxaMedia = dados.reduce((a,c)=>a+c.taxa, 0)/dados.length;
  const benchmark = 2.0;
  const economia = dados.reduce((a,c) => {
    if (c.taxa <= benchmark) return a;
    const excedente = (c.taxa - benchmark) / 100 * c.enviadas;
    return a + excedente * custoMedio;
  }, 0);

  const pior = [...dados].sort((a,b)=>b.custoPerda - a.custoPerda)[0];

  return (
    <div>
      <PageHeader
        title="Custo & Perda por Supermercado"
        subtitle="Quanto cada loja custa em caixa que não volta"
        actions={
          <>
            <div className="text-xs text-muted-foreground">Custo médio: <span className="font-bold text-navy">R$ {custoMedio.toFixed(2)}</span></div>
            <button
              onClick={() => toast.success("Exportação iniciada", { description: "Relatório de perda em XLSX." })}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark">
              <FileSpreadsheet size={14}/> Exportar
            </button>
          </>
        }
      />

      {/* Custo editor */}
      <div className="card-base p-4 mb-5 flex flex-wrap items-center gap-4">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Custo unitário</span>
        {custos.map((c,i)=>(
          <div key={c.id} className="flex items-center gap-2">
            <span className="text-xs text-ink">{c.nome}</span>
            <div className="flex items-center">
              <span className="px-2 h-8 bg-secondary border border-r-0 border-border rounded-l text-[10px] font-semibold text-muted-foreground flex items-center">R$</span>
              <input type="number" step="0.5" value={c.custo}
                onChange={(e)=>setCustos(prev=>prev.map((p,j)=>j===i?{...p,custo:parseFloat(e.target.value)||0}:p))}
                className="h-8 w-20 px-2 border border-border rounded-r text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"/>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <KpiCard label="Perda no mês" value={`R$ ${perdaTotal.toLocaleString("pt-BR",{maximumFractionDigits:0})}`} icon={DollarSign} delta={4.6} positiveIsGood={false} spark={[100,105,110,115,118,120,125]} />
        <KpiCard label="Taxa de perda média" value={`${taxaMedia.toFixed(2)}%`} icon={TrendingDown} delta={0.3} positiveIsGood={false} spark={[3,3.2,3.3,3.4,3.5,3.6,3.6]} />
        <KpiCard label="Economia potencial" value={`R$ ${economia.toLocaleString("pt-BR",{maximumFractionDigits:0})}`} icon={PiggyBank} accent="var(--success)" spark={[60,65,70,72,75,78,80]} />
      </div>

      {/* Callout */}
      <div className="card-base p-5 mb-5 flex items-start gap-4 border-l-4" style={{ borderLeftColor: "var(--warning)" }}>
        <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(240,169,43,0.15)", color: "var(--warning)" }}>
          <Lightbulb size={20}/>
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-navy">Onde está o dinheiro</div>
          <div className="text-sm text-ink mt-1">
            <strong>{pior.cliente}</strong> é o cliente que mais perde — <strong>R$ {pior.custoPerda.toFixed(0)}</strong> só no tipo <strong>{pior.pior}</strong>. Levando a taxa de perda dele de <strong>{pior.taxa}%</strong> para o benchmark de <strong>{benchmark}%</strong>, dá pra economizar cerca de{" "}
            <strong style={{ color: "var(--success)" }}>
              R$ {(((pior.taxa - benchmark)/100) * pior.enviadas * custoMedio).toLocaleString("pt-BR",{maximumFractionDigits:0})}
            </strong> por mês.
          </div>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Cliente</th>
              <th className="text-right px-3 py-3">Enviadas</th>
              <th className="text-right px-3 py-3">Perdidas</th>
              <th className="text-left px-3 py-3">Tipo dominante</th>
              <th className="text-right px-3 py-3">Custo da perda</th>
              <th className="text-center px-3 py-3">Taxa de perda</th>
              <th className="text-center px-3 py-3">Tendência</th>
              <th className="text-right px-4 py-3">Ação</th>
            </tr>
          </thead>
          <tbody>
            {dados.map(c => (
              <tr key={c.cliente} className="border-t border-border hover:bg-secondary/30">
                <td className="px-4 py-3 font-semibold text-navy">{c.cliente}</td>
                <td className="px-3 py-3 text-right text-ink">{c.enviadas}</td>
                <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--danger)" }}>{c.perdidas}</td>
                <td className="px-3 py-3"><span className="chip chip-muted">{c.pior}</span></td>
                <td className="px-3 py-3 text-right font-bold text-navy">R$ {c.custoPerda.toFixed(2)}</td>
                <td className="px-3 py-3 text-center">
                  <span className={`chip ${c.taxa >= 5 ? "chip-danger" : c.taxa >= 3 ? "chip-warn" : "chip-ok"}`}>{c.taxa.toFixed(1)}%</span>
                </td>
                <td className="px-3 py-3 text-center"><Sparkline data={c.trend} color={c.taxa >= 5 ? "var(--danger)" : "var(--warning)"}/></td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toast.success(`Cobrança enviada · ${c.cliente}`, { description: `R$ ${c.custoPerda.toFixed(2)} em caixas ${c.pior}.` })}
                    className="h-7 px-3 rounded-md bg-primary-soft text-primary-dark text-xs font-semibold hover:bg-primary hover:text-primary-foreground active:scale-95 transition">Cobrar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
