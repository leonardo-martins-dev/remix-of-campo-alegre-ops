import { createFileRoute } from "@tanstack/react-router";
import { Truck, Percent, Box, DollarSign, AlertCircle } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { Donut, BarRow } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { useDashboard, useAlertas } from "@/hooks/use-dashboard";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard · Campo Alegre" }] }),
});

function Dashboard() {
  const { data, isLoading, isError } = useDashboard();
  const { data: alertas = [], isLoading: loadingAlertas } = useAlertas();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Carregando dashboard...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Não foi possível carregar o dashboard.</p>
      </div>
    );
  }

  const { cargasExpedidas, fillRate, caixasAbertas, capital, statusCounts, topClientes } = data;
  const totalCargas = statusCounts.concluida + statusCounts.carregando + statusCounts.aguardando;
  const maxAbertas = Math.max(1, ...topClientes.map((c) => c.abertas));

  return (
    <div>
      <PageHeader title="Dashboard Operacional" subtitle="Visão consolidada de hoje · atualizado agora" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Cargas expedidas hoje" value={String(cargasExpedidas)} icon={Truck} />
        <KpiCard
          label="Fill rate fornecedores"
          value={`${fillRate.toFixed(1)}%`}
          icon={Percent}
          positiveIsGood={false}
        />
        <KpiCard label="Caixas em aberto" value={caixasAbertas.toString()} icon={Box} positiveIsGood={false} />
        <KpiCard
          label="Capital em caixas na rua"
          value={`R$ ${capital.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          positiveIsGood={false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Expedição agora</h3>
          <div className="flex items-center justify-center my-2">
            <Donut
              segments={[
                { label: "Concluídas", value: statusCounts.concluida, color: "var(--success)" },
                { label: "Em carregamento", value: statusCounts.carregando, color: "var(--primary)" },
                { label: "Aguardando", value: statusCounts.aguardando, color: "var(--warning)" },
              ]}
              center={{ label: "Cargas", value: String(totalCargas) }}
            />
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <Legend color="var(--success)" label="Concluídas" value={String(statusCounts.concluida)} />
            <Legend color="var(--primary)" label="Em carregamento" value={String(statusCounts.carregando)} />
            <Legend color="var(--warning)" label="Aguardando" value={String(statusCounts.aguardando)} />
          </div>
        </div>

        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Top clientes — caixas em aberto</h3>
          <div className="space-y-4">
            {topClientes.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum saldo em aberto.</p>
            )}
            {topClientes.map((c) => (
              <BarRow key={c.nome} label={c.nome} value={c.abertas} max={maxAbertas} suffix=" cx" />
            ))}
          </div>
        </div>

        <div className="card-base p-5">
          <h3 className="text-sm font-bold text-navy mb-4">Alertas operacionais</h3>
          <div className="space-y-3">
            {loadingAlertas && (
              <p className="text-sm text-muted-foreground">Carregando alertas...</p>
            )}
            {!loadingAlertas && alertas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum alerta no momento.</p>
            )}
            {alertas.map((a, i) => (
              <Alert key={i} tone={a.tone} title={a.title} desc={a.desc} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-ink">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        {label}
      </span>
      <span className="font-semibold text-navy">{value}</span>
    </div>
  );
}

function Alert({ tone, title, desc }: { tone: "danger" | "warn" | "info"; title: string; desc: string }) {
  const map = { danger: "var(--danger)", warn: "var(--warning)", info: "var(--info)" };
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/60">
      <AlertCircle size={16} style={{ color: map[tone] }} className="mt-0.5" />
      <div className="flex-1">
        <div className="text-sm font-semibold text-navy">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
