import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Plus, ChevronRight, Trash2, Pencil, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
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
  useImportPedidos,
  useFillRate,
  useUpdatePedidoAdmin,
} from "@/hooks/use-pedidos";
import { sumRateio, rateioRestante, validateRateio } from "@/lib/rateio";
import { useFornecedores, useProdutos, useDestinatarios } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import { resolveIsAdmin } from "@/lib/roles";
import { parsePedidosExcel, buildPedidosFromExcel } from "@/lib/excel";
import { formatTime } from "@/lib/utils-date";

export const Route = createFileRoute("/recebimento/")({
  component: Page,
  head: () => ({ meta: [{ title: "Recebimento · Campo Alegre" }] }),
});

type ItemPedidoRateio = {
  destinatario_id: string;
  quantidade: number;
  destinatarios: { nome: string } | null;
};

type ItemPedido = {
  id: string;
  itens_pedido_rateio: ItemPedidoRateio[];
};

type PedidoDia = {
  id: string;
  codigo: string;
  fornecedor_id: string;
  origem: string;
  hora_chegada: string | null;
  status: string;
  fornecedores: { nome: string } | null;
  itens_pedido: ItemPedido[];
};

type ManualItem = {
  produto_id: string;
  quantidade: number;
  rateio: { destinatario_id: string; quantidade: number }[];
};

const statusChip = (s: string) => {
  if (s === "conferido") return <span className="chip chip-ok">Conferido</span>;
  if (s === "aguardando_liberacao") return <span className="chip chip-warn">Aguardando liberação</span>;
  if (s === "divergencia") return <span className="chip chip-danger">Com divergência</span>;
  return <span className="chip chip-warn">Pendente</span>;
};

function pedidoActionLink(p: PedidoDia) {
  if (p.status === "pendente") {
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

function getRateioChips(p: PedidoDia): [string, number][] {
  const map = new Map<string, number>();
  for (const item of p.itens_pedido ?? []) {
    for (const r of item.itens_pedido_rateio ?? []) {
      const nome = r.destinatarios?.nome ?? "?";
      map.set(nome, (map.get(nome) ?? 0) + Number(r.quantidade));
    }
  }
  return [...map.entries()];
}

function origemLabel(o: string) {
  if (o === "wisetec") return "Wisetec";
  if (o === "excel") return "Excel";
  if (o === "manual") return "Manual";
  return o;
}

function Page() {
  const [tab, setTab] = useState<"todos" | "pendente" | "conferido" | "divergencia" | "aguardando_liberacao">("todos");
  const [manualOpen, setManualOpen] = useState(false);
  const [editPedido, setEditPedido] = useState<PedidoDia | null>(null);
  const [editCodigo, setEditCodigo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { user, profile, isAdmin } = useAuth();
  usePedidosRealtime();
  const { data: pedidos = [], isLoading, error } = usePedidosDia();
  const { data: fillRateData = [] } = useFillRate();
  const { data: fornecedores = [] } = useFornecedores();
  const { data: produtos = [] } = useProdutos();
  const { data: destinatarios = [] } = useDestinatarios();
  const createManual = useCreatePedidoManual();
  const importPedidos = useImportPedidos();
  const updatePedido = useUpdatePedidoAdmin();
  const canAdmin = isAdmin || resolveIsAdmin(profile, user);

  const [fornecedorId, setFornecedorId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [manualItens, setManualItens] = useState<ManualItem[]>([
    { produto_id: "", quantidade: 1, rateio: [{ destinatario_id: "", quantidade: 0 }] },
  ]);

  const typedPedidos = pedidos as PedidoDia[];
  const filtered = typedPedidos.filter((p) => tab === "todos" || p.status === tab);

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

  const nameMaps = useMemo(
    () => ({
      fornecedorByName: new Map(fornecedores.map((f) => [f.nome.trim(), f.id])),
      produtoByName: new Map(produtos.map((p) => [p.nome.trim(), p.id])),
      destinatarioByName: new Map(destinatarios.map((d) => [d.nome.trim(), d.id])),
    }),
    [fornecedores, produtos, destinatarios]
  );

  const handleExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;

    try {
      const buf = await file.arrayBuffer();
      const rows = parsePedidosExcel(buf);
      if (!rows.length) {
        toast.error("Planilha vazia ou formato inválido");
        return;
      }
      const built = buildPedidosFromExcel(rows, nameMaps);
      if (!built.length) {
        toast.error("Nenhum pedido válido — verifique nomes de fornecedor/produto");
        return;
      }
      await importPedidos.mutateAsync(
        built.map((p) => ({ ...p, created_by: user.id }))
      );
      toast.success(`${built.length} pedido(s) importado(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar Excel");
    }
  };

  const resetManualForm = () => {
    setFornecedorId("");
    setCodigo("");
    setManualItens([{ produto_id: "", quantidade: 1, rateio: [{ destinatario_id: "", quantidade: 0 }] }]);
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
        rateio: i.rateio.filter((r) => r.destinatario_id && r.quantidade > 0),
      }));
    if (!itens.length) {
      toast.error("Adicione ao menos um item válido");
      return;
    }
    for (const item of itens) {
      const v = validateRateio(item.quantidade, item.rateio);
      if (!v.ok) {
        toast.error(v.error);
        return;
      }
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
    return itens.every((i) => validateRateio(i.quantidade, i.rateio).ok);
  }, [fornecedorId, codigo, manualItens]);

  return (
    <div>
      <PageHeader
        title="Conferência de Mercadoria"
        subtitle="Pedidos a conferir do dia · recebimento sempre aceito"
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleExcel}
            />
            {canAdmin && (
              <Link
                to="/recebimento/liberacoes"
                className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-warning/40 bg-warning/10 text-sm font-semibold text-navy hover:bg-warning/20"
              >
                <ShieldAlert size={14} /> Liberações
              </Link>
            )}
            <button
              type="button"
              disabled={importPedidos.isPending}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary disabled:opacity-50"
            >
              <FileSpreadsheet size={14} /> Importar Excel
            </button>
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark"
            >
              <Plus size={14} /> Lançar pedido manual
            </button>
          </>
        }
      />

      <StatStrip
        items={[
          { label: "Pedidos hoje", value: isLoading ? "…" : String(typedPedidos.length) },
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

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          Erro ao carregar pedidos: {error.message}
        </div>
      )}

      <div className="card-base">
        <div className="flex items-center gap-1 p-2 border-b border-border">
          {(
            [
              ["todos", "Todos"],
              ["pendente", "A conferir"],
              ["conferido", "Conferidos"],
              ["aguardando_liberacao", "Aguard. liberação"],
              ["divergencia", "Com divergência"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${tab === k ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Pedido</th>
              <th className="text-left px-4 py-3 font-semibold">Fornecedor</th>
              <th className="text-left px-4 py-3 font-semibold">Itens</th>
              <th className="text-left px-4 py-3 font-semibold">Rateio</th>
              <th className="text-left px-4 py-3 font-semibold">Origem</th>
              <th className="text-left px-4 py-3 font-semibold">Chegada</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando pedidos…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum pedido encontrado
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                <td className="px-4 py-3 font-semibold text-navy">{p.codigo}</td>
                <td className="px-4 py-3 text-ink">{p.fornecedores?.nome ?? "—"}</td>
                <td className="px-4 py-3 text-ink">{p.itens_pedido?.length ?? 0}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {getRateioChips(p).map(([d, q]) => (
                      <span key={d} className="chip chip-muted">
                        {d} · {q}
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
                <td className="px-4 py-3 text-ink">{formatTime(p.hora_chegada)}</td>
                <td className="px-4 py-3">{statusChip(p.status)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {pedidoActionLink(p)}
                    {canAdmin && p.status === "conferido" && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditPedido(p);
                          setEditCodigo(p.codigo);
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
      </div>

      <Dialog
        open={manualOpen}
        onOpenChange={(open) => {
          setManualOpen(open);
          if (!open) resetManualForm();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lançar pedido manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fornecedor</Label>
                <Select value={fornecedorId || undefined} onValueChange={setFornecedorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent position="popper" onCloseAutoFocus={(e) => e.preventDefault()}>
                    {fornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Código do pedido</Label>
                <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="PC-2041" />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Itens</Label>
              {manualItens.map((item, idx) => (
                <div key={idx} className="p-3 border border-border rounded-lg space-y-2">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Produto</Label>
                      <Select
                        value={item.produto_id || undefined}
                        onValueChange={(v) =>
                          setManualItens((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, produto_id: v } : it))
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Produto…" />
                        </SelectTrigger>
                        <SelectContent position="popper" onCloseAutoFocus={(e) => e.preventDefault()}>
                          {produtos.map((pr) => (
                            <SelectItem key={pr.id} value={pr.id}>
                              {pr.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Qtd</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantidade}
                        onChange={(e) => {
                          const qtd = Number(e.target.value) || 0;
                          setManualItens((prev) =>
                            prev.map((it, i) => {
                              if (i !== idx) return it;
                              let rateio = it.rateio;
                              if (sumRateio(rateio) > qtd) {
                                let remaining = qtd;
                                rateio = rateio.map((r) => {
                                  if (!r.destinatario_id || r.quantidade <= 0) return r;
                                  const q = Math.min(r.quantidade, remaining);
                                  remaining -= q;
                                  return { ...r, quantidade: q };
                                });
                              }
                              return { ...it, quantidade: qtd, rateio };
                            })
                          );
                        }}
                      />
                    </div>
                    {manualItens.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setManualItens((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Rateio por destinatário</Label>
                      {(() => {
                        const sum = sumRateio(item.rateio);
                        const ok = sum === item.quantidade || (sum === 0 && item.rateio.every((r) => !r.destinatario_id));
                        return (
                          <span className={`text-[10px] font-semibold ${ok ? "text-[var(--success)]" : "text-destructive"}`}>
                            Rateado: {sum} / {item.quantidade}
                          </span>
                        );
                      })()}
                    </div>
                    {item.rateio.map((r, ri) => (
                      <div key={ri} className="flex gap-2">
                        <Select
                          value={r.destinatario_id || undefined}
                          onValueChange={(v) =>
                            setManualItens((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? {
                                      ...it,
                                      rateio: it.rateio.map((rr, j) =>
                                        j === ri ? { ...rr, destinatario_id: v } : rr
                                      ),
                                    }
                                  : it
                              )
                            )
                          }
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Destinatário…" />
                          </SelectTrigger>
                          <SelectContent position="popper" onCloseAutoFocus={(e) => e.preventDefault()}>
                            {destinatarios.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={0}
                          max={rateioRestante(item.quantidade, item.rateio, ri)}
                          className="w-24"
                          value={r.quantidade || ""}
                          onChange={(e) => {
                            const max = rateioRestante(item.quantidade, item.rateio, ri);
                            const q = Math.min(Number(e.target.value) || 0, max);
                            setManualItens((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? {
                                      ...it,
                                      rateio: it.rateio.map((rr, j) =>
                                        j === ri ? { ...rr, quantidade: q } : rr
                                      ),
                                    }
                                  : it
                              )
                            );
                          }}
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setManualItens((prev) =>
                          prev.map((it, i) =>
                            i === idx
                              ? {
                                  ...it,
                                  rateio: [...it.rateio, { destinatario_id: "", quantidade: 0 }],
                                }
                              : it
                          )
                        )
                      }
                    >
                      + Rateio
                    </Button>
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
                      rateio: [{ destinatario_id: "", quantidade: 0 }],
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
    </div>
  );
}
