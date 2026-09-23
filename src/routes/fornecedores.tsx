import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { TableWrapper } from "@/components/table-wrapper";
import { Button } from "@/components/ui/button";
import { exportToExcel } from "@/lib/excel";
import { dateRangeBRT, isoWeekKeyBRT } from "@/lib/utils-date";
import { formatBRL, formatBRLOrEmpty } from "@/lib/format";
import { useFornecedores } from "@/hooks/use-cadastros";
import { useFaltas, useConfigValor, useFillRate } from "@/hooks/use-pedidos";
import { useQuebras, TipoOcorrenciaQuebra } from "@/hooks/use-quebra";
import { useSaldosCaixa } from "@/hooks/use-ledger";
import { useValesPorFornecedor, useValesFornecedor } from "@/hooks/use-vales";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { one } from "@/lib/embed";
import { fillRateDisplay, formatMetaLine } from "@/lib/indicadores-metricas";

export const Route = createFileRoute("/fornecedores")({
  component: Page,
  head: () => ({ meta: [{ title: "Desempenho de fornecedores · Campo Alegre" }] }),
});

function Page() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const { from, to } = dateRangeBRT(period);
  const { data: fornecedores = [] } = useFornecedores();
  const { data: faltas = [] } = useFaltas({ period, divergencia: "all" });
  const { data: quebras = [] } = useQuebras({ from, to });
  const { data: saldos = [] } = useSaldosCaixa();
  const { data: fillRows = [] } = useFillRate(period);
  const { data: alvo = 95 } = useConfigValor("alvo_fill_rate", 95);
  const { data: benchQ = 2 } = useConfigValor("benchmark_quebra_fornecedor", 2);
  const { data: valesPorFornecedor = [] } = useValesPorFornecedor();
  const [fichaId, setFichaId] = useState<string | null>(null);
  const { data: valesFicha = [] } = useValesFornecedor(fichaId);

  const { data: pedidos = [] } = useQuery({
    queryKey: ["pedidos-placar", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("pedidos_recebimento")
        .select("id, fornecedor_id, status, data_pedido, conferencias(id, status)")
        .gte("data_pedido", from)
        .lte("data_pedido", to);
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    return fornecedores
      .filter((f) => f.nome !== "Aguardando vínculo")
      .map((f) => {
        const peds = (
          pedidos as { fornecedor_id: string; id: string; conferencias: { status: string }[] }[]
        ).filter((p) => p.fornecedor_id === f.id);
        const faltasF = faltas
          .map((x) => {
            const ip = one((x as { itens_pedido?: unknown }).itens_pedido) as {
              pedidos_recebimento?: unknown;
              preco_unitario?: number;
            } | null;
            const ped = one(ip?.pedidos_recebimento) as { fornecedor_id?: string } | null;
            return { ...x, _forn: ped?.fornecedor_id, _ip: ip };
          })
          .filter((x) => x._forn === f.id) as ((typeof faltas)[number] & {
          divergencia: string;
          quantidade_divergencia: number;
          valor_divergencia?: number;
          dentro_tolerancia?: boolean;
        })[];
        const quebraF = (
          quebras as {
            fornecedor_id: string;
            quebra_itens: {
              quantidade: number;
              valor: number;
              tipo_ocorrencia?: TipoOcorrenciaQuebra;
            }[];
          }[]
        ).filter((q) => q.fornecedor_id === f.id);
        const faltaCx = faltasF
          .filter((x) => x.divergencia === "falta")
          .reduce((a, x) => a + Number(x.quantidade_divergencia ?? 0), 0);
        const faltaR = faltasF
          .filter((x) => x.divergencia === "falta")
          .reduce((a, x) => a + Number(x.valor_divergencia ?? 0), 0);
        const acima = faltasF
          .filter((x) => x.divergencia === "falta" && x.dentro_tolerancia === false)
          .reduce((a, x) => a + Number(x.quantidade_divergencia ?? 0), 0);
        const qualidadeCx = faltasF
          .filter((x) => x.divergencia === "qualidade")
          .reduce((a, x) => a + Number(x.quantidade_divergencia ?? 0), 0);
        const qualidadeR = faltasF
          .filter((x) => x.divergencia === "qualidade")
          .reduce((a, x) => a + Number(x.valor_divergencia ?? 0), 0);
        const sobraCx = faltasF
          .filter((x) => x.divergencia === "sobra")
          .reduce((a, x) => a + Number(x.quantidade_divergencia ?? 0), 0);
        const quebraCx = quebraF.reduce(
          (a, q) =>
            a +
            q.quebra_itens
              .filter((i) => i.tipo_ocorrencia !== "falta_de_qualidade")
              .reduce((b, i) => b + Number(i.quantidade), 0),
          0,
        );
        const quebraR = quebraF.reduce(
          (a, q) =>
            a +
            q.quebra_itens
              .filter((i) => i.tipo_ocorrencia !== "falta_de_qualidade")
              .reduce((b, i) => b + Number(i.valor ?? 0), 0),
          0,
        );
        const galQualCx = quebraF.reduce(
          (a, q) =>
            a +
            q.quebra_itens
              .filter((i) => i.tipo_ocorrencia === "falta_de_qualidade")
              .reduce((b, i) => b + Number(i.quantidade), 0),
          0,
        );
        const galQualR = quebraF.reduce(
          (a, q) =>
            a +
            q.quebra_itens
              .filter((i) => i.tipo_ocorrencia === "falta_de_qualidade")
              .reduce((b, i) => b + Number(i.valor ?? 0), 0),
          0,
        );
        const caixaAberto = (saldos as { posicao_tipo: string; ref_id: string; saldo: number }[])
          .filter((s) => s.posicao_tipo === "fornecedor" && s.ref_id === f.id)
          .reduce((a, s) => a + Number(s.saldo ?? 0), 0);
        const entregas = peds.reduce(
          (a, p) => a + (p.conferencias?.filter((c) => c.status === "finalizada").length ?? 0),
          0,
        );
        const fillRow = (
          fillRows as {
            fornecedor_id: string;
            fill_rate?: number | null;
            fill_rate_valor?: number | null;
            total_itens?: number;
            itens_completos?: number;
            valor_pedido?: number;
            valor_recebido?: number;
          }[]
        ).find((r) => r.fornecedor_id === f.id);
        // Prefer valor; fall back to itens. Never default to 100 (NOP-320).
        const denomValor = Number(fillRow?.valor_pedido ?? 0);
        const numValor = Number(fillRow?.valor_recebido ?? 0);
        const denomItens = Number(fillRow?.total_itens ?? 0);
        const numItens = Number(fillRow?.itens_completos ?? 0);
        const fillDisp = fillRateDisplay(
          denomValor > 0
            ? {
                numerador: numValor,
                denominador: denomValor,
                pedidos: peds.length,
                entregas,
                formula: "valor recebido ÷ valor pedido × 100 (pedidos fechados no período)",
              }
            : {
                numerador: numItens,
                denominador: denomItens,
                pedidos: peds.length,
                entregas,
                formula: "itens completos ÷ itens do pedido × 100 (pedidos fechados no período)",
              },
        );
        const valeRow = (
          valesPorFornecedor as {
            fornecedor_id: string;
            pendentes: number;
            aplicados: number;
            recusados: number;
            valor_aplicado: number;
            valor_pendente: number;
          }[]
        ).find((v) => v.fornecedor_id === f.id);
        const valesPend = Number(valeRow?.pendentes ?? 0);
        const valesApl = Number(valeRow?.aplicados ?? 0);
        const valesRec = Number(valeRow?.recusados ?? 0);
        const valesValor = Number(valeRow?.valor_aplicado ?? 0);
        return {
          id: f.id,
          nome: f.nome,
          pedidos: peds.length,
          entregas,
          fillDisp,
          faltaCx,
          faltaR,
          acima,
          sobraCx,
          qualidadeCx,
          qualidadeR,
          quebraCx,
          quebraR,
          galQualCx,
          galQualR,
          caixaAberto,
          valesPend,
          valesApl,
          valesRec,
          valesValor,
          impacto: faltaR + qualidadeR + quebraR + galQualR,
        };
      })
      .sort((a, b) => b.impacto - a.impacto);
  }, [fornecedores, pedidos, faltas, quebras, saldos, fillRows, valesPorFornecedor]);

  const ficha = rows.find((r) => r.id === fichaId);

  return (
    <div>
      <PageHeader
        title="Desempenho de fornecedores"
        subtitle="Fill rate, faltas, qualidade, ocorrências no Packing, vales e caixas"
      />
      <div className="flex gap-2 mb-4">
        <Button
          size="sm"
          variant={period === "week" ? "default" : "outline"}
          onClick={() => setPeriod("week")}
        >
          7 dias
        </Button>
        <Button
          size="sm"
          variant={period === "month" ? "default" : "outline"}
          onClick={() => setPeriod("month")}
        >
          30 dias
        </Button>
      </div>
      {rows.every((r) => r.pedidos === 0 && r.entregas === 0) ? (
        <p className="text-sm text-muted-foreground mb-4">
          Nenhuma entrega no período — aguarde pedidos conferidos ou amplie o filtro (7/30 dias).
        </p>
      ) : null}
      <TableWrapper stickyFirstColumn>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 px-2 whitespace-nowrap">Fornecedor</th>
              <th className="px-2 whitespace-nowrap">Pedidos</th>
              <th className="px-2 whitespace-nowrap">Fill</th>
              <th className="px-2 whitespace-nowrap">Faltas</th>
              <th className="px-2 whitespace-nowrap" title="Recebimento">Qual. (rec)</th>
              <th className="px-2 whitespace-nowrap" title="Galpão">Quebra (gal)</th>
              <th className="px-2 whitespace-nowrap" title="Galpão">Qual. (gal)</th>
              <th className="px-2 whitespace-nowrap">Vales</th>
              <th className="px-2 whitespace-nowrap">Caixas</th>
              <th className="px-2 whitespace-nowrap">Impacto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b cursor-pointer hover:bg-secondary/40"
                onClick={() => setFichaId(r.id)}
              >
                <td className="py-2 px-2 font-medium whitespace-nowrap">{r.nome}</td>
                <td className="px-2 whitespace-nowrap">
                  {r.pedidos}/{r.entregas}
                </td>
                <td
                  className={`px-2 whitespace-nowrap ${
                    r.fillDisp.kind !== "pct"
                      ? "text-muted-foreground"
                      : r.fillDisp.pct! < alvo
                        ? "text-destructive"
                        : "text-[var(--success)]"
                  }`}
                  title={formatMetaLine({
                    periodLabel: period === "week" ? "7 dias" : "30 dias",
                    sampleSize: r.fillDisp.sampleSize,
                    formula: r.fillDisp.formula,
                  })}
                >
                  {r.fillDisp.kind === "pct" ? (
                    <>
                      <span
                        className={`inline-block h-2 w-2 rounded-full mr-1 ${
                          r.fillDisp.pct! < alvo * 0.9
                            ? "bg-destructive"
                            : r.fillDisp.pct! < alvo
                              ? "bg-[var(--warning)]"
                              : "bg-[var(--success)]"
                        }`}
                      />
                      {r.fillDisp.label}
                    </>
                  ) : (
                    <span className="italic">{r.fillDisp.label}</span>
                  )}
                </td>
                <td className="px-2 whitespace-nowrap">
                  {r.faltaCx > 0 ? `${r.faltaCx} un · ${formatBRL(r.faltaR)}` : "—"}
                  {r.acima ? ` (${r.acima} acima)` : ""}
                </td>
                <td className="px-2">{r.qualidadeCx}</td>
                <td
                  className={`px-2 whitespace-nowrap ${
                    r.quebraCx && (r.quebraCx / Math.max(1, r.pedidos)) * 100 > benchQ
                      ? "text-destructive"
                      : ""
                  }`}
                >
                  {r.quebraCx > 0 ? `${r.quebraCx} · ${formatBRL(r.quebraR)}` : "—"}
                </td>
                <td className="px-2 whitespace-nowrap">{r.galQualCx > 0 ? `${r.galQualCx} · ${formatBRL(r.galQualR)}` : "—"}</td>
                <td className="px-2 whitespace-nowrap">
                  {r.valesPend > 0 && <span className="text-amber-600">{r.valesPend} pend</span>}
                  {r.valesApl > 0 && (
                    <span className="text-[var(--success)] ml-1">
                      {r.valesApl} apl · {formatBRL(r.valesValor)}
                    </span>
                  )}
                  {r.valesPend === 0 && r.valesApl === 0 && "—"}
                </td>
                <td className="px-2">{r.caixaAberto}</td>
                <td className="px-2 font-semibold whitespace-nowrap">{formatBRLOrEmpty(r.impacto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrapper>
      <p className="text-[11px] text-muted-foreground mt-2 mb-4">
        Período: {period === "week" ? "7 dias" : "30 dias"} · Fill = valor recebido ÷ valor pedido (pedidos
        fechados); sem denominador → &quot;sem dados&quot; / &quot;aguardando entrega&quot; (sem cor de meta).
      </p>
      {ficha && (
        <div className="mt-6 rounded-xl border p-4 space-y-3">
          <div className="flex justify-between">
            <h3 className="font-semibold">Ficha · {ficha.nome}</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportToExcel(`ficha-${ficha.nome}.xlsx`, "Ficha", [ficha])}
            >
              Exportar ficha
            </Button>
          </div>
          <p className="text-sm">
            Impacto total {formatBRL(ficha.impacto)} · fill {ficha.fillDisp.label} · quebra{" "}
            {ficha.quebraCx} un · qualidade galpão {ficha.galQualCx} un
          </p>

          {(ficha.valesPend > 0 || ficha.valesApl > 0 || ficha.valesRec > 0) && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <h4 className="text-sm font-semibold text-amber-800 mb-2">Vales</h4>
              <div className="flex flex-wrap gap-3 text-sm">
                {ficha.valesPend > 0 && (
                  <span className="text-amber-700">{ficha.valesPend} pendente(s)</span>
                )}
                {ficha.valesApl > 0 && (
                  <span className="text-[var(--success)]">
                    {ficha.valesApl} aplicado(s) · {formatBRL(ficha.valesValor)}
                  </span>
                )}
                {ficha.valesRec > 0 && (
                  <span className="text-muted-foreground">{ficha.valesRec} recusado(s)</span>
                )}
              </div>
            </div>
          )}

          {valesFicha.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Histórico de vales</h4>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {valesFicha.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between text-xs p-2 rounded bg-secondary/30"
                  >
                    <div>
                      <span className="font-medium">{v.produto_nome ?? "Produto"}</span>
                      <span className="text-muted-foreground ml-2">· {v.diferenca} un</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.status === "pendente" && (
                        <span className="chip chip-warn">
                          Pendente · {formatBRL(v.valor_calculado)}
                        </span>
                      )}
                      {v.status === "aplicado" && (
                        <span className="chip chip-ok">
                          Aplicado · {formatBRL(v.valor_final ?? v.valor_calculado)}
                        </span>
                      )}
                      {v.status === "recusado" && (
                        <span className="chip chip-danger" title={v.motivo_recusa ?? ""}>
                          Recusado
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <SerieSemanal fornecedorId={ficha.id} />
        </div>
      )}
    </div>
  );
}

function SerieSemanal({ fornecedorId }: { fornecedorId: string }) {
  const { data } = useQuery({
    queryKey: ["serie-fornecedor", fornecedorId],
    queryFn: async () => {
      const { data } = await supabase
        .from("itens_conferencia")
        .select(
          "quantidade_recebida, divergencia, quantidade_divergencia, itens_pedido(pedidos_recebimento(fornecedor_id, data_pedido))",
        )
        .not("divergencia", "is", null);
      const byWeek: Record<string, number> = {};
      for (const r of data ?? []) {
        const ped = one(one(r.itens_pedido)?.pedidos_recebimento);
        if (ped?.fornecedor_id !== fornecedorId) continue;
        const key = isoWeekKeyBRT(ped.data_pedido);
        byWeek[key] = (byWeek[key] ?? 0) + Number(r.quantidade_divergencia ?? 0);
      }
      return Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b));
    },
  });
  if (!data?.length)
    return <p className="text-xs text-muted-foreground">Sem série semanal ainda.</p>;
  return (
    <div className="text-xs space-y-1">
      <p className="font-medium">Evolução semanal (divergências em cx)</p>
      {data.map(([w, v]) => (
        <p key={w}>
          {w}: {v}
        </p>
      ))}
    </div>
  );
}
