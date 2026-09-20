import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Camera,
  Check,
  ChevronLeft,
  Package,
  Search,
  Truck,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { NumberStepper } from "@/components/number-stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { one } from "@/lib/embed";
import { formatDateBRT } from "@/lib/utils-date";
import { useMotoristas } from "@/hooks/use-cadastros";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useSugestaoCaixas } from "@/hooks/use-sugestao-caixas";
import {
  useConfirmarSaidaRoca,
  useFornecedoresComPedidoAberto,
  usePedidosAbertosSaida,
  useSaidaOfflineQueue,
  uploadFotoSaida,
  type ConfirmarSaidaPayload,
  type PedidoAberto,
} from "@/hooks/use-saida-roca";

export const Route = createFileRoute("/recebimento/saida-roca")({
  component: Page,
  head: () => ({ meta: [{ title: "Saída na roça · Campo Alegre" }] }),
});

type CaixaEntry = {
  tipo_caixa_id: string | null;
  sigla: string;
  fator: number | null;
  qtd: number;
};

type ItemLinha = {
  item_pedido_id: string;
  produto_id: string | null;
  produto: string;
  unidade: string;
  quantidade_pedida: number;
};

function Page() {
  const { user, profile, isAdmin } = useAuth();
  const fornecedorDoPerfil = profile?.fornecedor_id ?? null;
  const motoristaDoPerfil = profile?.motorista_id ?? null;
  const isFornecedor = !!fornecedorDoPerfil;

  const { data: tipos = [] } = useTiposCaixa();
  const { data: motoristas = [] } = useMotoristas();
  const { data: fornecedores = [], isLoading: loadingFornecedores } =
    useFornecedoresComPedidoAberto(!isFornecedor);
  const confirmar = useConfirmarSaidaRoca();
  const { offline, pendentes, guardar } = useSaidaOfflineQueue(!!user);

  // fornecedor logado já entra com o próprio fornecedor selecionado
  const [fornecedorId, setFornecedorId] = useState<string | null>(fornecedorDoPerfil);
  const [pedido, setPedido] = useState<PedidoAberto | null>(null);
  const [motoristaId, setMotoristaId] = useState<string>(motoristaDoPerfil ?? "");
  const [veiculoFornecedor, setVeiculoFornecedor] = useState(false);
  const [caixas, setCaixas] = useState<Record<string, CaixaEntry[]>>({});
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [obs, setObs] = useState("");
  const [busca, setBusca] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const fotoRef = useRef<HTMLInputElement>(null);
  const caixasInitRef = useRef<string | null>(null);

  const { data: pedidos = [], isLoading: loadingPedidos } = usePedidosAbertosSaida(fornecedorId);

  const itens: ItemLinha[] = useMemo(() => {
    if (!pedido) return [];
    return (pedido.itens_pedido ?? []).map((ip) => {
      const prod = one(ip.produtos);
      return {
        item_pedido_id: ip.id,
        produto_id: ip.produto_id ?? null,
        produto: prod?.nome ?? "Produto sem cadastro",
        unidade: ip.unidade || prod?.unidade || "un",
        quantidade_pedida: Number(ip.quantidade_pedida ?? 0),
      };
    });
  }, [pedido]);

  const itensParaSugestao = useMemo(
    () => itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade_pedida })),
    [itens],
  );
  const { data: sugestoes } = useSugestaoCaixas(pedido?.fornecedor_id ?? null, itensParaSugestao);

  /* Sugestão de caixas (NOP-10/11) vira o valor inicial de cada card. */
  useEffect(() => {
    if (!pedido || !tipos.length) return;
    if (caixasInitRef.current === pedido.id) return;
    if (itensParaSugestao.some((i) => i.produto_id) && sugestoes === undefined) return;

    caixasInitRef.current = pedido.id;
    const next: Record<string, CaixaEntry[]> = {};
    for (const it of itens) {
      const sug = it.produto_id ? sugestoes?.get(it.produto_id) : undefined;
      if (sug && !sug.sem_conversao && sug.sugestoes.length > 0) {
        next[it.item_pedido_id] = sug.sugestoes.map((s, idx) => ({
          tipo_caixa_id: s.tipo_caixa_id,
          sigla: s.tipo_caixa_sigla,
          fator: s.fator,
          qtd: idx === 0 ? s.quantidade_caixas : 0,
        }));
      } else {
        next[it.item_pedido_id] = tipos.map((t) => ({
          tipo_caixa_id: t.id,
          sigla: t.sigla,
          fator: null,
          qtd: 0,
        }));
      }
    }
    setCaixas(next);
  }, [pedido, tipos, sugestoes, itens, itensParaSugestao]);

  const totalCaixas = useMemo(
    () =>
      Object.values(caixas).reduce(
        (acc, entries) => acc + entries.reduce((a, e) => a + (e.qtd || 0), 0),
        0,
      ),
    [caixas],
  );

  const totaisPorTipo = useMemo(() => {
    const out: Record<string, number> = {};
    for (const entries of Object.values(caixas)) {
      for (const e of entries) {
        if (e.qtd > 0) out[e.sigla] = (out[e.sigla] ?? 0) + e.qtd;
      }
    }
    return out;
  }, [caixas]);

  const motoristaNome = motoristas.find((m) => m.id === motoristaId)?.nome ?? null;

  const pedidosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return pedidos;
    return pedidos.filter(
      (p) =>
        p.codigo.toLowerCase().includes(q) ||
        (one(p.fornecedores)?.nome ?? "").toLowerCase().includes(q),
    );
  }, [pedidos, busca]);

  const reset = () => {
    setPedido(null);
    setCaixas({});
    setFotoUrl(null);
    setObs("");
    setBusca("");
    setVeiculoFornecedor(false);
    setMotoristaId(motoristaDoPerfil ?? "");
    caixasInitRef.current = null;
    setStep(1);
    if (!isFornecedor) setFornecedorId(null);
  };

  const voltar = () => {
    if (step === 4) return setStep(3);
    if (step === 3) return setStep(2);
    if (step === 2) return setStep(1);
    if (step === 1 && fornecedorId && !isFornecedor) {
      setFornecedorId(null);
      setPedido(null);
    }
  };

  const setQtd = (itemId: string, tipoCaixaId: string | null, sigla: string, qtd: number) => {
    setCaixas((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).map((e) =>
        (e.tipo_caixa_id ?? e.sigla) === (tipoCaixaId ?? sigla)
          ? { ...e, qtd: Math.max(0, qtd) }
          : e,
      ),
    }));
  };

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pedido) return;
    setEnviandoFoto(true);
    try {
      setFotoUrl(await uploadFotoSaida(file, pedido.id));
      toast.success("Foto da carga anexada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setEnviandoFoto(false);
    }
  };

  const montarPayload = (): ConfirmarSaidaPayload | null => {
    if (!pedido) return null;
    return {
      pedido_id: pedido.id,
      pedido_codigo: pedido.codigo,
      motorista_id: veiculoFornecedor ? null : motoristaId || null,
      veiculo_fornecedor: veiculoFornecedor,
      foto_url: fotoUrl,
      observacoes: obs.trim() || null,
      itens: itens
        .map((it) => {
          const entries = (caixas[it.item_pedido_id] ?? []).filter((e) => e.qtd > 0);
          const fator = entries.find((e) => e.fator && e.fator > 0)?.fator ?? null;
          const totalCx = entries.reduce((a, e) => a + e.qtd, 0);
          return {
            item_pedido_id: it.item_pedido_id,
            produto_id: it.produto_id,
            quantidade_pedida: it.quantidade_pedida,
            quantidade_unidades: fator ? totalCx * fator : null,
            caixas: entries.map((e) => ({
              tipo_caixa_id: e.tipo_caixa_id,
              tipo_caixa_sigla: e.sigla,
              qtd: e.qtd,
              fator_usado: e.fator,
            })),
          };
        })
        .filter((it) => it.caixas.length > 0),
    };
  };

  const enviar = async () => {
    const payload = montarPayload();
    if (!payload || !user) return;
    if (totalCaixas <= 0) {
      toast.error("Informe ao menos uma caixa");
      return;
    }
    if (!veiculoFornecedor && !payload.motorista_id) {
      toast.error("Escolha o motorista ou marque veículo do fornecedor");
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      guardar(payload);
      toast.success("Saída guardada offline", { description: "Sobe quando o sinal voltar." });
      reset();
      return;
    }

    try {
      const res = await confirmar.mutateAsync(payload);
      toast.success("Saída confirmada · pedido em trânsito", {
        description: `${res.total_caixas} cx · ${
          veiculoFornecedor ? "veículo do fornecedor" : (motoristaNome ?? "motorista")
        }`,
      });
      reset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao confirmar saída";
      if (/failed to fetch|network/i.test(msg)) {
        guardar(payload);
        toast.error("Sem conexão — saída ficou na fila");
        reset();
        return;
      }
      toast.error(msg);
    }
  };

  const podeVoltar = step > 1 || (!!fornecedorId && !isFornecedor);

  return (
    <div className="w-full max-w-lg mx-auto sm:max-w-2xl">
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFoto}
      />

      <PageHeader
        title="Saída na roça"
        subtitle="Registre o que saiu da roça antes da chegada no packing"
        actions={
          <Link
            to={isFornecedor ? "/fornecedor" : "/recebimento"}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> {isFornecedor ? "Minhas caixas" : "Voltar"}
          </Link>
        }
      />

      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
        {["Pedido", "Transporte", "Caixas", "Confirmar"].map((label, i) => (
          <span key={label} className="flex items-center gap-1">
            {i > 0 && <span className="mx-0.5">›</span>}
            <span
              className={
                step > i + 1 ? "text-primary" : step === i + 1 ? "text-primary font-bold" : ""
              }
            >
              {label}
            </span>
          </span>
        ))}
      </div>

      {(offline || pendentes > 0) && (
        <div className="rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs px-3 py-2 mb-3 flex items-center gap-2">
          <WifiOff size={14} />
          {offline ? "Modo offline" : ""}
          {pendentes > 0 && ` · ${pendentes} saída(s) na fila`}
        </div>
      )}

      {podeVoltar && (
        <button
          type="button"
          onClick={voltar}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-navy mb-3"
        >
          <ChevronLeft size={16} /> Voltar
        </button>
      )}

      {/* ── 1a: motorista/admin escolhe o fornecedor ───────────── */}
      {step === 1 && !fornecedorId && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-navy">De qual fornecedor?</h2>
          {loadingFornecedores && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!loadingFornecedores && fornecedores.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum fornecedor com pedido aberto.</p>
          )}
          <div className="grid grid-cols-1 gap-2">
            {fornecedores.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFornecedorId(f.id)}
                className="card-base p-4 text-left flex items-center justify-between gap-3 active:scale-[0.99] transition-transform"
              >
                <span className="flex items-center gap-2 font-semibold text-navy">
                  <Building2 size={18} className="text-primary" /> {f.nome}
                </span>
                <span className="chip chip-info">{f.pedidos} pedido(s)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 1b: escolher pedido aberto ─────────────────────────── */}
      {step === 1 && fornecedorId && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-navy">Qual pedido está saindo?</h2>
          {pedidos.length > 4 && (
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="pl-9 h-11"
                placeholder="Buscar pedido…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          )}
          {loadingPedidos && <p className="text-sm text-muted-foreground">Carregando pedidos…</p>}
          {!loadingPedidos && pedidosFiltrados.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum pedido aberto para registrar saída.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3">
            {pedidosFiltrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPedido(p);
                  caixasInitRef.current = null;
                  setStep(2);
                }}
                className="card-base p-4 text-left active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-bold text-navy">{p.codigo}</span>
                  <span className={`chip ${p.status === "parcial" ? "chip-warn" : "chip-muted"}`}>
                    {p.status === "parcial" ? "Parcial" : "A entregar"}
                  </span>
                </div>
                <div className="text-sm text-ink">{one(p.fornecedores)?.nome ?? "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {(p.itens_pedido ?? []).length} item(ns)
                  {p.data_prevista ? ` · prevista ${formatDateBRT(p.data_prevista)}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 2: transporte ──────────────────────────────────────── */}
      {step === 2 && pedido && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Quem leva a carga?</h2>

          <button
            type="button"
            onClick={() => {
              setVeiculoFornecedor(true);
              setStep(3);
            }}
            className={`w-full card-base p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform ${
              veiculoFornecedor ? "border-primary" : ""
            }`}
          >
            <Truck size={22} className="text-primary" />
            <span>
              <span className="block font-bold text-navy">Veículo do fornecedor</span>
              <span className="block text-xs text-muted-foreground">
                Sem motorista Campo Alegre
              </span>
            </span>
          </button>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Motorista
            </div>
            {motoristaDoPerfil && !isAdmin ? (
              <div className="card-base p-4 flex items-center justify-between">
                <span className="font-semibold text-navy">
                  {motoristas.find((m) => m.id === motoristaDoPerfil)?.nome ?? "Meu cadastro"}
                </span>
                <Button
                  className="min-h-11"
                  onClick={() => {
                    setVeiculoFornecedor(false);
                    setMotoristaId(motoristaDoPerfil);
                    setStep(3);
                  }}
                >
                  Sou eu
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {motoristas
                  .filter((m) => m.ativo !== false)
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setVeiculoFornecedor(false);
                        setMotoristaId(m.id);
                        setStep(3);
                      }}
                      className={`card-base p-4 text-left font-semibold text-navy active:scale-[0.99] transition-transform ${
                        !veiculoFornecedor && motoristaId === m.id ? "border-primary" : ""
                      }`}
                    >
                      {m.nome}
                    </button>
                  ))}
                {motoristas.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum motorista cadastrado.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 3: caixas por produto ──────────────────────────────── */}
      {step === 3 && pedido && (
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">
            {pedido.codigo} ·{" "}
            <span className="font-semibold text-navy">
              {veiculoFornecedor ? "Veículo do fornecedor" : (motoristaNome ?? "Motorista")}
            </span>
          </div>
          <h2 className="text-lg font-bold text-navy">Quantas caixas de cada produto?</h2>

          <div className="space-y-3">
            {itens.map((it) => {
              const entries = caixas[it.item_pedido_id] ?? [];
              const sug = it.produto_id ? sugestoes?.get(it.produto_id) : undefined;
              const totalItem = entries.reduce((a, e) => a + e.qtd, 0);
              return (
                <div key={it.item_pedido_id} className="card-base p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-navy leading-tight">{it.produto}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Pedido: {it.quantidade_pedida} {it.unidade}
                      </div>
                    </div>
                    <span className="chip chip-info shrink-0">{totalItem} cx</span>
                  </div>

                  {(!sug || sug.sem_conversao) && (
                    <p className="text-xs text-amber-700">
                      Sem fator un/cx cadastrado — informe as caixas manualmente.
                    </p>
                  )}

                  <div className="space-y-2">
                    {entries.map((e) => (
                      <div
                        key={`${it.item_pedido_id}-${e.tipo_caixa_id ?? e.sigla}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 p-2"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-navy text-sm">{e.sigla}</div>
                          {e.fator ? (
                            <div className="text-[11px] text-muted-foreground">
                              {e.fator} {it.unidade}/cx
                            </div>
                          ) : null}
                        </div>
                        <NumberStepper
                          value={e.qtd}
                          onChange={(v) => setQtd(it.item_pedido_id, e.tipo_caixa_id, e.sigla, v)}
                          inputMode="numeric"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {itens.length === 0 && (
              <p className="text-sm text-muted-foreground">Pedido sem itens cadastrados.</p>
            )}
          </div>

          <Button
            className="w-full min-h-12"
            disabled={totalCaixas === 0}
            onClick={() => setStep(4)}
          >
            Avançar · {totalCaixas} cx
          </Button>
        </div>
      )}

      {/* ── 4: resumo e confirmação ────────────────────────────── */}
      {step === 4 && pedido && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-navy">Confirmar saída</h2>

          <div className="card-base p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pedido</span>
              <span className="font-semibold text-navy">{pedido.codigo}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Fornecedor</span>
              <span className="font-semibold text-navy">
                {one(pedido.fornecedores)?.nome ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Transporte</span>
              <span className="font-semibold text-navy">
                {veiculoFornecedor ? "Veículo do fornecedor" : (motoristaNome ?? "—")}
              </span>
            </div>
            <div className="border-t border-border pt-2 space-y-1">
              {Object.entries(totaisPorTipo).map(([sigla, qtd]) => (
                <div key={sigla} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package size={14} className="text-primary" /> {sigla}
                  </span>
                  <span className="font-bold text-navy">{qtd} cx</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-2 flex items-center justify-between font-bold">
              <span>Total</span>
              <span className="text-navy">{totalCaixas} cx</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Foto da carga (opcional)
            </div>
            <div className="flex items-center gap-3">
              {fotoUrl && (
                <img
                  src={fotoUrl}
                  alt="Carga"
                  className="w-16 h-16 rounded-lg object-cover border border-border"
                />
              )}
              <Button
                variant="outline"
                className="min-h-11"
                disabled={enviandoFoto}
                onClick={() => fotoRef.current?.click()}
              >
                <Camera size={16} />{" "}
                {enviandoFoto ? "Enviando…" : fotoUrl ? "Trocar foto" : "Tirar foto"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Observação (opcional)
            </div>
            <Input
              className="h-11"
              placeholder="Alguma observação da carga…"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>

          <Button
            className="w-full min-h-12"
            disabled={confirmar.isPending || totalCaixas === 0}
            onClick={enviar}
          >
            <Check size={18} /> Confirmar saída · {totalCaixas} cx
          </Button>
        </div>
      )}
    </div>
  );
}
