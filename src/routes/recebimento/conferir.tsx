import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, CheckCircle2, Camera, Info, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
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
import { usePedidosDia, usePedido, useConfigValor, useSaldoItensPedido } from "@/hooks/use-pedidos";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useRegistrarMovimentoFornecedor } from "@/hooks/use-ledger";
import {
  useConferencia,
  useStartConferencia,
  useSaveConferenciaItens,
  useAddItemAvulso,
  uploadConferenciaFoto,
} from "@/hooks/use-conferencia";
import { useProdutos } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import { formatTime } from "@/lib/utils-date";
import { one } from "@/lib/embed";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

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
            O recebimento é <strong>sempre aceito</strong>. Divergências não bloqueiam: viram registro no{" "}
            <strong>Relatório de Faltas</strong>.
          </span>
        </div>
        {loadingPedidos && (
          <p className="text-sm text-muted-foreground">Carregando pedidos…</p>
        )}
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
                <div className="text-base font-bold text-navy">{one(p.fornecedores)?.nome ?? p.codigo}</div>
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

function mapToLinha(
  ic: {
    id: string;
    quantidade_recebida: number;
    conferido: boolean;
    tem_problema_qualidade: boolean;
    quantidade_qualidade: number;
    foto_url: string | null;
    itens_pedido: {
      id?: string;
      quantidade_pedida: number;
      preco_unitario?: number | null;
      produtos: { nome: string; unidade: string; tolerancia_pct?: number | null } | { nome: string; unidade: string; tolerancia_pct?: number | null }[] | null;
      clientes?: { nome: string } | { nome: string }[] | null;
    } | { id?: string; quantidade_pedida: number; preco_unitario?: number | null; produtos: unknown; clientes?: unknown }[] | null;
  }
): LinhaItem {
  const ip = one(ic.itens_pedido);
  const prod = one(ip?.produtos as { nome: string; unidade: string; tolerancia_pct?: number | null } | { nome: string; unidade: string; tolerancia_pct?: number | null }[] | null);
  return {
    id: ic.id,
    itemPedidoId: ip?.id,
    produto: prod?.nome ?? "—",
    unid: (ip as { unidade?: string | null })?.unidade || prod?.unidade || "un",
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

function buildSavePayload(
  it: LinhaItem,
  opts?: {
    toleranciaPct?: number;
    toleranciaMin?: number;
    preco?: number | null;
    fallback?: number;
    jaRecebido?: number;
  }
) {
  const ja = Number(opts?.jaRecebido ?? 0);
  const totalApos = ja + it.recebido;
  const gap = totalApos - it.pedido;
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
  const [cheias, setCheias] = useState<Record<string, number>>({});
  const [vazias, setVazias] = useState<Record<string, number>>({});

  const [confirmFinal, setConfirmFinal] = useState(false);

  const startedRef = useRef<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [fotoItemId, setFotoItemId] = useState<string | null>(null);
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [avulsoProduto, setAvulsoProduto] = useState("");
  const [avulsoQtd, setAvulsoQtd] = useState(1);

  const [itens, setItens] = useState<LinhaItem[]>([]);

  const pendentes = pedidos.filter((p) => p.status === "pendente" || p.status === "parcial");
  const fornecedorNome = one(pedido?.fornecedores)?.nome ?? one(pedidos.find((p) => p.id === pedidoId)?.fornecedores)?.nome ?? "—";
  const codigo = pedido?.codigo ?? pedidos.find((p) => p.id === pedidoId)?.codigo ?? "";
  const wiseId = (pedido as { wise_pedido_id?: string | null } | null)?.wise_pedido_id
    ?? (pedidos.find((p) => p.id === pedidoId) as { wise_pedido_id?: string | null } | undefined)?.wise_pedido_id;
  const entregaAtual = (entregasMeta ?? []).findIndex((e) => e.id === conferencia?.id) + 1;
  const entregaTotal = Math.max(1, (entregasMeta ?? []).length);
  const horaChegada = pedido?.hora_chegada ?? pedidos.find((p) => p.id === pedidoId)?.hora_chegada;
  const conferenteNome = profile?.nome ?? "—";
  const pedidoStatus = pedido?.status ?? pedidos.find((p) => p.id === pedidoId)?.status;
  const aguardandoLiberacao = pedidoStatus === "aguardando_liberacao" || pedidoStatus === "divergencia";
  const pedidoEncerrado =
    pedidoStatus === "encerrado" ||
    pedidoStatus === "aguardando_liberacao" ||
    pedidoStatus === "divergencia";
  const readOnly = conferencia?.status === "finalizada" && pedidoEncerrado;

  useEffect(() => {
    if (!pedidoId || !user?.id) return;
    if (startedRef.current === pedidoId) return;
    if (!pedidoStatus) return;
    if (pedidoStatus !== "pendente" && pedidoStatus !== "parcial") return;
    if (conferencia?.status === "finalizada") return;
    startedRef.current = pedidoId;
    startMut.mutate(
      { pedidoId, conferenteId: user.id, user },
      { onError: (e) => toast.error(e.message) }
    );
  }, [pedidoId, user, pedidoStatus, conferencia?.status]);

  useEffect(() => {
    if (!conferencia?.itens_conferencia) return;
    setItens(conferencia.itens_conferencia.map(mapToLinha));
  }, [conferencia]);

  const update = (idx: number, v: number) => {
    if (readOnly) return;
    setItens((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, recebido: Math.max(0, v), conferido: true } : it
      )
    );
  };

  const conferirIgualPedido = (idx: number) => {
    if (readOnly) return;
    setItens((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, recebido: it.pedido, conferido: true } : it))
    );
  };

  const toggleQualidade = (idx: number) => {
    if (readOnly) return;
    setItens((prev) =>
      prev.map((it, i) =>
        i !== idx
          ? it
          : { ...it, qualidade: it.qualidade ? null : { ativo: true, qtd: 1 } }
      )
    );
  };

  const stats = useMemo(() => {
    const total = itens.length;
    const conferidos = itens.filter((i) => i.conferido).length;
    const divergencias = itens.filter((i) => i.conferido && i.recebido !== i.pedido).length;
    const faltantes = total - conferidos;
    return {
      total,
      conferidos,
      divergencias,
      faltantes,
      progresso: total ? Math.round((conferidos / total) * 100) : 0,
    };
  }, [itens]);

  const clienteResumo = useMemo(() => {
    const map: Record<string, { ped: number; rec: number }> = {};
    itens.forEach((it) => {
      const nome = it.cliente ?? "Sem cliente";
      if (!map[nome]) map[nome] = { ped: 0, rec: 0 };
      map[nome].ped += it.pedido;
      map[nome].rec += it.recebido;
    });
    return map;
  }, [itens]);

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
            const saldoRow = (saldosItem as { item_pedido_id: string; recebido_acumulado: number }[])
              .find((s) => s.item_pedido_id === it.itemPedidoId);
            return buildSavePayload(it, {
              toleranciaPct: it.toleranciaPct ?? toleranciaPct,
              toleranciaMin,
              preco: it.preco,
              fallback: fallbackPreco,
              jaRecebido: Number(saldoRow?.recebido_acumulado ?? 0),
            });
          }),
        });
      if (status === "finalizada" && conferencia?.id) {
        await supabase.from("conferencia_caixas").delete().eq("conferencia_id", conferencia.id);
        const caixaRows = tipos
          .map((t) => ({
            conferencia_id: conferencia.id,
            tipo_caixa_sigla: t.sigla,
            qtd_cheias: Number(cheias[t.sigla] ?? 0),
            qtd_vazias: Number(vazias[t.sigla] ?? 0),
          }))
          .filter((r) => r.qtd_cheias > 0 || r.qtd_vazias > 0);
        if (caixaRows.length) {
          await supabase.from("conferencia_caixas").insert(caixaRows);
        }
      }
      if (status === "finalizada" && user && pedido?.fornecedor_id) {
        for (const t of tipos) {
          const c = Number(cheias[t.sigla] ?? 0);
          const v = Number(vazias[t.sigla] ?? 0);
          if (c > 0) {
            await movForn.mutateAsync({
              fornecedor_id: pedido.fornecedor_id,
              tipo_caixa: t.sigla,
              quantidade: c,
              natureza: "recebimento_cheias",
              registrado_por: user.id,
              conferencia_id: conferencia.id,
            });
          }
          if (v > 0) {
            await movForn.mutateAsync({
              fornecedor_id: pedido.fornecedor_id,
              tipo_caixa: t.sigla,
              quantidade: v,
              natureza: "entrega_vazias",
              registrado_por: user.id,
              conferencia_id: conferencia.id,
            });
          }
        }
      }
      const cargas = result?.cargasGeradas ?? [];
      const movTxt = tipos
        .map((t) => {
          const c = Number(cheias[t.sigla] ?? 0);
          const v = Number(vazias[t.sigla] ?? 0);
          if (!c && !v) return null;
          return `${t.sigla}: +${v} vazias · −${c} cheias`;
        })
        .filter(Boolean)
        .join(" · ");
      toast.success(
        status === "finalizada" ? "Entrega finalizada" : "Parcial salva",
        {
          description:
            status === "finalizada"
              ? cargas.length
                ? `${stats.conferidos} itens conferidos · ${cargas.length} carga(s) criada(s) no Painel de Carga (${cargas.map((c) => c.codigo).join(", ")}).`
                : `${stats.conferidos} itens · ${cargas.length ? cargas.map((c) => c.codigo).join(", ") : "sem carga"} · ${movTxt || "sem movimento de caixa"}`
              : `${stats.conferidos} itens guardados.`,
        }
      );
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
      <p className="text-sm text-destructive p-4">
        Erro ao carregar conferência: {error.message}
      </p>
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
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">conferidos</div>
        </div>
      </div>

      <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 mb-5 flex gap-2 text-xs text-primary-dark">
        <Info size={14} className="mt-0.5" />
        <span>
          Recebimento sempre aceito. Divergências alimentam o Relatório de Faltas — não interrompem o lançamento.
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <MiniStat label="Itens" value={stats.total.toString()} />
        <MiniStat label="Conferidos" value={`${stats.conferidos}/${stats.total}`} tone="ok" />
        <MiniStat label="Divergências" value={stats.divergencias.toString()} tone="danger" />
        <MiniStat label="Progresso" value={`${stats.progresso}%`} tone="info" />
      </div>

      <div className="card-base p-4 mb-5">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Recebido × pedido por cliente
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(clienteResumo).map(([d, q]) => {
            const rec = Math.round(q.rec);
            const ok = rec === q.ped;
            return (
              <span
                key={d}
                className={`chip ${ok ? "chip-teal" : rec < q.ped ? "chip-warn" : "chip-danger"} text-sm`}
              >
                {d} · {rec}/{q.ped}
              </span>
            );
          })}
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Produto</th>
              <th className="text-left px-4 py-3">Un.</th>
              <th className="text-right px-4 py-3">Pedido</th>
              <th className="text-right px-4 py-3">Já recebido</th>
              <th className="text-center px-4 py-3">Nesta entrega</th>
              <th className="text-right px-4 py-3">Saldo</th>
              <th className="text-right px-4 py-3">Tol.</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {itens.map((it, idx) => {
              const saldoRow = (saldosItem as { item_pedido_id: string; recebido_acumulado: number; saldo: number }[])
                .find((s) => s.item_pedido_id === it.itemPedidoId);
              const jaRecebido = Number(saldoRow?.recebido_acumulado ?? 0);
              const saldo = Number(saldoRow?.saldo ?? it.pedido - jaRecebido);
              const pct = it.toleranciaPct ?? toleranciaPct;
              const limite = Math.max((pct / 100) * it.pedido, toleranciaMin);
              const totalApos = jaRecebido + it.recebido;
              const gap = totalApos - it.pedido;
              const pendente = !it.conferido;
              const dentroTol = Math.abs(Math.max(0, gap)) <= limite;
              return (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-navy">{it.produto}</td>
                  <td className="px-4 py-3 text-muted-foreground">{it.unid}</td>
                  <td className="px-4 py-3 text-right text-ink">{it.pedido}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{jaRecebido}</td>
                  <td className="px-4 py-3">
                    {readOnly ? (
                      <span className="font-semibold tabular-nums">{it.recebido}</span>
                    ) : (
                      <NumberStepper value={it.recebido} onChange={(v) => update(idx, v)} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{Math.max(0, it.pedido - totalApos)}</td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">±{limite.toFixed(0)} un</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {pendente && <span className="chip chip-muted">Pendente</span>}
                      {!pendente && gap === 0 && <span className="chip chip-ok">OK</span>}
                      {!pendente && gap < 0 && (
                        <span className="chip chip-warn">Saldo {Math.abs(gap)}</span>
                      )}
                      {!pendente && gap > 0 && dentroTol && (
                        <span className="chip chip-info">Sobra {gap} · dentro da tolerância</span>
                      )}
                      {!pendente && gap > 0 && !dentroTol && (
                        <span className="chip chip-danger">Sobra {gap} · acima da tolerância</span>
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
                      {!readOnly && pendente && (
                        <button
                          type="button"
                          onClick={() => conferirIgualPedido(idx)}
                          className="inline-flex items-center gap-1 min-h-11 px-3 rounded-md bg-primary-soft text-primary-dark text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
                          title="Marcar conferido com a quantidade pedida"
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!readOnly && tipos.length > 0 && (
        <div className="mt-5 rounded-xl border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Caixas desta entrega</h3>
          {tipos.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="w-28 font-medium">{t.nome} ({t.sigla})</span>
              <label className="flex items-center gap-2">Cheias
                <NumberStepper value={cheias[t.sigla] ?? 0} onChange={(n) => setCheias((s) => ({ ...s, [t.sigla]: n }))} />
              </label>
              <label className="flex items-center gap-2">Vazias
                <NumberStepper value={vazias[t.sigla] ?? 0} onChange={(n) => setVazias((s) => ({ ...s, [t.sigla]: n }))} />
              </label>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setAvulsoOpen(true)}
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
        >
          <Plus size={14} /> Item avulso
        </button>
        <button
          type="button"
          onClick={() => salvar("parcial")}
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary disabled:opacity-50"
        >
          <Save size={14} /> Salvar parcial
        </button>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">
          Assinatura: <span className="font-semibold text-navy">{conferenteNome}</span>
        </div>
        <button
          type="button"
          onClick={finalizar}
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 min-h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary-dark active:scale-[0.99] transition disabled:opacity-50"
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
              O restante fica pendente no pedido. Isso não é falta até o encerramento.
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
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1" style={{ color: c }}>
        {value}
      </div>
    </div>
  );
}
