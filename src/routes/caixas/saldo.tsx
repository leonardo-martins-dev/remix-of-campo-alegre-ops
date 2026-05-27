import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Box, RotateCcw, Clock, Users, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Donut, BarRow, Sparkline } from "@/components/charts";
import { clientesSaldo, tiposCaixaInit } from "@/lib/mock";

export const Route = createFileRoute("/caixas/saldo")({
  component: Page,
  head: () => ({ meta: [{ title: "Saldo por Cliente · Campo Alegre" }] }),
});

type TipoFiltro = "ALL" | "G" | "I" | "P";

function Page() {
  const [custos, setCustos] = useState(tiposCaixaInit);
  const [filtro, setFiltro] = useState<TipoFiltro>("ALL");
  const cG = custos[0].custo, cI = custos[1].custo, cP = custos[2].custo;

  const totais = useMemo(() => {
    let aG=0, aI=0, aP=0;
    clientesSaldo.forEach(c => {
      aG += c.G.env - c.G.ret;
      aI += c.I.env - c.I.ret;
      aP += c.P.env - c.P.ret;
    });
    return { aG, aI, aP, capital: aG*cG + aI*cI + aP*cP, total: aG+aI+aP };
  }, [cG, cI, cP]);

  const taxaRetorno = useMemo(() => {
    const env = clientesSaldo.reduce((a,c)=>a + c.G.env + c.I.env + c.P.env, 0);
    const ret = clientesSaldo.reduce((a,c)=>a + c.G.ret + c.I.ret + c.P.ret, 0);
    return (ret/env)*100;
  }, []);

  return (
    <div>
      <PageHeader
        title="Saldo de Caixas por Cliente"
        subtitle="Vai-e-volta de caixas plásticas, isopor e grande"
        actions={
          <button
            onClick={() => toast.success("Exportação iniciada", { description: "Saldo por cliente em XLSX será baixado." })}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark"
          >
            <FileSpreadsheet size={14}/> Exportar
          </button>
        }
      />

      {/* Custo unitário editor */}
      <div className="card-base p-5 mb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-navy">Custo unitário das caixas</h3>
            <p className="text-xs text-muted-foreground mt-1">Edite para recalcular capital, perda e KPIs em tempo real</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {custos.map((c, i) => (
              <div key={c.id}>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.nome}</label>
                <div className="flex items-center mt-1">
                  <span className="px-2.5 h-9 bg-secondary border border-r-0 border-border rounded-l-md text-xs font-semibold text-muted-foreground flex items-center">R$</span>
                  <input type="number" step="0.5" value={c.custo}
                    onChange={(e)=>setCustos(prev => prev.map((p,j)=>j===i?{...p,custo:parseFloat(e.target.value)||0}:p))}
                    className="h-9 w-24 px-2 border border-border rounded-r-md text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Total em aberto" value={totais.total.toString()} icon={Box} delta={3.8} positiveIsGood={false} spark={[110,115,118,120,122,125,128]} />
        <KpiCard label="Taxa de retorno" value={`${taxaRetorno.toFixed(1)}%`} icon={RotateCcw} delta={1.2} spark={[88,89,89,90,91,92,92]} />
        <KpiCard label="Aging médio" value="7.0 d" icon={Clock} delta={-0.4} positiveIsGood={false} spark={[8,8,7,7,6,7,7]} />
        <KpiCard label="Clientes com saldo" value={clientesSaldo.length.toString()} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Em aberto por tipo</h3>
          <div className="flex justify-center">
            <Donut
              segments={[
                { label: "Grande", value: totais.aG, color: "var(--primary-dark)" },
                { label: "Isopor", value: totais.aI, color: "var(--info)" },
                { label: "Plástica", value: totais.aP, color: "var(--brand-green)" },
              ]}
              center={{ label: "R$ na rua", value: `${Math.round(totais.capital/1000)}k` }}
            />
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <Row color="var(--primary-dark)" label="Grande" value={`${totais.aG} · R$ ${(totais.aG*cG).toLocaleString("pt-BR",{maximumFractionDigits:0})}`}/>
            <Row color="var(--info)"          label="Isopor" value={`${totais.aI} · R$ ${(totais.aI*cI).toLocaleString("pt-BR",{maximumFractionDigits:0})}`}/>
            <Row color="var(--brand-green)"   label="Plástica" value={`${totais.aP} · R$ ${(totais.aP*cP).toLocaleString("pt-BR",{maximumFractionDigits:0})}`}/>
          </div>
        </div>

        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Distribuição de aging</h3>
          <div className="space-y-4">
            <BarRow label="0–2 dias"  value={42} max={100} color="var(--success)" suffix=" cx"/>
            <BarRow label="3–5 dias"  value={38} max={100} color="var(--info)" suffix=" cx"/>
            <BarRow label="6–10 dias" value={28} max={100} color="var(--warning)" suffix=" cx"/>
            <BarRow label="+10 dias"  value={18} max={100} color="var(--danger)" suffix=" cx"/>
          </div>
        </div>

        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Taxa de retorno por tipo</h3>
          <div className="space-y-4">
            <BarRow label="Grande" value={92.1} max={100} color="var(--primary-dark)" suffix="%"/>
            <BarRow label="Isopor" value={84.6} max={100} color="var(--info)" suffix="%"/>
            <BarRow label="Plástica" value={94.8} max={100} color="var(--brand-green)" suffix="%"/>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card-base overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-navy">Saldo por cliente</h3>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
            {(
              [
                ["ALL", "Todos"],
                ["G", "Grande"],
                ["I", "Isopor"],
                ["P", "Plástica"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFiltro(k)}
                className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
                  filtro === k ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-navy"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Cliente</th>
              {(filtro === "ALL" || filtro === "G") && (
                <th className="text-right px-3 py-3">Grande<br/><span className="font-normal normal-case">env / ret</span></th>
              )}
              {(filtro === "ALL" || filtro === "I") && (
                <th className="text-right px-3 py-3">Isopor<br/><span className="font-normal normal-case">env / ret</span></th>
              )}
              {(filtro === "ALL" || filtro === "P") && (
                <th className="text-right px-3 py-3">Plástica<br/><span className="font-normal normal-case">env / ret</span></th>
              )}
              <th className="text-right px-3 py-3">Saldo</th>
              <th className="text-right px-3 py-3">R$ em aberto</th>
              <th className="text-center px-3 py-3">Aging</th>
              <th className="text-center px-3 py-3">Tendência 14d</th>
              <th className="text-right px-4 py-3"/>
            </tr>
          </thead>
          <tbody>
            {clientesSaldo.map(c => {
              const sG = c.G.env-c.G.ret, sI = c.I.env-c.I.ret, sP = c.P.env-c.P.ret;
              const saldo = filtro === "ALL" ? sG+sI+sP : filtro === "G" ? sG : filtro === "I" ? sI : sP;
              const valor = filtro === "ALL"
                ? sG*cG + sI*cI + sP*cP
                : filtro === "G" ? sG*cG : filtro === "I" ? sI*cI : sP*cP;
              return (
                <tr key={c.cliente} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-semibold text-navy">{c.cliente}</td>
                  {(filtro === "ALL" || filtro === "G") && (
                    <td className="px-3 py-3 text-right text-ink">{c.G.env}/{c.G.ret}</td>
                  )}
                  {(filtro === "ALL" || filtro === "I") && (
                    <td className="px-3 py-3 text-right text-ink">{c.I.env}/{c.I.ret}</td>
                  )}
                  {(filtro === "ALL" || filtro === "P") && (
                    <td className="px-3 py-3 text-right text-ink">{c.P.env}/{c.P.ret}</td>
                  )}
                  <td className="px-3 py-3 text-right font-bold text-navy">{saldo}</td>
                  <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--danger)" }}>R$ {valor.toLocaleString("pt-BR",{maximumFractionDigits:0})}</td>
                  <td className="px-3 py-3 text-center">
                    <span className={`chip ${c.aging >= 10 ? "chip-danger" : c.aging >= 6 ? "chip-warn" : "chip-ok"}`}>{c.aging}d</span>
                  </td>
                  <td className="px-3 py-3 text-center"><Sparkline data={c.trend}/></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toast.info(`Extrato · ${c.cliente}`, { description: "Detalhamento por dia entra na Fase 2." })}
                      className="text-xs text-primary-dark font-semibold hover:underline"
                    >Extrato</button>
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

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-ink"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }}/>{label}</span>
      <span className="font-semibold text-navy">{value}</span>
    </div>
  );
}
