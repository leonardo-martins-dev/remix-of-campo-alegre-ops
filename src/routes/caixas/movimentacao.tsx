import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Store,
  Building2,
  Warehouse,
  Search,
  Check,
  WifiOff,
  Minus,
  Plus,
  ChevronLeft,
  Trophy,
  Truck,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { TableWrapper } from "@/components/table-wrapper";
import { StatStrip } from "@/components/stat-strip";
import { Donut } from "@/components/charts";
import { BarRow } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useMotoristas } from "@/hooks/use-cadastros";
import { useRetornoRanking, useRetornosDia } from "@/hooks/use-caixas";
import {
  useEntidadesMovimentacao,
  useSaldoPosicao,
  useRegistrarMovimentacao,
  ensurePosicao,
  destinosPermitidos,
  TIPO_LABEL,
  type PosicaoTipo,
  type Entidade,
} from "@/hooks/use-movimentacao";
import { emptyCaixas, sumCaixas, tipoColor, fromLegacyColumns } from "@/lib/caixas-map";
import { formatTime, todayBRT } from "@/lib/utils-date";
import { getMovQueue, enqueueMov, removeMovFromQueue } from "@/lib/offline-queue";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/caixas/movimentacao")({
  component: Page,
  head: () => ({ meta: [{ title: "Movimentação de Caixas · Campo Alegre" }] }),
});

/* ── Page shell ─────────────────────────────────────────────── */

function Page() {
  const { profile, isAdmin } = useAuth();
  const isMotorista = !!(profile as { motorista_id?: string } | null)?.motorista_id;
  const [view, setView] = useState<"campo" | "painel">("campo");

  return (
    <div>
      <PageHeader
        title="Movimentação de Caixas"
        subtitle="Registre movimentos entre lojas, fornecedores e packing"
        actions={
          isAdmin && !isMotorista ? (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setView("campo")}
                className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "campo" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
              >
                Movimentar
              </button>
              <button
                type="button"
                onClick={() => setView("painel")}
                className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "painel" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
              >
                Painel / Ranking
              </button>
            </div>
          ) : undefined
        }
      />
      {view === "campo" ? <MovimentacaoWizard /> : <RankingPanel />}
    </div>
  );
}

/* ── Icon map for tipo ──────────────────────────────────────── */

const TIPO_ICON: Record<PosicaoTipo, typeof Store> = {
  cliente: Store,
  fornecedor: Building2,
  galpao: Warehouse,
  motorista: Truck,
};

/* ── Wizard ─────────────────────────────────────────────────── */

function MovimentacaoWizard() {
  const { user, profile, isAdmin } = useAuth();
  const { data: tipos = [] } = useTiposCaixa();
  const { data: motoristas = [] } = useMotoristas();
  const { data: entidades, isLoading: loadingEntidades, isError: errorEntidades } =
    useEntidadesMovimentacao();
  const registrar = useRegistrarMovimentacao();

  const [step, setStep] = useState(1);
  const [origemTipo, setOrigemTipo] = useState<PosicaoTipo | null>(null);
  const [origem, setOrigem] = useState<Entidade | null>(null);
  const [destinoTipo, setDestinoTipo] = useState<PosicaoTipo | null>(null);
  const [destino, setDestino] = useState<Entidade | null>(null);
  const [caixas, setCaixas] = useState<Record<string, number>>({});
  const [motoristaId, setMotoristaId] = useState<string>(
    (profile as { motorista_id?: string } | null)?.motorista_id ?? "",
  );
  const [veiculoFornecedor, setVeiculoFornecedor] = useState(false);
  const [obs, setObs] = useState("");
  const [busca, setBusca] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);

  const { data: saldoOrigem = {} } = useSaldoPosicao(origem?.posicao_id ?? null);

  /* online/offline */
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  /* flush offline queue */
  useEffect(() => {
    if (!navigator.onLine || !user) return;
    const queue = getMovQueue();
    queue.forEach(async (item) => {
      try {
        const oriPosId =
          item.origem.posicao_id ??
          (await ensurePosicao(item.origem.tipo as PosicaoTipo, item.origem.ref_id));
        const dstPosId =
          item.destino.posicao_id ??
          (await ensurePosicao(item.destino.tipo as PosicaoTipo, item.destino.ref_id));

        const natureza =
          item.origem.tipo === "cliente" && item.destino.tipo === "galpao"
            ? "retorno"
            : item.origem.tipo === "galpao" && item.destino.tipo === "fornecedor"
              ? "entrega_vazias"
              : item.origem.tipo === "fornecedor" && item.destino.tipo === "galpao"
                ? "recebimento_cheias"
                : "transferencia";

        const hasForn = item.origem.tipo === "fornecedor" || item.destino.tipo === "fornecedor";

        const rows = Object.entries(item.caixas)
          .filter(([, q]) => q > 0)
          .map(([tipo_caixa, quantidade]) => ({
            origem_posicao_id: oriPosId,
            destino_posicao_id: dstPosId,
            tipo_caixa,
            quantidade,
            tipo: natureza,
            natureza,
            registrado_por: item.registrado_por,
            observacoes: item.observacoes ?? null,
            data_movimento: todayBRT(),
            documento_tipo: "avulso" as const,
            confirmacao_status: hasForn ? ("pendente" as const) : ("nao_aplicavel" as const),
            fornecedor_id:
              item.origem.tipo === "fornecedor"
                ? item.origem.ref_id
                : item.destino.tipo === "fornecedor"
                  ? item.destino.ref_id
                  : null,
            cliente_id:
              item.origem.tipo === "cliente"
                ? item.origem.ref_id
                : item.destino.tipo === "cliente"
                  ? item.destino.ref_id
                  : null,
          }));

        if (rows.length) {
          await supabase.from("movimentacoes_caixa").insert(rows);
        }
        removeMovFromQueue(item.id);
      } catch {
        /* retry on next online event */
      }
    });
  }, [offline, user]);

  const offlineCount = useMemo(() => getMovQueue().length, [offline]);
  const totalCaixas = sumCaixas(caixas);

  /* entity helpers */
  const entidadesFor = (tipo: PosicaoTipo): Entidade[] => {
    if (!entidades) return [];
    if (tipo === "cliente") return entidades.clientes;
    if (tipo === "fornecedor") return entidades.fornecedores;
    return entidades.galpao;
  };

  const clientesHojeIds = entidades?.clientesHojeIds ?? new Set<string>();

  /* search filter */
  const filteredList = useMemo(() => {
    const tipo = step === 1 ? origemTipo : destinoTipo;
    if (!tipo) return [];
    const list = entidadesFor(tipo);
    if (!busca.trim()) return list;
    const q = busca.toLowerCase();
    return list.filter((e) => e.nome.toLowerCase().includes(q));
  }, [step, origemTipo, destinoTipo, entidades, busca]);

  /* actions */
  const pickOrigemTipo = (tipo: PosicaoTipo) => {
    setOrigemTipo(tipo);
    setBusca("");
    if (tipo === "galpao" && entidades?.galpao[0]) {
      pickOrigem(entidades.galpao[0]);
    }
  };

  const pickOrigem = (ent: Entidade) => {
    setOrigem(ent);
    setDestino(null);
    setDestinoTipo(null);
    setBusca("");
    setCaixas(emptyCaixas(tipos));

    const dests = destinosPermitidos(ent.tipo);
    if (dests.length === 1) {
      setDestinoTipo(dests[0]);
      if (dests[0] === "galpao" && entidades?.galpao[0]) {
        setDestino(entidades.galpao[0]);
        setStep(3);
        return;
      }
    }
    setStep(2);
  };

  const pickDestinoTipo = (tipo: PosicaoTipo) => {
    setDestinoTipo(tipo);
    setBusca("");
    if (tipo === "galpao" && entidades?.galpao[0]) {
      pickDestino(entidades.galpao[0]);
    }
  };

  const pickDestino = (ent: Entidade) => {
    setDestino(ent);
    setStep(3);
  };

  const goBack = () => {
    if (step === 4) {
      setStep(3);
    } else if (step === 3) {
      setDestino(null);
      setDestinoTipo(null);
      setBusca("");
      const dests = origem ? destinosPermitidos(origem.tipo) : [];
      if (dests.length <= 1) {
        setOrigem(null);
        setOrigemTipo(null);
        setStep(1);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      if (destinoTipo) {
        setDestinoTipo(null);
        setDestino(null);
        setBusca("");
      } else {
        setOrigem(null);
        setOrigemTipo(null);
        setBusca("");
        setStep(1);
      }
    } else if (step === 1 && origemTipo) {
      setOrigemTipo(null);
      setOrigem(null);
      setBusca("");
    }
  };

  const resetWizard = () => {
    setStep(1);
    setOrigemTipo(null);
    setOrigem(null);
    setDestinoTipo(null);
    setDestino(null);
    setCaixas(emptyCaixas(tipos));
    setVeiculoFornecedor(false);
    setObs("");
    setBusca("");
  };

  const inc = (sigla: string) =>
    setCaixas((p) => ({ ...p, [sigla]: (p[sigla] ?? 0) + 1 }));

  const dec = (sigla: string) =>
    setCaixas((p) => ({ ...p, [sigla]: Math.max(0, (p[sigla] ?? 0) - 1) }));

  const setQty = (sigla: string, val: number) =>
    setCaixas((p) => ({ ...p, [sigla]: Math.max(0, val) }));

  async function confirmar() {
    if (!user || !origem || !destino) return;
    if (totalCaixas === 0) {
      toast.error("Informe ao menos uma caixa");
      return;
    }

    if (!navigator.onLine) {
      enqueueMov({
        origem: {
          tipo: origem.tipo,
          ref_id: origem.tipo === "galpao" ? null : origem.id,
          posicao_id: origem.posicao_id,
          nome: origem.nome,
        },
        destino: {
          tipo: destino.tipo,
          ref_id: destino.tipo === "galpao" ? null : destino.id,
          posicao_id: destino.posicao_id,
          nome: destino.nome,
        },
        caixas,
        motorista_id: veiculoFornecedor ? null : motoristaId || null,
        registrado_por: user.id,
        observacoes: obs || undefined,
        veiculo_fornecedor: veiculoFornecedor,
      });
      toast.success("Movimentação salva offline", {
        description: "Sincroniza ao recuperar sinal.",
      });
      resetWizard();
      return;
    }

    registrar.mutate(
      {
        origem,
        destino,
        caixas,
        motorista_id: veiculoFornecedor ? null : motoristaId || null,
        registrado_por: user.id,
        observacoes: obs || undefined,
        veiculo_fornecedor: veiculoFornecedor,
      },
      {
        onSuccess: () => {
          toast.success("Movimentação registrada");
          resetWizard();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  /* step labels */
  const hasFornecedor = origemTipo === "fornecedor" || destinoTipo === "fornecedor";
  const canGoBack = step > 1 || !!origemTipo;
  const saldoApos = useMemo(() => {
    const r: Record<string, number> = {};
    for (const t of tipos) {
      r[t.sigla] = (saldoOrigem[t.sigla] ?? 0) - (caixas[t.sigla] ?? 0);
    }
    return r;
  }, [saldoOrigem, caixas, tipos]);

  const warnings = tipos.filter(
    (t) => (caixas[t.sigla] ?? 0) > 0 && (caixas[t.sigla] ?? 0) > (saldoOrigem[t.sigla] ?? 0),
  );

  /* ─── render ─── */
  return (
    <div className="w-full max-w-lg space-y-4 sm:max-w-2xl">
      {/* step indicator */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {["Origem", "Destino", "Qtd", "Confirmar"].map((label, i) => (
          <span key={label} className="flex items-center gap-1">
            {i > 0 && <span className="mx-0.5">›</span>}
            <span
              className={
                step > i + 1
                  ? "text-primary"
                  : step === i + 1
                    ? "text-primary font-bold"
                    : ""
              }
            >
              {label}
            </span>
          </span>
        ))}
      </div>

      {/* offline badge */}
      {(offline || offlineCount > 0) && (
        <div className="rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs px-3 py-2 flex items-center gap-2">
          <WifiOff size={14} />
          {offline ? "Modo offline" : ""}
          {offlineCount > 0 && ` · ${offlineCount} na fila`}
        </div>
      )}

      {/* back button */}
      {canGoBack && (
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
        >
          <ChevronLeft size={16} /> Voltar
        </button>
      )}

      {/* ── STEP 1: Origem ─────────────────────────────────── */}
      {step === 1 && !origemTipo && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-navy">De onde saem as caixas?</h2>
          <div className="grid grid-cols-3 gap-3">
            {(["cliente", "fornecedor", "galpao"] as PosicaoTipo[]).map((tipo) => {
              const Icon = TIPO_ICON[tipo];
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => pickOrigemTipo(tipo)}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 border-border bg-card p-5 hover:border-primary transition-colors"
                >
                  <Icon size={32} className="text-primary" />
                  <span className="text-sm font-bold text-navy">{TIPO_LABEL[tipo]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 1 && origemTipo && origemTipo !== "galpao" && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-navy">
            Selecione a {TIPO_LABEL[origemTipo].toLowerCase()}
          </h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-card">
            {loadingEntidades && (
              <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
            )}
            {errorEntidades && (
              <p className="p-4 text-sm text-danger">Não foi possível carregar a lista.</p>
            )}
            {!loadingEntidades && !errorEntidades && filteredList.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {busca.trim()
                  ? "Nenhum resultado para a busca."
                  : `Nenhuma ${TIPO_LABEL[origemTipo].toLowerCase()} ativa cadastrada.`}
              </p>
            )}
            {filteredList.map((ent) => (
              <button
                key={ent.id}
                type="button"
                onClick={() => pickOrigem(ent)}
                className="w-full text-left px-4 py-3 hover:bg-secondary/50 flex items-center justify-between border-b border-border last:border-0"
              >
                <span className="font-semibold text-navy">{ent.nome}</span>
                {ent.tipo === "cliente" && clientesHojeIds.has(ent.id) && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
                    rota hoje
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: Destino ────────────────────────────────── */}
      {step === 2 && origem && !destinoTipo && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Origem: <span className="font-semibold text-navy">{origem.nome}</span> ({TIPO_LABEL[origem.tipo]})
          </div>
          <h2 className="text-lg font-bold text-navy">Para onde vão as caixas?</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {destinosPermitidos(origem.tipo).map((tipo) => {
              const Icon = TIPO_ICON[tipo];
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => pickDestinoTipo(tipo)}
                  className="flex flex-col items-center gap-2 rounded-2xl border-2 border-border bg-card p-5 hover:border-primary transition-colors"
                >
                  <Icon size={28} className="text-primary" />
                  <span className="text-sm font-bold text-navy">{TIPO_LABEL[tipo]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && origem && destinoTipo && destinoTipo !== "galpao" && !destino && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Origem: <span className="font-semibold text-navy">{origem.nome}</span> → {TIPO_LABEL[destinoTipo]}
          </div>
          <h2 className="text-lg font-bold text-navy">
            Selecione o {TIPO_LABEL[destinoTipo].toLowerCase()}
          </h2>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto rounded-xl border border-border bg-card">
            {loadingEntidades && (
              <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
            )}
            {errorEntidades && (
              <p className="p-4 text-sm text-danger">Não foi possível carregar a lista.</p>
            )}
            {!loadingEntidades && !errorEntidades && filteredList.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                {busca.trim()
                  ? "Nenhum resultado para a busca."
                  : `Nenhum ${TIPO_LABEL[destinoTipo].toLowerCase()} ativo cadastrado.`}
              </p>
            )}
            {filteredList.map((ent) => (
              <button
                key={ent.id}
                type="button"
                onClick={() => pickDestino(ent)}
                className="w-full text-left px-4 py-3 hover:bg-secondary/50 flex items-center justify-between border-b border-border last:border-0"
              >
                <span className="font-semibold text-navy">{ent.nome}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 3: Quantidades ────────────────────────────── */}
      {step === 3 && origem && destino && (
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-navy">{origem.nome}</span>
            {" → "}
            <span className="font-semibold text-navy">{destino.nome}</span>
          </div>
          <h2 className="text-lg font-bold text-navy">Quantas caixas?</h2>

          <div className="space-y-3">
            {tipos.map((t, i) => {
              const saldo = saldoOrigem[t.sigla] ?? 0;
              const qty = caixas[t.sigla] ?? 0;
              const after = saldo - qty;
              const overSaldo = qty > 0 && qty > saldo;

              return (
                <div
                  key={t.id}
                  className="rounded-xl p-4 border border-border bg-card"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded"
                        style={{ background: tipoColor(i) }}
                      />
                      <span className="font-bold text-navy">{t.nome}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {saldo}
                      <span className="mx-1">→</span>
                      <span className={after < 0 ? "text-red-500 font-bold" : ""}>
                        {after}
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => dec(t.sigla)}
                      disabled={qty <= 0}
                      className="h-12 w-12 rounded-xl bg-secondary flex items-center justify-center disabled:opacity-40"
                    >
                      <Minus size={18} />
                    </button>

                    <input
                      type="number"
                      inputMode="numeric"
                      value={qty}
                      onChange={(e) =>
                        setQty(t.sigla, parseInt(e.target.value) || 0)
                      }
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-20 text-center text-4xl font-bold text-navy bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => inc(t.sigla)}
                      className="h-12 w-12 rounded-xl flex items-center justify-center"
                      style={{ background: "var(--primary)", color: "white" }}
                    >
                      <Plus size={18} />
                    </button>
                  </div>

                  {overSaldo && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle size={12} /> Acima do saldo ({saldo})
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Button
            className="w-full min-h-11 gap-2"
            disabled={totalCaixas === 0}
            onClick={() => setStep(4)}
          >
            Avançar · {totalCaixas} cx
          </Button>
        </div>
      )}

      {/* ── STEP 4: Confirmar ──────────────────────────────── */}
      {step === 4 && origem && destino && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Confirmar movimentação</h2>

          {/* summary */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">De:</span>
              <span className="font-semibold text-navy">
                {origem.nome}{" "}
                <span className="text-xs text-muted-foreground">({TIPO_LABEL[origem.tipo]})</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Para:</span>
              <span className="font-semibold text-navy">
                {destino.nome}{" "}
                <span className="text-xs text-muted-foreground">({TIPO_LABEL[destino.tipo]})</span>
              </span>
            </div>
            <div className="border-t border-border pt-2 mt-2">
              {tipos
                .filter((t) => (caixas[t.sigla] ?? 0) > 0)
                .map((t, i) => (
                  <div key={t.id} className="flex items-center justify-between text-sm py-0.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded"
                        style={{ background: tipoColor(i) }}
                      />
                      {t.nome}
                    </span>
                    <span className="font-bold text-navy">{caixas[t.sigla]}</span>
                  </div>
                ))}
            </div>
            <div className="border-t border-border pt-2 flex items-center justify-between text-sm font-bold">
              <span>Total</span>
              <span className="text-navy">{totalCaixas} cx</span>
            </div>
          </div>

          {/* warnings */}
          {warnings.length > 0 && (
            <div className="rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div>
                Quantidade acima do saldo para:{" "}
                {warnings.map((t) => t.sigla).join(", ")}. O movimento será registrado mesmo assim.
              </div>
            </div>
          )}

          {/* motorista */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Motorista
            </label>

            {hasFornecedor && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={veiculoFornecedor}
                  onChange={(e) => setVeiculoFornecedor(e.target.checked)}
                  className="rounded border-border"
                />
                <Truck size={14} /> Veículo do fornecedor (sem motorista)
              </label>
            )}

            {!veiculoFornecedor &&
              (isAdmin || !(profile as { motorista_id?: string } | null)?.motorista_id) && (
                <Select value={motoristaId} onValueChange={setMotoristaId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o motorista" />
                  </SelectTrigger>
                  <SelectContent>
                    {motoristas.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

            {!veiculoFornecedor && motoristaId && (
              <p className="text-xs text-muted-foreground">
                Motorista: {motoristas.find((m) => m.id === motoristaId)?.nome ?? motoristaId}
              </p>
            )}
          </div>

          {/* obs */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <MessageSquare size={12} /> Observação (opcional)
            </label>
            <Input
              className="mt-1"
              placeholder="Observação..."
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>

          <Button
            className="w-full min-h-11 gap-2"
            onClick={confirmar}
            disabled={registrar.isPending}
          >
            <Check size={18} /> Confirmar · {totalCaixas} cx
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Ranking Panel (admin) ─────────────────────────────────── */

function RankingPanel() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const { data: ranking = [], isLoading } = useRetornoRanking(period);
  const { data: retornos = [] } = useRetornosDia();
  const { data: tipos = [] } = useTiposCaixa();
  const top = ranking[0];
  const totalCaixas = ranking.reduce((a, r) => a + r.total_caixas, 0);
  const periodLabel =
    period === "today" ? "hoje" : period === "week" ? "7 dias" : "30 dias";

  const totais = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tipos) map[t.sigla] = 0;
    for (const r of retornos) {
      const m = fromLegacyColumns(r);
      for (const [k, v] of Object.entries(m)) map[k] = (map[k] ?? 0) + Number(v || 0);
    }
    return map;
  }, [retornos, tipos]);
  const totalAll = Object.values(totais).reduce((a, n) => a + n, 0);

  return (
    <div className="space-y-6">
      <StatStrip
        items={[
          { label: "Motoristas ativos", value: isLoading ? "…" : String(ranking.length) },
          { label: `Caixas retornadas (${periodLabel})`, value: isLoading ? "…" : String(totalCaixas) },
          { label: "Líder", value: top?.motorista ?? "—", tone: "ok" },
          { label: "Retornos hoje", value: String(retornos.length) },
        ]}
      />

      <div className="card-base p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-warning" />
            <h3 className="text-sm font-bold text-navy">Ranking de motoristas</h3>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
            {(
              [
                ["today", "Hoje"],
                ["week", "7 dias"],
                ["month", "30 dias"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
                  period === k ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-navy"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {ranking.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum retorno com motorista identificado no período.
          </p>
        )}
        {ranking.map((r, i) => (
          <BarRow
            key={r.motorista_id ?? r.motorista}
            label={`${i + 1}. ${r.motorista}`}
            value={r.total_caixas}
            max={top?.total_caixas ?? 1}
            suffix={`${r.total_caixas} cx · ${r.total_retornos} retornos`}
          />
        ))}
      </div>

      {/* Today's retornos */}
      <div>
        <h3 className="text-sm font-bold text-navy mb-3">Retornos de hoje</h3>
        <div className="card-base p-5 mb-4">
          <div className="flex items-center gap-6">
            <Donut
              size={140}
              thickness={16}
              segments={tipos.map((t, i) => ({
                label: t.sigla,
                value: totais[t.sigla] ?? 0,
                color: tipoColor(i),
              }))}
              center={{ label: "Caixas", value: totalAll.toString() }}
            />
            <div className="flex-1 space-y-3">
              {tipos.map((t, i) => (
                <div key={t.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-ink">
                    <span className="h-3 w-3 rounded" style={{ background: tipoColor(i) }} />
                    {t.nome}
                  </span>
                  <span className="font-bold text-navy text-lg">{totais[t.sigla] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-base">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-bold text-navy">Últimos registros</h3>
          </div>
          <TableWrapper stickyFirstColumn>
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2 whitespace-nowrap">Hora</th>
                  <th className="text-left px-4 py-2 whitespace-nowrap">Motorista</th>
                  <th className="text-left px-4 py-2 whitespace-nowrap">Loja</th>
                  {tipos.map((t) => (
                    <th key={t.id} className="text-right px-4 py-2 whitespace-nowrap">
                      {t.sigla}
                    </th>
                  ))}
                  <th className="text-right px-4 py-2 whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody>
                {retornos.map(
                  (r: {
                    id: string;
                    created_at: string;
                    caixas?: Record<string, number> | null;
                    caixas_g: number;
                    caixas_i: number;
                    caixas_p: number;
                    clientes: { nome: string } | { nome: string }[] | null;
                    motoristas: { nome: string } | { nome: string }[] | null;
                    profiles: { nome: string } | { nome: string }[] | null;
                  }) => {
                    const map = fromLegacyColumns(r);
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                          {formatTime(r.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-ink whitespace-nowrap">
                          {(Array.isArray(r.motoristas) ? r.motoristas[0] : r.motoristas)?.nome ??
                            (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.nome ??
                            "—"}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-navy whitespace-nowrap">
                          {(Array.isArray(r.clientes) ? r.clientes[0] : r.clientes)?.nome ?? "—"}
                        </td>
                        {tipos.map((t) => (
                          <td key={t.id} className="px-4 py-2.5 text-right">
                            {map[t.sigla] ?? 0}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right font-bold text-navy">
                          {sumCaixas(map)}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </TableWrapper>
        </div>
      </div>
    </div>
  );
}
