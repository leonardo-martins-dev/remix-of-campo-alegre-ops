import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parseCustoValor, shouldSaveCusto } from "@/lib/custo-unitario";
import { Box, RotateCcw, Clock, Users, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Donut, BarRow, Sparkline } from "@/components/charts";
import { useSaldoCaixas, useMovimentacoesCliente } from "@/hooks/use-caixas";
import { useTiposCaixa, useUpdateTipoCaixa, type TipoCaixa } from "@/hooks/use-tipos-caixa";
import { exportToExcel } from "@/lib/excel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/caixas/saldo")({
  component: Page,
  head: () => ({ meta: [{ title: "Saldo por Cliente · Campo Alegre" }] }),
});

type TipoFiltro = "ALL" | "G" | "I" | "P";

type ClienteSaldo = {
  cliente_id: string;
  cliente: string;
  G: { env: number; ret: number; saldo: number };
  I: { env: number; ret: number; saldo: number };
  P: { env: number; ret: number; saldo: number };
};

function pivotSaldo(
  rows: {
    cliente_id: string;
    cliente: string;
    tipo_caixa: string | null;
    enviadas: number;
    retornadas: number;
    saldo: number;
  }[]
): ClienteSaldo[] {
  const map = new Map<string, ClienteSaldo>();
  for (const r of rows) {
    if (!r.cliente_id || !r.tipo_caixa) continue;
    if (!map.has(r.cliente_id)) {
      map.set(r.cliente_id, {
        cliente_id: r.cliente_id,
        cliente: r.cliente,
        G: { env: 0, ret: 0, saldo: 0 },
        I: { env: 0, ret: 0, saldo: 0 },
        P: { env: 0, ret: 0, saldo: 0 },
      });
    }
    const c = map.get(r.cliente_id)!;
    const t = r.tipo_caixa as "G" | "I" | "P";
    if (t === "G" || t === "I" || t === "P") {
      c[t] = { env: r.enviadas ?? 0, ret: r.retornadas ?? 0, saldo: r.saldo ?? 0 };
    }
  }
  return [...map.values()].sort((a, b) => a.cliente.localeCompare(b.cliente));
}

function Page() {
  const { data: saldoRows = [], isLoading } = useSaldoCaixas();
  const { data: tipos = [], isLoading: loadingTipos } = useTiposCaixa();
  const updateTipo = useUpdateTipoCaixa();
  const [filtro, setFiltro] = useState<TipoFiltro>("ALL");
  const [draftCustos, setDraftCustos] = useState<Record<string, string>>({});
  const [extratoId, setExtratoId] = useState<string | null>(null);
  const [extratoNome, setExtratoNome] = useState("");

  const clientes = useMemo(() => pivotSaldo(saldoRows), [saldoRows]);
  const { data: movimentacoes = [], isLoading: loadingExtrato } = useMovimentacoesCliente(extratoId);

  const custoById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tipos) {
      m[t.id] = draftCustos[t.id] !== undefined ? parseFloat(draftCustos[t.id]) || 0 : t.custo_unitario;
    }
    return m;
  }, [tipos, draftCustos]);

  const cG = custoById.G ?? 0;
  const cI = custoById.I ?? 0;
  const cP = custoById.P ?? 0;

  const totais = useMemo(() => {
    let aG = 0,
      aI = 0,
      aP = 0;
    clientes.forEach((c) => {
      aG += c.G.saldo;
      aI += c.I.saldo;
      aP += c.P.saldo;
    });
    return { aG, aI, aP, capital: aG * cG + aI * cI + aP * cP, total: aG + aI + aP };
  }, [clientes, cG, cI, cP]);

  const taxaRetorno = useMemo(() => {
    const env = clientes.reduce((a, c) => a + c.G.env + c.I.env + c.P.env, 0);
    const ret = clientes.reduce((a, c) => a + c.G.ret + c.I.ret + c.P.ret, 0);
    return env ? (ret / env) * 100 : 0;
  }, [clientes]);

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

  const handleExport = () => {
    exportToExcel(
      `saldo-caixas-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Saldo",
      clientes.map((c) => ({
        Cliente: c.cliente,
        "Grande env": c.G.env,
        "Grande ret": c.G.ret,
        "Grande saldo": c.G.saldo,
        "Isopor env": c.I.env,
        "Isopor ret": c.I.ret,
        "Isopor saldo": c.I.saldo,
        "Plástica env": c.P.env,
        "Plástica ret": c.P.ret,
        "Plástica saldo": c.P.saldo,
        "Saldo total": c.G.saldo + c.I.saldo + c.P.saldo,
        "R$ em aberto":
          c.G.saldo * cG + c.I.saldo * cI + c.P.saldo * cP,
      }))
    );
  };

  if (isLoading || loadingTipos) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Carregando saldos...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Saldo de Caixas por Cliente"
        subtitle="Vai-e-volta de caixas plásticas, isopor e grande"
        actions={
          <button
            onClick={handleExport}
            disabled={!clientes.length}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> Exportar
          </button>
        }
      />

      <div className="card-base p-5 mb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-navy">Custo unitário das caixas</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Edite e saia do campo para salvar no banco
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {tipos.map((c) => {
              const display =
                draftCustos[c.id] !== undefined ? draftCustos[c.id] : String(c.custo_unitario);
              return (
                <div key={c.id}>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {c.nome}
                  </label>
                  <div className="flex items-center mt-1">
                    <span className="px-2.5 h-9 bg-secondary border border-r-0 border-border rounded-l-md text-xs font-semibold text-muted-foreground flex items-center">
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
                      className="h-9 w-24 px-2 border border-border rounded-r-md text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Total em aberto" value={totais.total.toString()} icon={Box} positiveIsGood={false} />
        <KpiCard label="Taxa de retorno" value={`${taxaRetorno.toFixed(1)}%`} icon={RotateCcw} />
        <KpiCard label="Clientes com saldo" value={clientes.length.toString()} icon={Users} />
        <KpiCard
          label="Capital na rua"
          value={`R$ ${totais.capital.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
          icon={Clock}
          positiveIsGood={false}
        />
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
              center={{
                label: "R$ na rua",
                value: `${Math.round(totais.capital / 1000)}k`,
              }}
            />
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <Row
              color="var(--primary-dark)"
              label="Grande"
              value={`${totais.aG} · R$ ${(totais.aG * cG).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
            />
            <Row
              color="var(--info)"
              label="Isopor"
              value={`${totais.aI} · R$ ${(totais.aI * cI).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
            />
            <Row
              color="var(--brand-green)"
              label="Plástica"
              value={`${totais.aP} · R$ ${(totais.aP * cP).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
            />
          </div>
        </div>

        <div className="card-base p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-navy mb-4">Resumo por tipo</h3>
          <div className="space-y-4">
            <BarRow label="Grande" value={totais.aG} max={Math.max(1, totais.total)} color="var(--primary-dark)" suffix=" cx" />
            <BarRow label="Isopor" value={totais.aI} max={Math.max(1, totais.total)} color="var(--info)" suffix=" cx" />
            <BarRow label="Plástica" value={totais.aP} max={Math.max(1, totais.total)} color="var(--brand-green)" suffix=" cx" />
          </div>
        </div>
      </div>

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
        {clientes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum saldo registrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Cliente</th>
                {(filtro === "ALL" || filtro === "G") && (
                  <th className="text-right px-3 py-3">
                    Grande
                    <br />
                    <span className="font-normal normal-case">env / ret</span>
                  </th>
                )}
                {(filtro === "ALL" || filtro === "I") && (
                  <th className="text-right px-3 py-3">
                    Isopor
                    <br />
                    <span className="font-normal normal-case">env / ret</span>
                  </th>
                )}
                {(filtro === "ALL" || filtro === "P") && (
                  <th className="text-right px-3 py-3">
                    Plástica
                    <br />
                    <span className="font-normal normal-case">env / ret</span>
                  </th>
                )}
                <th className="text-right px-3 py-3">Saldo</th>
                <th className="text-right px-3 py-3">R$ em aberto</th>
                <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const saldo =
                  filtro === "ALL"
                    ? c.G.saldo + c.I.saldo + c.P.saldo
                    : filtro === "G"
                      ? c.G.saldo
                      : filtro === "I"
                        ? c.I.saldo
                        : c.P.saldo;
                const valor =
                  filtro === "ALL"
                    ? c.G.saldo * cG + c.I.saldo * cI + c.P.saldo * cP
                    : filtro === "G"
                      ? c.G.saldo * cG
                      : filtro === "I"
                        ? c.I.saldo * cI
                        : c.P.saldo * cP;
                const trend = [c.G.saldo, c.I.saldo, c.P.saldo];
                return (
                  <tr key={c.cliente_id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3 font-semibold text-navy">{c.cliente}</td>
                    {(filtro === "ALL" || filtro === "G") && (
                      <td className="px-3 py-3 text-right text-ink">
                        {c.G.env}/{c.G.ret}
                      </td>
                    )}
                    {(filtro === "ALL" || filtro === "I") && (
                      <td className="px-3 py-3 text-right text-ink">
                        {c.I.env}/{c.I.ret}
                      </td>
                    )}
                    {(filtro === "ALL" || filtro === "P") && (
                      <td className="px-3 py-3 text-right text-ink">
                        {c.P.env}/{c.P.ret}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right font-bold text-navy">{saldo}</td>
                    <td
                      className="px-3 py-3 text-right font-bold"
                      style={{ color: "var(--danger)" }}
                    >
                      R$ {valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Sparkline data={trend} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setExtratoId(c.cliente_id);
                          setExtratoNome(c.cliente);
                        }}
                        className="text-xs text-primary-dark font-semibold hover:underline"
                      >
                        Extrato
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!extratoId} onOpenChange={(open) => !open && setExtratoId(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extrato · {extratoNome}</DialogTitle>
          </DialogHeader>
          {loadingExtrato ? (
            <p className="text-sm text-muted-foreground py-4">Carregando movimentações...</p>
          ) : movimentacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Sem movimentações recentes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-2">Data</th>
                  <th className="text-left py-2">Tipo</th>
                  <th className="text-center py-2">Cx</th>
                  <th className="text-right py-2">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {movimentacoes.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-2 text-muted-foreground">{m.data_movimento}</td>
                    <td className="py-2 capitalize">{m.tipo}</td>
                    <td className="py-2 text-center font-semibold">{m.tipo_caixa}</td>
                    <td className="py-2 text-right font-bold">{m.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
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
