import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Plus, ChevronRight, Trash2, Pencil, ShieldAlert, RefreshCw, Ban, Receipt } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { useContarValesPendentes } from "@/hooks/use-vales";
import { StatStrip } from "@/components/stat-strip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  usePedidosDia,
  usePedidosRealtime,
  useCreatePedidoManual,
  useFillRate,
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
import { formatDateBRT, formatTime, todayBRT } from "@/lib/utils-date";
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
  if (s === "aguardando_vinculo") return <span className="chip chip-warn">Fornecedor não reconhecido</span>;
  if (s === "encerrado") return <span className="chip">Encerrado</span>;
  if (s === "aguardando_liberacao") return <span className="chip chip-warn">Aguardando liberação</span>;
  if (s === "divergencia") return <span className="chip chip-danger">Com divergência</span>;
  return <span className="chip chip-warn">A conferir</span>;
};

function pedidoActionLink(p: PedidoDia) {
  if (p.status === "pendente" || p.status === "parcial") {
    return (
      <Link
        to="/recebimento/conferir"
        search={{ pedidoId: p.id }}
        className="inline-flex items-center gap-1 text-primary-dark text-xs font-semibold hover:underline"
      >
        Conferir <ChevronRight size={12} />
      </Link>
    );
  }
  if (p.status === "aguardando_liberacao" || p.status === "divergencia") {
    return (
      <Link
        to="/recebimento/conferir"
        search={{ pedidoId: p.id }}
        className="inline-flex items-center gap-1 text-warning text-xs font-semibold hover:underline"
      >
        Ver <ChevronRight size={12} />
      </Link>
    );
  }
  return (
    <Link
      to="/recebimento/conferir"
      search={{ pedidoId: p.id }}
      className="inline-flex items-center gap-1 text-muted-foreground text-xs font-semibold hover:underline"
    >
      Ver <ChevronRight size={12} />
    </Link>
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

function Page() {
  const [tab, setTab] = useState<"todos" | "pendente" | "parcial" | "conferido" | "divergencia" | "aguardando_liberacao" | "aguardando_vinculo" | "encerrado" | "importacoes">("todos");
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
  const { data: fillRateData = [] } = useFillRate("today");
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
    if (tab !== "todos" && p.status !== tab) return false;
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return (
      p.codigo.toLowerCase().includes(q) ||
      (p.fornecedores?.nome ?? "").toLowerCase().includes(q) ||
      getClienteChips(p).some((n) => n.toLowerCase().includes(q))
    );
  });

  const stats = useMemo(() => {
    const totalItens = typedPedidos.reduce((a, p) => a + (p.itens_pedido?.length ?? 0), 0);
    const itensPendentes = typedPedidos
      .filter((p) => p.status === "pendente")
      .reduce((a, p) => a + (p.itens_pedido?.length ?? 0), 0);
    const divergencias = typedPedidos.filter(
      (p) => p.status === "divergencia" || p.status === "aguardando_liberacao"
    ).length;
    const fillAvg =
      fillRateData.length > 0
        ? fillRateData.reduce((a, f) => a + (Number(f.fill_rate) || 0), 0) / fillRateData.length
        : 0;
    return { totalItens, itensPendentes, divergencias, fillAvg };
  }, [typedPedidos, fillRateData]);

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
          <div className="header-actions-mobile">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleExcel}
            />
            {canAdmin && (
              <>
                <Link
                  to="/recebimento/vales"
                  className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 px-2 sm:px-3 rounded-lg border border-amber-300/50 bg-amber-50 text-xs sm:text-sm font-semibold text-amber-800 hover:bg-amber-100 relative"
                >
                  <Receipt size={14} /> Vales
                  {valesPendentes > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">
                      {valesPendentes > 99 ? "99+" : valesPendentes}
                    </span>
                  )}
                </Link>
                <Link
                  to="/recebimento/liberacoes"
                  className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 px-2 sm:px-3 rounded-lg border border-warning/40 bg-warning/10 text-xs sm:text-sm font-semibold text-navy hover:bg-warning/20"
                >
                  <ShieldAlert size={14} /> <span className="hidden sm:inline">Liberações</span><span className="sm:hidden">Lib.</span>
                </Link>
              </>
            )}
            <button
              type="button"
              disabled={syncWise.isPending}
              onClick={async () => {
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
                    toast.success(`${result.novos} novos · ${result.atualizados} atualizados · ${result.pendencias} pendências`);
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao sincronizar Wise");
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 px-2 sm:px-3 rounded-lg border border-border bg-card text-xs sm:text-sm font-semibold text-navy hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw size={14} /> <span className="hidden sm:inline">Sincronizar </span>Wise
            </button>
            <button
              type="button"
              disabled={previewMut.isPending}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 px-2 sm:px-3 rounded-lg border border-border bg-card text-xs sm:text-sm font-semibold text-navy hover:bg-secondary disabled:opacity-50"
            >
              <FileSpreadsheet size={14} /> <span className="hidden sm:inline">Importar planilha</span><span className="sm:hidden">Planilha</span>
            </button>
            <button
              type="button"
              onClick={() => downloadWiseModelo()}
              className="hidden sm:inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
            >
              Baixar modelo
            </button>
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-9 px-2 sm:px-3 rounded-lg bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary-dark"
            >
              <Plus size={14} /> <span className="hidden sm:inline">Lançar pedido </span>manual
            </button>
          </div>
        }
      />

      <StatStrip
        items={[
          { label: `Pedidos em ${formatDateBRT(dataFiltro)}`, value: isLoading ? "…" : String(typedPedidos.length) },
          {
            label: "Itens a conferir",
            value: isLoading ? "…" : String(stats.itensPendentes),
            tone: "warn",
          },
          {
            label: "Fill rate hoje",
            value: isLoading ? "…" : `${stats.fillAvg.toFixed(1)}%`,
            tone: "ok",
          },
          {
            label: "Divergências",
            value: isLoading ? "…" : String(stats.divergencias),
            tone: "danger",
          },
        ]}
      />

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

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-3">
        <Input type="date" className="w-full sm:w-40 h-10 sm:h-9" value={dataFiltro} onChange={(e) => setDataFiltro(e.target.value || todayBRT())} />
        <Input className="w-full sm:w-64 h-10 sm:h-9" placeholder="Buscar pedido, fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="card-base">
        <div className="flex items-center gap-1 p-2 border-b border-border overflow-x-auto -webkit-overflow-scrolling-touch">
          {(
            [
              ["todos", "Todos"],
              ["pendente", "Conferir"],
              ["parcial", "Parcial"],
              ["aguardando_vinculo", "Vínculo"],
              ["conferido", "Recebidos"],
              ["aguardando_liberacao", "Aguard."],
              ["divergencia", "Diverg."],
              ["encerrado", "Encerr."],
              ["importacoes", "Import."],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-2.5 sm:px-3 h-8 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${tab === k ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {tab === "importacoes" ? (
          <ImportacoesPanel canAdmin={canAdmin} />
        ) : (
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
                  <td className="px-4 py-3 text-ink whitespace-nowrap">{formatTime(p.hora_chegada)}</td>
                  <td className="px-4 py-3 text-ink whitespace-nowrap">{formatDateBRT(p.data_prevista)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{statusChip(p.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                      {pedidoActionLink(p)}
                      {canAdmin && p.status === "parcial" && (
                        <button
                          type="button"
                          onClick={() => {
                            setEncerrarId(p.id);
                            setEncerrarMotivo("");
                          }}
                          className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                        >
                          <Ban size={12} /> Encerrar
                        </button>
                      )}
                      {canAdmin && (p.status === "conferido" || p.status === "pendente" || p.status === "parcial") && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditPedido(p);
                            setEditCodigo(p.codigo);
                            setEditPrevista(p.data_prevista ?? "");
                          }}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-navy"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
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
                <Select value={fornecedorId || undefined} onValueChange={setFornecedorId}>
                  <SelectTrigger className="h-10 sm:h-9">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent position="popper" onCloseAutoFocus={(e) => e.preventDefault()}>
                    {fornecedores.filter((f) => f.ativo !== false).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                      <Select
                        value={item.produto_id || undefined}
                        onValueChange={(v) =>
                          setManualItens((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, produto_id: v } : it))
                          )
                        }
                      >
                        <SelectTrigger className="h-10 sm:h-9 flex-1">
                          <SelectValue placeholder="Produto…" />
                        </SelectTrigger>
                        <SelectContent position="popper" onCloseAutoFocus={(e) => e.preventDefault()}>
                          {produtos.filter((pr) => (pr as { ativo?: boolean }).ativo !== false).map((pr) => (
                            <SelectItem key={pr.id} value={pr.id}>
                              {pr.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                    <Select
                      value={item.cliente_id || undefined}
                      onValueChange={(v) =>
                        setManualItens((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, cliente_id: v } : it))
                        )
                      }
                    >
                      <SelectTrigger className="h-10 sm:h-9">
                        <SelectValue placeholder="Cliente…" />
                      </SelectTrigger>
                      <SelectContent position="popper" onCloseAutoFocus={(e) => e.preventDefault()}>
                        {clientes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}{c.cnpj ? ` · ${c.cnpj}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
