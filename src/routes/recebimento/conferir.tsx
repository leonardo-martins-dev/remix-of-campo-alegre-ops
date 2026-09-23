import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Save,
  CheckCircle2,
  Camera,
  Info,
  ArrowLeft,
  Check,
  AlertTriangle,
  Receipt,
  Truck,
  Pencil,
  History,
  X,
  ChevronRight,
  ChevronDown,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { NumberStepper } from "@/components/number-stepper";
import { FluxoPassos } from "@/components/fluxo-passos";
import { HeaderAcoes, ChipLabel } from "@/components/ui-galpao";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  usePedidosDia,
  usePedido,
  useConfigValor,
  useSaldoItensPedido,
  useRegistrarHoraChegada,
} from "@/hooks/use-pedidos";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useRegistrarEntradaGalpao } from "@/hooks/use-ledger";
import {
  useConferencia,
  useStartConferencia,
  useSaveConferenciaItens,
  useAddItemAvulso,
  useSalvarEdicaoConferencia,
  useConferenciaEdicoes,
  uploadConferenciaFoto,
} from "@/hooks/use-conferencia";
import { useProdutos } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import { formatTime, formatDateBRT, dateKeyBRT } from "@/lib/utils-date";
import { one } from "@/lib/embed";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCreateVale, useValesConferente, uploadValeFoto } from "@/hooks/use-vales";
import { useSugestaoCaixas, type SugestaoItemMap } from "@/hooks/use-sugestao-caixas";
import { CaixasItemEditor, type CaixaItemEntry } from "@/components/caixas-item-editor";
import { useCaixasItemConferencia } from "@/hooks/use-caixas-item";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { isAguardandoVinculo } from "@/lib/seletor-cadastro";
import { normalizeKey } from "@/lib/normalize";
import { SemConversaoSelo } from "@/components/sem-conversao-selo";
import type { TipoCaixa } from "@/lib/caixas-map";
import {
  useRegistrarChegadaSaida,
  useSaidaRocaPedido,
  useSaidasEmTransito,
} from "@/hooks/use-saida-roca";
import { formatBRL } from "@/lib/format";
import {
  chipsFornecedoresSessao,
  filterValesDoPedido,
  itemConferenciaQtyLocked,
  podeEditarConferenciaFinalizada,
  removerFornecedorDaSessao,
} from "@/lib/conferir-chegada";
import { ConferenciaCaminhao } from "@/components/recebimento/conferencia-caminhao";

/** NOP-298: pedidoId (legado) ou pedidoIds CSV para sessão multi-fornecedor. */
type ConferirSearch = { pedidoId?: string; pedidoIds?: string };

/** Pedidos que ainda aceitam conferência — em_transito = saiu da roça (NOP-129). */
const PEDIDO_ABERTO = ["pendente", "parcial", "em_transito"];

function parsePedidoIds(search: ConferirSearch): string[] {
  if (typeof search.pedidoIds === "string" && search.pedidoIds.trim()) {
    return [...new Set(search.pedidoIds.split(",").map((s) => s.trim()).filter(Boolean))];
  }
  if (typeof search.pedidoId === "string" && search.pedidoId) return [search.pedidoId];
  return [];
}

function searchFromPedidoIds(ids: string[]): ConferirSearch {
  if (ids.length === 0) return {};
  if (ids.length === 1) return { pedidoId: ids[0] };
  return { pedidoIds: ids.join(",") };
}

/** "Saiu da roça às 07:40 · 32 cx · João" */
function resumoSaida(saida: {
  registrado_em: string;
  total_caixas: number;
  motorista_nome: string | null;
  veiculo_fornecedor: boolean;
}): string {
  const quem = saida.veiculo_fornecedor
    ? "veículo do fornecedor"
    : (saida.motorista_nome ?? "motorista");
  return `Saiu da roça às ${formatTime(saida.registrado_em)} · ${saida.total_caixas} cx · ${quem}`;
}

export const Route = createFileRoute("/recebimento/conferir")({
  validateSearch: (search: Record<string, unknown>): ConferirSearch => ({
    pedidoId: typeof search.pedidoId === "string" ? search.pedidoId : undefined,
    pedidoIds: typeof search.pedidoIds === "string" ? search.pedidoIds : undefined,
  }),
  component: Page,
  head: () => ({ meta: [{ title: "Conferir chegada · Campo Alegre" }] }),
});

type LinhaItem = {
  id: string;
  itemPedidoId?: string | null;
  produtoId?: string | null;
  produto: string;
  unid: string;
  pedido: number;
  cliente: string | null;
  recebido: number;
  conferido: boolean;
  qualidade: { ativo: boolean; qtd: number } | null;
  foto_url: string | null;
  preco?: number | null;
  toleranciaPct?: number | null;
  aVincular?: boolean;
};

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const pedidoIds = parsePedidoIds(search);

  const { data: pedidos = [], isLoading: loadingPedidos } = usePedidosDia();
  const pendentes = pedidos.filter((p) => PEDIDO_ABERTO.includes(p.status));
  const { data: emTransito = [] } = useSaidasEmTransito();
  const saidaPorPedido = new Map(emTransito.map((s) => [s.pedido_id, s]));

  const setPedidoIds = (ids: string[]) => navigate({ search: searchFromPedidoIds(ids) });

  /** NOP-328: tela única em 3 passos (mockup). Mantém ConferenciaItens no arquivo para fluxos legados/ADM. */
  return (
    <ConferenciaCaminhao
      pendentes={pendentes}
      loadingPedidos={loadingPedidos}
      saidaPorPedido={saidaPorPedido}
      pedidoIds={pedidoIds}
      onChangePedidoIds={setPedidoIds}
      onAllDone={() => navigate({ to: "/recebimento" })}
    />
  );
}

/** Card por fornecedor + seleção por toque + barra fixa (lista de chegadas). */
function SelecaoMultiFornecedor({
  pendentes,
  loading,
  saidaPorPedido,
  onIniciar,
}: {
  pendentes: {
    id: string;
    codigo: string;
    fornecedor_id: string;
    hora_chegada: string | null;
    status: string;
    fornecedores?: { nome: string } | { nome: string }[] | null;
    itens_pedido?: unknown[];
  }[];
  loading: boolean;
  saidaPorPedido: Map<
    string,
    {
      pedido_id: string;
      registrado_em: string;
      total_caixas: number;
      motorista_nome: string | null;
      veiculo_fornecedor: boolean;
    }
  >;
  onIniciar: (pedidoIds: string[]) => void;
}) {
  const [selectedPedidoIds, setSelectedPedidoIds] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [buscaForn, setBuscaForn] = useState("");
  const registrarHora = useRegistrarHoraChegada();
  const [iniciando, setIniciando] = useState(false);

  type GrupoForn = {
    fornecedorId: string;
    nome: string;
    pedidos: typeof pendentes;
    itensTotal: number;
    emTransito: boolean;
    saidaResumo: string | null;
    horaChegada: string | null;
  };

  const grupos = useMemo((): GrupoForn[] => {
    const map = new Map<string, GrupoForn>();
    for (const p of pendentes) {
      if (!p.fornecedor_id) continue;
      const nomeRaw = one(p.fornecedores)?.nome;
      const nome =
        !nomeRaw || isAguardandoVinculo(nomeRaw) ? p.codigo : nomeRaw;
      let g = map.get(p.fornecedor_id);
      if (!g) {
        g = {
          fornecedorId: p.fornecedor_id,
          nome,
          pedidos: [],
          itensTotal: 0,
          emTransito: false,
          saidaResumo: null,
          horaChegada: null,
        };
        map.set(p.fornecedor_id, g);
      }
      g.pedidos.push(p);
      g.itensTotal += p.itens_pedido?.length ?? 0;
      const saida = saidaPorPedido.get(p.id);
      if (saida) {
        g.emTransito = true;
        if (!g.saidaResumo) {
          const quem = saida.veiculo_fornecedor
            ? "veículo do fornecedor"
            : (saida.motorista_nome ?? "motorista");
          g.saidaResumo = `Saiu da roça ${formatTime(saida.registrado_em)} · ${quem}`;
        }
      }
      if (p.hora_chegada && (!g.horaChegada || p.hora_chegada < g.horaChegada)) {
        g.horaChegada = p.hora_chegada;
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.emTransito !== b.emTransito) return a.emTransito ? -1 : 1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [pendentes, saidaPorPedido]);

  const gruposFiltrados = useMemo(() => {
    const q = buscaForn.trim().toLowerCase();
    if (!q) return grupos;
    return grupos.filter(
      (g) =>
        g.nome.toLowerCase().includes(q) ||
        g.pedidos.some((p) => p.codigo.toLowerCase().includes(q)),
    );
  }, [grupos, buscaForn]);

  const fornecedoresComPedido = useMemo(
    () =>
      grupos.map((g) => ({
        id: g.fornecedorId,
        nome: g.nome,
        codigo: g.pedidos[0]?.codigo,
      })),
    [grupos],
  );

  const fornIdsSelecionados = useMemo(() => {
    const ids: string[] = [];
    for (const g of grupos) {
      if (g.pedidos.some((p) => selectedPedidoIds.has(p.id))) ids.push(g.fornecedorId);
    }
    return ids;
  }, [grupos, selectedPedidoIds]);

  const pedidosSelecionados = useMemo(
    () => pendentes.filter((p) => selectedPedidoIds.has(p.id)),
    [pendentes, selectedPedidoIds],
  );

  const fornCount = fornIdsSelecionados.length;
  const temEmTransito = grupos.some((g) => g.emTransito);

  const toggleForn = (g: GrupoForn) => {
    setSelectedPedidoIds((prev) => {
      const next = new Set(prev);
      const allOn = g.pedidos.every((p) => next.has(p.id));
      if (allOn) {
        for (const p of g.pedidos) next.delete(p.id);
      } else {
        for (const p of g.pedidos) next.add(p.id);
      }
      return next;
    });
  };

  const togglePedido = (pedidoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPedidoIds((prev) => {
      const next = new Set(prev);
      if (next.has(pedidoId)) next.delete(pedidoId);
      else next.add(pedidoId);
      return next;
    });
  };

  const abrirPedidoSo = async (pedidoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await registrarHora.mutateAsync({ pedidoIds: [pedidoId], onlyIfNull: true });
    } catch {
      /* segue mesmo se falhar — conferência ainda abre */
    }
    onIniciar([pedidoId]);
  };

  const onSeletorChange = (ids: string[]) => {
    setSelectedPedidoIds((prev) => {
      const next = new Set(prev);
      const idSet = new Set(ids);
      for (const g of grupos) {
        if (idSet.has(g.fornecedorId)) {
          for (const p of g.pedidos) next.add(p.id);
        } else {
          for (const p of g.pedidos) next.delete(p.id);
        }
      }
      return next;
    });
  };

  const selecionarTodosEmTransito = () => {
    setSelectedPedidoIds((prev) => {
      const next = new Set(prev);
      for (const g of grupos) {
        if (!g.emTransito) continue;
        for (const p of g.pedidos) next.add(p.id);
      }
      return next;
    });
  };

  const iniciarMulti = async () => {
    const ids = [...selectedPedidoIds];
    if (ids.length === 0) {
      toast.error("Selecione ao menos um fornecedor");
      return;
    }
    setIniciando(true);
    try {
      await registrarHora.mutateAsync({ pedidoIds: ids, onlyIfNull: true });
      onIniciar(ids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar chegada");
    } finally {
      setIniciando(false);
    }
  };

  return (
    <div className="pb-28">
      <PageHeader
        title="Conferir chegada"
        subtitle="Toque nos cards para selecionar — um card por fornecedor"
        actions={
          <Link
            to="/recebimento"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Voltar
          </Link>
        }
      />
      <FluxoPassos
        steps={["Escolher pedidos", "Conferir itens", "Finalizar"]}
        current={1}
      />
      <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 mb-4 flex gap-2 text-xs text-primary-dark">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          O recebimento é <strong>sempre aceito</strong>. Divergências não bloqueiam: viram
          registro no <strong>Relatório de Faltas</strong>. Selecione todos os fornecedores do
          caminhão — a hora de chegada grava uma vez.
        </span>
      </div>

      <div className="mb-4 space-y-2">
        <Input
          value={buscaForn}
          onChange={(e) => setBuscaForn(e.target.value)}
          placeholder="Buscar pedido ou fornecedor… (ex. 30628)"
          className="h-11"
          aria-label="Buscar pedido ou fornecedor"
        />
        <SeletorCadastro
          tipo="fornecedor"
          label="Buscar fornecedor"
          multiple
          items={fornecedoresComPedido}
          values={fornIdsSelecionados}
          onChangeMultiple={(ids) => onSeletorChange(ids)}
          placeholder="Buscar fornecedor…"
        />
        {temEmTransito && (
          <button
            type="button"
            onClick={selecionarTodosEmTransito}
            className="text-sm font-semibold text-primary-dark hover:underline"
          >
            Selecionar todos em trânsito
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando pedidos…</p>}
      {!loading && grupos.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum pedido pendente hoje.</p>
      )}
      {!loading && grupos.length > 0 && gruposFiltrados.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum resultado para “{buscaForn}”.</p>
      )}

      <div className="grid grid-cols-1 gap-3">
        {gruposFiltrados.map((g) => {
          const selecionadosNoGrupo = g.pedidos.filter((p) => selectedPedidoIds.has(p.id));
          const marcado = selecionadosNoGrupo.length > 0;
          const todosMarcados = selecionadosNoGrupo.length === g.pedidos.length;
          const isExpanded = expanded.has(g.fornecedorId);
          return (
            <div
              key={g.fornecedorId}
              className={[
                "card-base overflow-hidden transition-all",
                marcado
                  ? "border-primary ring-2 ring-primary/25 bg-primary-soft/40"
                  : "hover:border-primary/40",
              ].join(" ")}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleForn(g)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleForn(g);
                  }
                }}
                className="w-full text-left p-4 flex gap-3 items-start cursor-pointer"
              >
                <span
                  className={[
                    "mt-0.5 h-6 w-6 shrink-0 rounded-md border-2 flex items-center justify-center",
                    marcado
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card",
                  ].join(" ")}
                  aria-hidden
                >
                  {marcado && <Check size={14} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-navy text-base truncate">{g.nome}</div>
                    <span className={`chip shrink-0 ${g.emTransito ? "chip-info" : "chip-warn"}`}>
                      {g.emTransito ? "Em trânsito" : "Pendente"}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {g.pedidos.length} pedido{g.pedidos.length !== 1 ? "s" : ""} · {g.itensTotal}{" "}
                    itens
                    {!todosMarcados && marcado
                      ? ` · ${selecionadosNoGrupo.length} selecionado${selecionadosNoGrupo.length !== 1 ? "s" : ""}`
                      : ""}
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2 text-sm">
                    {g.pedidos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={(e) => void abrirPedidoSo(p.id, e)}
                        className="font-semibold text-primary-dark underline-offset-2 hover:underline"
                        title="Abrir só este pedido"
                      >
                        {p.codigo}
                      </button>
                    ))}
                  </div>
                  {g.saidaResumo && (
                    <div className="text-xs text-primary-dark font-semibold mt-2">{g.saidaResumo}</div>
                  )}
                  {g.horaChegada && (
                    <div className="mt-2">
                      <span className="chip chip-info">Chegou {formatTime(g.horaChegada)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-border/60 px-4 py-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.fornecedorId)) next.delete(g.fornecedorId);
                      else next.add(g.fornecedorId);
                      return next;
                    })
                  }
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-navy"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {isExpanded ? "Ocultar pedidos" : "Incluir ou excluir pedidos"}
                </button>
              </div>

              {isExpanded && (
                <ul className="border-t border-border/60 divide-y divide-border/60 bg-card/50">
                  {g.pedidos.map((p) => {
                    const on = selectedPedidoIds.has(p.id);
                    const itens = p.itens_pedido?.length ?? 0;
                    return (
                      <li key={p.id} className="flex items-center gap-2 px-4 py-3">
                        <button
                          type="button"
                          onClick={(e) => togglePedido(p.id, e)}
                          className="flex-1 flex items-center gap-3 text-left hover:opacity-90 min-w-0"
                        >
                          <span
                            className={[
                              "h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center",
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border",
                            ].join(" ")}
                          >
                            {on && <Check size={12} strokeWidth={3} />}
                          </span>
                          <span className="min-w-0">
                            <span className="font-semibold text-navy">{p.codigo}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {itens} itens
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void abrirPedidoSo(p.id, e)}
                          className="text-xs font-semibold text-primary-dark hover:underline shrink-0"
                        >
                          Só este
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <p className="text-sm text-muted-foreground flex-1 text-center sm:text-left">
            <span className="font-semibold text-navy">{fornCount}</span> fornecedor
            {fornCount !== 1 ? "es" : ""} ·{" "}
            <span className="font-semibold text-navy">{pedidosSelecionados.length}</span> pedido
            {pedidosSelecionados.length !== 1 ? "s" : ""} selecionado
            {pedidosSelecionados.length !== 1 ? "s" : ""}
          </p>
          <Button
            type="button"
            className="w-full sm:w-auto min-h-12 sm:min-h-11"
            disabled={pedidosSelecionados.length === 0 || iniciando}
            onClick={() => void iniciarMulti()}
          >
            <CheckCircle2 size={16} className="mr-1.5" />
            {iniciando ? "Abrindo…" : "Iniciar chegada"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Sessão multi: seções por fornecedor; hora única; Encerrar chegada no fim. */
function SessaoMultiFornecedor({
  pedidoIds,
  pedidos,
  onChangePedidoIds,
  onAllDone,
}: {
  pedidoIds: string[];
  pedidos: {
    id: string;
    codigo: string;
    fornecedor_id: string;
    hora_chegada?: string | null;
    fornecedores?: { nome: string } | { nome: string }[] | null;
  }[];
  onChangePedidoIds: (ids: string[]) => void;
  onAllDone: () => void;
}) {
  const [finalizados, setFinalizados] = useState<Set<string>>(() => new Set());
  const registrarHora = useRegistrarHoraChegada();
  const [horaEdit, setHoraEdit] = useState("");

  const horaChegadaSessao = useMemo(() => {
    const times = pedidoIds
      .map((id) => pedidos.find((p) => p.id === id)?.hora_chegada)
      .filter((t): t is string => !!t);
    if (times.length === 0) return null;
    return times.sort()[0];
  }, [pedidoIds, pedidos]);

  useEffect(() => {
    if (!horaChegadaSessao) {
      setHoraEdit("");
      return;
    }
    setHoraEdit(formatTime(horaChegadaSessao));
  }, [horaChegadaSessao]);

  const grupos = useMemo(() => {
    const byForn = new Map<
      string,
      { fornecedorId: string; nome: string; pedidoIds: string[] }
    >();
    for (const id of pedidoIds) {
      const p = pedidos.find((x) => x.id === id);
      const fornId = p?.fornecedor_id ?? id;
      const nome = one(p?.fornecedores)?.nome ?? p?.codigo ?? "Fornecedor";
      const g = byForn.get(fornId) ?? { fornecedorId: fornId, nome, pedidoIds: [] };
      g.pedidoIds.push(id);
      byForn.set(fornId, g);
    }
    return [...byForn.values()];
  }, [pedidoIds, pedidos]);

  const removerPedido = (id: string) => {
    const next = pedidoIds.filter((x) => x !== id);
    onChangePedidoIds(next);
  };

  const onPedidoFinalizado = (id: string) => {
    setFinalizados((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const todosProntos =
    pedidoIds.length > 0 && pedidoIds.every((id) => finalizados.has(id));

  const salvarHoraEdit = async () => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(horaEdit.trim());
    if (!m) {
      toast.error("Use o formato HH:mm");
      return;
    }
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh > 23 || mm > 59) {
      toast.error("Hora inválida");
      return;
    }
    const day =
      dateKeyBRT(horaChegadaSessao) ||
      dateKeyBRT(new Date().toISOString());
    const isoGuess = new Date(
      `${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`,
    ).toISOString();
    try {
      await registrarHora.mutateAsync({
        pedidoIds,
        horaChegada: isoGuess,
        onlyIfNull: false,
      });
      toast.success("Hora de chegada atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar hora");
    }
  };

  return (
    <div className={todosProntos ? "pb-24" : undefined}>
      <PageHeader
        title="Conferência conjunta"
        subtitle={`${grupos.length} fornecedor(es) · ${pedidoIds.length} pedido(s)`}
        actions={
          <button
            type="button"
            onClick={() => onChangePedidoIds([])}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Trocar seleção
          </button>
        }
      />
      <FluxoPassos
        steps={["Escolher pedidos", "Conferir itens", "Finalizar"]}
        current={todosProntos ? 3 : 2}
      />

      {/* NOP-318: fornecedores escolhidos como chips (não lista de botões) */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2 mb-4 bg-background/95 backdrop-blur-md border-b border-border/70 flex flex-wrap gap-2 items-center">
        {chipsFornecedoresSessao(grupos).map((chip) => (
          <span
            key={chip.fornecedorId}
            className="chip chip-info inline-flex items-center gap-1.5 min-h-9 pl-2.5 pr-1"
          >
            <span className="font-semibold">{chip.nome}</span>
            <span className="text-[10px] opacity-80">
              {chip.pedidoIds.length} ped.
            </span>
            <button
              type="button"
              aria-label={`Remover ${chip.nome}`}
              className="rounded-full p-1 hover:bg-background/60"
              onClick={() =>
                onChangePedidoIds(
                  removerFornecedorDaSessao(pedidoIds, chip.pedidoIds),
                )
              }
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => onChangePedidoIds([])}
          className="text-xs font-semibold text-primary-dark hover:underline min-h-9 px-2"
        >
          Trocar seleção
        </button>
      </div>

      <div className="card-base p-3 mb-5 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 flex-1 min-w-[8rem]">
          <Label htmlFor="hora-chegada-sessao">Hora de chegada</Label>
          <Input
            id="hora-chegada-sessao"
            value={horaEdit}
            onChange={(e) => setHoraEdit(e.target.value)}
            placeholder="HH:mm"
            className="max-w-[8rem]"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => void salvarHoraEdit()}
          disabled={registrarHora.isPending}
        >
          Salvar hora
        </Button>
        {horaChegadaSessao && (
          <span className="chip chip-info self-center">
            Chegou {formatTime(horaChegadaSessao)}
          </span>
        )}
      </div>

      <div className="space-y-8">
        {grupos.map((g) => {
          const grupoDone = g.pedidoIds.every((id) => finalizados.has(id));
          return (
            <section key={g.fornecedorId} className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-base font-bold text-navy">{g.nome}</h2>
                <span className={`chip ${grupoDone ? "chip-ok" : "chip-info"}`}>
                  {grupoDone
                    ? "Finalizado"
                    : `${g.pedidoIds.length} pedido${g.pedidoIds.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              {g.pedidoIds.map((id) => {
                if (finalizados.has(id)) {
                  const p = pedidos.find((x) => x.id === id);
                  return (
                    <div
                      key={id}
                      className="rounded-xl border border-success/30 bg-success/5 p-4 flex items-center gap-2 text-sm text-navy"
                    >
                      <CheckCircle2 size={18} className="text-success shrink-0" />
                      <span>
                        Pedido <strong>{p?.codigo ?? id}</strong> finalizado
                      </span>
                    </div>
                  );
                }
                return (
                  <div key={id} className="rounded-xl border border-border p-3 sm:p-4">
                    <ConferenciaItens
                      pedidoId={id}
                      embedded
                      onBack={() => removerPedido(id)}
                      onFinished={() => onPedidoFinalizado(id)}
                      onTrocar={(nextId) => {
                        const next = pedidoIds.map((x) => (x === id ? nextId : x));
                        onChangePedidoIds([...new Set(next)]);
                      }}
                    />
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {todosProntos && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-5xl mx-auto">
            <Button
              type="button"
              className="w-full min-h-12"
              onClick={onAllDone}
            >
              <CheckCircle2 size={16} className="mr-1.5" />
              Encerrar chegada
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function mapToLinha(ic: {
  id: string;
  quantidade_recebida: number;
  conferido: boolean;
  tem_problema_qualidade: boolean;
  quantidade_qualidade: number;
  foto_url: string | null;
  itens_pedido: unknown;
}): LinhaItem {
  type Ip = {
    id?: string;
    quantidade_pedida?: number;
    preco_unitario?: number | null;
    unidade?: string | null;
    nome_externo?: string | null;
    produto_id?: string | null;
    produtos?:
      | { nome: string; unidade: string; tolerancia_pct?: number | null }
      | { nome: string; unidade: string; tolerancia_pct?: number | null }[]
      | null;
    clientes?: { nome: string } | { nome: string }[] | null;
  };
  const ip = one(ic.itens_pedido as Ip | Ip[] | null);
  const prod = one(ip?.produtos ?? null);
  return {
    id: ic.id,
    itemPedidoId: ip?.id,
    produtoId: ip?.produto_id ?? null,
    produto: prod?.nome ?? ip?.nome_externo ?? "—",
    unid: ip?.unidade || prod?.unidade || "un",
    aVincular: !ip?.produto_id,
    pedido: Number(ip?.quantidade_pedida ?? 0),
    cliente: one(ip?.clientes ?? null)?.nome ?? null,
    recebido: Number(ic.quantidade_recebida),
    conferido: ic.conferido,
    qualidade: ic.tem_problema_qualidade
      ? { ativo: true, qtd: Number(ic.quantidade_qualidade) || 1 }
      : null,
    foto_url: ic.foto_url,
    preco: ip?.preco_unitario ?? null,
    toleranciaPct: prod?.tolerancia_pct ?? null,
  };
}

/** Fator un/cx do item (vindo do cadastro/sugestão nas caixas). */
function fatorDoItem(entries: CaixaItemEntry[]): number | null {
  const e = entries.find((x) => x.fator != null && x.fator > 0);
  return e?.fator ?? null;
}

/**
 * Nesta entr. = caixas do produto (campo próprio, independente da coluna Caixas).
 */
function nestaEntradaCaixas(it: LinhaItem, _entries?: CaixaItemEntry[]): number {
  return Number(it.recebido ?? 0);
}

/**
 * Chegou em unidades para Status/Vale: Nesta entr. (cx) × fator un/cx.
 * O fator é o mesmo da coluna Caixas, mas a qty é só a de Nesta entr.
 */
function chegouEfetivo(it: LinhaItem, entries: CaixaItemEntry[]): number {
  const fator = fatorDoItem(entries);
  const cx = Number(it.recebido ?? 0);
  if (fator != null && fator > 0) return cx * fator;
  return cx;
}

/**
 * Caixas físicas que entram no galpão nesta entrega.
 * Prefere a coluna Caixas (real); se vazia, usa Nesta entr. (cx) no tipo do fator.
 */
function caixasParaGalpaoItem(
  it: LinhaItem,
  entries: CaixaItemEntry[],
): Record<string, number> {
  const out: Record<string, number> = {};
  let fromReal = 0;
  for (const e of entries) {
    const q = Number(e.real ?? 0);
    if (q > 0) {
      out[e.sigla] = (out[e.sigla] ?? 0) + q;
      fromReal += q;
    }
  }
  if (fromReal > 0) return out;
  const cx = nestaEntradaCaixas(it, entries);
  if (cx <= 0) return out;
  const sigla = entries.find((e) => e.sigla)?.sigla;
  if (sigla) out[sigla] = cx;
  return out;
}

/** Diferença vs pedido (un): (já + nestaEntr×fator) − pedido.
 * Sobra só de arredondamento de caixa (ceil) não conta: se Nesta entr.
 * = caixas necessárias do saldo restante, Status = OK (ex.: 500 un ÷ 80 = 7 cx).
 */
function gapVsPedido(
  it: LinhaItem,
  entries: CaixaItemEntry[],
  jaRecebido: number,
): number {
  const fator = fatorDoItem(entries);
  const cx = nestaEntradaCaixas(it, entries);
  const gap = jaRecebido + chegouEfetivo(it, entries) - it.pedido;
  if (gap > 0 && fator != null && fator > 0 && cx > 0) {
    const restante = Math.max(0, it.pedido - jaRecebido);
    const cxNecessarias = Math.ceil(restante / fator);
    if (cx === cxNecessarias) return 0;
    const sug = entries.reduce((a, e) => a + Number(e.sugerida ?? 0), 0);
    if (sug > 0 && cx === sug) return 0;
  }
  return gap;
}

/** NOP-129: saída na roça × chegada no packing, em caixas. */
function saldoTransporte(
  it: LinhaItem,
  entries: CaixaItemEntry[],
  daSaida: { total: number } | undefined,
) {
  if (!daSaida) return null;
  const chegada = Object.values(caixasParaGalpaoItem(it, entries)).reduce((a, n) => a + n, 0);
  return { saida: daSaida.total, chegada, dif: chegada - daSaida.total };
}

function buildSavePayload(
  it: LinhaItem,
  opts?: {
    toleranciaPct?: number;
    toleranciaMin?: number;
    preco?: number | null;
    fallback?: number;
    jaRecebido?: number;
    /** Gap já calculado (com regra de arredondamento de caixa). */
    gap?: number;
  },
) {
  const ja = Number(opts?.jaRecebido ?? 0);
  const totalApos = ja + it.recebido;
  const gap = opts?.gap ?? totalApos - it.pedido;
  let divergencia: string | null = null;
  if (it.conferido) {
    if (it.qualidade?.ativo) divergencia = "qualidade";
    else if (gap > 0) divergencia = "sobra";
    // R07: saldo pendente (totalApos < pedido) não é falta nesta entrega
  }
  const pct = opts?.toleranciaPct ?? 5;
  const min = opts?.toleranciaMin ?? 1;
  const limite = Math.max((pct / 100) * it.pedido, min);
  const dentro = divergencia === "qualidade" ? false : Math.abs(Math.max(0, gap)) <= limite;
  const preco = opts?.preco ?? null;
  const estimado = preco == null;
  const valor = Math.abs(Math.max(0, gap)) * (preco ?? opts?.fallback ?? 4.5);
  return {
    id: it.id,
    quantidade_recebida: it.recebido,
    conferido: it.conferido,
    divergencia,
    quantidade_divergencia: divergencia ? Math.abs(gap) : 0,
    tem_problema_qualidade: !!it.qualidade?.ativo,
    quantidade_qualidade: it.qualidade?.qtd ?? 0,
    dentro_tolerancia: divergencia ? dentro : null,
    valor_divergencia: divergencia && divergencia !== "sobra" ? valor : 0,
    estimado,
    tolerancia_pct_aplicada: pct,
  };
}

function ConferenciaItens({
  pedidoId,
  onBack,
  onFinished,
  onTrocar,
  embedded = false,
}: {
  pedidoId: string;
  onBack: () => void;
  onFinished: () => void;
  onTrocar: (id: string) => void;
  /** NOP-298: bloco dentro da sessão multi — finaliza só este pedido. */
  embedded?: boolean;
}) {
  const { user, profile, isAdmin } = useAuth();
  const { data: pedidos = [] } = usePedidosDia();
  const { data: pedido } = usePedido(pedidoId);
  const { data: conferencia, isLoading, error } = useConferencia(pedidoId);
  const startMut = useStartConferencia();
  const saveMut = useSaveConferenciaItens();
  const editMut = useSalvarEdicaoConferencia();
  const addAvulso = useAddItemAvulso();
  const { data: edicoes = [] } = useConferenciaEdicoes(
    conferencia?.status === "finalizada" || conferencia?.editada ? (conferencia?.id ?? null) : null,
  );
  const { data: produtos = [] } = useProdutos();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: toleranciaPct = 5 } = useConfigValor("tolerancia_pct", 5);
  const { data: toleranciaMin = 1 } = useConfigValor("tolerancia_min_un", 1);
  const { data: fallbackPreco = 4.5 } = useConfigValor("impacto_falta_por_unidade", 4.5);
  const { data: saldosItem = [] } = useSaldoItensPedido(pedidoId);
  const { data: entregasMeta } = useQuery({
    queryKey: ["entregas-meta", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conferencias")
        .select("id, numero, status, created_at")
        .eq("pedido_id", pedidoId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const entradaGalpao = useRegistrarEntradaGalpao();

  // NOP-129: saída na roça desta entrega (pode não existir — nada bloqueia).
  const { data: saida, isLoading: saidaLoading } = useSaidaRocaPedido(
    pedidoId,
    conferencia?.id,
    (conferencia as { numero?: number | null } | null)?.numero ?? null,
  );
  const registrarChegada = useRegistrarChegadaSaida();
  const temSaida = !!saida && saida.status === "confirmada";
  /** caixas da saída por item do pedido */
  const caixasSaidaPorItem = useMemo(() => {
    const map = new Map<string, { entries: CaixaItemEntry[]; total: number }>();
    for (const item of saida?.itens_saida_roca ?? []) {
      if (!item.item_pedido_id) continue;
      const entries = (item.caixas_item_saida ?? [])
        .filter((c) => c.qtd > 0)
        .map((c) => ({
          tipo_caixa_id: c.tipo_caixa_id ?? "",
          sigla: c.tipo_caixa_sigla,
          sugerida: c.qtd,
          real: c.qtd,
          fator: c.fator_usado != null ? Number(c.fator_usado) : null,
        }));
      map.set(item.item_pedido_id, {
        entries,
        total: entries.reduce((a, e) => a + e.real, 0),
      });
    }
    return map;
  }, [saida]);

  const fornecedorIdPedido = pedido?.fornecedor_id ?? null;
  const itensParaSugestao = useMemo(() => {
    const itensPedido =
      (
        pedido as {
          itens_pedido?: { produto_id?: string | null; quantidade_pedida: number }[];
        } | null
      )?.itens_pedido ?? [];
    return itensPedido.map((i) => ({
      produto_id: i.produto_id ?? null,
      quantidade: Number(i.quantidade_pedida),
    }));
  }, [pedido]);
  const { data: sugestoesCaixas } = useSugestaoCaixas(fornecedorIdPedido, itensParaSugestao);
  /** Produtos do próprio pedido sobem no seletor do item avulso. */
  const produtosDoPedido = useMemo(
    () => itensParaSugestao.map((i) => i.produto_id).filter((id): id is string => !!id),
    [itensParaSugestao],
  );

  const { data: caixasItemExistentes } = useCaixasItemConferencia(conferencia?.id);
  const [caixasItem, setCaixasItem] = useState<Record<string, CaixaItemEntry[]>>({});
  const caixasInitRef = useRef<string | null>(null);
  const itensHydratedRef = useRef<string | null>(null);

  const [confirmFinal, setConfirmFinal] = useState(false);
  const stepperRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusedRef = useRef(false);
  const [itemSheetIdx, setItemSheetIdx] = useState<number | null>(null);

  const startedRef = useRef<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [fotoItemId, setFotoItemId] = useState<string | null>(null);
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [avulsoProduto, setAvulsoProduto] = useState("");
  const [avulsoQtd, setAvulsoQtd] = useState(1);

  const [itens, setItens] = useState<LinhaItem[]>([]);

  // NOP-308 — edição de conferência concluída
  const [editando, setEditando] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMotivo, setEditMotivo] = useState("");
  const [histOpen, setHistOpen] = useState(false);
  const [valeWiseWarn, setValeWiseWarn] = useState(false);

  // Vale state
  const createVale = useCreateVale();
  const { data: meusValesAll = [] } = useValesConferente(user?.id ?? null);
  /** NOP-318: na conferência só vales do pedido aberto (fila completa no módulo Vales). */
  const meusVales = useMemo(
    () => filterValesDoPedido(meusValesAll, pedidoId),
    [meusValesAll, pedidoId],
  );
  const [trocarPedidoOpen, setTrocarPedidoOpen] = useState(false);
  const [buscaTrocaPedido, setBuscaTrocaPedido] = useState("");
  const [valeOpen, setValeOpen] = useState(false);
  const [valeItem, setValeItem] = useState<LinhaItem | null>(null);
  const [valeJaRecebido, setValeJaRecebido] = useState(0);
  const [valeObs, setValeObs] = useState("");
  const [valeFotos, setValeFotos] = useState<string[]>([]);
  const [valeUploading, setValeUploading] = useState(false);
  const valeFotoRef = useRef<HTMLInputElement>(null);

  const pendentes = pedidos.filter((p) => PEDIDO_ABERTO.includes(p.status));
  /** Pedidos abertos no seletor de troca (celular): nome do fornecedor + código. */
  const pedidosSeletor = pendentes.map((p) => {
    const nome = one(p.fornecedores)?.nome;
    return {
      id: p.id,
      nome: !nome || isAguardandoVinculo(nome) ? p.codigo : nome,
      codigo: p.codigo,
    };
  });
  const fornecedorNome =
    one(pedido?.fornecedores)?.nome ??
    one(pedidos.find((p) => p.id === pedidoId)?.fornecedores)?.nome ??
    "—";
  const codigo = pedido?.codigo ?? pedidos.find((p) => p.id === pedidoId)?.codigo ?? "";
  const wiseId =
    (pedido as { wise_pedido_id?: string | null } | null)?.wise_pedido_id ??
    (pedidos.find((p) => p.id === pedidoId) as { wise_pedido_id?: string | null } | undefined)
      ?.wise_pedido_id;
  const entregaAtual = (entregasMeta ?? []).findIndex((e) => e.id === conferencia?.id) + 1;
  const entregaTotal = Math.max(1, (entregasMeta ?? []).length);
  const horaChegada = pedido?.hora_chegada ?? pedidos.find((p) => p.id === pedidoId)?.hora_chegada;
  const conferenteNome = profile?.nome ?? "—";
  const pedidoStatus = pedido?.status ?? pedidos.find((p) => p.id === pedidoId)?.status;
  const aguardandoLiberacao =
    pedidoStatus === "aguardando_liberacao" || pedidoStatus === "divergencia";
  const conferenciaAberta =
    conferencia?.status === "em_andamento" || conferencia?.status === "parcial";
  const conferenciaFinalizada = conferencia?.status === "finalizada";
  const readOnly = conferenciaFinalizada && !editando;
  const editada = !!(conferencia as { editada?: boolean } | null)?.editada;

  const { data: valesLancadosPedido = [] } = useQuery({
    queryKey: ["vales-lancados-pedido", pedidoId],
    enabled: !!pedidoId && conferenciaFinalizada,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes_vale")
        .select("id, item_conferencia_id, status")
        .eq("pedido_id", pedidoId!)
        .eq("status", "lancado");
      if (error) throw error;
      return data ?? [];
    },
  });

  const valesLancadosNaConf = useMemo(() => {
    if (!conferencia?.itens_conferencia) return [];
    const ids = new Set(conferencia.itens_conferencia.map((i: { id: string }) => i.id));
    return valesLancadosPedido.filter(
      (v) => v.item_conferencia_id && ids.has(v.item_conferencia_id),
    );
  }, [conferencia, valesLancadosPedido]);

  useEffect(() => {
    if (!pedidoId || !user?.id) return;
    if (!pedidoStatus) return;
    if (isLoading) return;
    if (!PEDIDO_ABERTO.includes(pedidoStatus)) return;
    if (conferenciaAberta) {
      startedRef.current = `open:${pedidoId}:${conferencia?.id}`;
      return;
    }
    const startKey = `start:${pedidoId}:${conferencia?.id ?? "none"}`;
    if (startedRef.current === startKey) return;
    startedRef.current = startKey;
    startMut.mutate(
      { pedidoId, conferenteId: user.id, user },
      { onError: (e) => toast.error(e.message) },
    );
  }, [pedidoId, user, pedidoStatus, conferencia?.id, conferenciaAberta, isLoading]);

  useEffect(() => {
    if (!conferencia?.id) return;
    if (caixasInitRef.current && caixasInitRef.current !== conferencia.id) {
      caixasInitRef.current = null;
      itensHydratedRef.current = null;
      setCaixasItem({});
    }
  }, [conferencia?.id]);

  useEffect(() => {
    if (!conferencia?.itens_conferencia) return;
    // Não sobrescreve qty digitada em conf. aberta; em edição (NOP-308) rehidrata.
    if (
      conferencia.status === "finalizada" &&
      PEDIDO_ABERTO.includes(pedidoStatus ?? "") &&
      !editando
    ) {
      return;
    }
    const hydrateKey = `${conferencia.id}:${editando ? "edit" : "view"}`;
    if (itensHydratedRef.current === hydrateKey) return;
    itensHydratedRef.current = hydrateKey;
    setItens(conferencia.itens_conferencia.map(mapToLinha));
  }, [conferencia, pedidoStatus, editando]);

  useEffect(() => {
    if (!conferencia?.itens_conferencia || !tipos.length) return;
    // Uma hidratação por conferência, depois que sugestão e caixas do DB
    // estabilizaram. Antes: initKey mudava nosug→sug / nodb→db e sobrescrevia
    // a qty de caixas já ajustada pela "Nesta entr." (ex.: 1 → 50).
    if (caixasInitRef.current === conferencia.id) return;
    if (caixasItemExistentes === undefined) return;
    // Erro ao buscar a saída não pode travar a conferência: segue sem prefill.
    if (saidaLoading) return;
    if (
      fornecedorIdPedido &&
      itensParaSugestao.length > 0 &&
      sugestoesCaixas === undefined
    ) {
      return;
    }

    caixasInitRef.current = conferencia.id;

    const newCaixas: Record<string, CaixaItemEntry[]> = {};
    /** qty "Nesta entrega (cx)" pré-preenchida pela saída na roça */
    const prefillSaida: Record<string, number> = {};
    for (const ic of conferencia.itens_conferencia) {
      const itemId = ic.id;
      const produtoId = one(ic.itens_pedido)?.produto_id as string | undefined;
      const itemPedidoId = one(ic.itens_pedido)?.id as string | undefined;
      const daSaida = itemPedidoId ? caixasSaidaPorItem.get(itemPedidoId) : undefined;

      const existingForItem = caixasItemExistentes?.get(itemId);
      if (
        (!existingForItem || existingForItem.length === 0) &&
        daSaida &&
        daSaida.entries.length > 0
      ) {
        // NOP-129: chegada já abre com o que saiu da roça.
        newCaixas[itemId] = daSaida.entries.map((e) => ({ ...e }));
        prefillSaida[itemId] = daSaida.total;
        continue;
      }
      if (existingForItem && existingForItem.length > 0) {
        newCaixas[itemId] = existingForItem.map((e) => ({
          tipo_caixa_id: e.tipo_caixa_id,
          sigla: e.sigla,
          sugerida: e.sugerida,
          real: e.real,
          fator: e.fator,
        }));
      } else if (produtoId && sugestoesCaixas?.has(produtoId)) {
        const sug = sugestoesCaixas.get(produtoId)!;
        if (!sug.sem_conversao && sug.sugestoes.length > 0) {
          const bestSug = sug.sugestoes[0];
          newCaixas[itemId] = [
            {
              tipo_caixa_id: bestSug.tipo_caixa_id,
              sigla: bestSug.tipo_caixa_sigla,
              sugerida: bestSug.quantidade_caixas,
              real: bestSug.quantidade_caixas,
              fator: bestSug.fator,
            },
          ];
        }
      }
    }
    setCaixasItem(newCaixas);
    if (Object.keys(prefillSaida).length > 0) {
      setItens((prev) =>
        prev.map((row) =>
          !row.conferido && row.recebido === 0 && prefillSaida[row.id] > 0
            ? { ...row, recebido: prefillSaida[row.id] }
            : row,
        ),
      );
    }
  }, [
    conferencia,
    tipos,
    sugestoesCaixas,
    caixasItemExistentes,
    fornecedorIdPedido,
    itensParaSugestao.length,
    saidaLoading,
    caixasSaidaPorItem,
  ]);

  useEffect(() => {
    if (focusedRef.current || readOnly || itens.length === 0) return;
    // Espera a hidratação de caixas — senão o focus+blur com qty 0 zera a sugestão.
    if (!conferencia?.id || caixasInitRef.current !== conferencia.id) return;
    const firstIdx = itens.findIndex((it) => {
      if (it.conferido || it.aVincular) return false;
      const sr = (saldosItem as { item_pedido_id: string; saldo: number }[])
        .find((s) => s.item_pedido_id === it.itemPedidoId);
      return Number(sr?.saldo ?? it.pedido) > 0;
    });
    if (firstIdx >= 0) {
      focusedRef.current = true;
      setTimeout(() => stepperRefs.current[firstIdx]?.focus(), 200);
    }
  }, [itens, readOnly, saldosItem, caixasItem, conferencia?.id]);

  const handleStepperKeyDown = (idx: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void conferirIgualPedido(idx);
    }
  };

  /** Coluna Caixas: só mexe em caixas — não altera Nesta entr. */
  const applyCaixasAndSyncQty = useCallback((itemId: string, entries: CaixaItemEntry[]) => {
    setCaixasItem((prev) => ({ ...prev, [itemId]: entries }));
  }, []);

  const itemJaSolicitouVale = (itemId: string) => {
    return meusVales.some((v) => v.item_conferencia_id === itemId && v.status === "pendente");
  };

  const itemQtyLocked = (it: LinhaItem) =>
    itemConferenciaQtyLocked({
      conferenciaAberta,
      editando,
      readOnly,
      conferido: it.conferido,
      temValePendente: itemJaSolicitouVale(it.id),
    });

  const updateCaixasItem = useCallback(
    (itemId: string, entries: CaixaItemEntry[]) => {
      const it = itens.find((x) => x.id === itemId);
      if (!it) return;
      const valePend = meusVales.some(
        (v) => v.item_conferencia_id === itemId && v.status === "pendente",
      );
      if (
        itemConferenciaQtyLocked({
          conferenciaAberta,
          editando,
          readOnly,
          conferido: it.conferido,
          temValePendente: valePend,
        })
      ) {
        return;
      }
      applyCaixasAndSyncQty(itemId, entries);
    },
    [applyCaixasAndSyncQty, itens, meusVales, editando, conferenciaAberta, readOnly],
  );

  /** Nesta entr.: só mexe em recebido (cx) — não marca conferido nem altera Caixas. */
  const update = (idx: number, v: number) => {
    const it = itens[idx];
    if (!it) return;
    if (
      itemConferenciaQtyLocked({
        conferenciaAberta,
        editando,
        readOnly,
        conferido: it.conferido,
        temValePendente: itemJaSolicitouVale(it.id),
      })
    ) {
      return;
    }
    const newVal = Math.max(0, Math.round(v));
    setItens((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, recebido: newVal } : row)),
    );
  };

  const creditadosGalpaoRef = useRef<Set<string>>(new Set());

  const creditarGalpaoDoItem = async (
    it: LinhaItem,
    entries: CaixaItemEntry[],
    obs: string,
  ) => {
    if (!user?.id || !conferencia?.id || !fornecedorId) return;
    if (creditadosGalpaoRef.current.has(it.id)) return;
    // Com saída na roça as caixas já estão com o motorista: o crédito no
    // galpão sai do movimento motorista → packing, ao finalizar a entrega.
    if (temSaida) return;

    const byTipo = caixasParaGalpaoItem(it, entries);
    const cxNesta = nestaEntradaCaixas(it, entries);
    const sigla =
      entries.find((e) => e.sigla)?.sigla ??
      Object.keys(byTipo)[0] ??
      tipos[0]?.sigla ??
      null;
    const credito: Record<string, number> =
      cxNesta > 0 && sigla ? { [sigla]: cxNesta } : byTipo;

    let total = 0;
    for (const [tipo, qty] of Object.entries(credito)) {
      if (qty <= 0) continue;
      await entradaGalpao.mutateAsync({
        tipo_caixa: tipo,
        quantidade: qty,
        registrado_por: user.id,
        fornecedor_id: fornecedorId,
        conferencia_id: conferencia.id,
        observacoes: obs,
      });
      total += qty;
    }
    if (total > 0) creditadosGalpaoRef.current.add(it.id);
    return total;
  };

  /** Conferir: confirma qty (Nesta ou sugestão), credita galpão e trava o item. */
  const conferirIgualPedido = async (idx: number) => {
    if (readOnly) return;
    const it = itens[idx];
    if (!it || it.conferido) return;

    const saldoRow = (
      saldosItem as { item_pedido_id: string; recebido_acumulado: number }[]
    ).find((s) => s.item_pedido_id === it.itemPedidoId);
    const ja = Number(saldoRow?.recebido_acumulado ?? 0);
    let entries = [...(caixasItem[it.id] ?? [])];
    const fator = fatorDoItem(entries);
    const unRestante = Math.max(0, it.pedido - ja);
    const cxNecessarias =
      fator && fator > 0 ? Math.max(0, Math.ceil(unRestante / fator)) : unRestante;
    const cxAtual = nestaEntradaCaixas(it, entries);
    const qtdCx = cxAtual > 0 ? cxAtual : cxNecessarias;

    if (entries.length > 0) {
      const realSum = entries.reduce((a, e) => a + Number(e.real ?? 0), 0);
      if (realSum <= 0 && qtdCx > 0) {
        entries = entries.map((e, i) =>
          i === 0 ? { ...e, real: qtdCx } : e,
        );
        setCaixasItem((prev) => ({ ...prev, [it.id]: entries }));
      }
    }

    const updated: LinhaItem = { ...it, recebido: qtdCx, conferido: true };
    setItens((prev) => prev.map((row, i) => (i === idx ? updated : row)));

    try {
      const total = await creditarGalpaoDoItem(
        updated,
        entries,
        `Conferir · ${it.produto}`,
      );
      toast.success(
        total && total > 0
          ? `Conferido · ${total} cx no galpão`
          : "Item conferido",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao creditar galpão");
    }
  };

  /** NOP-327: desmarca item concluído enquanto a conferência está aberta (ou em edição ADM). */
  const desmarcarConferido = (idx: number) => {
    if (readOnly && !editando) return;
    setItens((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, conferido: false } : row)),
    );
  };

  const toggleQualidade = (idx: number) => {
    if (readOnly && !editando) return;
    setItens((prev) =>
      prev.map((it, i) =>
        i !== idx ? it : { ...it, qualidade: it.qualidade ? null : { ativo: true, qtd: 1 } },
      ),
    );
  };

  const fornecedorId = pedido?.fornecedor_id ?? pedidos.find((p) => p.id === pedidoId)?.fornecedor_id ?? "";

  const openValeDialog = (it: LinhaItem, jaRecebido: number, _entries: CaixaItemEntry[]) => {
    // Mantém it.recebido = Nesta entr. (cx). Unidades do vale = ja + nesta×fator.
    setValeItem(it);
    setValeJaRecebido(jaRecebido);
    setValeObs("");
    setValeFotos([]);
    setValeOpen(true);
  };

  const handleValeFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setValeUploading(true);
    try {
      const tempId = `temp-${Date.now()}`;
      const url = await uploadValeFoto(file, tempId);
      setValeFotos((prev) => [...prev, url]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setValeUploading(false);
    }
  };

  const submitVale = async () => {
    if (!valeItem || !user?.id || !pedidoId || !fornecedorId) {
      toast.error("Dados incompletos para solicitar vale");
      return;
    }
    const itLive = itens.find((i) => i.id === valeItem.id) ?? valeItem;
    const entries = caixasItem[valeItem.id] ?? [];
    const recebidoUn = valeJaRecebido + chegouEfetivo(itLive, entries);
    const diferenca = itLive.pedido - recebidoUn;
    if (diferenca <= 0) {
      toast.error("Não há diferença para solicitar vale");
      return;
    }
    const preco = itLive.preco ?? fallbackPreco;
    const valorCalc = diferenca * preco;
    const estimado = !itLive.preco;

    try {
      await createVale.mutateAsync({
        pedido_id: pedidoId,
        item_conferencia_id: valeItem.id,
        fornecedor_id: fornecedorId,
        conferente_id: user.id,
        produto_nome: itLive.produto,
        quantidade_pedida: itLive.pedido,
        quantidade_recebida: recebidoUn,
        diferenca,
        preco_unitario: preco,
        valor_calculado: valorCalc,
        estimado,
        observacao_conferente: valeObs.trim() || null,
        fotos: valeFotos,
      });

      const jaCreditou = creditadosGalpaoRef.current.has(valeItem.id);
      if (!jaCreditou) {
        await creditarGalpaoDoItem(itLive, entries, `Vale · ${itLive.produto}`);
      }

      setItens((prev) =>
        prev.map((row) =>
          row.id === valeItem.id ? { ...row, conferido: true } : row,
        ),
      );

      toast.success(
        jaCreditou
          ? "Solicitação de vale enviada ao ADM"
          : "Solicitação de vale enviada · caixas creditadas no galpão",
      );
      setValeOpen(false);
      setValeItem(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao solicitar vale");
    }
  };

  const stats = useMemo(() => {
    const contaveis = itens.filter((i) => !i.aVincular);
    const comSaldoReceber = contaveis.filter((i) => {
      const sr = (saldosItem as { item_pedido_id: string; saldo: number }[])
        .find((s) => s.item_pedido_id === i.itemPedidoId);
      return Number(sr?.saldo ?? i.pedido) > 0;
    });
    const total = comSaldoReceber.length;
    const conferidos = comSaldoReceber.filter((i) => i.conferido).length;
    const faltantes = total - conferidos;
    let divergencias = 0;
    let comSaldo = 0;
    let sobraUn = 0;
    for (const it of comSaldoReceber) {
      const saldoRow = (
        saldosItem as { item_pedido_id: string; recebido_acumulado: number }[]
      ).find((s) => s.item_pedido_id === it.itemPedidoId);
      const ja = Number(saldoRow?.recebido_acumulado ?? 0);
      const gap = gapVsPedido(it, caixasItem[it.id] ?? [], ja);
      const pct = it.toleranciaPct ?? toleranciaPct;
      const limite = Math.max((pct / 100) * it.pedido, toleranciaMin);
      const acimaTol = gap > 0 && Math.abs(gap) > limite;
      if (it.conferido && (acimaTol || it.qualidade?.ativo)) divergencias += 1;
      if (it.conferido && gap < 0) comSaldo += 1;
      if (it.conferido && gap > 0) sobraUn += gap;
    }
    return {
      total,
      conferidos,
      divergencias,
      comSaldo,
      sobraUn,
      faltantes,
      progresso: total ? Math.round((conferidos / total) * 100) : 0,
    };
  }, [itens, caixasItem, saldosItem, toleranciaPct, toleranciaMin]);

  /** NOP-129: saída × chegada do item — separado da divergência pedido × recebido. */
  const divergenciaTransporteDoItem = (it: LinhaItem, entries: CaixaItemEntry[]) => {
    const daSaida = it.itemPedidoId ? caixasSaidaPorItem.get(it.itemPedidoId) : undefined;
    const t = saldoTransporte(it, entries, daSaida);
    if (!saida || !daSaida || !t) return {};
    const fator = fatorDoItem(entries) ?? fatorDoItem(daSaida.entries);
    return {
      qtd_saida_caixas: t.saida,
      qtd_chegada_caixas: t.chegada,
      divergencia_transporte_caixas: t.dif,
      divergencia_transporte_unidades: fator && fator > 0 ? t.dif * fator : null,
    };
  };

  const buildItensPayload = () =>
    itens.map((it) => {
      const saldoRow = (
        saldosItem as { item_pedido_id: string; recebido_acumulado: number }[]
      ).find((s) => s.item_pedido_id === it.itemPedidoId);
      const entries = caixasItem[it.id] ?? [];
      const jaRecebido = Number(saldoRow?.recebido_acumulado ?? 0);
      const chegou = chegouEfetivo(it, entries);
      const gap = gapVsPedido(it, entries, jaRecebido);
      return {
        ...buildSavePayload(
          { ...it, recebido: chegou },
          {
            toleranciaPct: it.toleranciaPct ?? toleranciaPct,
            toleranciaMin,
            preco: it.preco,
            fallback: fallbackPreco,
            jaRecebido,
            gap,
          },
        ),
        ...divergenciaTransporteDoItem(it, entries),
      };
    });

  const persistCaixasEMovimento = async (status: "parcial" | "finalizada" | "edicao") => {
    const totaisCaixasReal: Record<string, number> = {};
    for (const it of itens) {
      const byTipo = caixasParaGalpaoItem(it, caixasItem[it.id] ?? []);
      for (const [sigla, qty] of Object.entries(byTipo)) {
        totaisCaixasReal[sigla] = (totaisCaixasReal[sigla] ?? 0) + qty;
      }
    }

    if (conferencia?.id) {
      for (const it of itens) {
        const entries = caixasItem[it.id] ?? [];
        await supabase.from("caixas_item_conferencia").delete().eq("item_conferencia_id", it.id);
        const rows = entries
          .filter((e) => e.sugerida > 0 || e.real > 0)
          .map((e) => ({
            item_conferencia_id: it.id,
            tipo_caixa_id: e.tipo_caixa_id,
            tipo_caixa_sigla: e.sigla,
            qtd_sugerida: e.sugerida,
            qtd_real: e.real,
            fator_usado: e.fator,
            registrado_por: user?.id ?? null,
          }));
        if (rows.length > 0) {
          await supabase.from("caixas_item_conferencia").insert(rows);
        }
      }
    }

    if ((status === "finalizada" || status === "edicao") && conferencia?.id) {
      await supabase.from("conferencia_caixas").delete().eq("conferencia_id", conferencia.id);
      const caixaRows = tipos
        .map((t) => ({
          conferencia_id: conferencia.id,
          tipo_caixa_sigla: t.sigla,
          qtd_cheias: totaisCaixasReal[t.sigla] ?? 0,
          qtd_vazias: 0,
        }))
        .filter((r) => r.qtd_cheias > 0);
      if (caixaRows.length) {
        await supabase.from("conferencia_caixas").insert(caixaRows);
      }
    }

    // Recebimento só credita galpão. Packing → fornecedor é na movimentação (motorista).
    // Em edição: apaga e regrava o ledger desta conferência (sem duplicar).
    if ((status === "finalizada" || status === "edicao") && user && pedido?.fornecedor_id && conferencia?.id) {
      await supabase
        .from("movimentacoes_caixa")
        .delete()
        .eq("documento_id", conferencia.id)
        .eq("documento_tipo", "entrega");

      if (saida) {
        await registrarChegada.mutateAsync({
          saida_id: saida.id,
          conferencia_id: conferencia.id,
          caixas: totaisCaixasReal,
        });
      } else {
        for (const t of tipos) {
          const realQty = totaisCaixasReal[t.sigla] ?? 0;
          if (realQty > 0) {
            await entradaGalpao.mutateAsync({
              tipo_caixa: t.sigla,
              quantidade: realQty,
              registrado_por: user.id,
              fornecedor_id: pedido.fornecedor_id,
              conferencia_id: conferencia.id,
              observacoes: status === "edicao" ? "Entrada conferência (edição)" : "Entrada conferência",
            });
          }
        }
      }
    }

    return totaisCaixasReal;
  };

  const salvarEdicao = async () => {
    if (!conferencia?.id || !editMotivo.trim()) {
      toast.error("Informe o motivo da edição");
      return;
    }
    try {
      const result = await editMut.mutateAsync({
        conferenciaId: conferencia.id,
        pedidoId,
        motivo: editMotivo.trim(),
        itens: buildItensPayload(),
      });
      await persistCaixasEMovimento("edicao");
      setEditando(false);
      setEditDialogOpen(false);
      setEditMotivo("");
      toast.success("Conferência atualizada", {
        description:
          result.vales_revisao > 0
            ? `${result.vales_revisao} vale(s) já no Wise foram marcados para revisão do ADM.`
            : "Divergência, vale e caixas recalculados.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar edição");
    }
  };

  const iniciarEdicao = () => {
    if (!podeEditarConferenciaFinalizada(isAdmin)) {
      toast.error("Só o administrador pode editar conferência finalizada");
      return;
    }
    if (valesLancadosNaConf.length > 0) {
      setValeWiseWarn(true);
      return;
    }
    setEditMotivo("");
    setEditDialogOpen(true);
  };

  const confirmarInicioEdicao = () => {
    setValeWiseWarn(false);
    setEditMotivo("");
    setEditDialogOpen(true);
  };

  const confirmarMotivoEEditar = () => {
    if (!editMotivo.trim()) {
      toast.error("Motivo obrigatório");
      return;
    }
    setEditando(true);
    setEditDialogOpen(false);
    // Libera qty: desmarca conferido para permitir correção.
    setItens((prev) => prev.map((row) => ({ ...row, conferido: false })));
    caixasInitRef.current = null;
    toast.message("Modo edição", {
      description: "Corrija os itens e salve a edição.",
    });
  };

  const salvar = async (status: "parcial" | "finalizada") => {
    if (editando) {
      await salvarEdicao();
      return;
    }
    if (readOnly) return;
    if (!conferencia?.id) {
      toast.error("Conferência ainda não iniciada");
      return;
    }
    try {
      const result = await saveMut.mutateAsync({
        conferenciaId: conferencia.id,
        pedidoId,
        status,
        itens: buildItensPayload(),
      });

      const totaisCaixasReal = await persistCaixasEMovimento(status);
      const cargas = result?.cargasGeradas ?? [];
      const movTxt = tipos
        .map((t) => {
          const c = totaisCaixasReal[t.sigla] ?? 0;
          if (!c) return null;
          return `${t.sigla}: +${c} cheias → galpão${saida ? " (motorista)" : ""}`;
        })
        .filter(Boolean)
        .join(" · ");
      toast.success(status === "finalizada" ? "Entrega finalizada" : "Parcial salva", {
        description:
          status === "finalizada"
            ? cargas.length
              ? `${stats.conferidos} itens conferidos · ${cargas.length} carga(s) criada(s) no Painel de Carga (${cargas.map((c) => c.codigo).join(", ")}).`
              : `${stats.conferidos} itens · ${movTxt || "sem movimento de caixa"}`
            : `${stats.conferidos} itens guardados.`,
      });
      if (status === "finalizada") onFinished();
      else if (!embedded) onBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar conferência");
    }
  };

  const finalizar = () => {
    const saldoAberto = (saldosItem as { saldo: number }[]).some((s) => Number(s.saldo) > 0);
    if (stats.faltantes > 0 || saldoAberto) {
      setConfirmFinal(true);
      return;
    }
    salvar("finalizada");
  };

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !fotoItemId) return;
    try {
      await uploadConferenciaFoto(file, fotoItemId);
      toast.success("Foto anexada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto");
    }
  };

  const submitAvulso = async () => {
    if (!conferencia?.id || !avulsoProduto || avulsoQtd <= 0) {
      toast.error("Selecione produto e quantidade");
      return;
    }
    try {
      await addAvulso.mutateAsync({
        pedidoId,
        conferenciaId: conferencia.id,
        produtoId: avulsoProduto,
        quantidade: avulsoQtd,
      });
      toast.success("Item avulso adicionado");
      setAvulsoOpen(false);
      setAvulsoProduto("");
      setAvulsoQtd(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar item");
    }
  };

  if (isLoading || startMut.isPending) {
    return <p className="text-sm text-muted-foreground p-4">Carregando conferência…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive p-4">Erro ao carregar conferência: {error.message}</p>
    );
  }

  return (
    <div>
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFoto}
      />

      {!embedded && (
        <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-3 mb-4 bg-background/95 backdrop-blur-md border-b border-border/70">
          <PageHeader
            title={fornecedorNome}
            subtitle={`Pedido ${codigo}${wiseId ? ` · Wise ${wiseId}` : ""} · Entrega ${entregaAtual || 1} de ${entregaTotal}${horaChegada ? ` · Chegou às ${formatTime(horaChegada)}` : ""} · Conferente: ${conferenteNome}`}
            actions={
              readOnly ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy min-h-11"
                >
                  <ArrowLeft size={14} /> Voltar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTrocarPedidoOpen(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-dark hover:underline min-h-11"
                >
                  <Search size={14} /> Trocar pedido
                </button>
              )
            }
          />
        </div>
      )}
      {embedded && (
        <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-navy">{fornecedorNome}</h2>
              {editada && <span className="chip chip-warn">editada</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pedido {codigo}
              {wiseId ? ` · Wise ${wiseId}` : ""} · Entrega {entregaAtual || 1} de {entregaTotal}
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-navy"
          >
            Remover da sessão
          </button>
        </div>
      )}

      {(editada || edicoes.length > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {editada && <span className="chip chip-warn">Conferência editada</span>}
          {edicoes.length > 0 && (
            <button
              type="button"
              onClick={() => setHistOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-dark hover:underline"
            >
              <History size={12} /> Histórico ({edicoes.length})
            </button>
          )}
        </div>
      )}

      {readOnly && (
        <div className="bg-secondary border border-border rounded-lg p-3 mb-4 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong className="text-navy">Conferência encerrada.</strong>{" "}
            {aguardandoLiberacao
              ? "Pedido com divergência aguarda liberação do administrador para expedição."
              : podeEditarConferenciaFinalizada(isAdmin)
                ? "Visualização somente leitura — ADM pode editar com motivo."
                : "Visualização somente leitura. Correções após finalizar passam pelo ADM."}
            {editada && (
              <span className="chip chip-warn ml-2">editada</span>
            )}
          </div>
          {podeEditarConferenciaFinalizada(isAdmin) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={iniciarEdicao}
              className="gap-1.5"
            >
              <Pencil size={14} /> Editar conferência
            </Button>
          )}
        </div>
      )}

      {editando && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong>Editando conferência.</strong> Motivo: {editMotivo || "—"}
            {valesLancadosNaConf.length > 0 && (
              <span className="block text-xs mt-1">
                {valesLancadosNaConf.length} vale(s) já no Wise serão enviados à revisão do ADM.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              itensHydratedRef.current = null;
            }}
            className="text-xs font-semibold underline"
          >
            Cancelar edição
          </button>
        </div>
      )}

      {saida && (
        <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 mb-4 flex items-start gap-2 text-sm text-primary-dark">
          <Truck size={16} className="mt-0.5 shrink-0" />
          <div>
            <strong>
              {resumoSaida({
                registrado_em: saida.registrado_em,
                total_caixas: saida.total_caixas,
                motorista_nome: one(saida.motoristas)?.nome ?? null,
                veiculo_fornecedor: saida.veiculo_fornecedor,
              })}
            </strong>
            <div className="text-xs mt-0.5">
              Caixas já pré-preenchidas pela saída. Mudar a quantidade aqui registra
              <strong> divergência de transporte</strong> — a divergência do pedido continua
              separada.
            </div>
          </div>
        </div>
      )}

      {!readOnly && sugestoesCaixas && (() => {
        const semFator = [...sugestoesCaixas.values()].filter((s) => s.sem_conversao).length;
        if (!semFator) return null;
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-950">
            <strong>{semFator} produto(s) sem conversão</strong>
            {" — "}selo em cada item; cadastre o fator em{" "}
            <Link to="/gestao/produtos" className="underline font-medium">
              Produtos
            </Link>{" "}
            ou em{" "}
            <Link to="/gestao/conversao" className="underline font-medium">
              Unidades por caixa
            </Link>
            .
          </div>
        );
      })()}

      {!embedded && (
        <FluxoPassos
          steps={["Escolher pedidos", "Conferir itens", "Finalizar"]}
          current={
            readOnly && !editando
              ? 3
              : stats.faltantes === 0 && stats.total > 0
                ? 3
                : 2
          }
        />
      )}

      <div
        className="card-base p-4 mb-4 flex items-center justify-between border-l-4"
        style={{
          borderLeftColor:
            stats.faltantes === 0
              ? "var(--success)"
              : stats.divergencias > 0
                ? "var(--danger)"
                : "var(--warning)",
        }}
      >
        <div>
          <div className="text-sm font-bold text-navy">{fornecedorNome}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {stats.faltantes === 0
              ? "Todos os itens conferidos"
              : `${stats.faltantes} item(ns) ainda faltam conferir`}
            {stats.divergencias > 0 && ` · ${stats.divergencias} divergência(s)`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-navy tabular-nums">
            {stats.conferidos}/{stats.total}
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">conferidos</div>
        </div>
      </div>

      <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 mb-5 flex gap-2 text-xs text-primary-dark">
        <Info size={14} className="mt-0.5" />
        <span>
          Recebimento sempre aceito. Divergências alimentam o Relatório de Faltas — não interrompem
          o lançamento. Toque num item para conferir quantidade e caixas.
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <MiniStat label="Itens" value={stats.total.toString()} />
        <MiniStat label="Conferidos" value={`${stats.conferidos}/${stats.total}`} tone="ok" />
        <MiniStat label="Divergências" value={stats.divergencias.toString()} tone="danger" />
      </div>

      {/* Lista compacta — steppers só no sheet do item */}
      <div className="card-base divide-y divide-border mb-5">
        {itens.map((it, idx) => {
          const saldoRow = (
            saldosItem as {
              item_pedido_id: string;
              recebido_acumulado: number;
              saldo: number;
            }[]
          ).find((s) => s.item_pedido_id === it.itemPedidoId);
          const jaRecebido = Number(saldoRow?.recebido_acumulado ?? 0);
          const saldo = Number(saldoRow?.saldo ?? it.pedido - jaRecebido);
          const itemCaixas = caixasItem[it.id] ?? [];
          const gap = gapVsPedido(it, itemCaixas, jaRecebido);
          const pendente = !it.conferido;
          const saldoZero = saldo <= 0;
          const sugestaoItem = it.produtoId ? sugestoesCaixas?.get(it.produtoId) : undefined;

          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setItemSheetIdx(idx)}
              className="w-full text-left px-3 py-3 sm:px-4 hover:bg-secondary/40 transition-colors flex items-start justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-navy text-sm leading-tight truncate">
                  {it.produto}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Pedido · <span className="font-semibold tabular-nums text-navy">{it.pedido}</span>
                  {it.cliente ? ` · ${it.cliente}` : ""}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {it.aVincular && <ChipLabel value="a vincular" tone="warn" />}
                  {sugestaoItem?.sem_conversao && (
                    <span className="inline-flex">
                      <SemConversaoSelo faltaFornecedor compact />
                    </span>
                  )}
                  {saldoZero && <ChipLabel value="Completo" tone="ok" />}
                  {!saldoZero && pendente && <ChipLabel value="Pendente" tone="muted" />}
                  {!saldoZero && !pendente && gap === 0 && <ChipLabel value="OK" tone="ok" />}
                  {!saldoZero && !pendente && gap < 0 && (
                    <ChipLabel label="Diferença" value={Math.abs(gap)} tone="warn" />
                  )}
                  {!saldoZero && !pendente && gap > 0 && (
                    <ChipLabel label="Sobra" value={gap} tone="danger" />
                  )}
                  {it.qualidade && <ChipLabel value="Qualidade" tone="warn" />}
                  {it.foto_url && <ChipLabel value="Foto" tone="info" />}
                  {itemJaSolicitouVale(it.id) && <ChipLabel value="Vale pendente" tone="info" />}
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />
            </button>
          );
        })}
        {itens.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum item</p>
        )}
      </div>

      <ItemConferirSheet
        open={itemSheetIdx != null}
        onOpenChange={(o) => !o && setItemSheetIdx(null)}
        idx={itemSheetIdx}
        itens={itens}
        saldosItem={saldosItem as { item_pedido_id: string; recebido_acumulado: number; saldo: number }[]}
        caixasItem={caixasItem}
        sugestoesCaixas={sugestoesCaixas}
        tipos={tipos}
        caixasSaidaPorItem={caixasSaidaPorItem}
        readOnly={readOnly}
        editando={editando}
        itemQtyLocked={itemQtyLocked}
        update={update}
        updateCaixasItem={updateCaixasItem}
        conferirIgualPedido={conferirIgualPedido}
        desmarcarConferido={desmarcarConferido}
        toggleQualidade={toggleQualidade}
        onFoto={(id) => {
          setFotoItemId(id);
          fotoRef.current?.click();
        }}
        openValeDialog={openValeDialog}
        itemJaSolicitouVale={itemJaSolicitouVale}
        handleStepperKeyDown={handleStepperKeyDown}
        stepperRefs={stepperRefs}
        onClose={() => setItemSheetIdx(null)}
      />

      {tipos.length > 0 && (
        <div className="mt-5 rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Resumo de caixas desta entrega → galpão</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tipos.map((t) => {
              const cheiasCalc = itens.reduce((acc, it) => {
                const entries = caixasItem[it.id] ?? [];
                const e = entries.find((x) => x.sigla === t.sigla);
                return acc + (e?.real ?? 0);
              }, 0);
              return (
                <div key={t.id} className="p-2 rounded-lg bg-secondary/50 text-center">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">{t.sigla}</div>
                  <div className="text-lg font-bold text-navy">{cheiasCalc}</div>
                  <div className="text-[10px] text-muted-foreground">cheias → galpão</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {meusVales.length > 0 && (
        <div className="mt-5 rounded-xl border p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Receipt size={14} /> Vales deste pedido
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Só vales do pedido aberto. A fila pessoal completa fica em{" "}
            <Link to="/recebimento/vales" className="underline font-medium">
              Vales
            </Link>
            .
          </p>
          <div className="space-y-2">
            {meusVales.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 p-2 rounded bg-secondary/30 text-sm">
                <div>
                  <span className="font-medium">{v.produto_nome ?? "Produto"}</span>
                  <span className="text-muted-foreground ml-2">· {v.diferenca} un</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatBRL(v.valor_calculado)}</span>
                  {v.status === "pendente" && (
                    <span className="chip chip-warn">Pendente</span>
                  )}
                  {v.status === "aplicado" && (
                    <span className="chip chip-ok">
                      Aplicado · {v.valor_final != null ? formatBRL(v.valor_final) : "—"}
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
            {meusVales.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                +{meusVales.length - 5} vales anteriores
              </p>
            )}
          </div>
        </div>
      )}

      {(!readOnly || editando) && (
        <>
          <div className="h-28 lg:hidden" aria-hidden />
          <div
            className={[
              "lg:mt-5",
              "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur-md p-3 md:p-4",
              "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
              "lg:static lg:inset-auto lg:z-auto lg:border-0 lg:bg-transparent lg:backdrop-blur-none lg:p-0 lg:pb-0",
            ].join(" ")}
          >
            {editando ? (
              <HeaderAcoes
                className="w-full justify-between"
                primary={
                  <button
                    type="button"
                    onClick={() => void salvarEdicao()}
                    disabled={editMut.isPending}
                    className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 min-h-12 lg:min-h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary-dark active:scale-[0.99] transition disabled:opacity-50"
                  >
                    <Save size={16} /> Salvar edição
                  </button>
                }
                detalhes={[
                  {
                    label: "Cancelar edição",
                    onClick: () => {
                      setEditando(false);
                      itensHydratedRef.current = null;
                    },
                  },
                ]}
              />
            ) : (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground text-center lg:text-left lg:mb-0">
                  Assinatura: <span className="font-semibold text-navy">{conferenteNome}</span>
                </div>
                <HeaderAcoes
                  className="w-full justify-between"
                  primary={
                    <button
                      type="button"
                      onClick={finalizar}
                      disabled={saveMut.isPending}
                      className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 min-h-12 lg:min-h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary-dark active:scale-[0.99] transition disabled:opacity-50"
                    >
                      <CheckCircle2 size={16} />{" "}
                      "Finalizar entrega"
                    </button>
                  }
                  detalhes={[
                    {
                      label: "Salvar parcial",
                      onClick: () => salvar("parcial"),
                      disabled: saveMut.isPending,
                    },
                    { label: "Item avulso", onClick: () => setAvulsoOpen(true) },
                  ]}
                />
              </div>
            )}
          </div>
        </>
      )}

      <Dialog open={avulsoOpen && !readOnly} onOpenChange={setAvulsoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item avulso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Produto</Label>
              <SeletorCadastro
                tipo="produto"
                value={avulsoProduto || null}
                onChange={(id) => setAvulsoProduto(id)}
                fornecedorId={fornecedorId || null}
                suggestedIds={produtosDoPedido}
              />
            </div>
            <div className="space-y-2">
              <Label>Quantidade recebida</Label>
              <Input
                type="number"
                min={1}
                value={avulsoQtd}
                onChange={(e) => setAvulsoQtd(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvulsoOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitAvulso} disabled={addAvulso.isPending}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmFinal} onOpenChange={setConfirmFinal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar esta entrega?</AlertDialogTitle>
            <AlertDialogDescription>
              {stats.comSaldo > 0
                ? "Restante pendente, não é falta até encerrar."
                : stats.sobraUn > 0
                  ? `${stats.sobraUn} un a mais nesta entrega.`
                  : "Confirme para finalizar esta entrega."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmFinal(false);
                salvar("finalizada");
              }}
            >
              Finalizar entrega
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={trocarPedidoOpen}
        onOpenChange={(o) => {
          setTrocarPedidoOpen(o);
          if (!o) setBuscaTrocaPedido("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar pedido</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Busque um pedido ativo por fornecedor ou código.
          </p>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={buscaTrocaPedido}
              onChange={(e) => setBuscaTrocaPedido(e.target.value)}
              placeholder="Buscar pedido ativo…"
              className="pl-9 min-h-11"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {pedidosSeletor
              .filter((p) => {
                const q = normalizeKey(buscaTrocaPedido);
                if (!q) return true;
                return (
                  normalizeKey(p.nome).includes(q) ||
                  normalizeKey(p.codigo ?? "").includes(q)
                );
              })
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={p.id === pedidoId}
                  onClick={() => {
                    if (p.id === pedidoId) return;
                    onTrocar(p.id);
                    setTrocarPedidoOpen(false);
                    setBuscaTrocaPedido("");
                  }}
                  className={`w-full text-left px-3 py-3 text-sm hover:bg-secondary/50 disabled:opacity-60 ${
                    p.id === pedidoId ? "bg-primary-soft" : ""
                  }`}
                >
                  <div className="font-semibold text-navy">{p.nome}</div>
                  {p.codigo && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Pedido {p.codigo}
                      {p.id === pedidoId ? " · atual" : ""}
                    </div>
                  )}
                </button>
              ))}
            {pedidosSeletor.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nenhum pedido ativo
              </p>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setTrocarPedidoOpen(false);
                setBuscaTrocaPedido("");
                onBack();
              }}
            >
              Voltar à seleção
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setTrocarPedidoOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={valeOpen} onOpenChange={setValeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Solicitar vale ao ADM</DialogTitle>
          </DialogHeader>
          <input
            ref={valeFotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleValeFotoUpload}
          />
          {valeItem && (() => {
            const itLive = itens.find((i) => i.id === valeItem.id) ?? valeItem;
            const entries = caixasItem[valeItem.id] ?? [];
            const recebidoUn = valeJaRecebido + chegouEfetivo(itLive, entries);
            const diferencaUn = itLive.pedido - recebidoUn;
            const cxGalpao = (() => {
              const cxNesta = nestaEntradaCaixas(itLive, entries);
              if (cxNesta > 0) return cxNesta;
              return Object.values(caixasParaGalpaoItem(itLive, entries)).reduce(
                (a, n) => a + n,
                0,
              );
            })();
            const preco = itLive.preco ?? fallbackPreco;
            return (
            <div className="space-y-4">
              <div className="bg-secondary/50 rounded-lg p-3 text-sm space-y-1">
                <div className="font-semibold text-navy">{itLive.produto}</div>
                <div className="text-muted-foreground">
                  Pedido {codigo} · {fornecedorNome}
                </div>
              </div>
              
              <div className="rounded-lg border divide-y sm:grid sm:grid-cols-3 sm:gap-3 sm:border-0 sm:divide-y-0 sm:text-center">
                <div className="flex items-center justify-between gap-2 p-3 sm:flex-col sm:gap-0 sm:rounded-lg sm:border">
                  <span className="text-xs text-muted-foreground sm:order-2">Pedido (un)</span>
                  <span className="text-xl sm:text-2xl font-bold text-navy tabular-nums sm:order-1">
                    {itLive.pedido}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 p-3 sm:flex-col sm:gap-0 sm:rounded-lg sm:border">
                  <span className="text-xs text-muted-foreground sm:order-2">Recebido (un)</span>
                  <span className="text-xl sm:text-2xl font-bold text-navy tabular-nums sm:order-1">
                    {recebidoUn}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 p-3 bg-amber-50 sm:flex-col sm:gap-0 sm:rounded-lg sm:border sm:border-amber-200">
                  <span className="text-xs text-amber-600 sm:order-2">Diferença (un)</span>
                  <span className="text-xl sm:text-2xl font-bold text-amber-700 tabular-nums sm:order-1">
                    {diferencaUn}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border bg-secondary/30 text-sm">
                <span className="text-muted-foreground">Caixas que entram no galpão: </span>
                <span className="font-bold text-navy">{cxGalpao}</span>
              </div>

              <div className="p-3 rounded-lg border border-primary/20 bg-primary-soft">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Valor calculado:</span>
                  <span className="text-lg font-bold text-primary-dark">
                    {formatBRL(diferencaUn * preco)}
                    {!itLive.preco && <span className="text-xs font-normal ml-1">(estimado)</span>}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {diferencaUn} {itLive.unid} × {formatBRL(preco)}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observação (opcional)</Label>
                <Textarea
                  placeholder="Motivo, detalhes ou justificativa..."
                  value={valeObs}
                  onChange={(e) => setValeObs(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Fotos (opcional)</Label>
                <div className="flex flex-wrap gap-2">
                  {valeFotos.map((url, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-md overflow-hidden border">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        className="absolute top-0 right-0 bg-destructive text-white text-xs w-5 h-5 flex items-center justify-center"
                        onClick={() => setValeFotos((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => valeFotoRef.current?.click()}
                    disabled={valeUploading}
                    className="w-16 h-16 rounded-md border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {valeUploading ? "..." : <Camera size={20} />}
                  </button>
                </div>
              </div>
            </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setValeOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitVale} disabled={createVale.isPending || !valeItem}>
              {createVale.isPending ? "Enviando..." : "Solicitar vale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={valeWiseWarn} onOpenChange={setValeWiseWarn}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vale já lançado no Wise</AlertDialogTitle>
            <AlertDialogDescription>
              Esta conferência tem {valesLancadosNaConf.length} vale(s) já lançado(s) no Wise.
              Ao editar, o(s) vale(s) não serão alterados automaticamente — o ADM precisará
              revisar. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarInicioEdicao}>Continuar edição</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar conferência</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Informe o motivo da correção. Divergência, vale e movimento de caixas serão
              recalculados ao salvar.
            </p>
            <div className="space-y-2">
              <Label>Motivo (obrigatório)</Label>
              <Textarea
                value={editMotivo}
                onChange={(e) => setEditMotivo(e.target.value)}
                placeholder="Ex.: quantidade digitada errada no item X"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarMotivoEEditar} disabled={!editMotivo.trim()}>
              Abrir para edição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de edições</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {edicoes.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma edição registrada.</p>
            )}
            {edicoes.map((ed) => (
              <div key={ed.id} className="rounded-lg border border-border p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-navy">
                    {ed.editor?.nome ?? "Usuário"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateBRT(ed.editado_em)} {formatTime(ed.editado_em)}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  Motivo: <span className="text-navy">{ed.motivo}</span>
                </p>
                {ed.vales_revisao > 0 && (
                  <span className="chip chip-warn text-xs">
                    {ed.vales_revisao} vale(s) p/ revisão ADM
                  </span>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold">Antes → depois</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all bg-secondary/40 p-2 rounded max-h-40 overflow-auto">
                    {JSON.stringify({ antes: ed.antes, depois: ed.depois }, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemConferirSheet({
  open,
  onOpenChange,
  idx,
  itens,
  saldosItem,
  caixasItem,
  sugestoesCaixas,
  tipos,
  caixasSaidaPorItem,
  readOnly,
  editando,
  itemQtyLocked,
  update,
  updateCaixasItem,
  conferirIgualPedido,
  desmarcarConferido,
  toggleQualidade,
  onFoto,
  openValeDialog,
  itemJaSolicitouVale,
  handleStepperKeyDown,
  stepperRefs,
  onClose,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  idx: number | null;
  itens: LinhaItem[];
  saldosItem: { item_pedido_id: string; recebido_acumulado: number; saldo: number }[];
  caixasItem: Record<string, CaixaItemEntry[]>;
  sugestoesCaixas?: SugestaoItemMap | null;
  tipos: TipoCaixa[];
  caixasSaidaPorItem: Map<string, { entries: CaixaItemEntry[]; total: number }>;
  readOnly: boolean;
  editando: boolean;
  itemQtyLocked: (it: LinhaItem) => boolean;
  update: (idx: number, v: number) => void;
  updateCaixasItem: (itemId: string, entries: CaixaItemEntry[]) => void;
  conferirIgualPedido: (idx: number) => Promise<void>;
  desmarcarConferido: (idx: number) => void;
  toggleQualidade: (idx: number) => void;
  onFoto: (itemId: string) => void;
  openValeDialog: (it: LinhaItem, jaRecebido: number, entries: CaixaItemEntry[]) => void;
  itemJaSolicitouVale: (itemId: string) => boolean;
  handleStepperKeyDown: (idx: number) => (e: React.KeyboardEvent<HTMLInputElement>) => void;
  stepperRefs: React.MutableRefObject<Record<number, HTMLInputElement | null>>;
  onClose: () => void;
}) {
  const it = idx != null ? itens[idx] : undefined;
  if (!it || idx == null) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }
  const saldoRow = saldosItem.find((s) => s.item_pedido_id === it.itemPedidoId);
  const jaRecebido = Number(saldoRow?.recebido_acumulado ?? 0);
  const saldo = Number(saldoRow?.saldo ?? it.pedido - jaRecebido);
  const sugestaoItem = it.produtoId ? sugestoesCaixas?.get(it.produtoId) : undefined;
  const itemCaixas = caixasItem[it.id] ?? [];
  const nestaEntr = nestaEntradaCaixas(it, itemCaixas);
  const gap = gapVsPedido(it, itemCaixas, jaRecebido);
  const pendente = !it.conferido;
  const saldoZero = saldo <= 0;
  const qtyLocked = itemQtyLocked(it);
  const transporte = saldoTransporte(
    it,
    itemCaixas,
    it.itemPedidoId ? caixasSaidaPorItem.get(it.itemPedidoId) : undefined,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-xl px-4 pb-6">
        <SheetHeader className="text-left mb-3">
          <SheetTitle className="pr-8">{it.produto}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Pedido · {it.pedido} {it.unid}
            {it.cliente ? ` · ${it.cliente}` : ""}
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {saldoZero && <ChipLabel value="Completo" tone="ok" />}
            {!saldoZero && pendente && <ChipLabel value="Pendente" tone="muted" />}
            {!saldoZero && !pendente && gap === 0 && <ChipLabel value="OK" tone="ok" />}
            {!saldoZero && !pendente && gap < 0 && (
              <ChipLabel label="Diferença" value={Math.abs(gap)} tone="warn" />
            )}
            {!saldoZero && !pendente && gap > 0 && (
              <ChipLabel label="Sobra" value={gap} tone="danger" />
            )}
            {it.qualidade && <ChipLabel value="Qualidade" tone="warn" />}
          </div>
        </SheetHeader>

        <div className="mb-4 rounded-lg bg-secondary/50 divide-y divide-border grid grid-cols-3 gap-0 sm:gap-2 sm:bg-transparent sm:divide-y-0">
          <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-2.5 sm:rounded-lg sm:bg-secondary/50">
            <span className="text-xs text-muted-foreground">Pedido</span>
            <span className="font-bold text-navy tabular-nums">{it.pedido}</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-2.5 sm:rounded-lg sm:bg-secondary/50">
            <span className="text-xs text-muted-foreground">Já receb.</span>
            <span className="font-bold text-muted-foreground tabular-nums">{jaRecebido}</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-2.5 sm:rounded-lg sm:bg-secondary/50">
            <span className="text-xs text-muted-foreground">Saldo</span>
            <span
              className="font-bold tabular-nums"
              style={{ color: saldo > 0 ? "var(--warning)" : "var(--success)" }}
            >
              {saldo}
            </span>
          </div>
        </div>

        {!qtyLocked && !it.aVincular && !saldoZero && (
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1.5">Nesta entrega (cx)</div>
            <NumberStepper
              value={nestaEntr}
              onChange={(v) => update(idx, v)}
              inputMode="numeric"
              inputRef={(el) => {
                stepperRefs.current[idx] = el;
              }}
              onKeyDown={handleStepperKeyDown(idx)}
            />
          </div>
        )}

        {(qtyLocked || it.aVincular || saldoZero) && (
          <div className="mb-4 text-sm">
            <span className="text-muted-foreground">Nesta entrega: </span>
            <span className="font-semibold">{it.aVincular ? "—" : nestaEntr} cx</span>
            {it.conferido && qtyLocked && <ChipLabel value="Travado" tone="ok" className="ml-2" />}
            {it.conferido && !qtyLocked && <ChipLabel value="Conferido" tone="ok" className="ml-2" />}
          </div>
        )}

        {transporte && (
          <div className="mb-4 text-xs flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">Saída na roça:</span>
            <span className="font-semibold">{transporte.saida} cx</span>
            {transporte.dif !== 0 && (
              <ChipLabel
                label="Transporte"
                value={`${transporte.dif > 0 ? "+" : ""}${transporte.dif} cx`}
                tone="danger"
              />
            )}
          </div>
        )}

        {itemCaixas.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-1.5">Caixas</div>
            <CaixasItemEditor
              entries={itemCaixas}
              onChange={(entries) => updateCaixasItem(it.id, entries)}
              tipos={tipos}
              sugestao={sugestaoItem}
              readOnly={qtyLocked || !!it.aVincular}
            />
          </div>
        )}

        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <div className="flex flex-wrap gap-2 w-full">
            {!readOnly && pendente && !it.aVincular && !saldoZero && (
              <Button
                type="button"
                className="flex-1 min-h-11"
                onClick={() => {
                  void conferirIgualPedido(idx).then(onClose);
                }}
              >
                <Check size={16} className="mr-1.5" /> Conferir item
              </Button>
            )}
            {(!readOnly || editando) && it.conferido && !it.aVincular && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 min-h-11"
                onClick={() => desmarcarConferido(idx)}
              >
                Desmarcar concluído
              </Button>
            )}
            {(!readOnly || editando) && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={`h-11 w-11 ${
                    it.qualidade
                      ? "border-transparent bg-[rgba(240,169,43,0.15)] text-[var(--warning)]"
                      : ""
                  }`}
                  aria-label="Marcar problema de qualidade"
                  onClick={() => toggleQualidade(idx)}
                >
                  <AlertTriangle size={18} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11"
                  aria-label="Adicionar foto"
                  onClick={() => onFoto(it.id)}
                >
                  <Camera size={18} />
                </Button>
              </>
            )}
            {gap < 0 && !itemJaSolicitouVale(it.id) && !readOnly && nestaEntr > 0 && (
              <Button
                type="button"
                variant="outline"
                className="flex-1 min-h-11 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                onClick={() => openValeDialog(it, jaRecebido, itemCaixas)}
              >
                <Receipt size={16} className="mr-1.5" /> Vale
              </Button>
            )}
          </div>
          {itemJaSolicitouVale(it.id) && <ChipLabel value="Vale pendente" tone="info" />}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger" | "info";
}) {
  const c =
    tone === "ok"
      ? "var(--success)"
      : tone === "warn"
        ? "var(--warning)"
        : tone === "danger"
          ? "var(--danger)"
          : tone === "info"
            ? "var(--info)"
            : "var(--navy)";
  return (
    <div className="card-base p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1" style={{ color: c }}>
        {value}
      </div>
    </div>
  );
}
