import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Box, Clock, Minus, Plus, Smartphone, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/components/number-stepper";
import { KpiCard } from "@/components/kpi-card";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useSaldosCaixa, usePosicoes } from "@/hooks/use-ledger";
import { useClientes, useFornecedores } from "@/hooks/use-cadastros";
import {
  useConciliarInventario,
  useContagensCaixa,
  useMotivosAjuste,
  useRegistrarInventario,
} from "@/hooks/use-inventario";
import {
  usePosicoesPendentes,
  useFornecedoresAbaixoMinimo,
  useDivergenciasPendentes,
  useTotalGeralCaixas,
  useMinimosEstoque,
  useSaveMinimoEstoque,
} from "@/hooks/use-minimo-estoque";
import { one } from "@/lib/embed";
import { formatDateBRT } from "@/lib/utils-date";
import { formatBRL } from "@/lib/format";
import { statusLabel } from "@/lib/labels";

type Search = { posicao?: string };

export const Route = createFileRoute("/caixas/inventario")({
  component: Page,
  validateSearch: (s: Record<string, unknown>): Search => ({
    posicao: typeof s.posicao === "string" ? s.posicao : undefined,
  }),
  head: () => ({ meta: [{ title: "Inventário de caixas · Campo Alegre" }] }),
});

function posicaoLabel(
  p: { id: string; tipo: string; ref_id: string | null },
  clientes: { id: string; nome: string }[],
  fornecedores: { id: string; nome: string }[]
) {
  if (p.tipo === "galpao") return "Galpão";
  if (p.tipo === "cliente") return `Loja · ${clientes.find((c) => c.id === p.ref_id)?.nome ?? p.ref_id}`;
  return `Fornecedor · ${fornecedores.find((f) => f.id === p.ref_id)?.nome ?? p.ref_id}`;
}

function Page() {
  const { posicao } = Route.useSearch();
  const { profile, isAdmin } = useAuth();
  const [view, setView] = useState<"visao_geral" | "painel" | "campo">(
    profile?.motorista_id ? "campo" : "visao_geral"
  );

  return (
    <div>
      <PageHeader
        title="Inventário de caixas"
        subtitle="Contagem nas 3 posições — divergência esperado × contado"
        actions={
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setView("visao_geral")}
              className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "visao_geral" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Visão geral
            </button>
            <button
              type="button"
              onClick={() => setView("painel")}
              className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "painel" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Contagem
            </button>
            <button
              type="button"
              onClick={() => setView("campo")}
              className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "campo" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Modo campo
            </button>
          </div>
        }
      />
      {view === "visao_geral" ? (
        <VisaoGeralInventario />
      ) : view === "campo" ? (
        <CampoInventario initialTipo={posicao} />
      ) : (
        <PainelInventario initialTipo={posicao} />
      )}
    </div>
  );
}

function VisaoGeralInventario() {
  const { isAdmin } = useAuth();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: totais = [] } = useTotalGeralCaixas();
  const { data: pendentes = [] } = usePosicoesPendentes();
  const { data: abaixoMinimo = [] } = useFornecedoresAbaixoMinimo();
  const { data: divergencias = [] } = useDivergenciasPendentes();
  const { data: saldos = [] } = useSaldosCaixa();
  const { data: fornecedores = [] } = useFornecedores();
  const { data: clientes = [] } = useClientes();

  const saldoPorPosicaoTipo = useMemo(() => {
    const result: Record<string, Record<string, number>> = {
      galpao: {},
      fornecedor: {},
      cliente: {},
    };
    for (const s of saldos as { posicao_tipo: string; tipo_caixa: string; saldo: number }[]) {
      if (!s.tipo_caixa) continue;
      const tipo = s.posicao_tipo;
      if (!result[tipo]) result[tipo] = {};
      result[tipo][s.tipo_caixa] = (result[tipo][s.tipo_caixa] ?? 0) + (s.saldo ?? 0);
    }
    return result;
  }, [saldos]);

  const totalGeral = useMemo(() => {
    let qty = 0;
    let valor = 0;
    for (const t of totais) {
      qty += t.saldo_total;
      valor += t.valor_total;
    }
    return { qty, valor };
  }, [totais]);

  const totalValorFaltando = useMemo(() => {
    return abaixoMinimo.reduce((a, b) => a + b.valor_faltando, 0);
  }, [abaixoMinimo]);

  const posicoesPorTipo = useMemo(() => {
    const m: Record<string, typeof pendentes> = { galpao: [], fornecedor: [], cliente: [] };
    for (const p of pendentes) {
      if (m[p.posicao_tipo]) m[p.posicao_tipo].push(p);
    }
    return m;
  }, [pendentes]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total geral de caixas"
          value={totalGeral.qty.toString()}
          icon={Box}
        />
        <KpiCard
          label="Valor total"
          value={formatBRL(totalGeral.valor)}
          icon={Warehouse}
        />
        <KpiCard
          label="Posições pendentes"
          value={pendentes.length.toString()}
          icon={Clock}
          positiveIsGood={false}
        />
        <KpiCard
          label="Fornec. abaixo do mínimo"
          value={abaixoMinimo.length.toString()}
          icon={AlertTriangle}
          positiveIsGood={false}
        />
      </div>

      {/* Alertas pendentes */}
      {isAdmin && (pendentes.length > 0 || abaixoMinimo.length > 0 || divergencias.length > 0) && (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 space-y-3">
          <h3 className="font-semibold text-danger flex items-center gap-2">
            <AlertTriangle size={18} /> Alertas do ADM
          </h3>
          {pendentes.length > 0 && (
            <div className="text-sm">
              <p className="font-medium mb-1">
                {pendentes.length} posição(ões) sem contagem há mais de 7 dias:
              </p>
              <ul className="list-disc list-inside text-muted-foreground">
                {pendentes.slice(0, 5).map((p) => (
                  <li key={p.posicao_id}>
                    {p.posicao_nome} — {p.dias_desde_contagem} dias
                  </li>
                ))}
                {pendentes.length > 5 && <li>e mais {pendentes.length - 5}...</li>}
              </ul>
            </div>
          )}
          {abaixoMinimo.length > 0 && (
            <div className="text-sm">
              <p className="font-medium mb-1">
                {abaixoMinimo.length} fornecedor(es) abaixo do estoque mínimo:
              </p>
              <ul className="list-disc list-inside text-muted-foreground">
                {abaixoMinimo.slice(0, 5).map((f, i) => (
                  <li key={`${f.fornecedor_id}-${f.tipo_caixa}-${i}`}>
                    {f.fornecedor_nome} — {f.tipo_caixa}: faltam {f.faltando} cx (R$ {f.valor_faltando.toFixed(0)})
                  </li>
                ))}
                {abaixoMinimo.length > 5 && <li>e mais {abaixoMinimo.length - 5}...</li>}
              </ul>
            </div>
          )}
          {divergencias.length > 0 && (
            <div className="text-sm">
              <p className="font-medium mb-1">
                {divergencias.length} divergência(s) pendente(s) de conciliação:
              </p>
              <ul className="list-disc list-inside text-muted-foreground">
                {divergencias.slice(0, 5).map((d) => (
                  <li key={d.contagem_id}>
                    {d.posicao_nome} — {d.tipo_caixa}: {d.qtd_contada} contado vs {d.qtd_calculada} esperado ({d.diferenca > 0 ? "+" : ""}{d.diferenca})
                  </li>
                ))}
                {divergencias.length > 5 && <li>e mais {divergencias.length - 5}...</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Total por tipo de caixa */}
      <div className="card-base p-5">
        <h3 className="font-semibold text-navy mb-4">Total geral por tipo de caixa</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left py-2 px-3">Tipo</th>
                <th className="text-right py-2 px-3">Galpão</th>
                <th className="text-right py-2 px-3">Fornecedores</th>
                <th className="text-right py-2 px-3">Clientes</th>
                <th className="text-right py-2 px-3 font-bold">Total</th>
                <th className="text-right py-2 px-3">Valor</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => {
                const galpao = saldoPorPosicaoTipo.galpao[t.sigla] ?? 0;
                const forn = saldoPorPosicaoTipo.fornecedor[t.sigla] ?? 0;
                const cli = saldoPorPosicaoTipo.cliente[t.sigla] ?? 0;
                const total = galpao + forn + cli;
                const valor = total * t.custo_unitario;
                return (
                  <tr key={t.id} className="border-t">
                    <td className="py-2 px-3 font-medium">{t.nome} ({t.sigla})</td>
                    <td className="py-2 px-3 text-right">{galpao}</td>
                    <td className="py-2 px-3 text-right">{forn}</td>
                    <td className="py-2 px-3 text-right">{cli}</td>
                    <td className="py-2 px-3 text-right font-bold">{total}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{formatBRL(valor)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-secondary/30">
              <tr>
                <td className="py-2 px-3 font-bold">Total</td>
                <td className="py-2 px-3 text-right font-bold">
                  {Object.values(saldoPorPosicaoTipo.galpao).reduce((a, b) => a + b, 0)}
                </td>
                <td className="py-2 px-3 text-right font-bold">
                  {Object.values(saldoPorPosicaoTipo.fornecedor).reduce((a, b) => a + b, 0)}
                </td>
                <td className="py-2 px-3 text-right font-bold">
                  {Object.values(saldoPorPosicaoTipo.cliente).reduce((a, b) => a + b, 0)}
                </td>
                <td className="py-2 px-3 text-right font-bold">{totalGeral.qty}</td>
                <td className="py-2 px-3 text-right font-bold">{formatBRL(totalGeral.valor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Posições pendentes por tipo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(["galpao", "fornecedor", "cliente"] as const).map((tipo) => {
          const items = posicoesPorTipo[tipo] ?? [];
          const label = tipo === "galpao" ? "Galpão" : tipo === "fornecedor" ? "Fornecedores" : "Clientes";
          return (
            <div key={tipo} className="card-base p-4">
              <h4 className="font-semibold text-sm mb-3">{label} — contagem</h4>
              {items.length === 0 ? (
                <p className="text-xs text-success">Todas as posições em dia ✓</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {items.map((p) => (
                    <li key={p.posicao_id} className="flex justify-between items-center">
                      <span className="truncate">{p.posicao_nome}</span>
                      <span className="text-danger text-xs font-medium">
                        {p.dias_desde_contagem === 999 ? "nunca" : `${p.dias_desde_contagem}d`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Fornecedores abaixo do mínimo */}
      {abaixoMinimo.length > 0 && (
        <div className="card-base p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning" />
            Fornecedores abaixo do estoque mínimo
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-2 px-3">Fornecedor</th>
                  <th className="text-center py-2 px-3">Tipo</th>
                  <th className="text-right py-2 px-3">Mínimo</th>
                  <th className="text-right py-2 px-3">Atual</th>
                  <th className="text-right py-2 px-3">Faltam</th>
                  <th className="text-right py-2 px-3">Valor</th>
                </tr>
              </thead>
              <tbody>
                {abaixoMinimo.map((f, i) => (
                  <tr key={`${f.fornecedor_id}-${f.tipo_caixa}-${i}`} className="border-t">
                    <td className="py-2 px-3 font-medium">{f.fornecedor_nome}</td>
                    <td className="py-2 px-3 text-center font-semibold">{f.tipo_caixa}</td>
                    <td className="py-2 px-3 text-right">{f.qtd_minima}</td>
                    <td className="py-2 px-3 text-right text-danger font-bold">{f.saldo_atual}</td>
                    <td className="py-2 px-3 text-right text-danger font-bold">{f.faltando}</td>
                    <td className="py-2 px-3 text-right">{formatBRL(f.valor_faltando)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-secondary/30">
                <tr>
                  <td colSpan={5} className="py-2 px-3 text-right font-bold">Total faltando:</td>
                  <td className="py-2 px-3 text-right font-bold text-danger">
                    {formatBRL(totalValorFaltando)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Configurar estoque mínimo - apenas ADM */}
      {isAdmin && <ConfigurarMinimoEstoque />}
    </div>
  );
}

function ConfigurarMinimoEstoque() {
  const { data: fornecedores = [] } = useFornecedores();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: minimos = [] } = useMinimosEstoque();
  const saveMinimo = useSaveMinimoEstoque();
  const [fornId, setFornId] = useState("");
  const [tipoSel, setTipoSel] = useState("");
  const [qtd, setQtd] = useState(0);

  async function handleSave() {
    if (!fornId || !tipoSel) {
      toast.error("Selecione fornecedor e tipo");
      return;
    }
    try {
      await saveMinimo.mutateAsync({
        fornecedor_id: fornId,
        tipo_caixa: tipoSel,
        qtd_minima: qtd,
      });
      toast.success("Mínimo salvo");
      setQtd(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  return (
    <div className="card-base p-4">
      <h3 className="font-semibold text-sm mb-3">Configurar estoque mínimo por fornecedor</h3>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs">Fornecedor</Label>
          <select
            className="h-10 w-full rounded-md border px-2 mt-1"
            value={fornId}
            onChange={(e) => setFornId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <Label className="text-xs">Tipo de caixa</Label>
          <select
            className="h-10 w-full rounded-md border px-2 mt-1"
            value={tipoSel}
            onChange={(e) => setTipoSel(e.target.value)}
          >
            <option value="">Tipo…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.sigla}>{t.sigla}</option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <Label className="text-xs">Mínimo</Label>
          <Input
            type="number"
            min={0}
            value={qtd}
            onChange={(e) => setQtd(parseInt(e.target.value) || 0)}
            className="mt-1"
          />
        </div>
        <Button onClick={handleSave} disabled={saveMinimo.isPending} className="h-10">
          Salvar
        </Button>
      </div>
      {minimos.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Mínimos configurados:</p>
          <div className="flex flex-wrap gap-2">
            {minimos.map((m) => {
              const forn = fornecedores.find((f) => f.id === m.fornecedor_id);
              return (
                <span key={m.id} className="px-2 py-1 bg-secondary rounded text-xs">
                  {forn?.nome ?? "?"} · {m.tipo_caixa} ≥ {m.qtd_minima}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function useInventarioState(initialTipo?: string) {
  const { user, profile, isAdmin } = useAuth();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: saldos = [] } = useSaldosCaixa();
  const { data: posicoes = [] } = usePosicoes();
  const { data: clientes = [] } = useClientes();
  const { data: fornecedores = [] } = useFornecedores();
  const { data: motivos = [] } = useMotivosAjuste();
  const registrar = useRegistrarInventario();
  const conciliar = useConciliarInventario();

  const allowedPosicoes = useMemo(() => {
    const list = (posicoes as { id: string; tipo: string; ref_id: string | null }[]).filter((p) => {
      if (p.tipo === "cliente") return clientes.some((c) => c.id === p.ref_id && c.ativo !== false);
      if (p.tipo === "fornecedor") return fornecedores.some((f) => f.id === p.ref_id && f.ativo !== false);
      return true;
    });
    if (isAdmin || profile?.role === "user") return list;
    if (profile?.fornecedor_id) return list.filter((p) => p.tipo === "fornecedor" && p.ref_id === profile.fornecedor_id);
    if (profile?.motorista_id) return list.filter((p) => p.tipo === "cliente");
    return list.filter((p) => p.tipo === "galpao");
  }, [posicoes, isAdmin, profile, clientes, fornecedores]);

  const [posicaoId, setPosicaoId] = useState("");
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [obs, setObs] = useState("");
  const [contrariaId, setContrariaId] = useState("");

  useEffect(() => {
    if (posicaoId || !allowedPosicoes.length) return;
    const wanted = initialTipo === "galpao"
      ? allowedPosicoes.find((p) => p.tipo === "galpao")
      : initialTipo
        ? allowedPosicoes.find((p) => p.id === initialTipo || p.tipo === initialTipo)
        : profile?.motorista_id
          ? allowedPosicoes.find((p) => p.tipo === "cliente")
          : allowedPosicoes.find((p) => p.tipo === "galpao");
    if (wanted) setPosicaoId(wanted.id);
  }, [allowedPosicoes, initialTipo, posicaoId, profile?.motorista_id]);

  const { data: fila = [] } = useContagensCaixa(isAdmin ? null : posicaoId || null);

  const calculado = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of saldos as { posicao_id: string; tipo_caixa: string; saldo: number }[]) {
      if (s.posicao_id === posicaoId && s.tipo_caixa) map[s.tipo_caixa] = Number(s.saldo ?? 0);
    }
    return map;
  }, [saldos, posicaoId]);

  const origem: "interna" | "motorista" | "fornecedor" = profile?.fornecedor_id
    ? "fornecedor"
    : profile?.motorista_id
      ? "motorista"
      : "interna";

  async function handleRegistrar() {
    if (!user || !posicaoId) {
      toast.error("Selecione a posição");
      return;
    }
    try {
      await registrar.mutateAsync({
        posicao_id: posicaoId,
        origem,
        contado_por: user.id,
        itens: tipos.map((t) => ({
          tipo_caixa: t.sigla,
          qtd_contada: Number(contagem[t.sigla] ?? 0),
          qtd_calculada: Number(calculado[t.sigla] ?? 0),
        })),
      });
      setSubmitted(true);
      toast.success("Contagem registrada — saldo não foi alterado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    }
  }

  return {
    tipos,
    clientes,
    fornecedores,
    motivos,
    allowedPosicoes,
    posicoes: posicoes as { id: string; tipo: string; ref_id: string | null }[],
    posicaoId,
    setPosicaoId,
    contagem,
    setContagem,
    submitted,
    motivoId,
    setMotivoId,
    obs,
    setObs,
    contrariaId,
    setContrariaId,
    fila,
    calculado,
    origem,
    handleRegistrar,
    registrar,
    conciliar,
    isAdmin,
  };
}

function PainelInventario({ initialTipo }: { initialTipo?: string }) {
  const s = useInventarioState(initialTipo);
  const motivoSel = s.motivos.find((m) => m.id === s.motivoId);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <Label>Posição</Label>
          <select
            className="h-10 w-full rounded-md border px-2"
            value={s.posicaoId}
            onChange={(e) => {
              s.setPosicaoId(e.target.value);
              s.setContagem({});
            }}
          >
            <option value="">Selecione…</option>
            {s.allowedPosicoes.map((p) => (
              <option key={p.id} value={p.id}>
                {posicaoLabel(p, s.clientes, s.fornecedores)}
              </option>
            ))}
          </select>
        </div>
        <p className="text-sm text-muted-foreground">
          Informe o que há no local, por tipo. O saldo esperado aparece após o registro.
        </p>
        {s.tipos.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3">
            <span className="font-medium">{t.nome} ({t.sigla})</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Esperado: {s.calculado[t.sigla] ?? 0}
              </span>
              <NumberStepper
                value={s.contagem[t.sigla] ?? 0}
                onChange={(n) => s.setContagem((prev) => ({ ...prev, [t.sigla]: n }))}
              />
            </div>
          </div>
        ))}
        <Button className="min-h-11 w-full" onClick={s.handleRegistrar} disabled={s.registrar.isPending || !s.posicaoId}>
          Registrar contagem
        </Button>
        {s.submitted && (
          <div className="text-sm space-y-1 p-3 bg-secondary/50 rounded-lg">
            <p className="font-medium mb-2">Divergência esperado × contado:</p>
            {s.tipos.map((t) => {
              const c = Number(s.contagem[t.sigla] ?? 0);
              const calc = Number(s.calculado[t.sigla] ?? 0);
              const diff = c - calc;
              return (
                <p key={t.id} className={diff !== 0 ? "text-danger" : ""}>
                  {t.sigla}: contado {c} · esperado {calc} · diferença{" "}
                  <span className="font-bold">{diff > 0 ? "+" : ""}{diff}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>
      <FilaConciliacao s={s} motivoSel={motivoSel} />
    </div>
  );
}

function CampoInventario({ initialTipo }: { initialTipo?: string }) {
  const s = useInventarioState(initialTipo);
  const pos = s.allowedPosicoes.find((p) => p.id === s.posicaoId);

  return (
    <div className="max-w-sm mx-auto">
      <div className="mx-auto" style={{ width: 340 }}>
        <div className="rounded-[36px] p-2 shadow-xl" style={{ background: "#0F1B2D" }}>
          <div className="rounded-[28px] overflow-hidden text-white p-5 space-y-4" style={{ background: "#16243A", minHeight: 640 }}>
            <div className="flex items-center gap-2">
              <Smartphone size={14} className="opacity-70" />
              <span className="text-xs uppercase tracking-wider opacity-60">
                {s.origem === "motorista" ? "Contagem na loja" : "Inventário"}
              </span>
            </div>
            <h2 className="text-2xl font-bold">Contar caixas</h2>
            <select
              className="w-full h-12 rounded-2xl px-3 text-sm text-navy"
              value={s.posicaoId}
              onChange={(e) => {
                s.setPosicaoId(e.target.value);
                s.setContagem({});
              }}
            >
              <option value="">Posição…</option>
              {s.allowedPosicoes.map((p) => (
                <option key={p.id} value={p.id}>{posicaoLabel(p, s.clientes, s.fornecedores)}</option>
              ))}
            </select>
            {s.tipos.map((t) => (
              <div key={t.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs uppercase tracking-wider opacity-60">{t.nome}</span>
                  <span className="text-xs opacity-50">Esperado: {s.calculado[t.sigla] ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    aria-label={`Diminuir ${t.nome}`}
                    onClick={() => s.setContagem((prev) => ({ ...prev, [t.sigla]: Math.max(0, (prev[t.sigla] ?? 0) - 1) }))}
                    className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center"
                  >
                    <Minus size={18} />
                  </button>
                  <span className="text-5xl font-bold tabular-nums">{s.contagem[t.sigla] ?? 0}</span>
                  <button
                    type="button"
                    aria-label={`Aumentar ${t.nome}`}
                    onClick={() => s.setContagem((prev) => ({ ...prev, [t.sigla]: (prev[t.sigla] ?? 0) + 1 }))}
                    className="h-12 w-12 rounded-2xl flex items-center justify-center"
                    style={{ background: "var(--primary)" }}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            ))}
            <Button className="min-h-12 w-full" onClick={s.handleRegistrar} disabled={s.registrar.isPending || !s.posicaoId}>
              Registrar {pos ? posicaoLabel(pos, s.clientes, s.fornecedores) : ""}
            </Button>
            {s.submitted && (
              <div className="text-xs opacity-70 space-y-1">
                <p>Contagem enviada. O admin concilia no painel.</p>
                {s.tipos.map((t) => {
                  const c = Number(s.contagem[t.sigla] ?? 0);
                  const calc = Number(s.calculado[t.sigla] ?? 0);
                  const diff = c - calc;
                  if (diff === 0) return null;
                  return (
                    <p key={t.id}>
                      {t.sigla}: {diff > 0 ? "+" : ""}{diff} divergência
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {s.isAdmin && (
        <div className="mt-6">
          <FilaConciliacao s={s} motivoSel={s.motivos.find((m) => m.id === s.motivoId)} />
        </div>
      )}
    </div>
  );
}

function FilaConciliacao({
  s,
  motivoSel,
}: {
  s: ReturnType<typeof useInventarioState>;
  motivoSel?: { exige_posicao_contraria: boolean };
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="font-semibold">Fila de conciliação</h3>
      {s.isAdmin && (
        <div className="space-y-2">
          <Label>Motivo do ajuste</Label>
          <select className="h-10 w-full rounded-md border px-2" value={s.motivoId} onChange={(e) => s.setMotivoId(e.target.value)}>
            <option value="">Selecione…</option>
            {s.motivos.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
          {motivoSel?.exige_posicao_contraria && (
            <select className="h-10 w-full rounded-md border px-2" value={s.contrariaId} onChange={(e) => s.setContrariaId(e.target.value)}>
              <option value="">Posição contrária…</option>
              {s.posicoes.map((p) => (
                <option key={p.id} value={p.id}>{posicaoLabel(p, s.clientes, s.fornecedores)}</option>
              ))}
            </select>
          )}
          <Input placeholder="Observação" value={s.obs} onChange={(e) => s.setObs(e.target.value)} />
        </div>
      )}
      {(s.fila as {
        id: string;
        data: string;
        status: string;
        origem: string;
        conciliado_em?: string | null;
        observacao?: string | null;
        posicoes_caixa: { tipo: string; ref_id: string | null } | { tipo: string; ref_id: string | null }[] | null;
        conciliador?: { nome?: string } | { nome?: string }[] | null;
        motivos_ajuste_caixa?: { nome?: string } | { nome?: string }[] | null;
        contagem_caixa_itens: { tipo_caixa: string; qtd_contada: number; qtd_calculada: number; diferenca: number }[];
      }[]).map((c) => {
        const pos = one(c.posicoes_caixa);
        const autor = one(c.conciliador);
        const motivo = one(c.motivos_ajuste_caixa);
        return (
          <div key={c.id} className="border-t border-border pt-2 text-sm">
            <div className="flex justify-between">
              <span>{c.data} · {statusLabel(pos?.tipo)} · {statusLabel(c.origem)}</span>
              <span className="chip">{statusLabel(c.status)}</span>
            </div>
            {c.contagem_caixa_itens?.map((it) => (
              <p key={it.tipo_caixa} className={it.diferenca !== 0 ? "text-danger" : ""}>
                {it.tipo_caixa}: contado {it.qtd_contada} vs esperado {it.qtd_calculada} ({it.diferenca > 0 ? "+" : ""}{it.diferenca})
              </p>
            ))}
            {(c.conciliado_em || motivo || autor) && (
              <p className="text-xs text-muted-foreground mt-1">
                {autor?.nome ?? "—"} · {c.conciliado_em ? formatDateBRT(c.conciliado_em) : "—"}
                {motivo?.nome ? ` · ${motivo.nome}` : ""}
                {c.observacao ? ` — ${c.observacao}` : ""}
              </p>
            )}
            {s.isAdmin && c.status === "pendente" && (
              <Button
                size="sm"
                className="mt-2"
                disabled={s.conciliar.isPending || !s.motivoId}
                onClick={() =>
                  s.conciliar.mutate(
                    {
                      contagemId: c.id,
                      motivoId: s.motivoId,
                      observacao: s.obs || undefined,
                      posicaoContrariaId: s.contrariaId || null,
                    },
                    {
                      onSuccess: () => toast.success("Inventário conciliado"),
                      onError: (e) => toast.error(e.message),
                    }
                  )
                }
              >
                Conciliar
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
