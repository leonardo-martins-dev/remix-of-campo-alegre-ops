import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Truck,
  Percent,
  Box,
  DollarSign,
  AlertCircle,
  PackageCheck,
  ArrowLeftRight,
  ClipboardCheck,
} from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { formatBRL } from "@/lib/format";
import { Donut, BarRow } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { useDashboard, useAlertas } from "@/hooks/use-dashboard";
import { CoberturaDiaCard } from "@/components/cobertura-dia";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard · Campo Alegre" }] }),
});

const OPS_ACTIONS = [
  {
    to: "/recebimento" as const,
    title: "Recebimento",
    desc: "Pedidos, chegada e faltas",
    icon: PackageCheck,
  },
  {
    to: "/recebimento/conferir" as const,
    title: "Conferência",
    desc: "Conferir carga e gerar vale",
    icon: ClipboardCheck,
  },
  {
    to: "/caixas/movimentacao" as const,
    title: "Movimentação de caixas",
    desc: "Entrada, saída e transferência",
    icon: ArrowLeftRight,
  },
  {
    to: "/expedicao" as const,
    title: "Expedição",
    desc: "Painel de carga, saída e entrega",
    icon: Truck,
  },
];

function OperatorHome() {
  return (
    <div>
      <PageHeader
        title="Operação"
        subtitle="Atalhos do dia a dia — sem painel de valores de caixa"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        {OPS_ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              className="card-base p-4 md:p-5 flex items-start gap-3 md:gap-4 hover:bg-secondary/50 active:bg-secondary/70 transition-colors touch-target min-h-[4.5rem]"
            >
              <div
                className="h-11 w-11 shrink-0 rounded-lg flex items-center justify-center"
                style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}
              >
                <Icon size={20} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-navy">{a.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{a.desc}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard() {
  const { canViewValoresCaixa } = useAuth();
  if (!canViewValoresCaixa) return <OperatorHome />;
  return <AdminDashboard />;
}

function AdminDashboard() {
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

  const { cargasExpedidas, fillRate, fillRateValor, fillItensDisp, fillValorDisp, fillSampleItens, fillSampleValor, caixasClientes, caixasFornecedores, caixasGalpao, capital, perdaCaixasMes, lastInventarioGalpao, statusCounts, topClientes, quebraDia, pendenciasVinculo, divergenciasDia } = data as typeof data & {
    fillItensDisp?: { label: string; kind: string; formula: string; sampleSize: number };
    fillValorDisp?: { label: string; kind: string; formula: string; sampleSize: number };
    fillSampleItens?: number;
    fillSampleValor?: number;
    fillRate: number | null;
    fillRateValor: number | null;
  };
  const totalCargas = statusCounts.concluida + statusCounts.carregando + statusCounts.aguardando;
  const maxAbertas = Math.max(1, ...topClientes.map((c) => c.abertas));
  const fillLabel =
    fillItensDisp && fillValorDisp
      ? `${fillItensDisp.label} / ${fillValorDisp.label}`
      : fillRate == null && fillRateValor == null
        ? "sem dados"
        : `${fillRate == null ? "sem dados" : `${Math.round(fillRate)}%`} / ${fillRateValor == null ? "sem dados" : `${Math.round(fillRateValor)}%`}`;
  const fillMuted = (fillItensDisp?.kind !== "pct" && fillValorDisp?.kind !== "pct") || (fillRate == null && fillRateValor == null);
  const fillFooter = `Período: hoje · Amostra itens n=${fillSampleItens ?? fillItensDisp?.sampleSize ?? 0} · valor n=${fillSampleValor ?? fillValorDisp?.sampleSize ?? 0} · Fórmula: completos÷pedido e R$ recebido÷pedido (fechados)`;

  return (
    <div>
      <PageHeader title="Dashboard Operacional" subtitle="Visão consolidada de hoje · atualizado agora" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Cargas expedidas hoje" value={String(cargasExpedidas)} icon={Truck} />
        <Link to="/fornecedores" className="block">
          <KpiCard
            label="Fill rate hoje (itens / R$)"
            value={fillLabel}
            icon={Percent}
            positiveIsGood={false}
            muted={fillMuted}
            footer={fillFooter}
          />
        </Link>
        <KpiCard label="Com supermercados" value={String(caixasClientes)} icon={Box} positiveIsGood={false} />
        <KpiCard label="Com fornecedores" value={String(caixasFornecedores)} icon={Box} positiveIsGood={false} />
        <KpiCard
          label={lastInventarioGalpao ? `No galpão · inv. ${String(lastInventarioGalpao).slice(0, 10)}` : "No galpão"}
          value={String(caixasGalpao)}
          icon={Box}
        />
        <KpiCard
          label="Perda de caixas no mês"
          value={formatBRL(perdaCaixasMes ?? 0)}
          icon={AlertCircle}
          positiveIsGood={false}
        />
        <KpiCard label="Quebra do dia" value={formatBRL(quebraDia)} icon={AlertCircle} positiveIsGood={false} />
        <KpiCard label="Pendências de vínculo" value={String(pendenciasVinculo)} icon={AlertCircle} positiveIsGood={false} />
        <KpiCard label="Divergências hoje" value={`${divergenciasDia.todas} · ${divergenciasDia.acima} acima`} icon={AlertCircle} positiveIsGood={false} />
        <KpiCard
          label="Capital em caixas na rua"
          value={formatBRL(capital)}
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

        <CoberturaDiaCard />

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
              <Alert key={i} tone={a.tone} title={a.title} desc={a.desc} href={a.href} />
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

function Alert({ tone, title, desc, href }: { tone: "danger" | "warn" | "info"; title: string; desc: string; href?: string }) {
  const map = { danger: "var(--danger)", warn: "var(--warning)", info: "var(--info)" };
  const inner = (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/60">
      <AlertCircle size={16} style={{ color: map[tone] }} className="mt-0.5" />
      <div className="flex-1">
        <div className="text-sm font-semibold text-navy">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
  return href ? <Link to={href as "/"}>{inner}</Link> : inner;
}
