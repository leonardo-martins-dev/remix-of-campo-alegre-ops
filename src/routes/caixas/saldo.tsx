import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parseCustoValor, shouldSaveCusto } from "@/lib/custo-unitario";
import { Box, RotateCcw, Clock, Users, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Donut, BarRow, Sparkline } from "@/components/charts";
import { useSaldoCaixas, useMovimentacoesCliente, useCobrarCaixa } from "@/hooks/use-caixas";
import { useSaldosCaixa } from "@/hooks/use-ledger";
import { useTiposCaixa, useUpdateTipoCaixa, type TipoCaixa } from "@/hooks/use-tipos-caixa";
import { exportToExcel } from "@/lib/excel";
import { tipoColor, computeFifoAging } from "@/lib/caixas-map";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/caixas/saldo")({
  component: Page,
  head: () => ({ meta: [{ title: "Saldo por parceiro · Campo Alegre" }] }),
});

type Qty = { env: number; ret: number; saldo: number };
type ClienteSaldo = {
  cliente_id: string;
  cliente: string;
  byTipo: Record<string, Qty>;
};

function emptyQty(): Qty {
  return { env: 0, ret: 0, saldo: 0 };
}

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
      map.set(r.cliente_id, { cliente_id: r.cliente_id, cliente: r.cliente, byTipo: {} });
    }
    const c = map.get(r.cliente_id)!;
    c.byTipo[r.tipo_caixa] = { env: r.enviadas ?? 0, ret: r.retornadas ?? 0, saldo: r.saldo ?? 0 };
  }
  return [...map.values()].sort((a, b) => a.cliente.localeCompare(b.cliente));
}

function qtyOf(c: ClienteSaldo, sigla: string): Qty {
  return c.byTipo[sigla] ?? emptyQty();
}

function Page() {
  const { user } = useAuth();
  const { data: saldoRows = [], isLoading } = useSaldoCaixas();
  const { data: tipos = [], isLoading: loadingTipos } = useTiposCaixa();
  const { data: saldosAll = [] } = useSaldosCaixa();
  const updateTipo = useUpdateTipoCaixa();
  const cobrar = useCobrarCaixa();
  const [aba, setAba] = useState<"cliente" | "fornecedor" | "galpao">("cliente");
  const [filtro, setFiltro] = useState<string>("ALL");
  const [draftCustos, setDraftCustos] = useState<Record<string, string>>({});
  const [extratoId, setExtratoId] = useState<string | null>(null);
  const [extratoNome, setExtratoNome] = useState("");

  const clientes = useMemo(() => pivotSaldo(saldoRows), [saldoRows]);
  const { data: movimentacoes = [], isLoading: loadingExtrato } = useMovimentacoesCliente(extratoId);

  const { data: movsAging = [] } = useQuery({
    queryKey: ["mov-aging"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_caixa")
        .select("data_movimento, quantidade, tipo_caixa, tipo, natureza, cliente_id, fornecedor_id")
        .limit(3000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const aging = useMemo(() => computeFifoAging(movsAging), [movsAging]);
  const agingByCliente = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of aging) {
      if (a.partnerKind !== "cliente") continue;
      m.set(a.partnerId, Math.max(m.get(a.partnerId) ?? 0, a.oldestDays));
    }
    return m;
  }, [aging]);

  const custoById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tipos) {
      const val = draftCustos[t.id] !== undefined ? parseFloat(draftCustos[t.id]) || 0 : t.custo_unitario;
      m[t.id] = val;
      m[t.sigla] = val;
    }
    return m;
  }, [tipos, draftCustos]);

  const totais = useMemo(() => {
    const byTipo: Record<string, number> = {};
    let capital = 0;
    let total = 0;
    for (const t of tipos) {
      const s = clientes.reduce((a, c) => a + qtyOf(c, t.sigla).saldo, 0);
      byTipo[t.sigla] = s;
      capital += s * (custoById[t.sigla] ?? 0);
      total += s;
    }
    return { byTipo, capital, total };
  }, [clientes, tipos, custoById]);

  const taxaRetorno = useMemo(() => {
    const env = clientes.reduce((a, c) => a + Object.values(c.byTipo).reduce((b, q) => b + q.env, 0), 0);
    const ret = clientes.reduce((a, c) => a + Object.values(c.byTipo).reduce((b, q) => b + q.ret, 0), 0);
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
      clientes.map((c) => {
        const row: Record<string, string | number> = { Cliente: c.cliente };
        let saldo = 0;
        let valor = 0;
        for (const t of tipos) {
          const q = qtyOf(c, t.sigla);
          row[`${t.nome} env`] = q.env;
          row[`${t.nome} ret`] = q.ret;
          row[`${t.nome} saldo`] = q.saldo;
          saldo += q.saldo;
          valor += q.saldo * (custoById[t.sigla] ?? 0);
        }
        row["Saldo total"] = saldo;
        row["R$ em aberto"] = valor;
        row["Aging (dias)"] = agingByCliente.get(c.cliente_id) ?? 0;
        return row;
      })
    );
  };

  const handleCobrarFornecedor = async (refId: string, tipo: string, qtd: number) => {
    if (!user?.id || qtd <= 0) return;
    try {
      await cobrar.mutateAsync({
        cliente_id: null,
        fornecedor_id: refId,
        tipo_caixa: tipo,
        quantidade: qtd,
        custo_unitario: custoById[tipo] ?? 0,
        created_by: user.id,
      });
      toast.success("Cobrança registrada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cobrar");
    }
  };

  if (isLoading || loadingTipos) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Carregando saldos...</p>
      </div>
    );
  }

  const parceiros = (saldosAll as { posicao_tipo: string; tipo_caixa: string; saldo: number; enviadas: number; retornadas: number; ref_id: string }[])
    .filter((s) => s.posicao_tipo === aba);

  return (
    <div>
      <PageHeader
        title="Saldo por parceiro"
        subtitle="Clientes, fornecedores e galpão · aging FIFO"
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

      <div className="flex gap-2 mb-4">
        {(["cliente", "fornecedor", "galpao"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            className={`h-8 px-3 rounded-md text-xs font-semibold ${aba === k ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {k === "cliente" ? "Clientes" : k === "fornecedor" ? "Fornecedores" : "Galpão"}
          </button>
        ))}
      </div>

      {aba !== "cliente" && (
        <div className="card-base overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-right px-3 py-3">Env</th>
                <th className="text-right px-3 py-3">Ret</th>
                <th className="text-right px-3 py-3">Saldo</th>
                {aba === "fornecedor" && <th className="text-right px-4 py-3">Ação</th>}
              </tr>
            </thead>
            <tbody>
              {parceiros.map((s, i) => (
                <tr key={`${s.ref_id}-${s.tipo_caixa}-${i}`} className="border-t">
                  <td className="px-4 py-2 font-semibold">{s.tipo_caixa}</td>
                  <td className="px-3 py-2 text-right">{s.enviadas}</td>
                  <td className="px-3 py-2 text-right">{s.retornadas}</td>
                  <td className="px-3 py-2 text-right font-bold">{s.saldo}</td>
                  {aba === "fornecedor" && (
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary-dark hover:underline"
                        onClick={() => handleCobrarFornecedor(s.ref_id, s.tipo_caixa, Math.max(0, s.saldo))}
                      >
                        Cobrar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!parceiros.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Sem saldo nesta posição.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="card-base p-5 mb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-navy">Custo unitário das caixas</h3>
            <p className="text-xs text-muted-foreground mt-1">Edite e saia do campo para salvar no cadastro</p>
          </div>
          <div className="flex flex-wrap gap-4">
            {tipos.map((c) => {
              const display = draftCustos[c.id] !== undefined ? draftCustos[c.id] : String(c.custo_unitario);
              return (
                <div key={c.id}>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.nome}</label>
                  <div className="flex items-center mt-1">
                    <span className="px-2.5 h-9 bg-secondary border border-r-0 border-border rounded-l-md text-xs font-semibold text-muted-foreground flex items-center">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      value={display}
                      onChange={(e) => setDraftCustos((prev) => ({ ...prev, [c.id]: e.target.value }))}
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
              segments={tipos.map((t, i) => ({
                label: t.nome,
                value: totais.byTipo[t.sigla] ?? 0,
                color: tipoColor(i),
              }))}
              center={{
                label: "R$ na rua",
                value: `${Math.round(totais.capital / 1000)}k`,
              }}
            />
          </div>
          <div className="mt-4 space-y-2 text-sm">
            {tipos.map((t, i) => (
              <Row
                key={t.id}
                color={tipoColor(i)}
                label={t.nome}
                value={`${totais.byTipo[t.sigla] ?? 0} · R$ ${((totais.byTipo[t.sigla] ?? 0) * (custoById[t.sigla] ?? 0)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
              />
            ))}
          </div>
        </div>

        <div className="card-base p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-navy mb-4">Resumo por tipo</h3>
          <div className="space-y-4">
            {tipos.map((t, i) => (
              <BarRow
                key={t.id}
                label={t.nome}
                value={totais.byTipo[t.sigla] ?? 0}
                max={Math.max(1, totais.total)}
                color={tipoColor(i)}
                suffix=" cx"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-navy">Saldo por cliente</h3>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
            <button
              onClick={() => setFiltro("ALL")}
              className={`px-3 h-7 rounded-md text-xs font-semibold ${filtro === "ALL" ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-navy"}`}
            >
              Todos
            </button>
            {tipos.map((t) => (
              <button
                key={t.id}
                onClick={() => setFiltro(t.sigla)}
                className={`px-3 h-7 rounded-md text-xs font-semibold ${filtro === t.sigla ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-navy"}`}
              >
                {t.nome}
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
                {tipos.filter((t) => filtro === "ALL" || filtro === t.sigla).map((t) => (
                  <th key={t.id} className="text-right px-3 py-3">
                    {t.nome}
                    <br />
                    <span className="font-normal normal-case">env / ret</span>
                  </th>
                ))}
                <th className="text-right px-3 py-3">Saldo</th>
                <th className="text-right px-3 py-3">Aging</th>
                <th className="text-right px-3 py-3">R$ em aberto</th>
                <th className="text-right px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => {
                const visible = tipos.filter((t) => filtro === "ALL" || filtro === t.sigla);
                const saldo = visible.reduce((a, t) => a + qtyOf(c, t.sigla).saldo, 0);
                const valor = visible.reduce((a, t) => a + qtyOf(c, t.sigla).saldo * (custoById[t.sigla] ?? 0), 0);
                const trend = tipos.map((t) => qtyOf(c, t.sigla).saldo);
                const days = agingByCliente.get(c.cliente_id) ?? 0;
                return (
                  <tr key={c.cliente_id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3 font-semibold text-navy">{c.cliente}</td>
                    {visible.map((t) => {
                      const q = qtyOf(c, t.sigla);
                      return (
                        <td key={t.id} className="px-3 py-3 text-right text-ink">
                          {q.env}/{q.ret}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right font-bold text-navy">{saldo}</td>
                    <td className="px-3 py-3 text-right" style={{ color: days >= 7 ? "var(--danger)" : "var(--muted-foreground)" }}>
                      {days ? `${days}d` : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-bold" style={{ color: "var(--danger)" }}>
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
