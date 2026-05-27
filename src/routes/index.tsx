import { createFileRoute } from "@tanstack/react-router";
import { Truck, Percent, Box, DollarSign, AlertCircle } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { Donut, BarRow } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { clientesSaldo, tiposCaixaInit } from "@/lib/mock";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard · Campo Alegre" }] }),
});

function Dashboard() {
  const capital = clientesSaldo.reduce((acc, c) => {
    const G = c.G.env - c.G.ret, I = c.I.env - c.I.ret, P = c.P.env - c.P.ret;
    return acc + G*tiposCaixaInit[0].custo + I*tiposCaixaInit[1].custo + P*tiposCaixaInit[2].custo;
  }, 0);
  const caixasAbertas = clientesSaldo.reduce((a,c)=> a + (c.G.env-c.G.ret) + (c.I.env-c.I.ret) + (c.P.env-c.P.ret), 0);

  const topClientes = [...clientesSaldo]
    .map(c => ({ nome: c.cliente, abertas: (c.G.env-c.G.ret)+(c.I.env-c.I.ret)+(c.P.env-c.P.ret) }))
    .sort((a,b)=>b.abertas-a.abertas).slice(0,5);
  const maxAbertas = Math.max(...topClientes.map(c=>c.abertas));

  return (
    <div>
      <PageHeader title="Dashboard Operacional" subtitle="Visão consolidada de hoje · atualizado agora" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Cargas expedidas hoje" value="14" icon={Truck} delta={12.4} spark={[8,9,11,10,12,13,14]} />
        <KpiCard label="Fill rate fornecedores" value="94.3%" icon={Percent} delta={-1.2} positiveIsGood={false} spark={[96,95,94,95,93,94,94]} />
        <KpiCard label="Caixas em aberto" value={caixasAbertas.toString()} icon={Box} delta={3.8} positiveIsGood={false} spark={[110,115,118,120,122,125,128]} />
        <KpiCard label="Capital em caixas na rua" value={`R$ ${capital.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`} icon={DollarSign} delta={2.1} positiveIsGood={false} spark={[40,42,43,45,47,48,50]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Expedição agora</h3>
          <div className="flex items-center justify-center my-2">
            <Donut
              segments={[
                { label: "Concluídas",     value: 14, color: "var(--success)" },
                { label: "Em carregamento", value: 4, color: "var(--primary)" },
                { label: "Aguardando",      value: 3, color: "var(--warning)" },
              ]}
              center={{ label: "Cargas", value: "21" }}
            />
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <Legend color="var(--success)" label="Concluídas" value="14" />
            <Legend color="var(--primary)" label="Em carregamento" value="4" />
            <Legend color="var(--warning)" label="Aguardando" value="3" />
          </div>
        </div>

        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Top clientes — caixas em aberto</h3>
          <div className="space-y-4">
            {topClientes.map(c => (
              <BarRow key={c.nome} label={c.nome} value={c.abertas} max={maxAbertas} suffix=" cx" />
            ))}
          </div>
        </div>

        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Alertas operacionais</h3>
          <div className="space-y-3">
            <Alert tone="danger" title="Carrefour Morumbi" desc="32 caixas paradas há 11+ dias" />
            <Alert tone="warn"   title="Verduras Modelo" desc="Fill rate 87,4% (7 divergências hoje)" />
            <Alert tone="warn"   title="Assaí Tatuapé" desc="Aging médio 9 dias acima do limite" />
            <Alert tone="info"   title="Folhas Premium" desc="Chegou 30min atrasado" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-ink"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }}/>{label}</span>
      <span className="font-semibold text-navy">{value}</span>
    </div>
  );
}

function Alert({ tone, title, desc }: { tone: "danger"|"warn"|"info"; title: string; desc: string }) {
  const map = { danger: "var(--danger)", warn: "var(--warning)", info: "var(--info)" };
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/60">
      <AlertCircle size={16} style={{ color: map[tone] }} className="mt-0.5"/>
      <div className="flex-1">
        <div className="text-sm font-semibold text-navy">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
