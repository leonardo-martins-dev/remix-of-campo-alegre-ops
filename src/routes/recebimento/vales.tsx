import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Receipt,
  ExternalLink,
  BookCheck,
  ListChecks,
  DollarSign,
  Clock,
  Ban,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
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
import {
  useValesByStatus,
  useValesKpis,
  useAplicarVale,
  useRecusarVale,
  useMarcarValeLancado,
  useAplicarValesLote,
  type SolicitacaoVale,
  type StatusVale,
} from "@/hooks/use-vales";
import { useFornecedores } from "@/hooks/use-cadastros";
import { formatDateBRT, todayBRT, addDaysBRT } from "@/lib/utils-date";

export const Route = createFileRoute("/recebimento/vales")({
  component: Page,
  head: () => ({ meta: [{ title: "Vales · Campo Alegre" }] }),
});

type PeriodKey = "hoje" | "7d" | "30d" | "custom";

function periodRange(key: PeriodKey): { from: string | null; to: string | null } {
  const today = todayBRT();
  if (key === "hoje") return { from: today, to: today };
  if (key === "7d") return { from: addDaysBRT(today, -7), to: today };
  if (key === "30d") return { from: addDaysBRT(today, -30), to: today };
  return { from: null, to: null };
}

function groupByFornecedor(vales: SolicitacaoVale[]) {
  const map = new Map<string, { nome: string; vales: SolicitacaoVale[]; total: number }>();
  for (const v of vales) {
    const key = v.fornecedor_id;
    const cur = map.get(key) ?? { nome: v.fornecedores?.nome ?? "—", vales: [], total: 0 };
    cur.vales.push(v);
    cur.total += Number(v.valor_final ?? v.valor_calculado ?? 0);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

function Page() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<StatusVale>("pendente");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customFrom, setCustomFrom] = useState(todayBRT());
  const [customTo, setCustomTo] = useState(todayBRT());
  const [fornecedorId, setFornecedorId] = useState<string>("all");

  const range = period === "custom" ? { from: customFrom, to: customTo } : periodRange(period);
  const filterBase = {
    fornecedorId: fornecedorId === "all" ? null : fornecedorId,
    from: range.from,
    to: range.to,
  };

  const { data: vales = [], isLoading } = useValesByStatus({ status: tab, ...filterBase });
  const { data: kpis } = useValesKpis(filterBase);
  const { data: fornecedores = [] } = useFornecedores();

  const aplicar = useAplicarVale();
  const recusar = useRecusarVale();
  const marcarLancado = useMarcarValeLancado();
  const aplicarLote = useAplicarValesLote();

  // Action dialogs
  const [selectedVale, setSelectedVale] = useState<SolicitacaoVale | null>(null);
  const [action, setAction] = useState<"aplicar" | "recusar" | "lancado" | null>(null);
  const [valorFinal, setValorFinal] = useState("");
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [refWise, setRefWise] = useState("");

  // Batch selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => groupByFornecedor(vales), [vales]);

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Acesso restrito a administradores.{" "}
        <Link to="/recebimento" className="text-primary-dark underline">
          Voltar
        </Link>
      </p>
    );
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFornecedor = (fornVales: SolicitacaoVale[]) => {
    const ids = fornVales.map((v) => v.id);
    const allIn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allIn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const openAplicar = (vale: SolicitacaoVale) => {
    setSelectedVale(vale);
    setValorFinal(vale.valor_calculado.toFixed(2));
    setAction("aplicar");
  };

  const openRecusar = (vale: SolicitacaoVale) => {
    setSelectedVale(vale);
    setMotivoRecusa("");
    setAction("recusar");
  };

  const openLancado = (vale: SolicitacaoVale) => {
    setSelectedVale(vale);
    setRefWise(vale.ref_wise ?? "");
    setAction("lancado");
  };

  const submitAplicar = async () => {
    if (!selectedVale) return;
    const valor = parseFloat(valorFinal);
    if (isNaN(valor) || valor < 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      await aplicar.mutateAsync({ solicitacaoId: selectedVale.id, valorFinal: valor });
      toast.success("Vale aplicado com sucesso");
      setSelectedVale(null);
      setAction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aplicar vale");
    }
  };

  const submitRecusar = async () => {
    if (!selectedVale) return;
    if (!motivoRecusa.trim()) {
      toast.error("Motivo obrigatório para recusar");
      return;
    }
    try {
      await recusar.mutateAsync({ solicitacaoId: selectedVale.id, motivo: motivoRecusa.trim() });
      toast.success("Vale recusado");
      setSelectedVale(null);
      setAction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao recusar vale");
    }
  };

  const submitLancado = async () => {
    if (!selectedVale) return;
    try {
      await marcarLancado.mutateAsync({ valeId: selectedVale.id, refWise: refWise.trim() || undefined });
      toast.success("Vale marcado como lançado no Wise");
      setSelectedVale(null);
      setAction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao marcar vale como lançado");
    }
  };

  const submitLote = async () => {
    if (selected.size === 0) return;
    try {
      const result = await aplicarLote.mutateAsync({ valeIds: [...selected] });
      toast.success(`${result.aplicados} de ${result.total} vales aplicados em lote`);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aplicar em lote");
    }
  };

  const tabLabel = (status: StatusVale, count: number | undefined) => {
    const labels: Record<StatusVale, string> = {
      pendente: "Pendentes",
      aplicado: "Aplicados",
      lancado: "Lançados",
      recusado: "Recusados",
    };
    return `${labels[status]}${count != null ? ` (${count})` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Vales"
        subtitle="Solicitações de desconto por diferença no recebimento"
        actions={
          <Link
            to="/recebimento"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Voltar
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiCard
          label="Pendentes"
          value={kpis ? String(kpis.pendentes) : "…"}
          icon={Clock}
          accent="var(--warning)"
        />
        <KpiCard
          label="Valor aplicado"
          value={kpis ? `R$ ${kpis.valorAplicado.toFixed(2)}` : "…"}
          icon={DollarSign}
        />
        <KpiCard
          label="Lançados no Wise"
          value={kpis ? String(kpis.lancados) : "…"}
          icon={BookCheck}
          accent="var(--success)"
        />
        <KpiCard
          label="Recusados"
          value={kpis ? String(kpis.recusados) : "…"}
          icon={Ban}
          accent="var(--danger)"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="7d">7 dias</SelectItem>
            <SelectItem value="30d">30 dias</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {period === "custom" && (
          <>
            <Input type="date" className="w-40" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <Input type="date" className="w-40" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        )}
        <Select value={fornecedorId} onValueChange={setFornecedorId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Fornecedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos fornecedores</SelectItem>
            {fornecedores.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as StatusVale); setSelected(new Set()); }}>
        <TabsList className="mb-4">
          <TabsTrigger value="pendente">{tabLabel("pendente", kpis?.pendentes)}</TabsTrigger>
          <TabsTrigger value="aplicado">{tabLabel("aplicado", kpis?.aplicados)}</TabsTrigger>
          <TabsTrigger value="lancado">{tabLabel("lancado", kpis?.lancados)}</TabsTrigger>
          <TabsTrigger value="recusado">{tabLabel("recusado", kpis?.recusados)}</TabsTrigger>
        </TabsList>

        {/* Batch actions bar for pendentes */}
        {tab === "pendente" && selected.size > 0 && (
          <div className="flex items-center gap-3 mb-3 p-3 rounded-lg bg-primary-soft">
            <span className="text-sm font-semibold text-navy">{selected.size} selecionado(s)</span>
            <Button size="sm" onClick={submitLote} disabled={aplicarLote.isPending}>
              <ListChecks size={14} className="mr-1" />
              {aplicarLote.isPending ? "Aplicando…" : "Aplicar em lote"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        )}

        <TabsContent value={tab}>
          {isLoading && <p className="text-sm text-muted-foreground py-4">Carregando…</p>}

          {!isLoading && vales.length === 0 && (
            <EmptyState status={tab} />
          )}

          {!isLoading && grupos.map((grupo) => (
            <div key={grupo.nome} className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {tab === "pendente" && (
                    <Checkbox
                      checked={grupo.vales.every((v) => selected.has(v.id))}
                      onCheckedChange={() => toggleFornecedor(grupo.vales)}
                    />
                  )}
                  <h3 className="text-sm font-bold text-navy">{grupo.nome}</h3>
                  <span className="text-xs text-muted-foreground">
                    {grupo.vales.length} {grupo.vales.length === 1 ? "vale" : "vales"}
                  </span>
                </div>
                <span className="text-sm font-bold text-navy">
                  R$ {grupo.total.toFixed(2)}
                </span>
              </div>

              <div className="space-y-3">
                {grupo.vales.map((vale) => (
                  <ValeCard
                    key={vale.id}
                    vale={vale}
                    tab={tab}
                    isSelected={selected.has(vale.id)}
                    onToggleSelect={() => toggleSelect(vale.id)}
                    onAplicar={() => openAplicar(vale)}
                    onRecusar={() => openRecusar(vale)}
                    onLancado={() => openLancado(vale)}
                    busy={aplicar.isPending || recusar.isPending || marcarLancado.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {/* Dialog: Aplicar */}
      <Dialog open={action === "aplicar" && !!selectedVale} onOpenChange={() => { setAction(null); setSelectedVale(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar vale</DialogTitle>
          </DialogHeader>
          {selectedVale && (
            <div className="space-y-4">
              <div className="text-sm">
                <strong>{selectedVale.produto_nome}</strong> · {selectedVale.fornecedores?.nome}
              </div>
              <div className="text-sm text-muted-foreground">
                Diferença: {selectedVale.diferenca} {selectedVale.preco_unitario ? `× R$ ${selectedVale.preco_unitario.toFixed(2)}` : "(preço estimado)"}
              </div>
              <div className="space-y-2">
                <Label>Valor final do vale (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorFinal}
                  onChange={(e) => setValorFinal(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Valor calculado: R$ {selectedVale.valor_calculado.toFixed(2)}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setSelectedVale(null); }}>
              Cancelar
            </Button>
            <Button onClick={submitAplicar} disabled={aplicar.isPending}>
              {aplicar.isPending ? "Aplicando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Recusar */}
      <Dialog open={action === "recusar" && !!selectedVale} onOpenChange={() => { setAction(null); setSelectedVale(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar vale</DialogTitle>
          </DialogHeader>
          {selectedVale && (
            <div className="space-y-4">
              <div className="text-sm">
                <strong>{selectedVale.produto_nome}</strong> · {selectedVale.fornecedores?.nome}
              </div>
              <div className="text-sm text-muted-foreground">
                Valor solicitado: R$ {selectedVale.valor_calculado.toFixed(2)}
              </div>
              <div className="space-y-2">
                <Label>Motivo da recusa (obrigatório)</Label>
                <Textarea
                  placeholder="Explique por que o vale está sendo recusado..."
                  value={motivoRecusa}
                  onChange={(e) => setMotivoRecusa(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setSelectedVale(null); }}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={submitRecusar} disabled={recusar.isPending || !motivoRecusa.trim()}>
              {recusar.isPending ? "Recusando..." : "Recusar vale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Marcar como lançado */}
      <Dialog open={action === "lancado" && !!selectedVale} onOpenChange={() => { setAction(null); setSelectedVale(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como lançado no Wise</DialogTitle>
          </DialogHeader>
          {selectedVale && (
            <div className="space-y-4">
              <div className="text-sm">
                <strong>{selectedVale.produto_nome}</strong> · {selectedVale.fornecedores?.nome}
              </div>
              <div className="text-sm text-muted-foreground">
                Valor aplicado: R$ {(selectedVale.valor_final ?? selectedVale.valor_calculado).toFixed(2)}
              </div>
              <div className="space-y-2">
                <Label>Referência no Wise (opcional)</Label>
                <Input
                  placeholder="Ex: NF-12345, lançamento #789…"
                  value={refWise}
                  onChange={(e) => setRefWise(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setSelectedVale(null); }}>
              Cancelar
            </Button>
            <Button onClick={submitLancado} disabled={marcarLancado.isPending}>
              {marcarLancado.isPending ? "Salvando..." : "Confirmar lançamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ValeCard({
  vale,
  tab,
  isSelected,
  onToggleSelect,
  onAplicar,
  onRecusar,
  onLancado,
  busy,
}: {
  vale: SolicitacaoVale;
  tab: StatusVale;
  isSelected: boolean;
  onToggleSelect: () => void;
  onAplicar: () => void;
  onRecusar: () => void;
  onLancado: () => void;
  busy: boolean;
}) {
  const valor = Number(vale.valor_final ?? vale.valor_calculado);

  return (
    <div className="card-base p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          {tab === "pendente" && (
            <Checkbox
              className="mt-1"
              checked={isSelected}
              onCheckedChange={onToggleSelect}
            />
          )}
          <div>
            <div className="font-bold text-navy">{vale.produto_nome ?? "Produto"}</div>
            <div className="text-sm text-muted-foreground">
              Pedido {vale.pedidos_recebimento?.codigo ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Conferente: {vale.conferente?.nome ?? "—"} · {formatDateBRT(vale.created_at)}
            </div>
            {vale.item_conferencia_id && (
              <Link
                to="/recebimento/conferir"
                search={{ pedidoId: vale.pedido_id }}
                className="text-xs text-primary-dark hover:underline mt-1 inline-block"
              >
                Ver conferência →
              </Link>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-amber-600">
            R$ {valor.toFixed(2)}
            {vale.estimado && <span className="text-xs font-normal ml-1">(estimado)</span>}
          </div>
          <div className="text-xs text-muted-foreground">
            {tab === "pendente" ? "Valor calculado" : tab === "aplicado" ? "Valor aplicado" : tab === "lancado" ? "Valor lançado" : "Valor solicitado"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm mb-3">
        <div className="p-2 rounded bg-secondary/50">
          <div className="font-semibold">{vale.quantidade_pedida}</div>
          <div className="text-xs text-muted-foreground">Pedido</div>
        </div>
        <div className="p-2 rounded bg-secondary/50">
          <div className="font-semibold">{vale.quantidade_recebida}</div>
          <div className="text-xs text-muted-foreground">Recebido</div>
        </div>
        <div className="p-2 rounded bg-amber-50 border border-amber-200">
          <div className="font-semibold text-amber-700">{vale.diferenca}</div>
          <div className="text-xs text-amber-600">Diferença</div>
        </div>
      </div>

      {vale.observacao_conferente && (
        <div className="mb-3 p-2 rounded bg-secondary/30 text-sm">
          <span className="font-medium">Obs:</span> {vale.observacao_conferente}
        </div>
      )}

      {tab === "recusado" && vale.motivo_recusa && (
        <div className="mb-3 p-2 rounded bg-destructive/10 text-sm text-destructive">
          <span className="font-medium">Motivo da recusa:</span> {vale.motivo_recusa}
        </div>
      )}

      {tab === "lancado" && (
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {vale.lancado_por_profile?.nome && <span>Lançado por: {vale.lancado_por_profile.nome}</span>}
          {vale.lancado_em && <span>em {formatDateBRT(vale.lancado_em)}</span>}
          {vale.ref_wise && <span className="chip chip-info">Ref: {vale.ref_wise}</span>}
        </div>
      )}

      {vale.fotos && vale.fotos.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {vale.fotos.map((foto) => (
            <a
              key={foto.id}
              href={foto.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative w-16 h-16 rounded-md overflow-hidden border hover:opacity-80"
            >
              <img src={foto.url} alt="" className="w-full h-full object-cover" />
              <ExternalLink size={10} className="absolute bottom-1 right-1 text-white drop-shadow" />
            </a>
          ))}
        </div>
      )}

      {/* Actions by tab */}
      {tab === "pendente" && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onAplicar} disabled={busy}>
            <CheckCircle2 size={14} className="mr-1" /> Aplicar
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={onRecusar} disabled={busy}>
            <XCircle size={14} className="mr-1" /> Recusar
          </Button>
        </div>
      )}
      {tab === "aplicado" && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={onLancado} disabled={busy}>
            <BookCheck size={14} className="mr-1" /> Marcar como lançado
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ status }: { status: StatusVale }) {
  const messages: Record<StatusVale, { title: string; hint: string }> = {
    pendente: {
      title: "Nenhum vale pendente",
      hint: "Quando o conferente registrar uma falta, a solicitação aparece aqui. Verifique o Relatório de Faltas para itens sem vale.",
    },
    aplicado: {
      title: "Nenhum vale aplicado",
      hint: "Vales aplicados ficam aqui até serem lançados no Wise.",
    },
    lancado: {
      title: "Nenhum vale lançado",
      hint: "Após lançar no Wise, marque os vales aplicados como lançados para manter o controle.",
    },
    recusado: {
      title: "Nenhum vale recusado",
      hint: "Vales recusados pelo administrador aparecem aqui para referência.",
    },
  };

  const msg = messages[status];

  return (
    <div className="text-center py-12">
      <Receipt className="mx-auto h-12 w-12 text-muted-foreground/50" />
      <p className="text-sm font-semibold text-navy mt-3">{msg.title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{msg.hint}</p>
      <div className="flex justify-center gap-3 mt-4">
        {status === "pendente" && (
          <Link to="/recebimento/faltas" className="text-sm text-primary-dark hover:underline inline-flex items-center gap-1">
            <AlertTriangle size={14} /> Ver Relatório de Faltas
          </Link>
        )}
        {status === "lancado" && (
          <button
            type="button"
            className="text-sm text-primary-dark hover:underline"
            onClick={() => {
              const tabEl = document.querySelector<HTMLButtonElement>('[data-state][value="aplicado"]');
              tabEl?.click();
            }}
          >
            Ver Aplicados →
          </button>
        )}
      </div>
    </div>
  );
}
