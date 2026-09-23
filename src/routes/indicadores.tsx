import { createFileRoute } from "@tanstack/react-router";
import { Clock, PackageCheck, Truck, RotateCcw, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TableWrapper } from "@/components/table-wrapper";
import { KpiCard } from "@/components/kpi-card";
import { useIndicadores } from "@/hooks/use-dashboard";
import { formatTime, formatDurationMinutes } from "@/lib/utils-date";
import { durationMinutes, formatMetaLine } from "@/lib/indicadores-metricas";

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
    tempo_medio_conferencia_min?: number | null;
    tempo_medio_carga_min?: number | null;
    ciclo_total_medio_min?: number | null;
    retorno_medio_caixas_min?: number | null;
  };

  const confMeta = data.confMeta;
  const cargaMeta = data.cargaMeta;
  const retornoMeta = data.retornoMeta;

  const conf = cv?.tempo_medio_conferencia_min ?? null;
  const carga = cv?.tempo_medio_carga_min ?? null;
  const cicloTotal = cv?.ciclo_total_medio_min ?? null;
  const retorno = cv?.retorno_medio_caixas_min ?? null;
  const inicioCarga =
    conf != null && cicloTotal != null && carga != null
      ? Math.max(conf, cicloTotal - carga)
      : conf ?? 0;

  const ciclo = [
    { etapa: "Chegada fornecedor", tempo: 0 },
    { etapa: "Conferência ok", tempo: conf ?? 0 },
    { etapa: "Início da carga", tempo: inicioCarga },
    { etapa: "Caminhão na rua", tempo: cicloTotal ?? inicioCarga },
    {
      etapa: "Retorno de caixas",
      tempo: (cicloTotal ?? inicioCarga) + (retorno ?? 0),
    },
  ];

  const tempoCargaPorLoja = data.cargas.map((c) => {
    const minutes = durationMinutes(c.hora_inicio, c.hora_fim);
    const itens = c.romaneio_itens?.length ?? 0;
    const cliente = Array.isArray(c.clientes) ? c.clientes[0] : c.clientes;
    const duracao = minutes == null ? null : Math.round(minutes);
    return {
      loja: cliente?.nome ?? "—",
      inicio: formatTime(c.hora_inicio),
      fim: formatTime(c.hora_fim),
      duracao,
      ipm: minutes && minutes > 0 ? itens / minutes : null,
      outlier: data.cargaOutliers?.some((o) => o.id === c.id) ?? false,
    };
  });

  const conferenciasRows = data.conferencias.map((c) => {
    const minutes = durationMinutes(c.iniciada_em, c.finalizada_em);
    const ped = Array.isArray(c.pedidos_recebimento) ? c.pedidos_recebimento[0] : c.pedidos_recebimento;
    const forn = ped ? (Array.isArray(ped.fornecedores) ? ped.fornecedores[0] : ped.fornecedores) : null;
    return {
      id: c.id,
      codigo: ped?.codigo ?? "—",
      fornecedor: forn?.nome ?? "—",
      duracao: minutes == null ? null : Math.round(minutes),
      outlier: data.confOutliers?.some((o) => o.id === c.id) ?? false,
    };
  });

  const confFooter = formatMetaLine({
    periodLabel: confMeta.periodLabel,
    sampleSize: confMeta.sampleSize,
    formula: confMeta.formula,
    outliersCount: confMeta.outliers.length,
  });
  const cargaFooter = formatMetaLine({
    periodLabel: cargaMeta.periodLabel,
    sampleSize: cargaMeta.sampleSize,
    formula: cargaMeta.formula,
    outliersCount: cargaMeta.outliers.length,
  });
  const cicloFooter = formatMetaLine({
    periodLabel: confMeta.periodLabel,
    sampleSize: Math.min(confMeta.sampleSize, cargaMeta.sampleSize) || confMeta.sampleSize + cargaMeta.sampleSize,
    formula: "média conferência + média carga (amostras válidas)",
  });
  const retornoFooter = formatMetaLine({
    periodLabel: retornoMeta.periodLabel,
    sampleSize: retornoMeta.sampleSize,
    formula: retornoMeta.formula,
  });

  return (
    <div>
      <PageHeader
        title="Indicadores — Tempos & Ciclo"
        subtitle="Médias só com registros finalizados válidos · período, amostra e fórmula em cada KPI"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Tempo médio de conferência"
          value={conf == null ? "sem dados" : formatDurationMinutes(conf)}
          icon={PackageCheck}
          muted={conf == null}
          footer={confFooter}
        />
        <KpiCard
          label="Tempo médio de carga"
          value={carga == null ? "sem dados" : formatDurationMinutes(carga)}
          icon={Truck}
          muted={carga == null}
          footer={cargaFooter}
        />
        <KpiCard
          label="Ciclo total médio"
          value={cicloTotal == null ? "sem dados" : formatDurationMinutes(cicloTotal)}
          icon={Clock}
          muted={cicloTotal == null}
          footer={cicloFooter}
        />
        <KpiCard
          label="Retorno médio de caixa"
          value={retorno == null ? "sem dados" : formatDurationMinutes(retorno)}
          icon={RotateCcw}
          positiveIsGood={false}
          muted={retorno == null}
          footer={retornoFooter}
        />
      </div>

      <div className="card-base p-4 sm:p-6 mb-5">
        <h3 className="text-sm font-bold text-navy mb-4 sm:mb-6">Linha do ciclo operacional</h3>
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-2 -mx-2 px-2">
          {ciclo.map((e, i) => (
            <div key={e.etapa} className="flex items-center gap-1 sm:gap-2 shrink-0">
              <div className="flex flex-col items-center gap-1 sm:gap-2 w-20 sm:w-40">
                <div
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-bold"
                  style={{
                    background:
                      i === 0 ? "var(--info)" : i === ciclo.length - 1 ? "var(--brand-green)" : "var(--primary)",
                  }}
                >
                  {i + 1}
                </div>
                <div className="text-[10px] sm:text-xs font-semibold text-navy text-center leading-tight">{e.etapa}</div>
                <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">
                  {e.tempo === 0 ? "T0" : `+${formatMin(e.tempo)}`}
                </div>
              </div>
              {i < ciclo.length - 1 && (
                <div className="flex flex-col items-center text-muted-foreground">
                  <ChevronRight size={16} className="sm:w-5 sm:h-5" />
                  <span className="text-[10px] sm:text-xs">{formatMin(ciclo[i + 1].tempo - e.tempo)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Linha usa as médias acima (sem outliers). Timestamps iguais ou registros abertos não entram na média.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Tempo de carregamento por loja</h3>
            <p className="text-[11px] text-muted-foreground mt-1">{cargaFooter}</p>
          </div>
          {tempoCargaPorLoja.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem cargas finalizadas.</p>
          ) : (
            <TableWrapper stickyFirstColumn>
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Loja</th>
                    <th className="text-right px-3 py-3 whitespace-nowrap">Início</th>
                    <th className="text-right px-3 py-3 whitespace-nowrap">Fim</th>
                    <th className="text-right px-3 py-3 whitespace-nowrap">Duração</th>
                    <th className="text-right px-4 py-3 whitespace-nowrap">Itens/min</th>
                  </tr>
                </thead>
                <tbody>
                  {tempoCargaPorLoja.map((t) => (
                    <tr key={t.loja + t.inicio} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">
                        {t.loja}
                        {t.outlier && (
                          <span className="ml-1 text-[10px] text-amber-600 font-normal">(outlier)</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-muted-foreground font-mono whitespace-nowrap">{t.inicio}</td>
                      <td className="px-3 py-3 text-right text-muted-foreground font-mono whitespace-nowrap">{t.fim}</td>
                      <td className="px-3 py-3 text-right font-semibold whitespace-nowrap">
                        {t.duracao == null ? "—" : `${t.duracao} min`}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-primary-dark whitespace-nowrap">
                        {t.ipm == null ? "—" : t.ipm.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </div>

        <div className="card-base">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Tempo de conferência por pedido</h3>
            <p className="text-[11px] text-muted-foreground mt-1">{confFooter}</p>
          </div>
          {conferenciasRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem conferências finalizadas.</p>
          ) : (
            <TableWrapper stickyFirstColumn>
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-3 whitespace-nowrap">Pedido</th>
                    <th className="text-left px-3 py-3 whitespace-nowrap">Fornecedor</th>
                    <th className="text-right px-3 py-3 whitespace-nowrap">Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {conferenciasRows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">
                        {r.codigo}
                        {r.outlier && (
                          <span className="ml-1 text-[10px] text-amber-600 font-normal">(outlier)</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-ink whitespace-nowrap">{r.fornecedor}</td>
                      <td
                        className={`px-3 py-3 text-right font-semibold whitespace-nowrap ${
                          r.outlier ? "text-amber-700" : ""
                        }`}
                      >
                        {r.duracao == null ? "—" : `${r.duracao} min`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
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
