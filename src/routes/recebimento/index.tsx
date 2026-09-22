import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Plus, ChevronRight, Trash2, Pencil, Ban, PackageCheck, MoreHorizontal, Truck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { useContarValesPendentes } from "@/hooks/use-vales";
import { StatStrip } from "@/components/stat-strip";
import { HeaderAcoes, ChipLabel } from "@/components/ui-galpao";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  usePedidosDia,
  usePedidosRealtime,
  useCreatePedidoManual,
  useAliases,
  useUpdatePedidoAdmin,
  useEncerrarPedido,
} from "@/hooks/use-pedidos";
import { useFornecedores, useProdutos, useDestinatarios, useClientes } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import { resolveIsAdmin } from "@/lib/roles";
import { downloadWiseModelo, type AliasRow } from "@/lib/excel-wise-pedidos";
import { useConfirmWiseImport, usePreviewWiseImport, useSyncWisePedidos, type ImportPreview, type ImportWiseResult } from "@/hooks/use-wise-pedidos";
import { ImportacaoWiseDialog } from "@/components/importacao-wise-dialog";
import { ImportacoesPanel } from "@/components/importacoes-panel";
import { TableWrapper } from "@/components/table-wrapper";
import { usePendenciasVinculo } from "@/hooks/use-pedidos";
import { formatDateBRT, formatDurationMinutes, formatTime, todayBRT } from "@/lib/utils-date";
import { useSaidasEmTransito } from "@/hooks/use-saida-roca";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { useFornecedoresComEntregaRecente } from "@/hooks/use-seletor-cadastro";
import { Textarea } from "@/components/ui/textarea";
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
import { one } from "@/lib/embed";

export const Route = createFileRoute("/recebimento/")({
  component: Page,
  head: () => ({ meta: [{ title: "Recebimento · Campo Alegre" }] }),
});

type ItemPedido = {
  id: string;
  cliente_id?: string | null;
  clientes?: { nome: string } | { nome: string }[] | null;
};

type PedidoDia = {
  id: string;
  codigo: string;
  fornecedor_id: string;
  origem: string;
  hora_chegada: string | null;
  status: string;
  wise_pedido_id?: string | null;
  data_prevista?: string | null;
  fornecedores: { nome: string } | null;
  itens_pedido: ItemPedido[];
};

type ManualItem = {
  produto_id: string;
  quantidade: number;
  preco_unitario: string;
  cliente_id: string;
  rateio: { destinatario_id: string; quantidade: number }[];
};

const statusChip = (s: string) => {
  if (s === "conferido" || s === "recebido") return <span className="chip chip-ok">Recebido</span>;
  if (s === "parcial") return <span className="chip chip-warn">Parcial</span>;
  if (s === "em_transito") return <span className="chip chip-info">Em trânsito</span>;
  if (s === "aguardando_vinculo") return <span className="chip chip-warn">Fornecedor não reconhecido</span>;
  if (s === "encerrado") return <span className="chip">Encerrado</span>;
  if (s === "aguardando_liberacao") return <span className="chip chip-warn">Aguardando liberação</span>;
  if (s === "divergencia") return <span className="chip chip-danger">Com divergência</span>;
  return <span className="chip chip-warn">A conferir</span>;
};

function pedidoActionLink(p: PedidoDia) {
  const isConferir =
    p.status === "pendente" || p.status === "parcial" || p.status === "em_transito";
  return (
    <Link
      to="/recebimento/conferir"
      search={{ pedidoId: p.id }}
      className={
        isConferir
          ? "inline-flex items-center gap-1 text-primary-dark text-xs font-semibold hover:underline"
          : "inline-flex items-center gap-1 text-muted-foreground text-xs font-semibold hover:underline"
      }
    >
      {isConferir ? "Conferir" : "Ver"} <ChevronRight size={12} />
    </Link>
  );
}

function PedidoRowAdminMenu({
  p,
  canAdmin,
  onEncerrar,
  onEditar,
}: {
  p: PedidoDia;
  canAdmin: boolean;
  onEncerrar: () => void;
  onEditar: () => void;
}) {
  const canEncerrar = canAdmin && p.status === "parcial";
  const canEditar =
    canAdmin && (p.status === "conferido" || p.status === "pendente" || p.status === "parcial");
  if (!canEncerrar && !canEditar) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 px-2">
          <MoreHorizontal size={14} />
          <span className="sr-only sm:not-sr-only sm:inline">Detalhes</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEditar && (
          <DropdownMenuItem onSelect={onEditar}>
            <Pencil size={12} className="mr-2" /> Editar
          </DropdownMenuItem>
        )}
        {canEncerrar && (
          <DropdownMenuItem onSelect={onEncerrar} className="text-destructive focus:text-destructive">
            <Ban size={12} className="mr-2" /> Encerrar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getClienteChips(p: PedidoDia): string[] {
  const names = new Set<string>();
  for (const item of p.itens_pedido ?? []) {
    const nome = Array.isArray(item.clientes) ? item.clientes[0]?.nome : item.clientes?.nome;
    if (nome) names.add(nome);
  }
  return [...names];
}

function origemLabel(o: string) {
  if (o === "wisetec") return "Wise (planilha)";
  if (o === "excel") return "Excel";
  if (o === "manual") return "Manual";
  return o;
}

type TabKey =
  | "todos"
  | "pendente"
  | "divergencia"
  | "aguardando_vinculo"
  | "outros"
  | "importacoes";

const OUTROS_STATUS = new Set(["parcial", "em_transito", "conferido", "encerrado", "recebido"]);

function Page() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("todos");
  const [dataFiltro, setDataFiltro] = useState(todayBRT());
  const [busca, setBusca] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [editPedido, setEditPedido] = useState<PedidoDia | null>(null);
  const [editCodigo, setEditCodigo] = useState("");
  const [editPrevista, setEditPrevista] = useState("");
  const [encerrarId, setEncerrarId] = useState<string | null>(null);
  const [encerrarMotivo, setEncerrarMotivo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [lastImport, setLastImport] = useState<ImportWiseResult | null>(null);

  const { user, profile, isAdmin } = useAuth();
  usePedidosRealtime();
  const { data: pedidos = [], isLoading, error } = usePedidosDia(dataFiltro);
  const { data: fornecedores = [] } = useFornecedores();
  const { data: produtos = [] } = useProdutos();
  const { data: destinatarios = [] } = useDestinatarios();
  const { data: clientes = [] } = useClientes();
  const createManual = useCreatePedidoManual();
  const previewMut = usePreviewWiseImport();
  const confirmMut = useConfirmWiseImport();
  const syncWise = useSyncWisePedidos();
  const { data: aliases = [] } = useAliases();
  const { data: pendencias = [] } = usePendenciasVinculo();
  const updatePedido = useUpdatePedidoAdmin();
  const encerrarPedido = useEncerrarPedido();
  const canAdmin = isAdmin || resolveIsAdmin(profile, user);
  const { data: valesPendentes = 0 } = useContarValesPendentes();
  const { data: emTransito = [] } = useSaidasEmTransito();
  const fornecedoresRecentes = useFornecedoresComEntregaRecente();

  const [fornecedorId, setFornecedorId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [manualItens, setManualItens] = useState<ManualItem[]>([
    { produto_id: "", quantidade: 1, preco_unitario: "", cliente_id: "", rateio: [] },
  ]);

  const typedPedidos: PedidoDia[] = pedidos.map((p) => ({
    ...p,
    fornecedores: one(p.fornecedores),
    itens_pedido: (p.itens_pedido ?? []) as ItemPedido[],
  }));
  const filtered = typedPedidos.filter((p) => {
    if (tab === "pendente" && p.status !== "pendente") return false;
    if (tab === "aguardando_vinculo" && p.status !== "aguardando_vinculo") return false;
    if (
      tab === "divergencia" &&
      p.status !== "divergencia" &&
      p.status !== "aguardando_liberacao"
    ) {
      return false;
    }
    if (tab === "outros" && !OUTROS_STATUS.has(p.status)) return false;
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return (
      p.codigo.toLowerCase().includes(q) ||
      (p.fornecedores?.nome ?? "").toLowerCase().includes(q) ||
      getClienteChips(p).some((n) => n.toLowerCase().includes(q))
    );
  });

  const stats = useMemo(() => {
    const pendentes = typedPedidos.filter((p) => p.status === "pendente").length;
    const emConferencia = typedPedidos.filter((p) => p.status === "parcial").length;
    const divergencias = typedPedidos.filter(
      (p) => p.status === "divergencia" || p.status === "aguardando_liberacao",
    ).length;
    const conferidos = typedPedidos.filter(
      (p) => p.status === "conferido" || p.status === "recebido",
    ).length;
    return { pendentes, emConferencia, divergencias, conferidos };
  }, [typedPedidos]);

  const syncWiseAction = async () => {
    if (!user?.id) return;
    try {
      const result = await syncWise.mutateAsync({
        created_by: user.id,
        fornecedores,
        produtos,
        destinatarios,
        clientes,
      });
      if (!result.novos && !result.atualizados) {
        toast.info(result.message ?? "Nenhum pedido na API. Use a importação por arquivo.");
      } else {
        toast.success(
          `${result.novos} novos · ${result.atualizados} atualizados · ${result.pendencias} pendências`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar Wise");
    }
  };

  const handleExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    try {
      const buf = await file.arrayBuffer();
      const next = await previewMut.mutateAsync({
        file: buf,
        filename: file.name,
        fornecedores,
        produtos: produtos.map((p) => ({ id: p.id, nome: p.nome, codigo: p.codigo })),
        destinatarios,
        clientes,
      });
      setPreview(next);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao ler o arquivo");
    }
  };

  const resetManualForm = () => {
    setFornecedorId("");
    setCodigo("");
    setManualItens([{ produto_id: "", quantidade: 1, preco_unitario: "", cliente_id: "", rateio: [] }]);
  };

  const submitManual = async () => {
    if (!user?.id || !fornecedorId || !codigo.trim()) {
      toast.error("Informe fornecedor e código do pedido");
      return;
    }
    const itens = manualItens
      .filter((i) => i.produto_id && i.quantidade > 0)
      .map((i) => ({
        produto_id: i.produto_id,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario ? Number(i.preco_unitario) : null,
        cliente_id: i.cliente_id || null,
        rateio: [] as { destinatario_id: string; quantidade: number }[],
      }));
    if (!itens.length) {
      toast.error("Adicione ao menos um item válido");
      return;
    }
    try {
      await createManual.mutateAsync({
        codigo: codigo.trim(),
        fornecedor_id: fornecedorId,
        itens,
        created_by: user.id,
      });
      toast.success("Pedido lançado com sucesso");
      setManualOpen(false);
      resetManualForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao lançar pedido");
    }
  };

  const manualFormValid = useMemo(() => {
    if (!fornecedorId || !codigo.trim()) return false;
    const itens = manualItens.filter((i) => i.produto_id && i.quantidade > 0);
    if (!itens.length) return false;
    return itens.every((i) => i.quantidade > 0);
  }, [fornecedorId, codigo, manualItens]);

  return (
    <div>
      <PageHeader
        title="Conferência de Mercadoria"
        subtitle="Pedidos a conferir do dia · recebimento sempre aceito"
        actions={
          <HeaderAcoes
            primary={
              <Link
                to="/recebimento/conferir"
                className="inline-flex items-center justify-center gap-1.5 min-h-11 lg:min-h-9 h-11 lg:h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark"
              >
                <PackageCheck size={14} /> Conferir
              </Link>
            }
            detalhes={[
              {
                label: "Sincronizar Wise",
                onClick: () => void syncWiseAction(),
                disabled: syncWise.isPending,
              },
              {
                label: "Importar planilha",
                onClick: () => fileRef.current?.click(),
                disabled: previewMut.isPending,
              },
              { label: "Baixar modelo", onClick: () => downloadWiseModelo() },
              { label: "Lançar pedido manual", onClick: () => setManualOpen(true) },
              { separator: true, label: "" },
              {
                label: emTransito.length > 0 ? `Saída na roça (${emTransito.length})` : "Saída na roça",
                onClick: () => navigate({ to: "/recebimento/saida-roca" }),
              },
              ...(canAdmin
                ? [
                    {
                      label: valesPendentes > 0 ? `Vales (${valesPendentes})` : "Vales",
                      onClick: () => navigate({ to: "/recebimento/vales" }),
                    },
                    {
                      label: "Liberações",
                      onClick: () => navigate({ to: "/recebimento/liberacoes" }),
                    },
                  ]
                : []),
              { separator: true, label: "" },
              { label: "Importações", onClick: () => setTab("importacoes") },
            ]}
          />
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleExcel}
      />

      <StatStrip
        items={[
          {
            label: "Pendentes",
            value: isLoading ? "…" : String(stats.pendentes),
            tone: "warn",
          },
          {
            label: "Em conferência",
            value: isLoading ? "…" : String(stats.emConferencia),
            tone: "info",
          },
          {
            label: "Divergências",
            value: isLoading ? "…" : String(stats.divergencias),
            tone: "danger",
          },
          {
            label: "Conferidos",
            value: isLoading ? "…" : String(stats.conferidos),
            tone: "ok",
          },
        ]}
      />

      {canAdmin && valesPendentes > 0 && (
        <div className="mb-3">
          <Link to="/recebimento/vales" className="inline-flex">
            <ChipLabel label="Vales" value={valesPendentes} tone="warn" />
          </Link>
        </div>
      )}

      {emTransito.length > 0 && (
        <div className="card-base p-3 md:p-4 mb-4">
          <h2 className="text-sm font-semibold text-navy mb-2 flex items-center gap-2">
            <Truck size={14} /> Saíram da roça · aguardando chegada ({emTransito.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {emTransito.map((s) => (
              <Link
                key={s.id}
                to="/recebimento/conferir"
                search={{ pedidoId: s.pedido_id }}
                className="rounded-lg border border-border p-3 hover:border-primary transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-navy truncate">{s.fornecedor_nome}</span>
                  <span className="chip chip-info shrink-0">
                    há {formatDurationMinutes(Number(s.minutos_em_transito))}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {s.pedido_codigo} · {s.total_caixas} cx ·{" "}
                  {s.veiculo_fornecedor
                    ? "veículo do fornecedor"
                    : (s.motorista_nome ?? "motorista")}{" "}
                  · saiu às {formatTime(s.registrado_em)}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {lastImport && (
        <div className="mb-4 p-3 rounded-lg bg-primary-soft text-navy text-sm flex flex-wrap items-center justify-between gap-2">
          <span>
            Importação gravada: {lastImport.novos} novos · {lastImport.atualizados} atualizados · {lastImport.itens} itens · {lastImport.pendencias} pendências
            {lastImport.ignoradas.length ? ` · ${lastImport.ignoradas.length} avisos` : ""}
          </span>
          <button type="button" className="text-xs font-semibold underline" onClick={() => setTab("importacoes")}>
            Ver importações
          </button>
        </div>
      )}
      {pendencias.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-warning/15 text-navy text-sm">
          {pendencias.length} pendência(s) de vínculo — resolva em Configurações → Vínculos de importação.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          Erro ao carregar pedidos: {error.message}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-2 md:gap-3 mb-3">
        <Input
          type="date"
          className="w-full md:w-44 h-11 lg:h-9"
          value={dataFiltro}
          onChange={(e) => setDataFiltro(e.target.value || todayBRT())}
          title="Data prevista de entrega"
          aria-label="Data prevista de entrega"
        />
        <Input className="w-full md:flex-1 lg:max-w-sm h-11 lg:h-9" placeholder="Buscar pedido, fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="card-base">
        <div className="flex items-center gap-1.5 p-2 md:p-2.5 border-b border-border overflow-x-auto overscroll-x-contain touch-pan-x">
          {(
            [
              ["todos", "Todos"],
              ["pendente", "Pendentes"],
              ["divergencia", "Divergência"],
              ["aguardando_vinculo", "Vínculo"],
              ["outros", "Outros"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3 min-h-10 lg:min-h-8 lg:h-8 rounded-md text-xs md:text-sm font-semibold whitespace-nowrap transition-colors ${tab === k ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {tab === "importacoes" ? (
          <ImportacoesPanel canAdmin={canAdmin} />
        ) : (
        <>
        {/* Mobile + tablet: cards */}
        <div className="lg:hidden p-3 md:p-4 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {isLoading && (
            <p className="col-span-full text-center text-muted-foreground py-8">Carregando pedidos…</p>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-8">Nenhum pedido encontrado</p>
          )}
          {filtered.map((p) => (
            <div key={p.id} className="mobile-item-card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-navy text-base">{p.codigo}</div>
                  <div className="text-sm text-ink mt-0.5 truncate">
                    {p.fornecedores?.nome ??
                      (p.status === "aguardando_vinculo" ? "fornecedor não reconhecido" : "—")}
                  </div>
                </div>
                {statusChip(p.status)}
              </div>
              <div className="divide-y divide-border border-y border-border text-sm sm:grid sm:grid-cols-2 sm:gap-2 sm:border-0 sm:divide-y-0">
                <div className="flex items-center justify-between gap-2 py-2 sm:block sm:py-0">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Itens</span>
                  <span className="block font-semibold text-navy">{p.itens_pedido?.length ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-2 py-2 sm:block sm:py-0">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Chegada</span>
                  <span className="block font-semibold text-navy">
                    {p.hora_chegada ? formatTime(p.hora_chegada) : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 py-2 sm:block sm:py-0">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Prevista</span>
                  <span className="block font-semibold text-navy">{formatDateBRT(p.data_prevista)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 py-2 sm:block sm:py-0">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Origem</span>
                  <span className={`chip ${p.origem === "wisetec" ? "chip-info" : "chip-muted"}`}>
                    {origemLabel(p.origem)}
                  </span>
                </div>
              </div>
              {getClienteChips(p).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {getClienteChips(p).map((d) => (
                    <span key={d} className="chip chip-muted">
                      {d}
                    </span>
                  ))}
                </div>
              )}
              <div className="mobile-actions">
                <div className="flex-1 min-w-[7rem] [&_a]:inline-flex [&_a]:items-center [&_a]:justify-center [&_a]:min-h-11 [&_a]:px-3 [&_a]:rounded-lg [&_a]:bg-primary [&_a]:text-primary-foreground [&_a]:text-sm [&_a]:font-semibold [&_a]:no-underline">
                  {pedidoActionLink(p)}
                </div>
                <PedidoRowAdminMenu
                  p={p}
                  canAdmin={canAdmin}
                  onEncerrar={() => {
                    setEncerrarId(p.id);
                    setEncerrarMotivo("");
                  }}
                  onEditar={() => {
                    setEditPedido(p);
                    setEditCodigo(p.codigo);
                    setEditPrevista(p.data_prevista ?? "");
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block">
        <TableWrapper stickyFirstColumn>
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Pedido</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Fornecedor</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Itens</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Origem</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Chegada</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Prevista</th>
                <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Carregando pedidos…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum pedido encontrado
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3 font-semibold text-navy whitespace-nowrap">{p.codigo}</td>
                  <td className="px-4 py-3 text-ink whitespace-nowrap">
                    {p.fornecedores?.nome ?? (p.status === "aguardando_vinculo" ? "fornecedor não reconhecido" : "—")}
                  </td>
                  <td className="px-4 py-3 text-ink">{p.itens_pedido?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {getClienteChips(p).map((d) => (
                        <span key={d} className="chip chip-muted">
                          {d}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`chip ${p.origem === "wisetec" ? "chip-info" : "chip-muted"}`}
                    >
                      {origemLabel(p.origem)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink whitespace-nowrap">
                    {p.hora_chegada ? formatTime(p.hora_chegada) : ""}
                  </td>
                  <td className="px-4 py-3 text-ink whitespace-nowrap">{formatDateBRT(p.data_prevista)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{statusChip(p.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      {pedidoActionLink(p)}
                      <PedidoRowAdminMenu
                        p={p}
                        canAdmin={canAdmin}
                        onEncerrar={() => {
                          setEncerrarId(p.id);
                          setEncerrarMotivo("");
                        }}
                        onEditar={() => {
                          setEditPedido(p);
                          setEditCodigo(p.codigo);
                          setEditPrevista(p.data_prevista ?? "");
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
        </div>
        </>
        )}
      </div>

      {preview && (
        <ImportacaoWiseDialog
          preview={preview}
          onClose={() => setPreview(null)}
          confirming={confirmMut.isPending}
          fornecedores={fornecedores.filter((f) => f.ativo !== false)}
          produtos={produtos.map((p) => ({ id: p.id, nome: p.nome, codigo: p.codigo }))}
          aliases={(aliases ?? []) as AliasRow[]}
          destinatarios={destinatarios}
          clientes={clientes}
          onRebuild={setPreview}
          onConfirm={async () => {
            const result = await confirmMut.mutateAsync(preview);
            setLastImport(result);
            setPreview(null);
            toast.success(`${result.novos} novos · ${result.atualizados} atualizados · ${result.pendencias} pendências`);
          }}
        />
      )}

      <Dialog
        open={manualOpen}
        onOpenChange={(open) => {
          setManualOpen(open);
          if (!open) resetManualForm();
        }}
      >
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lançar pedido manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <SeletorCadastro
                  tipo="fornecedor"
                  value={fornecedorId || null}
                  onChange={(id) => setFornecedorId(id)}
                  suggestedIds={fornecedoresRecentes}
                />
              </div>
              <div className="space-y-2">
                <Label>Código do pedido</Label>
                <Input className="h-10 sm:h-9" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="PC-2041" />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Itens</Label>
              {manualItens.map((item, idx) => (
                <div key={idx} className="p-3 border border-border rounded-lg space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Produto</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <SeletorCadastro
                          tipo="produto"
                          value={item.produto_id || null}
                          fornecedorId={fornecedorId || null}
                          onChange={(v) =>
                            setManualItens((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, produto_id: v } : it)),
                            )
                          }
                        />
                      </div>
                      {manualItens.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-10 w-10 sm:h-9 sm:w-9"
                          onClick={() => setManualItens((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Qtd</Label>
                      <Input
                        className="h-10 sm:h-9"
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) => {
                          const qtd = Number(e.target.value) || 0;
                          setManualItens((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, quantidade: qtd } : it))
                          );
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Preço un.</Label>
                      <Input
                        className="h-10 sm:h-9"
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.preco_unitario}
                        onChange={(e) =>
                          setManualItens((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, preco_unitario: e.target.value } : it))
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cliente (CNPJ / nome)</Label>
                    <SeletorCadastro
                      tipo="cliente"
                      value={item.cliente_id || null}
                      onChange={(v) =>
                        setManualItens((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, cliente_id: v } : it)),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setManualItens((prev) => [
                    ...prev,
                    {
                      produto_id: "",
                      quantidade: 1,
                      preco_unitario: "",
                      cliente_id: "",
                      rateio: [],
                    },
                  ])
                }
              >
                <Plus size={14} /> Adicionar item
              </Button>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" onClick={submitManual} disabled={createManual.isPending || !manualFormValid}>
              {createManual.isPending ? "Salvando…" : "Lançar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPedido} onOpenChange={(o) => !o && setEditPedido(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar pedido (admin)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Código do pedido</Label>
            <Input value={editCodigo} onChange={(e) => setEditCodigo(e.target.value)} />
            <Label>Data prevista</Label>
            <Input type="date" value={editPrevista} onChange={(e) => setEditPrevista(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              type="button"
              disabled={updatePedido.isPending || !editPedido || !editCodigo.trim()}
              onClick={async () => {
                if (!editPedido) return;
                try {
                  await updatePedido.mutateAsync({
                    pedidoId: editPedido.id,
                    codigo: editCodigo.trim(),
                    data_prevista: editPrevista || null,
                  });
                  toast.success("Pedido atualizado");
                  setEditPedido(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!encerrarId} onOpenChange={(open) => !open && setEncerrarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar com falta definitiva?</AlertDialogTitle>
            <AlertDialogDescription>
              O saldo restante vira falta no pedido. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo do encerramento (obrigatório)"
            value={encerrarMotivo}
            onChange={(e) => setEncerrarMotivo(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!encerrarId) return;
                const motivo = encerrarMotivo.trim();
                if (!motivo) {
                  toast.error("Observação obrigatória para encerrar com falta");
                  return;
                }
                try {
                  await encerrarPedido.mutateAsync({ pedidoId: encerrarId, motivo });
                  toast.success("Pedido encerrado com falta definitiva");
                  setEncerrarId(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao encerrar");
                }
              }}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
