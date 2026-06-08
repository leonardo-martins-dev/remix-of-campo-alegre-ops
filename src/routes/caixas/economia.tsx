import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DollarSign, TrendingDown, PiggyBank, FileSpreadsheet, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Sparkline } from "@/components/charts";
import { usePerdaClientes, useSaldoCaixas, useCobrarCaixa } from "@/hooks/use-caixas";
import { useTiposCaixa, useUpdateTipoCaixa, type TipoCaixa } from "@/hooks/use-tipos-caixa";
import { useAuth } from "@/lib/auth";
import { exportToExcel } from "@/lib/excel";
import { parseCustoValor, shouldSaveCusto } from "@/lib/custo-unitario";

export const Route = createFileRoute("/caixas/economia")({
  component: Page,
  head: () => ({ meta: [{ title: "Custo & Perda · Campo Alegre" }] }),
});

const TIPO_LABEL: Record<"G" | "I" | "P", string> = { G: "Grande", I: "Isopor", P: "Plástica" };

function Page() {
  const { user } = useAuth();
  const { data: perdas = [], isLoading } = usePerdaClientes();
  const { data: saldoRows = [] } = useSaldoCaixas();
  const { data: tipos = [], isLoading: loadingTipos } = useTiposCaixa();
  const updateTipo = useUpdateTipoCaixa();
  const cobrar = useCobrarCaixa();
  const [draftCustos, setDraftCustos] = useState<Record<string, string>>({});
  const [cobrandoId, setCobrandoId] = useState<string | null>(null);
  const [cobradoIds, setCobradoIds] = useState<Set<string>>(new Set());

  const custoById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tipos) {
      m[t.id] = draftCustos[t.id] !== undefined ? parseFloat(draftCustos[t.id]) || 0 : t.custo_unitario;
    }
    return m;
  }, [tipos, draftCustos]);

  const custoMedio = ((custoById.G ?? 0) + (custoById.I ?? 0) + (custoById.P ?? 0)) / 3;

  const piorTipoByCliente = useMemo(() => {
    const map = new Map<string, { tipo: "G" | "I" | "P"; perdidas: number }>();
    for (const r of saldoRows) {
      if (!r.cliente_id || !r.tipo_caixa) continue;
      const t = r.tipo_caixa as "G" | "I" | "P";
      const p = Number(r.perdidas ?? 0);
      const cur = map.get(r.cliente_id);
      if (!cur || p > cur.perdidas) map.set(r.cliente_id, { tipo: t, perdidas: p });
    }
    return map;
  }, [saldoRows]);

  const dados = useMemo(
    () =>
      perdas.map((c) => {
        const piorInfo = piorTipoByCliente.get(c.cliente_id);
        const tipoCx = piorInfo?.tipo ?? "P";
        const custo = custoById[tipoCx] ?? custoMedio;
        const perdidas = Number(c.perdidas ?? 0);
        return {
          cliente_id: c.cliente_id as string,
          cliente: c.cliente as string,
          enviadas: Number(c.enviadas ?? 0),
          perdidas,
          taxa: Number(c.taxa_perda ?? 0),
          pior: TIPO_LABEL[tipoCx],
          tipoCx,
          custoPerda: perdidas * custo,
          trend: [perdidas, perdidas, perdidas],
        };
      }),
    [perdas, piorTipoByCliente, custoById, custoMedio]
  );

  const perdaTotal = dados.reduce((a, c) => a + c.custoPerda, 0);
  const taxaMedia = dados.length ? dados.reduce((a, c) => a + c.taxa, 0) / dados.length : 0;
  const benchmark = 2.0;
  const economia = dados.reduce((a, c) => {
    if (c.taxa <= benchmark) return a;
    const excedente = ((c.taxa - benchmark) / 100) * c.enviadas;
    return a + excedente * custoMedio;
  }, 0);

  const pior = [...dados].sort((a, b) => b.custoPerda - a.custoPerda)[0];

  const handleCustoSave = async (tipo: TipoCaixa) => {
    const valor = parseCustoValor(tipo, draftCustos);
    if (valor === null) return;
    if (!shouldSaveCusto(tipo, valor)) {
      setDraftCustos((prev) => {
        const next = { ...prev };
        delete next[tipo.id];
        return next;
      });
      return;
    }
    try {
      await updateTipo.mutateAsync({ id: tipo.id, custo_unitario: valor });
      toast.success("Custo salvo");
      setDraftCustos((prev) => {
        const next = { ...prev };
        delete next[tipo.id];
        return next;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar custo");
    }
  };

  const handleCobrar = async (c: (typeof dados)[0]) => {
    if (!user?.id) {
      toast.error("Faça login para registrar cobrança.");
      return;
    }
    if (c.perdidas <= 0) {
      toast.info("Cliente sem perda registrada");
      return;
    }
    const custo = custoById[c.tipoCx] ?? custoMedio;
    setCobrandoId(c.cliente_id);
    try {
      await cobrar.mutateAsync({
        cliente_id: c.cliente_id,
        tipo_caixa: c.tipoCx,
        quantidade: Math.max(1, c.perdidas),
        custo_unitario: custo,
        created_by: user.id,
      });
      setCobradoIds((prev) => new Set(prev).add(c.cliente_id));
      toast.success(`Cobrança registrada · ${c.cliente}`, {
        description: `R$ ${(c.perdidas * custo).toFixed(2)} em caixas ${c.pior}.`,
      });
    } catch {
      toast.error("Não foi possível registrar a cobrança.");
    } finally {
      setCobrandoId(null);
    }
  };

  const handleExport = () => {
    exportToExcel(
      `perda-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Perda",
      dados.map((c) => ({
        Cliente: c.cliente,
        Enviadas: c.enviadas,
        Perdidas: c.perdidas,
        "Tipo dominante": c.pior,
        "Custo da perda": c.custoPerda,
        "Taxa %": c.taxa,
      }))
    );
  };

  if (isLoading || loadingTipos) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Carregando dados de perda...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Custo & Perda por Supermercado"
        subtitle="Quanto cada loja custa em caixa que não volta"
        actions={
          <>
            <div className="text-xs text-muted-foreground">
              Custo médio: <span className="font-bold text-navy">R$ {custoMedio.toFixed(2)}</span>
            </div>
            <button
              onClick={handleExport}
              disabled={!dados.length}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark disabled:opacity-50"
            >
              <FileSpreadsheet size={14} /> Exportar
            </button>
          </>
        }
      />

      <div className="card-base p-4 mb-5 flex flex-wrap items-center gap-4">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Custo unitário
        </span>
        {tipos.map((c) => {
          const display =
            draftCustos[c.id] !== undefined ? draftCustos[c.id] : String(c.custo_unitario);
          return (
            <div key={c.id} className="flex items-center gap-2">
              <span className="text-xs text-ink">{c.nome}</span>
              <div className="flex items-center">
                <span className="px-2 h-8 bg-secondary border border-r-0 border-border rounded-l text-[10px] font-semibold text-muted-foreground flex items-center">
                  R$
                </span>
                <input
                  type="number"
                  step="0.5"
                  value={display}
                  onChange={(e) =>
                    setDraftCustos((prev) => ({ ...prev, [c.id]: e.target.value }))
                  }
                  onBlur={() => handleCustoSave(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCustoSave(c);
                    }
                  }}
                  className="h-8 w-20 px-2 border border-border rounded-r text-xs font-bold text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <KpiCard
          label="Perda estimada"
          value={`R$ ${perdaTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          positiveIsGood={false}
        />
        <KpiCard
          label="Taxa de perda média"
          value={`${taxaMedia.toFixed(2)}%`}
          icon={TrendingDown}
          positiveIsGood={false}
        />
        <KpiCard
          label="Economia potencial"
          value={`R$ ${economia.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
          icon={PiggyBank}
          accent="var(--success)"
        />
      </div>

      {pior && (
        <div
          className="card-base p-5 mb-5 flex items-start gap-4 border-l-4"
          style={{ borderLeftColor: "var(--warning)" }}
        >
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(240,169,43,0.15)", color: "var(--warning)" }}
          >
            <Lightbulb size={20} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-navy">Onde está o dinheiro</div>
            <div className="text-sm text-ink mt-1">
              <strong>{pior.cliente}</strong> é o cliente que mais perde —{" "}
              <strong>R$ {pior.custoPerda.toFixed(0)}</strong> no tipo <strong>{pior.pior}</strong>.
              Levando a taxa de <strong>{pior.taxa}%</strong> para o benchmark de{" "}
              <strong>{benchmark}%</strong>, dá para economizar cerca de{" "}
              <strong style={{ color: "var(--success)" }}>
                R${" "}
                {(((pior.taxa - benchmark) / 100) * pior.enviadas * custoMedio).toLocaleString(
                  "pt-BR",
                  { maximumFractionDigits: 0 }
                )}
              </strong>
              .
            </div>
          </div>
        </div>
      )}

      <div className="card-base overflow-hidden">
        {dados.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado de perda.</p>
        ) : (
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
              {dados.map((c) => (
                <tr key={c.cliente_id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-semibold text-navy">{c.cliente}</td>
                  <td className="px-3 py-3 text-right text-ink">{c.enviadas}</td>
                  <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--danger)" }}>
                    {c.perdidas}
                  </td>
                  <td className="px-3 py-3">
                    <span className="chip chip-muted">{c.pior}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-navy">
                    R$ {c.custoPerda.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`chip ${c.taxa >= 5 ? "chip-danger" : c.taxa >= 3 ? "chip-warn" : "chip-ok"}`}
                    >
                      {c.taxa.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Sparkline
                      data={c.trend}
                      color={c.taxa >= 5 ? "var(--danger)" : "var(--warning)"}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleCobrar(c)}
                      disabled={cobrandoId === c.cliente_id || cobradoIds.has(c.cliente_id)}
                      className="h-7 px-3 rounded-md bg-primary-soft text-primary-dark text-xs font-semibold hover:bg-primary hover:text-primary-foreground active:scale-95 transition disabled:opacity-50"
                    >
                      {cobrandoId === c.cliente_id
                        ? "Cobrando…"
                        : cobradoIds.has(c.cliente_id)
                          ? "Cobrado"
                          : "Cobrar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
