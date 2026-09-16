import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Plus,
  Save,
  CheckCircle2,
  Camera,
  Info,
  ArrowLeft,
  Check,
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { TableWrapper } from "@/components/table-wrapper";
import { NumberStepper } from "@/components/number-stepper";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePedidosDia, usePedido, useConfigValor, useSaldoItensPedido } from "@/hooks/use-pedidos";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useRegistrarMovimentoFornecedor, useRegistrarEntradaGalpao } from "@/hooks/use-ledger";
import {
  useConferencia,
  useStartConferencia,
  useSaveConferenciaItens,
  useAddItemAvulso,
  uploadConferenciaFoto,
} from "@/hooks/use-conferencia";
import { useProdutos } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import { formatTime, formatDateBRT } from "@/lib/utils-date";
import { one } from "@/lib/embed";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCreateVale, useValesConferente, uploadValeFoto } from "@/hooks/use-vales";
import { useSugestaoCaixas } from "@/hooks/use-sugestao-caixas";
import { CaixasItemEditor, type CaixaItemEntry } from "@/components/caixas-item-editor";
import { useCaixasItemConferencia } from "@/hooks/use-caixas-item";

type ConferirSearch = { pedidoId?: string };

export const Route = createFileRoute("/recebimento/conferir")({
  validateSearch: (search: Record<string, unknown>): ConferirSearch => ({
    pedidoId: typeof search.pedidoId === "string" ? search.pedidoId : undefined,
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
  const { pedidoId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: pedidos = [], isLoading: loadingPedidos } = usePedidosDia();
  const pendentes = pedidos.filter((p) => p.status === "pendente" || p.status === "parcial");

  const clearPedido = () => navigate({ search: {} });
  const selectPedido = (id: string) => navigate({ search: { pedidoId: id } });

  if (!pedidoId) {
    return (
      <div>
        <PageHeader
          title="Conferir chegada"
          subtitle="Selecione o pedido pendente — a conferência inicia na hora"
          actions={
            <Link
              to="/recebimento"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
            >
              <ArrowLeft size={14} /> Voltar
            </Link>
          }
        />
        <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 mb-5 flex gap-2 text-xs text-primary-dark">
          <Info size={14} className="mt-0.5" />
          <span>
            O recebimento é <strong>sempre aceito</strong>. Divergências não bloqueiam: viram
            registro no <strong>Relatório de Faltas</strong>.
          </span>
        </div>
        {loadingPedidos && <p className="text-sm text-muted-foreground">Carregando pedidos…</p>}
        {!loadingPedidos && pendentes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum pedido pendente hoje.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pendentes.map((p) => {
            const itensCount = (p as { itens_pedido?: unknown[] }).itens_pedido?.length ?? 0;
            return (
              <Link
                key={p.id}
                to="/recebimento/conferir"
                search={{ pedidoId: p.id }}
                className="card-base p-4 text-left hover:border-primary hover:shadow-sm transition-all block"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="chip chip-info">Chegou {formatTime(p.hora_chegada)}</span>
                  <span className="chip chip-warn">Pendente</span>
                </div>
                <div className="text-base font-bold text-navy">
                  {one(p.fornecedores)?.nome ?? p.codigo}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {p.codigo} · {itensCount} itens no pedido
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <ConferenciaItens
      key={pedidoId}
      pedidoId={pedidoId}
      onBack={clearPedido}
      onFinished={() => navigate({ to: "/recebimento" })}
      onTrocar={selectPedido}
    />
  );
}

function mapToLinha(ic: {
  id: string;
  quantidade_recebida: number;
  conferido: boolean;
  tem_problema_qualidade: boolean;
  quantidade_qualidade: number;
  foto_url: string | null;
  itens_pedido:
    | {
        id?: string;
        quantidade_pedida: number;
        preco_unitario?: number | null;
        nome_externo?: string | null;
        produto_id?: string | null;
        produtos:
          | { nome: string; unidade: string; tolerancia_pct?: number | null }
          | { nome: string; unidade: string; tolerancia_pct?: number | null }[]
          | null;
        clientes?: { nome: string } | { nome: string }[] | null;
      }
    | {
        id?: string;
        quantidade_pedida: number;
        preco_unitario?: number | null;
        nome_externo?: string | null;
        produto_id?: string | null;
        produtos: unknown;
        clientes?: unknown;
      }[]
    | null;
}): LinhaItem {
  const ip = one(ic.itens_pedido);
  const prod = one(
    ip?.produtos as
      | { nome: string; unidade: string; tolerancia_pct?: number | null }
      | { nome: string; unidade: string; tolerancia_pct?: number | null }[]
      | null,
  );
  return {
    id: ic.id,
    itemPedidoId: ip?.id,
    produtoId: (ip as { produto_id?: string | null })?.produto_id ?? null,
    produto: prod?.nome ?? (ip as { nome_externo?: string | null })?.nome_externo ?? "—",
    unid: (ip as { unidade?: string | null })?.unidade || prod?.unidade || "un",
    aVincular: !(ip as { produto_id?: string | null })?.produto_id,
    pedido: Number(ip?.quantidade_pedida ?? 0),
    cliente: one(ip?.clientes as { nome: string } | { nome: string }[] | null)?.nome ?? null,
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
}: {
  pedidoId: string;
  onBack: () => void;
  onFinished: () => void;
  onTrocar: (id: string) => void;
}) {
  const { user, profile } = useAuth();
  const { data: pedidos = [] } = usePedidosDia();
  const { data: pedido } = usePedido(pedidoId);
  const { data: conferencia, isLoading, error } = useConferencia(pedidoId);
  const startMut = useStartConferencia();
  const saveMut = useSaveConferenciaItens();
  const addAvulso = useAddItemAvulso();
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
  const movForn = useRegistrarMovimentoFornecedor();
  const entradaGalpao = useRegistrarEntradaGalpao();
  const [vazias, setVazias] = useState<Record<string, number>>({});

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

  const { data: caixasItemExistentes } = useCaixasItemConferencia(conferencia?.id);
  const [caixasItem, setCaixasItem] = useState<Record<string, CaixaItemEntry[]>>({});
  const caixasInitRef = useRef<string | null>(null);
  const itensHydratedRef = useRef<string | null>(null);

  const [confirmFinal, setConfirmFinal] = useState(false);
  const vaziasInitRef = useRef(false);
  const stepperRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const focusedRef = useRef(false);

  const startedRef = useRef<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [fotoItemId, setFotoItemId] = useState<string | null>(null);
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [avulsoProduto, setAvulsoProduto] = useState("");
  const [avulsoQtd, setAvulsoQtd] = useState(1);

  const [itens, setItens] = useState<LinhaItem[]>([]);

  // Vale state
  const createVale = useCreateVale();
  const { data: meusVales = [] } = useValesConferente(user?.id ?? null);
  const [valeOpen, setValeOpen] = useState(false);
  const [valeItem, setValeItem] = useState<LinhaItem | null>(null);
  const [valeJaRecebido, setValeJaRecebido] = useState(0);
  const [valeObs, setValeObs] = useState("");
  const [valeFotos, setValeFotos] = useState<string[]>([]);
  const [valeUploading, setValeUploading] = useState(false);
  const valeFotoRef = useRef<HTMLInputElement>(null);

  const pendentes = pedidos.filter((p) => p.status === "pendente" || p.status === "parcial");
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
  const readOnly = conferencia?.status === "finalizada";

  useEffect(() => {
    if (!pedidoId || !user?.id) return;
    if (!pedidoStatus) return;
    if (isLoading) return;
    if (pedidoStatus !== "pendente" && pedidoStatus !== "parcial") return;
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
      vaziasInitRef.current = false;
      setCaixasItem({});
    }
  }, [conferencia?.id]);

  useEffect(() => {
    if (!conferencia?.itens_conferencia) return;
    if (
      conferencia.status === "finalizada" &&
      (pedidoStatus === "pendente" || pedidoStatus === "parcial")
    ) {
      return;
    }
    // Só hidrata uma vez por conferência — refetch do React Query não pode
    // apagar qty digitada e ainda não salva (resetava "Nesta entr." / status).
    if (itensHydratedRef.current === conferencia.id) return;
    itensHydratedRef.current = conferencia.id;
    setItens(conferencia.itens_conferencia.map(mapToLinha));
  }, [conferencia, pedidoStatus]);

  useEffect(() => {
    if (!conferencia?.itens_conferencia || !tipos.length) return;
    // Uma hidratação por conferência, depois que sugestão e caixas do DB
    // estabilizaram. Antes: initKey mudava nosug→sug / nodb→db e sobrescrevia
    // a qty de caixas já ajustada pela "Nesta entr." (ex.: 1 → 50).
    if (caixasInitRef.current === conferencia.id) return;
    if (caixasItemExistentes === undefined) return;
    if (
      fornecedorIdPedido &&
      itensParaSugestao.length > 0 &&
      sugestoesCaixas === undefined
    ) {
      return;
    }

    caixasInitRef.current = conferencia.id;

    const newCaixas: Record<string, CaixaItemEntry[]> = {};
    for (const ic of conferencia.itens_conferencia) {
      const itemId = ic.id;
      const produtoId = one(ic.itens_pedido)?.produto_id as string | undefined;

      const existingForItem = caixasItemExistentes?.get(itemId);
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
  }, [
    conferencia,
    tipos,
    sugestoesCaixas,
    caixasItemExistentes,
    fornecedorIdPedido,
    itensParaSugestao.length,
  ]);

  useEffect(() => {
    if (vaziasInitRef.current) return;
    if (Object.keys(caixasItem).length === 0) return;
    const totais: Record<string, number> = {};
    for (const entries of Object.values(caixasItem)) {
      for (const e of entries) {
        totais[e.sigla] = (totais[e.sigla] ?? 0) + e.real;
      }
    }
    if (Object.keys(totais).length === 0) return;
    vaziasInitRef.current = true;
    setVazias(totais);
  }, [caixasItem]);

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
    readOnly || it.conferido || itemJaSolicitouVale(it.id);

  const updateCaixasItem = useCallback(
    (itemId: string, entries: CaixaItemEntry[]) => {
      const it = itens.find((x) => x.id === itemId);
      if (it && (it.conferido || meusVales.some((v) => v.item_conferencia_id === itemId && v.status === "pendente"))) {
        return;
      }
      applyCaixasAndSyncQty(itemId, entries);
    },
    [applyCaixasAndSyncQty, itens, meusVales],
  );

  /** Nesta entr.: só mexe em recebido (cx) — não marca conferido nem altera Caixas. */
  const update = (idx: number, v: number) => {
    if (readOnly) return;
    const it = itens[idx];
    if (!it || it.conferido || itemJaSolicitouVale(it.id)) return;
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

  const toggleQualidade = (idx: number) => {
    if (readOnly) return;
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

  const salvar = async (status: "parcial" | "finalizada") => {
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
        itens: itens.map((it) => {
          const saldoRow = (
            saldosItem as { item_pedido_id: string; recebido_acumulado: number }[]
          ).find((s) => s.item_pedido_id === it.itemPedidoId);
          const entries = caixasItem[it.id] ?? [];
          const jaRecebido = Number(saldoRow?.recebido_acumulado ?? 0);
          const chegou = chegouEfetivo(it, entries);
          const gap = gapVsPedido(it, entries, jaRecebido);
          return buildSavePayload(
            { ...it, recebido: chegou },
            {
              toleranciaPct: it.toleranciaPct ?? toleranciaPct,
              toleranciaMin,
              preco: it.preco,
              fallback: fallbackPreco,
              jaRecebido,
              gap,
            },
          );
        }),
      });

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

      if (status === "finalizada" && conferencia?.id) {
        await supabase.from("conferencia_caixas").delete().eq("conferencia_id", conferencia.id);
        const caixaRows = tipos
          .map((t) => ({
            conferencia_id: conferencia.id,
            tipo_caixa_sigla: t.sigla,
            qtd_cheias: totaisCaixasReal[t.sigla] ?? 0,
            qtd_vazias: Number(vazias[t.sigla] ?? 0),
          }))
          .filter((r) => r.qtd_cheias > 0 || r.qtd_vazias > 0);
        if (caixaRows.length) {
          await supabase.from("conferencia_caixas").insert(caixaRows);
        }
      }

      if (status === "finalizada" && user && pedido?.fornecedor_id) {
        await supabase
          .from("movimentacoes_caixa")
          .delete()
          .eq("documento_id", conferencia.id)
          .eq("documento_tipo", "entrega");

        for (const t of tipos) {
          const realQty = totaisCaixasReal[t.sigla] ?? 0;
          const vaziasQty = Number(vazias[t.sigla] ?? 0);
          if (realQty > 0) {
            await entradaGalpao.mutateAsync({
              tipo_caixa: t.sigla,
              quantidade: realQty,
              registrado_por: user.id,
              fornecedor_id: pedido.fornecedor_id,
              conferencia_id: conferencia.id,
              observacoes: "Entrada conferência",
            });
          }
          if (vaziasQty > 0) {
            await movForn.mutateAsync({
              fornecedor_id: pedido.fornecedor_id,
              tipo_caixa: t.sigla,
              quantidade: vaziasQty,
              natureza: "entrega_vazias",
              registrado_por: user.id,
              conferencia_id: conferencia.id,
            });
          }
        }
      }
      const cargas = result?.cargasGeradas ?? [];
      const totalCheias = Object.values(totaisCaixasReal).reduce((a, b) => a + b, 0);
      const totalVazias = tipos.reduce((a, t) => a + Number(vazias[t.sigla] ?? 0), 0);
      const movTxt = tipos
        .map((t) => {
          const c = totaisCaixasReal[t.sigla] ?? 0;
          const v = Number(vazias[t.sigla] ?? 0);
          if (!c && !v) return null;
          return `${t.sigla}: ${c > 0 ? `+${c} cheias` : ""}${c > 0 && v > 0 ? " · " : ""}${v > 0 ? `-${v} vazias` : ""}`;
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
      else onBack();
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

      <PageHeader
        title={fornecedorNome}
        subtitle={`Pedido ${codigo}${wiseId ? ` · Wise ${wiseId}` : ""} · Entrega ${entregaAtual || 1} de ${entregaTotal} · Chegou às ${formatTime(horaChegada)} · Conferente: ${conferenteNome}`}
        actions={
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> {readOnly ? "Voltar" : "Trocar pedido"}
          </button>
        }
      />

      {readOnly && (
        <div className="bg-secondary border border-border rounded-lg p-3 mb-4 text-sm text-muted-foreground">
          <strong className="text-navy">Conferência encerrada.</strong>{" "}
          {aguardandoLiberacao
            ? "Pedido com divergência aguarda liberação do administrador para expedição."
            : "Visualização somente leitura."}
        </div>
      )}

      {!readOnly && sugestoesCaixas && (() => {
        const semFator = [...sugestoesCaixas.values()].filter((s) => s.sem_conversao).length;
        if (!semFator) return null;
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-950">
            <strong>{semFator} produto(s) sem fator un/cx</strong>
            {" — "}caixas não são sugeridas automaticamente. Cadastre o padrão em{" "}
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

      {!readOnly && (
        <div className="flex flex-wrap gap-2 mb-4">
          {pendentes.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onTrocar(p.id)}
              className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${
                p.id === pedidoId
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-navy hover:bg-secondary"
              }`}
            >
              {one(p.fornecedores)?.nome ?? p.codigo}
            </button>
          ))}
        </div>
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
          o lançamento.
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <MiniStat label="Itens" value={stats.total.toString()} />
        <MiniStat label="Conferidos" value={`${stats.conferidos}/${stats.total}`} tone="ok" />
        <MiniStat label="Divergências" value={stats.divergencias.toString()} tone="danger" />
        <MiniStat label="Itens com saldo" value={stats.comSaldo.toString()} tone="warn" />
        <MiniStat label="Progresso" value={`${stats.progresso}%`} tone="info" />
      </div>

      {/* Mobile: Card view */}
      <div className="sm:hidden space-y-3">
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
          const sugestaoItem = it.produtoId ? sugestoesCaixas?.get(it.produtoId) : undefined;
          const itemCaixas = caixasItem[it.id] ?? [];
          const nestaEntr = nestaEntradaCaixas(it, itemCaixas);
          const gap = gapVsPedido(it, itemCaixas, jaRecebido);
          const pendente = !it.conferido;
          const saldoZero = saldo <= 0;
          const qtyLocked = itemQtyLocked(it);

          const statusClass =
            saldoZero || (!pendente && gap === 0)
              ? "item-status-ok"
              : it.qualidade || (!pendente && gap > 0)
                ? "item-status-danger"
                : (!pendente && gap < 0) || pendente
                  ? "item-status-warn"
                  : "";

          return (
            <div key={it.id} className={`mobile-item-card ${statusClass}`}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-navy text-sm leading-tight">{it.produto}</div>
                  {it.aVincular && <span className="chip chip-warn mt-1">a vincular</span>}
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  {saldoZero && <span className="chip chip-ok">Completo</span>}
                  {!saldoZero && pendente && <span className="chip chip-muted">Pendente</span>}
                  {!saldoZero && !pendente && gap === 0 && <span className="chip chip-ok">OK</span>}
                  {!saldoZero && !pendente && gap < 0 && (
                    <span className="chip chip-warn">Diferença {Math.abs(gap)}</span>
                  )}
                  {!saldoZero && !pendente && gap > 0 && (
                    <span className="chip chip-danger">Sobra {gap}</span>
                  )}
                  {it.qualidade && (
                    <span
                      className="chip"
                      style={{ background: "rgba(240,169,43,0.15)", color: "var(--warning)" }}
                    >
                      Qual.
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                <div className="p-2 rounded-lg bg-secondary/50">
                  <div className="text-xs text-muted-foreground">Pedido</div>
                  <div className="font-bold text-navy">{it.pedido}</div>
                </div>
                <div className="p-2 rounded-lg bg-secondary/50">
                  <div className="text-xs text-muted-foreground">Já receb.</div>
                  <div className="font-bold text-muted-foreground">{jaRecebido}</div>
                </div>
                <div className="p-2 rounded-lg bg-secondary/50">
                  <div className="text-xs text-muted-foreground">Saldo</div>
                  <div
                    className="font-bold"
                    style={{ color: saldo > 0 ? "var(--warning)" : "var(--success)" }}
                  >
                    {saldo}
                  </div>
                </div>
              </div>

              {!qtyLocked && !it.aVincular && !saldoZero && (
                <div className="mb-3">
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
                <div className="mb-3 text-sm">
                  <span className="text-muted-foreground">Nesta entrega: </span>
                  <span className="font-semibold">
                    {it.aVincular ? "—" : nestaEntr} cx
                  </span>
                  {it.conferido && (
                    <span className="chip chip-ok ml-2 text-xs">Travado</span>
                  )}
                </div>
              )}

              {itemCaixas.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs text-muted-foreground mb-1.5">Caixas</div>
                  <CaixasItemEditor
                    entries={itemCaixas}
                    onChange={(entries) => updateCaixasItem(it.id, entries)}
                    tipos={tipos}
                    sugestao={sugestaoItem}
                    readOnly={qtyLocked || it.aVincular}
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                {!readOnly && pendente && !it.aVincular && !saldoZero && (
                  <button
                    type="button"
                    onClick={() => void conferirIgualPedido(idx)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
                  >
                    <Check size={16} /> Conferir
                  </button>
                )}
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleQualidade(idx)}
                      className={`h-11 w-11 rounded-lg border flex items-center justify-center transition-colors ${
                        it.qualidade
                          ? "border-transparent bg-[rgba(240,169,43,0.15)] text-[var(--warning)]"
                          : "border-border text-muted-foreground active:bg-secondary"
                      }`}
                      aria-label="Marcar problema de qualidade"
                    >
                      <AlertTriangle size={18} />
                    </button>
                    <button
                      type="button"
                      className="h-11 w-11 rounded-lg border border-border text-muted-foreground active:bg-secondary flex items-center justify-center"
                      aria-label="Adicionar foto"
                      onClick={() => {
                        setFotoItemId(it.id);
                        fotoRef.current?.click();
                      }}
                    >
                      <Camera size={18} />
                    </button>
                  </>
                )}
                {gap < 0 && !itemJaSolicitouVale(it.id) && !readOnly && nestaEntr > 0 && (
                  <button
                    type="button"
                    onClick={() => openValeDialog(it, jaRecebido, itemCaixas)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-sm font-semibold active:scale-[0.98] transition-transform"
                  >
                    <Receipt size={16} /> Vale
                  </button>
                )}
                {itemJaSolicitouVale(it.id) && (
                  <span className="chip chip-info text-xs">Vale pendente</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: Table view */}
      <div className="hidden sm:block card-base">
        <TableWrapper stickyFirstColumn>
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 whitespace-nowrap">Produto</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Un.</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Pedido</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Caixas</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Já receb.</th>
                <th className="text-center px-4 py-3 whitespace-nowrap">Nesta entr. (cx)</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Saldo</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
          <tbody>
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
              const sugestaoItem = it.produtoId ? sugestoesCaixas?.get(it.produtoId) : undefined;
              const itemCaixas = caixasItem[it.id] ?? [];
              const nestaEntr = nestaEntradaCaixas(it, itemCaixas);
              const gap = gapVsPedido(it, itemCaixas, jaRecebido);
              const pendente = !it.conferido;
              const saldoZero = saldo <= 0;
              const qtyLocked = itemQtyLocked(it);
              return (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-navy">
                    {it.produto}
                    {it.aVincular && (
                      <span className="ml-2 chip chip-warn">produto a vincular</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{it.unid}</td>
                  <td className="px-4 py-3 text-right text-ink">{it.pedido}</td>
                  <td className="px-4 py-3">
                    <CaixasItemEditor
                      entries={itemCaixas}
                      onChange={(entries) => updateCaixasItem(it.id, entries)}
                      tipos={tipos}
                      sugestao={sugestaoItem}
                      readOnly={qtyLocked || it.aVincular}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{jaRecebido}</td>
                  <td className="px-4 py-3">
                    {qtyLocked || it.aVincular || saldoZero ? (
                      <span className="font-semibold tabular-nums">
                        {it.aVincular ? "—" : nestaEntr}
                        {it.conferido && (
                          <span className="chip chip-ok ml-1 text-[10px]">Travado</span>
                        )}
                      </span>
                    ) : (
                      <NumberStepper
                        value={nestaEntr}
                        onChange={(v) => update(idx, v)}
                        inputMode="numeric"
                        inputRef={(el) => {
                          stepperRefs.current[idx] = el;
                        }}
                        onKeyDown={handleStepperKeyDown(idx)}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{saldo}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {saldoZero && <span className="chip chip-ok">Completo</span>}
                      {!saldoZero && pendente && <span className="chip chip-muted">Pendente</span>}
                      {!saldoZero && !pendente && gap === 0 && <span className="chip chip-ok">OK</span>}
                      {!saldoZero && !pendente && gap < 0 && (
                        <span className="chip chip-warn">Diferença {Math.abs(gap)}</span>
                      )}
                      {!saldoZero && !pendente && gap > 0 && (
                        <span className="chip chip-danger">Sobra {gap}</span>
                      )}
                      {it.qualidade && (
                        <span
                          className="chip"
                          style={{ background: "rgba(240,169,43,0.15)", color: "var(--warning)" }}
                        >
                          Qualidade
                        </span>
                      )}
                      {it.foto_url && <span className="chip chip-info">Foto</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {!readOnly && pendente && !it.aVincular && !saldoZero && (
                        <button
                          type="button"
                          onClick={() => void conferirIgualPedido(idx)}
                          className="inline-flex items-center gap-1 min-h-11 px-3 rounded-md bg-primary-soft text-primary-dark text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
                          title="Conferir e creditar caixas no galpão"
                        >
                          <Check size={12} /> Conferir
                        </button>
                      )}
                      {!readOnly && (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleQualidade(idx)}
                            className={`h-11 w-11 rounded-md border flex items-center justify-center transition-colors ${
                              it.qualidade
                                ? "border-transparent bg-[rgba(240,169,43,0.15)] text-[var(--warning)]"
                                : "border-border text-muted-foreground hover:text-navy hover:bg-secondary"
                            }`}
                            title="Marcar problema de qualidade"
                          >
                            <AlertTriangle size={13} />
                          </button>
                          <button
                            type="button"
                            className="h-11 w-11 rounded-md border border-border text-muted-foreground hover:text-navy hover:bg-secondary flex items-center justify-center"
                            title="Adicionar foto"
                            onClick={() => {
                              setFotoItemId(it.id);
                              fotoRef.current?.click();
                            }}
                          >
                            <Camera size={13} />
                          </button>
                        </>
                      )}
                      {gap < 0 && !itemJaSolicitouVale(it.id) && !readOnly && nestaEntr > 0 && (
                        <button
                          type="button"
                          onClick={() => openValeDialog(it, jaRecebido, itemCaixas)}
                          className="inline-flex items-center gap-1 min-h-11 px-3 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold hover:bg-amber-100 transition-colors"
                          title="Solicitar vale/desconto ao ADM"
                        >
                          <Receipt size={12} /> Vale
                        </button>
                      )}
                      {itemJaSolicitouVale(it.id) && (
                        <span className="chip chip-info text-xs">Vale pendente</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </TableWrapper>
      </div>

      {tipos.length > 0 && (
        <div className="mt-5 rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Resumo de caixas desta entrega</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tipos.map((t) => {
              const cheiasCalc = itens.reduce((acc, it) => {
                const entries = caixasItem[it.id] ?? [];
                const e = entries.find((x) => x.sigla === t.sigla);
                return acc + (e?.real ?? 0);
              }, 0);
              const vaziasQty = Number(vazias[t.sigla] ?? 0);
              return (
                <div key={t.id} className="p-2 rounded-lg bg-secondary/50 text-center">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">{t.sigla}</div>
                  <div className="text-lg font-bold text-navy">{cheiasCalc}</div>
                  <div className="text-[10px] text-muted-foreground">cheias (produtos)</div>
                </div>
              );
            })}
          </div>
          {!readOnly && (
            <div className="pt-3 border-t border-border">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                Caixas vazias devolvidas ao fornecedor
              </div>
              <div className="flex flex-wrap gap-4">
                {tipos.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="w-8 text-center font-semibold">{t.sigla}</span>
                    <NumberStepper
                      value={vazias[t.sigla] ?? 0}
                      onChange={(n) => setVazias((s) => ({ ...s, [t.sigla]: n }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {meusVales.length > 0 && (
        <div className="mt-5 rounded-xl border p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Receipt size={14} /> Meus pedidos de vale
          </h3>
          <div className="space-y-2">
            {meusVales.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 p-2 rounded bg-secondary/30 text-sm">
                <div>
                  <span className="font-medium">{v.produto_nome ?? "Produto"}</span>
                  <span className="text-muted-foreground ml-2">· {v.diferenca} un</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">R$ {v.valor_calculado.toFixed(2)}</span>
                  {v.status === "pendente" && (
                    <span className="chip chip-warn">Pendente</span>
                  )}
                  {v.status === "aplicado" && (
                    <span className="chip chip-ok">
                      Aplicado · R$ {v.valor_final?.toFixed(2)}
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

      {!readOnly && (
        <div className="mt-5 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex gap-2 sm:contents">
            <button
              type="button"
              onClick={() => setAvulsoOpen(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary active:bg-secondary/80"
            >
              <Plus size={14} /> <span className="hidden sm:inline">Item </span>avulso
            </button>
            <button
              type="button"
              onClick={() => salvar("parcial")}
              disabled={saveMut.isPending}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary active:bg-secondary/80 disabled:opacity-50"
            >
              <Save size={14} /> <span className="hidden sm:inline">Salvar </span>parcial
            </button>
          </div>
          <div className="hidden sm:block sm:flex-1" />
          <div className="text-xs text-muted-foreground text-center sm:text-left">
            Assinatura: <span className="font-semibold text-navy">{conferenteNome}</span>
          </div>
          <button
            type="button"
            onClick={finalizar}
            disabled={saveMut.isPending}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-12 sm:min-h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary-dark active:scale-[0.99] transition disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Finalizar entrega
          </button>
        </div>
      )}

      <Dialog open={avulsoOpen && !readOnly} onOpenChange={setAvulsoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item avulso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Produto</Label>
              <Select value={avulsoProduto} onValueChange={setAvulsoProduto}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {produtos.map((pr) => (
                    <SelectItem key={pr.id} value={pr.id}>
                      {pr.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg border">
                  <div className="text-2xl font-bold text-navy">{itLive.pedido}</div>
                  <div className="text-xs text-muted-foreground">Pedido (un)</div>
                </div>
                <div className="p-3 rounded-lg border">
                  <div className="text-2xl font-bold text-navy">{recebidoUn}</div>
                  <div className="text-xs text-muted-foreground">Recebido (un)</div>
                </div>
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                  <div className="text-2xl font-bold text-amber-700">{diferencaUn}</div>
                  <div className="text-xs text-amber-600">Diferença (un)</div>
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
                    R$ {(diferencaUn * preco).toFixed(2)}
                    {!itLive.preco && <span className="text-xs font-normal ml-1">(estimado)</span>}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {diferencaUn} {itLive.unid} × R$ {preco.toFixed(2)}
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
    </div>
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
