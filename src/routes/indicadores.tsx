import { createFileRoute } from "@tanstack/react-router";
import { Clock, PackageCheck, Truck, RotateCcw, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { useIndicadores } from "@/hooks/use-dashboard";
import { formatTime, formatDurationMinutes } from "@/lib/utils-date";

export const Route = createFileRoute("/indicadores")({
  component: Page,
  head: () => ({ meta: [{ title: "Indicadores · Campo Alegre" }] }),
});

function Page() {
  const { data, isLoading, isError } = useIndicadores();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Carregando indicadores...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Não foi possível carregar os indicadores.</p>
      </div>
    );
  }

  const cv = data.cicloView as {
    tempo_medio_conferencia_min?: number;
    tempo_medio_carga_min?: number;
    ciclo_total_medio_min?: number;
    retorno_medio_caixas_min?: number;
  } | undefined;

  const conf = Number(cv?.tempo_medio_conferencia_min ?? 0);
  const carga = Number(cv?.tempo_medio_carga_min ?? 0);
  const cicloTotal = Number(cv?.ciclo_total_medio_min ?? 0);
  const retorno = Number(cv?.retorno_medio_caixas_min ?? 0);
  const inicioCarga = Math.max(conf, cicloTotal - carga);

  const ciclo = [
    { etapa: "Chegada fornecedor", tempo: 0 },
    { etapa: "Conferência ok", tempo: conf },
    { etapa: "Início da carga", tempo: inicioCarga },
    { etapa: "Caminhão na rua", tempo: cicloTotal },
    { etapa: "Retorno de caixas", tempo: cicloTotal + retorno },
  ];

  const tempoCargaPorLoja = (data.cargas as {
    id: string;
    hora_inicio: string;
    hora_fim: string;
    clientes: { nome: string } | null;
    romaneio_itens: { id: string }[];
  }[]).map((c) => {
    const inicio = new Date(c.hora_inicio).getTime();
    const fim = new Date(c.hora_fim).getTime();
    const duracao = Math.max(1, (fim - inicio) / 60000);
    const itens = c.romaneio_itens?.length ?? 0;
    return {
      loja: c.clientes?.nome ?? "—",
      inicio: formatTime(c.hora_inicio),
      fim: formatTime(c.hora_fim),
      duracao: Math.round(duracao),
      ipm: itens / duracao,
    };
  });

  const conferenciasRows = (data.conferencias as {
    id: string;
    iniciada_em: string;
    finalizada_em: string;
    pedidos_recebimento: { codigo: string; fornecedores: { nome: string } | null } | null;
  }[]).map((c) => {
    const dur =
      (new Date(c.finalizada_em).getTime() - new Date(c.iniciada_em).getTime()) / 60000;
    return {
      codigo: c.pedidos_recebimento?.codigo ?? "—",
      fornecedor: c.pedidos_recebimento?.fornecedores?.nome ?? "—",
      duracao: Math.round(dur),
    };
  });

  return (
    <div>
      <PageHeader
        title="Indicadores — Tempos & Ciclo"
        subtitle="Métricas geradas automaticamente pelos timestamps das operações"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Tempo médio de conferência"
          value={formatDurationMinutes(conf)}
          icon={PackageCheck}
        />
        <KpiCard label="Tempo médio de carga" value={formatDurationMinutes(carga)} icon={Truck} />
        <KpiCard
          label="Ciclo total médio"
          value={formatDurationMinutes(cicloTotal)}
          icon={Clock}
        />
        <KpiCard
          label="Retorno médio de caixa"
          value={formatDurationMinutes(retorno)}
          icon={RotateCcw}
          positiveIsGood={false}
        />
      </div>

      <div className="card-base p-6 mb-5">
        <h3 className="text-sm font-bold text-navy mb-6">Linha do ciclo operacional</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {ciclo.map((e, i) => (
            <div key={e.etapa} className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col items-center gap-2 w-40">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{
                    background:
                      i === 0 ? "var(--info)" : i === ciclo.length - 1 ? "var(--brand-green)" : "var(--primary)",
                  }}
                >
                  {i + 1}
                </div>
                <div className="text-xs font-semibold text-navy text-center">{e.etapa}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {e.tempo === 0 ? "T0" : `+${formatMin(e.tempo)}`}
                </div>
              </div>
              {i < ciclo.length - 1 && (
                <div className="flex flex-col items-center text-muted-foreground">
                  <ChevronRight size={20} />
                  <span className="text-[10px]">{formatMin(ciclo[i + 1].tempo - e.tempo)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Tempo de carregamento por loja</h3>
          </div>
          {tempoCargaPorLoja.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem cargas finalizadas.</p>
          ) : (
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
                {tempoCargaPorLoja.map((t) => (
                  <tr key={t.loja + t.inicio} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-navy">{t.loja}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground font-mono">{t.inicio}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground font-mono">{t.fim}</td>
                    <td className="px-3 py-3 text-right font-semibold">{t.duracao} min</td>
                    <td className="px-4 py-3 text-right font-bold text-primary-dark">
                      {t.ipm.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card-base overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Tempo de conferência por pedido</h3>
          </div>
          {conferenciasRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem conferências finalizadas.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3">Pedido</th>
                  <th className="text-left px-3 py-3">Fornecedor</th>
                  <th className="text-right px-3 py-3">Duração</th>
                </tr>
              </thead>
              <tbody>
                {conferenciasRows.map((r) => (
                  <tr key={r.codigo} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-navy">{r.codigo}</td>
                    <td className="px-3 py-3 text-ink">{r.fornecedor}</td>
                    <td className="px-3 py-3 text-right font-semibold">{r.duracao} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function formatMin(m: number) {
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h${r}m` : `${h}h`;
}
