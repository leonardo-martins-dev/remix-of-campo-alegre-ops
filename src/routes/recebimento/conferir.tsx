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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePedidosDia, usePedido } from "@/hooks/use-pedidos";
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
  produto: string;
  unid: string;
  pedido: number;
  rateio: [string, number][];
  recebido: number;
  conferido: boolean;
  qualidade: { ativo: boolean; qtd: number } | null;
  foto_url: string | null;
};

function Page() {
  const { pedidoId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: pedidos = [], isLoading: loadingPedidos } = usePedidosDia();
  const pendentes = pedidos.filter((p) => p.status === "pendente");

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
                <div className="text-base font-bold text-navy">{p.fornecedores?.nome ?? p.codigo}</div>
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
      quantidade_pedida: number;
      produtos: { nome: string; unidade: string } | null;
      itens_pedido_rateio: { quantidade: number; destinatarios: { nome: string } | null }[];
    } | null;
  }
): LinhaItem {
  const ip = ic.itens_pedido;
  return {
    id: ic.id,
    produto: ip?.produtos?.nome ?? "—",
    unid: ip?.produtos?.unidade ?? "un",
    pedido: Number(ip?.quantidade_pedida ?? 0),
    rateio: (ip?.itens_pedido_rateio ?? []).map((r) => [
      r.destinatarios?.nome ?? "?",
      Number(r.quantidade),
    ]),
    recebido: Number(ic.quantidade_recebida),
    conferido: ic.conferido,
    qualidade: ic.tem_problema_qualidade
      ? { ativo: true, qtd: Number(ic.quantidade_qualidade) || 1 }
      : null,
    foto_url: ic.foto_url,
  };
}

function buildSavePayload(it: LinhaItem) {
  const div = it.recebido - it.pedido;
  let divergencia: string | null = null;
  if (it.conferido) {
    if (it.qualidade?.ativo) divergencia = "qualidade";
    else if (div < 0) divergencia = "falta";
    else if (div > 0) divergencia = "sobra";
  }
  return {
    id: it.id,
    quantidade_recebida: it.recebido,
    conferido: it.conferido,
    divergencia,
    quantidade_divergencia: Math.abs(div),
    tem_problema_qualidade: !!it.qualidade?.ativo,
    quantidade_qualidade: it.qualidade?.qtd ?? 0,
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

  const startedRef = useRef<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [fotoItemId, setFotoItemId] = useState<string | null>(null);
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [avulsoProduto, setAvulsoProduto] = useState("");
  const [avulsoQtd, setAvulsoQtd] = useState(1);

  const [itens, setItens] = useState<LinhaItem[]>([]);

  const pendentes = pedidos.filter((p) => p.status === "pendente");
  const fornecedorNome = pedido?.fornecedores?.nome ?? pedidos.find((p) => p.id === pedidoId)?.fornecedores?.nome ?? "—";
  const codigo = pedido?.codigo ?? pedidos.find((p) => p.id === pedidoId)?.codigo ?? "";
  const horaChegada = pedido?.hora_chegada ?? pedidos.find((p) => p.id === pedidoId)?.hora_chegada;
  const conferenteNome = profile?.nome ?? "—";

  useEffect(() => {
    if (!pedidoId || !user?.id) return;
    if (startedRef.current === pedidoId) return;
    startedRef.current = pedidoId;
    startMut.mutate(
      { pedidoId, conferenteId: user.id, user },
      { onError: (e) => toast.error(e.message) }
    );
  }, [pedidoId, user]);

  useEffect(() => {
    if (!conferencia?.itens_conferencia) return;
    setItens(conferencia.itens_conferencia.map(mapToLinha));
  }, [conferencia]);

  const update = (idx: number, v: number) => {
    setItens((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, recebido: Math.max(0, v), conferido: true } : it
      )
    );
  };

  const conferirIgualPedido = (idx: number) => {
    setItens((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, recebido: it.pedido, conferido: true } : it))
    );
  };

  const toggleQualidade = (idx: number) => {
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

  const rateioResumo = useMemo(() => {
    const map: Record<string, { ped: number; rec: number }> = {};
    itens.forEach((it) => {
      const fator = it.pedido > 0 ? it.recebido / it.pedido : 0;
      it.rateio.forEach(([d, q]) => {
        if (!map[d]) map[d] = { ped: 0, rec: 0 };
        map[d].ped += Number(q);
        map[d].rec += Number(q) * fator;
      });
    });
    return map;
  }, [itens]);

  const salvar = async (status: "parcial" | "finalizada") => {
    if (!conferencia?.id) {
      toast.error("Conferência ainda não iniciada");
      return;
    }
    try {
      await saveMut.mutateAsync({
        conferenciaId: conferencia.id,
        pedidoId,
        status,
        itens: itens.map(buildSavePayload),
      });
      toast.success(
        status === "finalizada" ? "Conferência finalizada" : "Parcial salva",
        {
          description:
            status === "finalizada"
              ? `${stats.conferidos} itens · ${stats.divergencias} divergências enviadas ao Relatório de Faltas.`
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
    if (stats.faltantes > 0) {
      toast.warning("Alguns itens ainda estão pendentes", {
        description: `${stats.faltantes} item(ns) sem conferência. Finalize mesmo assim?`,
        action: {
          label: "Finalizar mesmo assim",
          onClick: () => salvar("finalizada"),
        },
      });
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
        subtitle={`Pedido ${codigo} · Chegou às ${formatTime(horaChegada)} · Conferente: ${conferenteNome}`}
        actions={
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Trocar pedido
          </button>
        }
      />

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
            {p.fornecedores?.nome ?? p.codigo}
          </button>
        ))}
      </div>

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
          Recebido × pedido por destinatário
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(rateioResumo).map(([d, q]) => {
            const rec = Math.round(q.rec);
            const ok = rec === q.ped;
            return (
              <span
                key={d}
                className={`chip ${ok ? "chip-teal" : rec < q.ped ? "chip-danger" : "chip-info"} text-sm`}
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
              <th className="text-right px-4 py-3">Pedida</th>
              <th className="text-left px-4 py-3">Rateio</th>
              <th className="text-center px-4 py-3">Recebida</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {itens.map((it, idx) => {
              const div = it.recebido - it.pedido;
              const pendente = !it.conferido;
              return (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-navy">{it.produto}</td>
                  <td className="px-4 py-3 text-muted-foreground">{it.unid}</td>
                  <td className="px-4 py-3 text-right text-ink">{it.pedido}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {it.rateio.map(([d, q]) => (
                        <span key={d} className="chip chip-muted">
                          {d}·{q}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <NumberStepper value={it.recebido} onChange={(v) => update(idx, v)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {pendente && <span className="chip chip-muted">Pendente</span>}
                      {!pendente && div === 0 && <span className="chip chip-ok">OK</span>}
                      {!pendente && div < 0 && (
                        <span className="chip chip-danger">Falta {Math.abs(div)}</span>
                      )}
                      {!pendente && div > 0 && <span className="chip chip-info">Sobra {div}</span>}
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
                      {pendente && (
                        <button
                          type="button"
                          onClick={() => conferirIgualPedido(idx)}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-primary-soft text-primary-dark text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
                          title="Marcar conferido com a quantidade pedida"
                        >
                          <Check size={12} /> Conferir
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleQualidade(idx)}
                        className={`h-7 w-7 rounded-md border flex items-center justify-center transition-colors ${
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
                        className="h-7 w-7 rounded-md border border-border text-muted-foreground hover:text-navy hover:bg-secondary flex items-center justify-center"
                        title="Adicionar foto"
                        onClick={() => {
                          setFotoItemId(it.id);
                          fotoRef.current?.click();
                        }}
                      >
                        <Camera size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setAvulsoOpen(true)}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
        >
          <Plus size={14} /> Item avulso
        </button>
        <button
          type="button"
          onClick={() => salvar("parcial")}
          disabled={saveMut.isPending}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary disabled:opacity-50"
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
          className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary-dark active:scale-[0.99] transition disabled:opacity-50"
        >
          <CheckCircle2 size={16} /> Finalizar conferência
        </button>
      </div>

      <Dialog open={avulsoOpen} onOpenChange={setAvulsoOpen}>
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
