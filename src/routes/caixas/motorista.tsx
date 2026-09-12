import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Truck,
  MapPin,
  Package,
  ArrowRight,
  ArrowLeft,
  Plus,
  Minus,
  Check,
  ChevronDown,
  ChevronUp,
  Building2,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import {
  useParadasMotoristaDia,
  useSaldoRetiradaCliente,
  useRegistrarMovimentoMotorista,
  useFornecedoresAtivos,
  useMovimentosParada,
  type ParadaMotorista,
} from "@/hooks/use-motorista-caixas";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useMotoristas } from "@/hooks/use-cadastros";
import { useAuth } from "@/lib/auth";
import { formatTime } from "@/lib/utils-date";
import { tipoColor } from "@/lib/caixas-map";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/caixas/motorista")({
  component: Page,
  head: () => ({ meta: [{ title: "Movimentação de Caixas · Motorista" }] }),
});

type MovimentoForm = {
  tipo_caixa: string;
  quantidade: number;
  natureza: "enviada" | "retirada";
  destino_fornecedor_id?: string | null;
};

function Page() {
  const { user, profile, isAdmin } = useAuth();
  const { data: motoristas = [] } = useMotoristas();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: fornecedores = [] } = useFornecedoresAtivos();
  const registrar = useRegistrarMovimentoMotorista();

  const [motoristaId, setMotoristaId] = useState<string>(
    (profile as { motorista_id?: string } | null)?.motorista_id ?? "",
  );
  const [paradaAberta, setParadaAberta] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogParada, setDialogParada] = useState<ParadaMotorista | null>(null);
  const [dialogMode, setDialogMode] = useState<"enviada" | "retirada">("enviada");
  const [formValues, setFormValues] = useState<Record<string, number>>({});
  const [destinoTipo, setDestinoTipo] = useState<"galpao" | "fornecedor">("galpao");
  const [destinoFornecedorId, setDestinoFornecedorId] = useState<string>("");

  const { data: paradas = [], isLoading } = useParadasMotoristaDia(motoristaId || undefined);
  const { data: saldoCliente = [] } = useSaldoRetiradaCliente(dialogParada?.cliente_id ?? null);
  const { data: movimentosParada = [] } = useMovimentosParada(paradaAberta);

  const saldoPorTipo = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of saldoCliente) {
      map[s.tipo_caixa] = s.saldo_disponivel;
    }
    return map;
  }, [saldoCliente]);

  const stats = useMemo(() => {
    let totalParadas = paradas.length;
    let paradasConcluidas = paradas.filter((p) => p.carga_status === "concluida").length;
    let totalEnviadas = 0;
    let totalRetiradas = 0;
    for (const p of paradas) {
      totalEnviadas += Object.values(p.caixas_enviadas || {}).reduce(
        (a, n) => a + Number(n || 0),
        0,
      );
      totalRetiradas += Object.values(p.caixas_retiradas || {}).reduce(
        (a, n) => a + Number(n || 0),
        0,
      );
    }
    return { totalParadas, paradasConcluidas, totalEnviadas, totalRetiradas };
  }, [paradas]);

  const openEnviadas = (parada: ParadaMotorista) => {
    setDialogParada(parada);
    setDialogMode("enviada");
    const initial: Record<string, number> = {};
    for (const t of tipos) {
      const sugerido = Number(parada.caixas_sugeridas?.[t.sigla] || 0);
      const jaEnviado = Number(parada.caixas_enviadas?.[t.sigla] || 0);
      initial[t.sigla] = Math.max(0, sugerido - jaEnviado);
    }
    setFormValues(initial);
    setDialogOpen(true);
  };

  const openRetiradas = (parada: ParadaMotorista) => {
    setDialogParada(parada);
    setDialogMode("retirada");
    const initial: Record<string, number> = {};
    for (const t of tipos) {
      initial[t.sigla] = 0;
    }
    setFormValues(initial);
    setDestinoTipo("galpao");
    setDestinoFornecedorId("");
    setDialogOpen(true);
  };

  const handleConfirm = async () => {
    if (!dialogParada) return;
    const movimentos: MovimentoForm[] = [];
    for (const t of tipos) {
      const qty = formValues[t.sigla] || 0;
      if (qty > 0) {
        movimentos.push({
          tipo_caixa: t.sigla,
          quantidade: qty,
          natureza: dialogMode,
          destino_fornecedor_id:
            dialogMode === "retirada" && destinoTipo === "fornecedor"
              ? destinoFornecedorId || null
              : null,
        });
      }
    }

    if (movimentos.length === 0) {
      toast.error("Informe ao menos uma caixa");
      return;
    }

    if (dialogMode === "retirada" && destinoTipo === "fornecedor" && !destinoFornecedorId) {
      toast.error("Selecione o fornecedor de destino");
      return;
    }

    for (const mov of movimentos) {
      if (dialogMode === "retirada" && mov.quantidade > (saldoPorTipo[mov.tipo_caixa] || 0)) {
        toast.error(
          `Retirada de ${mov.tipo_caixa} maior que saldo disponível (${saldoPorTipo[mov.tipo_caixa] || 0})`,
        );
        return;
      }
    }

    try {
      for (const mov of movimentos) {
        await registrar.mutateAsync({
          carga_id: dialogParada.carga_id,
          tipo_caixa: mov.tipo_caixa,
          quantidade: mov.quantidade,
          natureza: mov.natureza,
          destino_fornecedor_id: mov.destino_fornecedor_id,
        });
      }
      toast.success(
        dialogMode === "enviada"
          ? `Enviadas registradas para ${dialogParada.cliente}`
          : `Retiradas registradas de ${dialogParada.cliente}`,
      );
      setDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar movimento");
    }
  };

  const increment = (sigla: string) => {
    setFormValues((prev) => ({ ...prev, [sigla]: (prev[sigla] || 0) + 1 }));
  };

  const decrement = (sigla: string) => {
    setFormValues((prev) => ({
      ...prev,
      [sigla]: Math.max(0, (prev[sigla] || 0) - 1),
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">Carregando paradas...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Movimentação de Caixas"
        subtitle="Registre enviadas e retiradas por parada"
      />

      {(isAdmin || !(profile as { motorista_id?: string } | null)?.motorista_id) && (
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Motorista
          </label>
          <Select value={motoristaId} onValueChange={setMotoristaId}>
            <SelectTrigger className="mt-1 w-full max-w-xs">
              <SelectValue placeholder="Todos os motoristas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos os motoristas</SelectItem>
              {motoristas.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <StatStrip
        items={[
          { label: "Paradas hoje", value: String(stats.totalParadas) },
          {
            label: "Concluídas",
            value: String(stats.paradasConcluidas),
            tone: "ok",
          },
          {
            label: "Caixas enviadas",
            value: String(stats.totalEnviadas),
            tone: "info",
          },
          {
            label: "Caixas retiradas",
            value: String(stats.totalRetiradas),
          },
        ]}
      />

      {paradas.length === 0 ? (
        <div className="card-base p-8 text-center">
          <Truck size={48} className="mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-bold text-navy mb-2">Nenhuma parada hoje</h3>
          <p className="text-sm text-muted-foreground">
            {motoristaId
              ? "Este motorista não tem cargas programadas para hoje."
              : "Nenhuma carga programada para hoje. Crie cargas na expedição ou selecione um motorista."}
          </p>
        </div>
      ) : (
        <div className="space-y-4 mt-4">
          {paradas.map((parada) => {
            const isOpen = paradaAberta === parada.carga_id;
            const totalSugerido = Object.values(parada.caixas_sugeridas || {}).reduce(
              (a, n) => a + Number(n || 0),
              0,
            );
            const totalEnviado = Object.values(parada.caixas_enviadas || {}).reduce(
              (a, n) => a + Number(n || 0),
              0,
            );
            const totalRetirado = Object.values(parada.caixas_retiradas || {}).reduce(
              (a, n) => a + Number(n || 0),
              0,
            );
            const progresso =
              totalSugerido > 0
                ? Math.min(100, Math.round((totalEnviado / totalSugerido) * 100))
                : totalEnviado > 0
                  ? 100
                  : 0;

            return (
              <div key={parada.carga_id} className="card-base overflow-hidden">
                <button
                  type="button"
                  onClick={() => setParadaAberta(isOpen ? null : parada.carga_id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ background: "var(--primary-soft)" }}
                    >
                      <MapPin size={20} className="text-primary-dark" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-navy">{parada.cliente}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{parada.carga_codigo}</span>
                        {parada.rota && <span>· Rota: {parada.rota}</span>}
                        {parada.hora_inicio && <span>· {formatTime(parada.hora_inicio)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Enviadas</div>
                      <div className="font-bold text-navy">
                        {totalEnviado}/{totalSugerido}
                      </div>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                      {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border">
                    <div className="p-4 bg-secondary/20">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-navy flex items-center gap-2">
                          <Package size={14} /> Caixas por tipo
                        </h4>
                        <span
                          className="text-xs font-semibold px-2 py-1 rounded-full"
                          style={{
                            background:
                              parada.carga_status === "concluida"
                                ? "var(--success-soft)"
                                : parada.carga_status === "carregando"
                                  ? "var(--info-soft)"
                                  : "var(--warning-soft)",
                            color:
                              parada.carga_status === "concluida"
                                ? "var(--success)"
                                : parada.carga_status === "carregando"
                                  ? "var(--info)"
                                  : "var(--warning)",
                          }}
                        >
                          {parada.carga_status === "concluida"
                            ? "Concluída"
                            : parada.carga_status === "carregando"
                              ? "Em carregamento"
                              : "Aguardando"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {tipos.map((t, i) => {
                          const sug = Number(parada.caixas_sugeridas?.[t.sigla] || 0);
                          const env = Number(parada.caixas_enviadas?.[t.sigla] || 0);
                          const ret = Number(parada.caixas_retiradas?.[t.sigla] || 0);
                          return (
                            <div
                              key={t.id}
                              className="rounded-lg p-3"
                              style={{ background: "var(--card)" }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span
                                  className="h-3 w-3 rounded"
                                  style={{ background: tipoColor(i) }}
                                />
                                <span className="text-xs font-bold text-navy">{t.nome}</span>
                              </div>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <div className="flex justify-between">
                                  <span>Sugerido:</span>
                                  <span className="font-semibold">{sug}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Enviadas:</span>
                                  <span className="font-semibold text-info">{env}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Retiradas:</span>
                                  <span className="font-semibold">{ret}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4">
                        <Button
                          onClick={() => openEnviadas(parada)}
                          className="flex-1 gap-2"
                          variant="default"
                        >
                          <ArrowRight size={16} /> Registrar Enviadas
                        </Button>
                        <Button
                          onClick={() => openRetiradas(parada)}
                          className="flex-1 gap-2"
                          variant="outline"
                        >
                          <ArrowLeft size={16} /> Registrar Retiradas
                        </Button>
                      </div>

                      {movimentosParada.length > 0 && (
                        <div className="mt-4">
                          <h5 className="text-xs font-bold text-muted-foreground uppercase mb-2">
                            Últimos movimentos
                          </h5>
                          <div className="space-y-1">
                            {movimentosParada.slice(0, 5).map((mov) => (
                              <div
                                key={mov.id}
                                className="text-xs flex items-center justify-between py-1 border-b border-border"
                              >
                                <span>
                                  {mov.natureza === "envio" || mov.natureza === "enviada"
                                    ? "Enviada"
                                    : "Retirada"}{" "}
                                  · {mov.tipo_caixa}
                                </span>
                                <span className="font-bold">{mov.quantidade} cx</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="px-4 pb-2">
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${progresso}%`,
                        background: "var(--primary)",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "enviada"
                ? `Enviadas para ${dialogParada?.cliente}`
                : `Retiradas de ${dialogParada?.cliente}`}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {dialogMode === "enviada" && (
              <p className="text-sm text-muted-foreground">
                Quantidade sugerida pelo pedido. Confirme ou edite antes de registrar.
              </p>
            )}

            {dialogMode === "retirada" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Destino
                  </label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setDestinoTipo("galpao")}
                      className={`flex-1 h-10 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition ${
                        destinoTipo === "galpao"
                          ? "bg-primary text-white"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      <Warehouse size={16} /> Galpão
                    </button>
                    <button
                      type="button"
                      onClick={() => setDestinoTipo("fornecedor")}
                      className={`flex-1 h-10 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold transition ${
                        destinoTipo === "fornecedor"
                          ? "bg-primary text-white"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      }`}
                    >
                      <Building2 size={16} /> Fornecedor
                    </button>
                  </div>
                </div>

                {destinoTipo === "fornecedor" && (
                  <Select value={destinoFornecedorId} onValueChange={setDestinoFornecedorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {fornecedores.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <p className="text-xs text-muted-foreground">
                  Informe a quantidade de caixas retiradas deste cliente.
                </p>
              </>
            )}

            <div className="space-y-3">
              {tipos.map((t, i) => {
                const saldo = saldoPorTipo[t.sigla] || 0;
                const value = formValues[t.sigla] || 0;
                const sugerido =
                  dialogMode === "enviada"
                    ? Number(dialogParada?.caixas_sugeridas?.[t.sigla] || 0) -
                      Number(dialogParada?.caixas_enviadas?.[t.sigla] || 0)
                    : 0;

                return (
                  <div
                    key={t.id}
                    className="rounded-xl p-4"
                    style={{ background: "var(--secondary)" }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded" style={{ background: tipoColor(i) }} />
                        <span className="font-bold text-navy">{t.nome}</span>
                      </div>
                      {dialogMode === "enviada" && sugerido > 0 && (
                        <span className="text-xs text-muted-foreground">Sugerido: {sugerido}</span>
                      )}
                      {dialogMode === "retirada" && (
                        <span className="text-xs text-muted-foreground">Saldo: {saldo}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => decrement(t.sigla)}
                        disabled={value <= 0}
                        className="h-12 w-12 rounded-xl bg-card flex items-center justify-center disabled:opacity-40"
                      >
                        <Minus size={18} />
                      </button>
                      <span className="text-4xl font-bold tabular-nums text-navy">{value}</span>
                      <button
                        type="button"
                        onClick={() => increment(t.sigla)}
                        disabled={dialogMode === "retirada" && value >= saldo}
                        className="h-12 w-12 rounded-xl flex items-center justify-center disabled:opacity-40"
                        style={{ background: "var(--primary)", color: "white" }}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={registrar.isPending} className="gap-2">
              <Check size={16} />{" "}
              {dialogMode === "enviada" ? "Confirmar Enviadas" : "Confirmar Retiradas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
