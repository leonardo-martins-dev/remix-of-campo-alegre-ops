import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  Building2,
  ChevronLeft,
  Clock,
  Minus,
  Plus,
  Search,
  Smartphone,
  Store,
  Truck,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { FluxoPassos } from "@/components/fluxo-passos";
import { TableWrapper } from "@/components/table-wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NumberStepper } from "@/components/number-stepper";
import { ConfirmarContagemDialog } from "@/components/confirmar-contagem-dialog";
import { ChipNaoInformado, ProgressoContagem } from "@/components/contagem-progresso";
import { KpiCard } from "@/components/kpi-card";
import { PendenciasInventarioSemanal } from "@/components/pendencias-inventario-semanal";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useSaldosCaixa, usePosicoes } from "@/hooks/use-ledger";
import { useClientes, useFornecedores } from "@/hooks/use-cadastros";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import {
  useConciliarInventario,
  useContagensCaixa,
  useMotivosAjuste,
  useRegistrarInventario,
} from "@/hooks/use-inventario";
import {
  usePosicoesPendentes,
  useFornecedoresAbaixoMinimo,
  useTotalGeralCaixas,
  useMinimosEstoque,
  useSaveMinimoEstoque,
  useDeleteMinimoEstoque,
} from "@/hooks/use-minimo-estoque";
import {
  ensurePosicao,
  TIPO_LABEL,
  useEntidadesMovimentacao,
  type Entidade,
  type PosicaoTipo,
} from "@/hooks/use-movimentacao";
import { useConfigValor } from "@/hooks/use-pedidos";
import { useContagemRascunho } from "@/hooks/use-contagem-rascunho";
import {
  buildConfirmacoes,
  countInformados,
  isInformado,
  loadRascunho,
  rascunhoCaixasKey,
  type ContagemValues,
  type Confirmacao,
} from "@/lib/contagem-rascunho";
import { one } from "@/lib/embed";
import { formatDateBRT } from "@/lib/utils-date";
import { formatBRL } from "@/lib/format";
import { statusLabel } from "@/lib/labels";

type SearchParams = { posicao?: string };

export const Route = createFileRoute("/caixas/inventario")({
  component: Page,
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    posicao: typeof s.posicao === "string" ? s.posicao : undefined,
  }),
  head: () => ({ meta: [{ title: "Inventário de caixas · Campo Alegre" }] }),
});

const TIPO_ICON: Record<PosicaoTipo, typeof Store> = {
  cliente: Store,
  fornecedor: Building2,
  galpao: Warehouse,
  motorista: Truck,
};

function posicaoLabel(
  p: { id: string; tipo: string; ref_id: string | null },
  clientes: { id: string; nome: string }[],
  fornecedores: { id: string; nome: string }[]
) {
  if (p.tipo === "galpao") return "Packing";
  if (p.tipo === "motorista") return "Motorista (em trânsito)";
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
              Contar
            </button>
            <button
              type="button"
              onClick={() => setView("campo")}
              className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "campo" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Campo
            </button>
          </div>
        }
      />
      <FluxoPassos
        steps={["Visão geral", "Contar", "Campo"]}
        current={view === "visao_geral" ? 1 : view === "painel" ? 2 : 3}
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
  const { data: saldos = [] } = useSaldosCaixa();

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
          label="Abaixo mínimo"
          value={String(abaixoMinimo.length)}
          icon={AlertTriangle}
          positiveIsGood={false}
        />
      </div>

      {/* NOP-158: pendência do inventário de embalagens junto com a de caixas */}
      <PendenciasInventarioSemanal origem="caixas" />

      {/* Total por tipo de caixa */}
      <div className="card-base p-5">
        <h3 className="font-semibold text-navy mb-4">Total geral por tipo de caixa</h3>
        <TableWrapper stickyFirstColumn>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                <th className="text-left py-2 px-3 whitespace-nowrap">Tipo</th>
                <th className="text-right py-2 px-3 whitespace-nowrap">Galpão</th>
                <th className="text-right py-2 px-3 whitespace-nowrap">Fornecedores</th>
                <th className="text-right py-2 px-3 whitespace-nowrap">Clientes</th>
                <th className="text-right py-2 px-3 font-bold whitespace-nowrap">Total</th>
                <th className="text-right py-2 px-3 whitespace-nowrap">Valor</th>
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
                    <td className="py-2 px-3 font-medium whitespace-nowrap">{t.nome} ({t.sigla})</td>
                    <td className="py-2 px-3 text-right">{galpao}</td>
                    <td className="py-2 px-3 text-right">{forn}</td>
                    <td className="py-2 px-3 text-right">{cli}</td>
                    <td className="py-2 px-3 text-right font-bold">{total}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground whitespace-nowrap">{formatBRL(valor)}</td>
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
                <td className="py-2 px-3 text-right font-bold whitespace-nowrap">{formatBRL(totalGeral.valor)}</td>
              </tr>
            </tfoot>
          </table>
        </TableWrapper>
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
                <ul className="space-y-2 text-sm">
                  {items.map((p) => (
                    <li key={p.posicao_id} className="space-y-0.5">
                      <div className="flex justify-between items-center gap-2">
                        <span className="truncate font-medium">{p.posicao_nome}</span>
                        <span className="text-danger text-xs font-medium shrink-0">
                          {p.nunca_contado || p.dias_desde_contagem === 999
                            ? "nunca"
                            : `${p.dias_desde_contagem}d`}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Prazo sexta {formatDateBRT(p.vencimento)}
                        {p.responsavel ? ` · ${p.responsavel}` : " · sem responsável"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Configurar estoque mínimo - apenas ADM */}
      {isAdmin && <ConfigurarMinimoEstoque />}
    </div>
  );
}

function ConfigurarMinimoEstoque() {
  const { data: fornecedoresAll = [] } = useFornecedores();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: minimos = [] } = useMinimosEstoque();
  const saveMinimo = useSaveMinimoEstoque();
  const deleteMinimo = useDeleteMinimoEstoque();
  const [fornId, setFornId] = useState("");
  const [tipoSel, setTipoSel] = useState("");
  const [qtd, setQtd] = useState(0);
  const [pendingDesativar, setPendingDesativar] = useState<{ id: string; label: string } | null>(null);

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
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-end">
        <div className="col-span-2 sm:flex-1 sm:min-w-[180px]">
          <Label className="text-xs">Fornecedor</Label>
          <div className="mt-1">
            <SeletorCadastro
              tipo="fornecedor"
              value={fornId || null}
              onChange={(id) => setFornId(id)}
            />
          </div>
        </div>
        <div className="col-span-2 sm:w-40">
          <Label className="text-xs">Tipo</Label>
          <div className="mt-1">
            <SeletorCadastro
              tipo="tipo_caixa"
              value={tipos.find((t) => t.sigla === tipoSel)?.id ?? null}
              onChange={(_id, item) => setTipoSel(item?.meta?.sigla ?? "")}
              placeholder="Tipo…"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Mínimo</Label>
          <Input
            type="number"
            min={0}
            value={qtd}
            onChange={(e) => setQtd(parseInt(e.target.value) || 0)}
            className="mt-1 h-10 w-full sm:w-24"
          />
        </div>
        <Button onClick={handleSave} disabled={saveMinimo.isPending} className="h-10 col-span-2 sm:col-span-1">
          Salvar
        </Button>
      </div>
      {minimos.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Mínimos configurados:</p>
          <div className="flex flex-wrap gap-2">
            {minimos.map((m) => {
              const forn = fornecedoresAll.find((f) => f.id === m.fornecedor_id);
              const label = `${forn?.nome ?? "?"} · ${m.tipo_caixa} ≥ ${m.qtd_minima}`;
              return (
                <span key={m.id} className="inline-flex items-center gap-2 px-2 py-1 bg-secondary rounded text-xs">
                  {label}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setPendingDesativar({ id: m.id, label })}
                  >
                    Desativar
                  </Button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={!!pendingDesativar} onOpenChange={(open) => !open && setPendingDesativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar este mínimo?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDesativar
                ? `${pendingDesativar.label} deixará de gerar alertas de estoque mínimo.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!pendingDesativar) return;
                deleteMinimo.mutate(pendingDesativar.id, {
                  onSuccess: () => {
                    toast.success("Mínimo desativado");
                    setPendingDesativar(null);
                  },
                  onError: (e) => toast.error(e.message),
                });
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const {
    data: entidadesData,
    isLoading: loadingEntidades,
    error: errorEntidades,
  } = useEntidadesMovimentacao();
  const registrar = useRegistrarInventario();
  const conciliar = useConciliarInventario();

  const tiposPermitidos = useMemo((): PosicaoTipo[] => {
    if (isAdmin || profile?.role === "user") return ["cliente", "fornecedor", "galpao"];
    if (profile?.fornecedor_id) return ["fornecedor"];
    if (profile?.motorista_id) return ["cliente"];
    return ["galpao"];
  }, [isAdmin, profile?.role, profile?.fornecedor_id, profile?.motorista_id]);

  const posicoesAtivas = useMemo(() => {
    return (posicoes as { id: string; tipo: string; ref_id: string | null }[]).filter((p) => {
      if (p.tipo === "cliente") return clientes.some((c) => c.id === p.ref_id && c.ativo !== false);
      if (p.tipo === "fornecedor") return fornecedores.some((f) => f.id === p.ref_id && f.ativo !== false);
      return true;
    });
  }, [posicoes, clientes, fornecedores]);

  const [tipoSel, setTipoSel] = useState<PosicaoTipo | null>(null);
  const [busca, setBusca] = useState("");
  const [posicaoId, setPosicaoId] = useState("");
  const [parceiroNome, setParceiroNome] = useState("");
  // NOP-322: a contagem carrega junto a posição a que pertence, para o rascunho
  // de uma posição nunca ser gravado por cima do de outra na troca de posição.
  const [contagemState, setContagemState] = useState<{ key: string | null; values: ContagemValues }>({
    key: null,
    values: {},
  });
  const [submitted, setSubmitted] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [obs, setObs] = useState("");
  const [contrariaId, setContrariaId] = useState("");
  const [picking, setPicking] = useState(false);
  const [confirmacoes, setConfirmacoes] = useState<Confirmacao[] | null>(null);

  const contagem = contagemState.values;
  const rascunhoKey = posicaoId ? rascunhoCaixasKey(posicaoId) : null;
  const { salvar: salvarRascunho, limpar: limparRascunho } = useContagemRascunho(rascunhoKey);
  const { data: tolerancia = 5 } = useConfigValor("diferenca_contagem_tolerada", 5);

  // Troca de posição: a contagem vem do rascunho salvo (sair e voltar não perde nada).
  useEffect(() => {
    setSubmitted(false);
    setConfirmacoes(null);
    if (!rascunhoKey) {
      setContagemState({ key: null, values: {} });
      return;
    }
    const salvo = loadRascunho(rascunhoKey);
    setContagemState((prev) =>
      prev.key === rascunhoKey ? prev : { key: rascunhoKey, values: salvo?.values ?? {} }
    );
  }, [rascunhoKey]);

  useEffect(() => {
    if (!rascunhoKey || contagemState.key !== rascunhoKey) return;
    salvarRascunho({ values: contagemState.values });
  }, [rascunhoKey, contagemState, salvarRascunho]);

  const atualizarContagem = (fn: (prev: ContagemValues) => ContagemValues) =>
    setContagemState((prev) => (prev.key ? { key: prev.key, values: fn(prev.values) } : prev));

  /** `null` apaga a chave — o tipo volta a ser "não informado" e sai do payload. */
  const setQtd = (sigla: string, n: number | null) =>
    atualizarContagem((prev) => {
      const next = { ...prev };
      if (n == null) delete next[sigla];
      else next[sigla] = n;
      return next;
    });

  const ajustarQtd = (sigla: string, delta: number) =>
    atualizarContagem((prev) => {
      const atual: number | undefined = prev[sigla];
      const next = { ...prev };
      if (atual === undefined) {
        if (delta <= 0) return prev; // − em "não informado" não faz nada
        next[sigla] = delta; // + parte do passo: zero só quando digitado
        return next;
      }
      const somado = atual + delta;
      if (somado < 0) delete next[sigla]; // − no zero volta para "não informado"
      else next[sigla] = somado;
      return next;
    });

  const pickTipo = async (tipo: PosicaoTipo) => {
    setTipoSel(tipo);
    setBusca("");
    if (tipo === "galpao") {
      setPicking(true);
      try {
        const id = await ensurePosicao("galpao", null);
        setPosicaoId(id);
        setParceiroNome("Packing House");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao abrir packing");
        setTipoSel(null);
        setPosicaoId("");
        setParceiroNome("");
      } finally {
        setPicking(false);
      }
    } else {
      setPosicaoId("");
      setParceiroNome("");
    }
  };

  const pickEntidade = async (ent: Entidade) => {
    setPicking(true);
    try {
      const id =
        ent.posicao_id ??
        (await ensurePosicao(ent.tipo, ent.tipo === "galpao" ? null : ent.id));
      setPosicaoId(id);
      setParceiroNome(ent.nome);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao selecionar");
    } finally {
      setPicking(false);
    }
  };

  const voltarSelecao = () => {
    // O rascunho fica salvo: voltar para a seleção não descarta a contagem.
    if (posicaoId && tipoSel && tipoSel !== "galpao") {
      setPosicaoId("");
      setParceiroNome("");
      return;
    }
    setTipoSel(null);
    setPosicaoId("");
    setParceiroNome("");
    setBusca("");
  };

  useEffect(() => {
    if (!initialTipo || tipoSel) return;
    if (
      (initialTipo === "galpao" || initialTipo === "cliente" || initialTipo === "fornecedor") &&
      tiposPermitidos.includes(initialTipo)
    ) {
      void pickTipo(initialTipo);
    }
  }, [initialTipo, tiposPermitidos, tipoSel]);

  const listaFiltrada = useMemo(() => {
    if (!tipoSel || tipoSel === "galpao" || !entidadesData) return [];
    let list =
      tipoSel === "cliente" ? entidadesData.clientes : entidadesData.fornecedores;
    if (profile?.fornecedor_id && tipoSel === "fornecedor") {
      list = list.filter((f) => f.id === profile.fornecedor_id);
    }
    if (!busca.trim()) return list;
    const q = busca.toLowerCase();
    return list.filter((e) => e.nome.toLowerCase().includes(q));
  }, [tipoSel, entidadesData, busca, profile?.fornecedor_id]);

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

  const siglas = useMemo(() => tipos.map((t) => t.sigla), [tipos]);
  const progresso = useMemo(() => countInformados(contagem, siglas), [contagem, siglas]);

  /** Só os tipos informados entram no fechamento — nada vai como 0 por omissão. */
  const itensInformados = () =>
    tipos
      .filter((t) => isInformado(contagem, t.sigla))
      .map((t) => ({
        tipo_caixa: t.sigla,
        qtd_contada: Number(contagem[t.sigla]),
        qtd_calculada: Number(calculado[t.sigla] ?? 0),
      }));

  async function registrarAgora() {
    if (!user || !posicaoId) {
      toast.error("Selecione a posição");
      return;
    }
    const itens = itensInformados();
    if (!itens.length) {
      toast.error("Informe ao menos um tipo antes de registrar");
      return;
    }
    try {
      await registrar.mutateAsync({
        posicao_id: posicaoId,
        origem,
        contado_por: user.id,
        itens,
      });
      setSubmitted(true);
      limparRascunho();
      toast.success("Contagem registrada — saldo não foi alterado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    }
  }

  /** Passa pela confirmação quando há zero em cima de saldo ou diferença grande. */
  function handleRegistrar() {
    if (!user || !posicaoId) {
      toast.error("Selecione a posição");
      return;
    }
    if (progresso.contados === 0) {
      toast.error("Informe ao menos um tipo antes de registrar");
      return;
    }
    const pendentes = buildConfirmacoes(
      tipos.map((t) => ({
        id: t.id,
        label: `${t.nome} (${t.sigla})`,
        informado: isInformado(contagem, t.sigla),
        qtd: isInformado(contagem, t.sigla) ? contagem[t.sigla] : null,
        esperado: Number(calculado[t.sigla] ?? 0),
      })),
      tolerancia
    );
    if (pendentes.length) {
      setConfirmacoes(pendentes);
      return;
    }
    void registrarAgora();
  }

  return {
    tipos,
    clientes,
    fornecedores,
    motivos,
    tiposPermitidos,
    tipoSel,
    busca,
    setBusca,
    posicaoId,
    parceiroNome,
    listaFiltrada,
    loadingEntidades,
    errorEntidades,
    clientesHojeIds: entidadesData?.clientesHojeIds ?? new Set<string>(),
    pickTipo,
    pickEntidade,
    voltarSelecao,
    picking,
    posicoes: posicoesAtivas,
    contagem,
    setQtd,
    ajustarQtd,
    progresso,
    confirmacoes,
    setConfirmacoes,
    registrarAgora,
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

function SeletorPosicao({ s }: { s: ReturnType<typeof useInventarioState> }) {
  if (!s.tipoSel) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-bold text-navy">Onde contar as caixas?</h2>
        <div className="grid grid-cols-3 gap-3">
          {s.tiposPermitidos.map((tipo) => {
            const Icon = TIPO_ICON[tipo];
            return (
              <button
                key={tipo}
                type="button"
                disabled={s.picking}
                onClick={() => void s.pickTipo(tipo)}
                className="flex flex-col items-center gap-2 rounded-2xl border-2 border-border bg-card p-4 hover:border-primary transition-colors disabled:opacity-50"
              >
                <Icon size={28} className="text-primary" />
                <span className="text-sm font-bold text-navy">{TIPO_LABEL[tipo]}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (s.tipoSel !== "galpao" && !s.posicaoId) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={s.voltarSelecao}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-navy"
        >
          <ChevronLeft size={14} /> Voltar
        </button>
        <h2 className="text-base font-bold text-navy">
          Selecione {s.tipoSel === "cliente" ? "a loja" : "o fornecedor"}
        </h2>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar..."
            value={s.busca}
            onChange={(e) => s.setBusca(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1 max-h-[40vh] overflow-y-auto rounded-xl border border-border bg-card">
          {s.loadingEntidades && (
            <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
          )}
          {s.errorEntidades && (
            <p className="p-4 text-sm text-danger">Não foi possível carregar a lista.</p>
          )}
          {!s.loadingEntidades && !s.errorEntidades && s.listaFiltrada.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {s.busca.trim()
                ? "Nenhum resultado para a busca."
                : `Nenhum${s.tipoSel === "cliente" ? "a loja" : " fornecedor"} ativo(a) cadastrado(a).`}
            </p>
          )}
          {s.listaFiltrada.map((ent) => (
            <button
              key={ent.id}
              type="button"
              disabled={s.picking}
              onClick={() => void s.pickEntidade(ent)}
              className="w-full text-left px-4 py-3 hover:bg-secondary/50 flex items-center justify-between border-b border-border last:border-0 disabled:opacity-50"
            >
              <span className="font-semibold text-navy">{ent.nome}</span>
              {ent.tipo === "cliente" && s.clientesHojeIds.has(ent.id) && (
                <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                  rota hoje
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function PainelInventario({ initialTipo }: { initialTipo?: string }) {
  const s = useInventarioState(initialTipo);
  const motivoSel = s.motivos.find((m) => m.id === s.motivoId);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <SeletorPosicao s={s} />
        {s.posicaoId && (
          <>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={s.voltarSelecao}
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-navy"
              >
                <ChevronLeft size={14} /> Trocar posição
              </button>
              <span className="text-sm font-semibold text-navy truncate">
                {s.tipoSel ? TIPO_LABEL[s.tipoSel] : ""} · {s.parceiroNome}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Informe o que há no local, por tipo. Campo em branco = não informado: o tipo
              fica de fora do fechamento (não vira 0).
            </p>
            <ProgressoContagem contados={s.progresso.contados} total={s.progresso.total} />
            {s.tipos.map((t) => {
              const informado = isInformado(s.contagem, t.sigla);
              const esperado = Number(s.calculado[t.sigla] ?? 0);
              return (
                <div key={t.id} className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {t.nome} · {t.sigla}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Esperado: {esperado}</span>
                    {!informado && <ChipNaoInformado destacar={esperado > 0} />}
                    <NumberStepper
                      nullable
                      width="w-20"
                      value={informado ? s.contagem[t.sigla] : null}
                      onChange={(n: number | null) => s.setQtd(t.sigla, n)}
                    />
                  </div>
                </div>
              );
            })}
            <Button className="min-h-11 w-full" onClick={s.handleRegistrar} disabled={s.registrar.isPending || !s.posicaoId}>
              Registrar
            </Button>
            {s.submitted && (
              <div className="text-sm space-y-1 p-3 bg-secondary/50 rounded-lg">
                <p className="font-medium mb-2">Divergência esperado × contado:</p>
                {s.tipos.map((t) => {
                  if (!isInformado(s.contagem, t.sigla)) return null;
                  const c = Number(s.contagem[t.sigla]);
                  const calc = Number(s.calculado[t.sigla] ?? 0);
                  const diff = c - calc;
                  return (
                    <p key={t.id} className={diff !== 0 ? "text-danger" : ""}>
                      {t.sigla}: contado {c} · esperado {calc} · diferença{" "}
                      <span className="font-bold">{diff > 0 ? "+" : ""}{diff}</span>
                    </p>
                  );
                })}
                {s.progresso.contados < s.progresso.total && (
                  <p className="text-xs text-muted-foreground pt-1">
                    {s.progresso.total - s.progresso.contados} tipo(s) não informado(s) ficaram
                    de fora desta contagem.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <FilaConciliacao s={s} motivoSel={motivoSel} />
      <ConfirmarContagemDialog
        confirmacoes={s.confirmacoes}
        onCancel={() => s.setConfirmacoes(null)}
        onConfirm={() => {
          s.setConfirmacoes(null);
          void s.registrarAgora();
        }}
      />
    </div>
  );
}

function CampoInventario({ initialTipo }: { initialTipo?: string }) {
  const s = useInventarioState(initialTipo);

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

            {!s.posicaoId ? (
              <div className="space-y-3 text-navy">
                {!s.tipoSel && (
                  <div className="grid grid-cols-1 gap-2">
                    {s.tiposPermitidos.map((tipo) => {
                      const Icon = TIPO_ICON[tipo];
                      return (
                        <button
                          key={tipo}
                          type="button"
                          disabled={s.picking}
                          onClick={() => void s.pickTipo(tipo)}
                          className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 disabled:opacity-50"
                        >
                          <Icon size={22} className="text-primary" />
                          <span className="text-sm font-bold">{TIPO_LABEL[tipo]}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {s.tipoSel && s.tipoSel !== "galpao" && (
                  <>
                    <button
                      type="button"
                      onClick={s.voltarSelecao}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-white/70"
                    >
                      <ChevronLeft size={14} /> Voltar
                    </button>
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar..."
                        value={s.busca}
                        onChange={(e) => s.setBusca(e.target.value)}
                        className="w-full h-11 pl-9 pr-3 rounded-2xl text-sm text-navy"
                      />
                    </div>
                    <div className="max-h-[320px] overflow-y-auto rounded-2xl bg-white">
                      {s.listaFiltrada.map((ent) => (
                        <button
                          key={ent.id}
                          type="button"
                          disabled={s.picking}
                          onClick={() => void s.pickEntidade(ent)}
                          className="w-full text-left px-4 py-3 border-b border-border last:border-0 font-semibold disabled:opacity-50"
                        >
                          {ent.nome}
                        </button>
                      ))}
                      {!s.listaFiltrada.length && (
                        <p className="p-4 text-sm text-muted-foreground">Nenhum ativo encontrado.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={s.voltarSelecao}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-white/70"
                >
                  <ChevronLeft size={14} /> Trocar posição
                </button>
                <p className="text-sm opacity-80">
                  {s.tipoSel ? TIPO_LABEL[s.tipoSel] : ""} · {s.parceiroNome}
                </p>
                <ProgressoContagem contados={s.progresso.contados} total={s.progresso.total} escuro />
                {s.tipos.map((t) => {
                  const informado = isInformado(s.contagem, t.sigla);
                  const esperado = Number(s.calculado[t.sigla] ?? 0);
                  return (
                    <div key={t.id} className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs uppercase tracking-wider opacity-60">
                          {t.nome} · {t.sigla}
                        </span>
                        <span className="text-xs opacity-50">Esperado: {esperado}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          aria-label={`Diminuir ${t.nome}`}
                          onClick={() => s.ajustarQtd(t.sigla, -1)}
                          className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center"
                        >
                          <Minus size={18} />
                        </button>
                        {informado ? (
                          <span className="text-5xl font-bold tabular-nums">{s.contagem[t.sigla]}</span>
                        ) : (
                          <span
                            className={`text-sm font-semibold ${esperado > 0 ? "text-warning" : "opacity-50"}`}
                          >
                            não informado
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`Aumentar ${t.nome}`}
                          onClick={() => s.ajustarQtd(t.sigla, 1)}
                          className="h-12 w-12 rounded-2xl flex items-center justify-center"
                          style={{ background: "var(--primary)" }}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      {informado && s.contagem[t.sigla] === 0 && (
                        <p className="mt-2 text-[11px] opacity-60">
                          0 contado — toque em − de novo para voltar a “não informado”.
                        </p>
                      )}
                    </div>
                  );
                })}
                <Button className="min-h-12 w-full" onClick={s.handleRegistrar} disabled={s.registrar.isPending || !s.posicaoId}>
                  Registrar
                </Button>
                {s.submitted && (
                  <div className="text-xs opacity-70 space-y-1">
                    <p>Contagem enviada. O admin concilia no painel.</p>
                    {s.tipos.map((t) => {
                      if (!isInformado(s.contagem, t.sigla)) return null;
                      const c = Number(s.contagem[t.sigla]);
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
              </>
            )}
          </div>
        </div>
      </div>
      {s.isAdmin && (
        <div className="mt-6">
          <FilaConciliacao s={s} motivoSel={s.motivos.find((m) => m.id === s.motivoId)} />
        </div>
      )}
      <ConfirmarContagemDialog
        confirmacoes={s.confirmacoes}
        onCancel={() => s.setConfirmacoes(null)}
        onConfirm={() => {
          s.setConfirmacoes(null);
          void s.registrarAgora();
        }}
      />
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
