import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  MapPinned,
  PackageX,
  Store,
  Truck,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusOrdemBadge } from "@/components/expedicao/fluxo-ordem";
import { NumberStepper } from "@/components/number-stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChipLabel, NumeroRotulo } from "@/components/ui-galpao";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { formatDateBRT, formatTime } from "@/lib/utils-date";
import {
  useCaixasDaSaida,
  useConfirmarEntrega,
  uploadCanhotoEntrega,
} from "@/hooks/use-saida-expedicao";
import {
  isParadaConcluida,
  isParadaPendente,
  resumoMinhaRota,
  useMinhaRota,
  type ParadaMinhaRota,
} from "@/hooks/use-minha-rota";
import type { EntregaCaixaQueueItem } from "@/lib/offline-queue";

export const Route = createFileRoute("/expedicao/minha-rota")({
  validateSearch: (search: Record<string, unknown>) => ({
    saidaId: typeof search.saidaId === "string" ? search.saidaId : undefined,
  }),
  component: Page,
  head: () => ({ meta: [{ title: "Minha rota · Campo Alegre" }] }),
});

type StatusCaixa = EntregaCaixaQueueItem["status"];

function Page() {
  const { saidaId: saidaIdSearch } = Route.useSearch();
  const { profile, isAdmin } = useAuth();
  const motoristaDoPerfil = profile?.motorista_id ?? null;

  const { data: tipos = [] } = useTiposCaixa();
  const motoristaQueryId =
    motoristaDoPerfil ?? (isAdmin ? null : undefined);
  const {
    data: paradas = [],
    isLoading,
    refetch,
  } = useMinhaRota(motoristaQueryId);

  const confirmar = useConfirmarEntrega();
  const [paradaSel, setParadaSel] = useState<ParadaMinhaRota | null>(null);

  useEffect(() => {
    if (!saidaIdSearch || paradaSel) return;
    const match = paradas.find((p) => p.saida_id === saidaIdSearch);
    if (match && isParadaPendente(match)) setParadaSel(match);
  }, [saidaIdSearch, paradas, paradaSel]);

  const resumo = useMemo(() => resumoMinhaRota(paradas), [paradas]);
  const pendentes = useMemo(() => paradas.filter(isParadaPendente), [paradas]);
  const concluidas = useMemo(() => paradas.filter(isParadaConcluida), [paradas]);

  if (!motoristaDoPerfil && !isAdmin) {
    return (
      <div className="w-full max-w-lg mx-auto sm:max-w-2xl">
        <PageHeader
          title="Minha rota"
          subtitle="Entregas do dia na ordem da rota"
        />
        <div className="card-base p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Conta sem motorista vinculado — peça ao admin para associar o perfil.
          </p>
        </div>
      </div>
    );
  }

  if (paradaSel && isParadaPendente(paradaSel)) {
    return (
      <ParadaEntregaForm
        parada={paradaSel}
        tipos={tipos}
        confirming={confirmar.isPending}
        onBack={() => setParadaSel(null)}
        onConfirm={async (payload) => {
          try {
            const res = await confirmar.mutateAsync(payload);
            toast.success(
              res.status === "entregue"
                ? "Entrega confirmada"
                : res.status === "entregue_parcial"
                  ? "Entrega parcial registrada"
                  : "Entrega recusada registrada",
              {
                description: `${res.caixas_entregues} entregue(s) · ${res.caixas_recusadas} recusada(s)${
                  res.quebra_id ? " · quebra lançada" : ""
                }`,
              },
            );
            setParadaSel(null);
            await refetch();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro ao confirmar entrega");
          }
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto sm:max-w-2xl space-y-4">
      <PageHeader
        title="Minha rota"
        subtitle="Próximas lojas na ordem da rota — entrega, parcial, recusa e vazias"
        actions={
          <Link
            to="/expedicao/saida"
            search={{ cargaId: undefined, clienteId: undefined }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <Truck size={14} /> Saída
          </Link>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">Carregando rota…</p>}

      {!isLoading && (
        <>
          <ProgressoRota resumo={resumo} />

          {paradas.length === 0 && (
            <div className="card-base p-6 text-center space-y-2">
              <MapPinned className="mx-auto text-muted-foreground" size={28} />
              <p className="text-sm font-semibold text-navy">Nenhuma parada hoje</p>
              <p className="text-xs text-muted-foreground">
                Confirme a saída das ordens em{" "}
                <Link to="/expedicao/saida" search={{ cargaId: undefined, clienteId: undefined }} className="underline">
                  Saída
                </Link>{" "}
                para montar a rota.
              </p>
            </div>
          )}

          {resumo.completa && paradas.length > 0 && <ResumoFinal resumo={resumo} paradas={concluidas} />}

          {pendentes.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-navy">
                Próximas lojas ({pendentes.length})
              </h2>
              {pendentes.map((p, idx) => (
                <ParadaCard
                  key={p.saida_id}
                  parada={p}
                  indice={idx + 1}
                  onOpen={() => setParadaSel(p)}
                />
              ))}
            </section>
          )}

          {concluidas.length > 0 && !resumo.completa && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-navy">Já entregues ({concluidas.length})</h2>
              {concluidas.map((p) => (
                <ParadaCard key={p.saida_id} parada={p} readOnly />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ProgressoRota({
  resumo,
}: {
  resumo: ReturnType<typeof resumoMinhaRota>;
}) {
  const pct = resumo.total === 0 ? 0 : Math.round((resumo.concluidas / resumo.total) * 100);
  return (
    <div className="card-base p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-navy">Progresso da rota</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {resumo.concluidas}/{resumo.total} lojas
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      {resumo.total > 0 && (
        <div className="text-xs text-muted-foreground">
          {resumo.pendentes > 0
            ? `${resumo.pendentes} parada(s) restante(s)`
            : "Rota concluída"}
        </div>
      )}
    </div>
  );
}

function ResumoFinal({
  resumo,
  paradas,
}: {
  resumo: ReturnType<typeof resumoMinhaRota>;
  paradas: ParadaMinhaRota[];
}) {
  const vaziasTxt = Object.entries(resumo.vazias)
    .map(([s, q]) => `${q} ${s}`)
    .join(" · ");
  return (
    <div className="card-base p-4 space-y-3 border-primary/30">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="text-primary" size={20} />
        <h2 className="text-sm font-bold text-navy">Rota concluída</h2>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <ChipLabel label="Lojas" value={resumo.total} />
        <ChipLabel label="Entregues" value={resumo.entregues} />
        <ChipLabel label="Parciais" value={resumo.parciais} />
        <ChipLabel label="Recusadas" value={resumo.recusadas} />
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        <div>
          Caixas: {resumo.caixasEntregues} entregue(s) · {resumo.caixasRecusadas}{" "}
          recusada(s)
        </div>
        {vaziasTxt && <div>Vazias retornadas (Loja → Packing): {vaziasTxt}</div>}
      </div>
      <ul className="text-xs text-muted-foreground space-y-1">
        {paradas.map((p) => (
          <li key={p.saida_id}>
            {p.cliente_nome}
            {p.entrega_status ? ` · ${labelEntrega(p.entrega_status)}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelEntrega(status: string) {
  if (status === "entregue") return "Entregue";
  if (status === "entregue_parcial") return "Parcial";
  if (status === "recusada") return "Recusada";
  return status;
}

function ParadaCard({
  parada,
  indice,
  onOpen,
  readOnly,
}: {
  parada: ParadaMinhaRota;
  indice?: number;
  onOpen?: () => void;
  readOnly?: boolean;
}) {
  const pendente = isParadaPendente(parada);
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-navy tabular-nums">
          {indice != null ? `${indice}. ` : ""}
          {parada.numero_ordem ?? parada.carga_codigo}
        </span>
        <div className="flex items-center gap-1.5">
          {pendente ? (
            <StatusOrdemBadge status="em_transito" />
          ) : (
            <span
              className={`chip ${
                parada.entrega_status === "entregue"
                  ? "chip-ok"
                  : parada.entrega_status === "entregue_parcial"
                    ? "chip-warn"
                    : "chip-danger"
              }`}
            >
              {labelEntrega(parada.entrega_status ?? parada.status_ordem)}
            </span>
          )}
          <ChipLabel label="Caixas" value={parada.total_caixas} />
        </div>
      </div>
      <div className="text-sm text-ink flex items-center gap-1 mt-0.5">
        <Store size={14} className="text-primary" /> {parada.cliente_nome}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {parada.rota_nome ? `${parada.rota_nome} · ` : ""}
        Saiu às {formatTime(parada.saida_em)}
        {parada.data_carga ? ` · ${formatDateBRT(parada.data_carga)}` : ""}
      </div>
    </>
  );

  if (readOnly || !onOpen) {
    return <div className="card-base p-4 opacity-90">{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-base p-4 text-left w-full active:scale-[0.99] transition-transform"
    >
      {inner}
    </button>
  );
}

function ParadaEntregaForm({
  parada,
  tipos,
  confirming,
  onBack,
  onConfirm,
}: {
  parada: ParadaMinhaRota;
  tipos: { id: string; nome: string; sigla: string }[];
  confirming: boolean;
  onBack: () => void;
  onConfirm: (payload: {
    saida_id: string;
    ordem_codigo?: string;
    cliente_nome?: string;
    caixas: EntregaCaixaQueueItem[];
    recebedor_nome: string | null;
    canhoto_foto_url: string | null;
    vazias: Record<string, number>;
    observacoes: string | null;
  }) => Promise<void>;
}) {
  const { data: caixas = [] } = useCaixasDaSaida(parada.carga_id);
  const [statusCaixa, setStatusCaixa] = useState<Record<string, StatusCaixa>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [recebedor, setRecebedor] = useState("");
  const [vazias, setVazias] = useState<Record<string, number>>({});
  const [canhoto, setCanhoto] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [obs, setObs] = useState("");
  const fotoRef = useRef<HTMLInputElement>(null);
  const initRef = useRef<string | null>(null);

  const emTransito = useMemo(() => caixas.filter((c) => c.status === "em_transito"), [caixas]);

  useEffect(() => {
    if (emTransito.length === 0) return;
    if (initRef.current === parada.saida_id) return;
    initRef.current = parada.saida_id;
    setStatusCaixa(Object.fromEntries(emTransito.map((c) => [c.id, "entregue" as StatusCaixa])));
    setMotivos({});
    setRecebedor("");
    setVazias({});
    setCanhoto(null);
    setObs("");
  }, [parada.saida_id, emTransito]);

  const entregues = emTransito.filter((c) => (statusCaixa[c.id] ?? "entregue") === "entregue");
  const recusadas = emTransito.filter((c) => (statusCaixa[c.id] ?? "entregue") === "recusada");
  const naoLocalizadas = emTransito.filter(
    (c) => (statusCaixa[c.id] ?? "entregue") === "nao_localizada",
  );
  const statusFinal =
    entregues.length === 0
      ? "Recusada"
      : recusadas.length + naoLocalizadas.length > 0
        ? "Entrega parcial"
        : "Entrega";

  const tipoLabel = (sigla: string | null | undefined) => {
    if (!sigla) return null;
    const t = tipos.find((x) => x.sigla === sigla);
    return t ? `${t.nome} (${t.sigla})` : sigla;
  };

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnviandoFoto(true);
    try {
      setCanhoto(await uploadCanhotoEntrega(file, parada.saida_id));
      toast.success("Canhoto anexado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setEnviandoFoto(false);
    }
  };

  const enviar = async () => {
    if (recusadas.length > 0 && recusadas.some((c) => !motivos[c.id]?.trim())) {
      toast.error("Informe o motivo de cada caixa recusada");
      return;
    }
    await onConfirm({
      saida_id: parada.saida_id,
      ordem_codigo: parada.numero_ordem ?? parada.carga_codigo,
      cliente_nome: parada.cliente_nome,
      caixas: emTransito.map((c) => ({
        caixa_id: c.id,
        status: (statusCaixa[c.id] ?? "entregue") as StatusCaixa,
        motivo: motivos[c.id]?.trim() || null,
      })),
      recebedor_nome: recebedor.trim() || null,
      canhoto_foto_url: canhoto,
      vazias: Object.fromEntries(Object.entries(vazias).filter(([, q]) => q > 0)),
      observacoes: obs.trim() || null,
    });
  };

  return (
    <div className="w-full max-w-lg mx-auto sm:max-w-2xl space-y-4">
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFoto}
      />

      <PageHeader
        title={parada.cliente_nome}
        subtitle={`OS ${parada.numero_ordem ?? parada.carga_codigo} · registrar entrega nesta parada`}
      />

      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
      >
        <ChevronLeft size={16} /> Voltar à rota
      </button>

      <div className="card-base p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-navy text-lg tabular-nums">
            {parada.numero_ordem ?? parada.carga_codigo}
          </span>
          <span
            className={`chip ${
              statusFinal === "Entrega"
                ? "chip-ok"
                : statusFinal === "Entrega parcial"
                  ? "chip-warn"
                  : "chip-danger"
            }`}
          >
            {statusFinal}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {parada.cliente_cnpj ? `CNPJ ${parada.cliente_cnpj} · ` : ""}
          <NumeroRotulo label="Caixas" value={emTransito.length} />
          {" no caminhão"}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-navy">Caixas</h3>
        {emTransito.map((cx) => {
          const st = statusCaixa[cx.id] ?? "entregue";
          return (
            <div key={cx.id} className="card-base p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-navy tabular-nums">{cx.codigo_etiqueta}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {(cx.itens_caixa_ordem ?? [])
                      .map((i) => {
                        const prod = Array.isArray(i.produtos) ? i.produtos[0] : i.produtos;
                        return `${Number(i.quantidade)} ${prod?.nome ?? "produto"}`;
                      })
                      .join(" · ") || "Caixa vazia"}
                  </div>
                </div>
                <ChipLabel
                  label="Tipo"
                  value={tipoLabel(cx.tipo_caixa_sigla)}
                  className="shrink-0"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["entregue", "Entrega"],
                    ["recusada", "Recusa"],
                    ["nao_localizada", "Não localizada"],
                  ] as const
                ).map(([valor, label]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() =>
                      setStatusCaixa((prev) => ({ ...prev, [cx.id]: valor as StatusCaixa }))
                    }
                    className={`min-h-11 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                      st === valor
                        ? valor === "entregue"
                          ? "bg-primary text-primary-foreground border-transparent"
                          : "bg-destructive/10 text-destructive border-destructive/30"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {st === "recusada" && (
                <Input
                  className="h-11"
                  placeholder="Motivo da recusa (obrigatório)"
                  value={motivos[cx.id] ?? ""}
                  onChange={(e) => setMotivos((prev) => ({ ...prev, [cx.id]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
        {emTransito.length === 0 && (
          <p className="text-sm text-muted-foreground">Esta ordem não tem caixas em trânsito.</p>
        )}
      </div>

      <div className="card-base p-4 space-y-3">
        <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
          <Undo2 size={14} /> Retorno de vazias
        </h3>
        <p className="text-xs text-muted-foreground">
          Gera movimento Loja → Packing no saldo de caixas.
        </p>
        {tipos.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3">
            <span className="text-sm">
              {t.nome} ({t.sigla})
            </span>
            <NumberStepper
              value={vazias[t.sigla] ?? 0}
              onChange={(v) => setVazias((prev) => ({ ...prev, [t.sigla]: v }))}
              inputMode="numeric"
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quem recebeu
        </div>
        <Input
          className="h-11"
          placeholder="Nome do recebedor"
          value={recebedor}
          onChange={(e) => setRecebedor(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Canhoto assinado (opcional)
        </div>
        <div className="flex items-center gap-3">
          {canhoto && (
            <img
              src={canhoto}
              alt="Canhoto"
              className="w-16 h-16 rounded-lg object-cover border border-border"
            />
          )}
          <Button
            variant="outline"
            className="min-h-11"
            disabled={enviandoFoto}
            onClick={() => fotoRef.current?.click()}
          >
            <Camera size={16} /> {enviandoFoto ? "Enviando…" : canhoto ? "Trocar foto" : "Fotografar"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Observação (opcional)
        </div>
        <Input
          className="h-11"
          placeholder="Alguma observação da entrega…"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
        />
      </div>

      {recusadas.length > 0 && (
        <div className="rounded-lg bg-destructive/10 text-destructive text-xs p-3 flex items-start gap-2">
          <PackageX size={14} className="mt-0.5 shrink-0" />
          <span>
            {recusadas.length} caixa(s) recusada(s) voltam para o packing e viram laudo de quebra.
          </span>
        </div>
      )}

      <Button
        className="w-full min-h-12"
        disabled={confirming || emTransito.length === 0}
        onClick={enviar}
      >
        <Check size={16} /> {confirming ? "Confirmando…" : "Confirmar nesta loja"}
      </Button>
    </div>
  );
}
