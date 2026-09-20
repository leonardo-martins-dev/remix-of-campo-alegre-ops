import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronLeft,
  PackageX,
  Store,
  Undo2,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { NumberStepper } from "@/components/number-stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { formatDateBRT, formatTime } from "@/lib/utils-date";
import {
  useCaixasDaSaida,
  useConfirmarEntrega,
  useEntregaOfflineQueue,
  useSaidasExpedicaoEmTransito,
  uploadCanhotoEntrega,
  type SaidaExpedicao,
} from "@/hooks/use-saida-expedicao";
import type { EntregaCaixaQueueItem } from "@/lib/offline-queue";

export const Route = createFileRoute("/expedicao/entrega")({
  component: Page,
  head: () => ({ meta: [{ title: "Entrega na loja · Campo Alegre" }] }),
});

type StatusCaixa = EntregaCaixaQueueItem["status"];

function Page() {
  const { user, profile, isAdmin } = useAuth();
  const motoristaDoPerfil = profile?.motorista_id ?? null;

  const { data: tipos = [] } = useTiposCaixa();
  const { data: saidas = [], isLoading } = useSaidasExpedicaoEmTransito(
    isAdmin ? null : motoristaDoPerfil,
  );
  const confirmar = useConfirmarEntrega();
  const { offline, pendentes, guardar } = useEntregaOfflineQueue(!!user);

  const [saidaSel, setSaidaSel] = useState<SaidaExpedicao | null>(null);
  const { data: caixas = [] } = useCaixasDaSaida(saidaSel?.carga_id ?? null);

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

  /* Pré-preenche tudo como entregue — o motorista só marca as exceções. */
  useEffect(() => {
    if (!saidaSel || emTransito.length === 0) return;
    if (initRef.current === saidaSel.id) return;
    initRef.current = saidaSel.id;
    setStatusCaixa(Object.fromEntries(emTransito.map((c) => [c.id, "entregue" as StatusCaixa])));
    setMotivos({});
    setRecebedor("");
    setVazias({});
    setCanhoto(null);
    setObs("");
  }, [saidaSel, emTransito]);

  const entregues = emTransito.filter((c) => (statusCaixa[c.id] ?? "entregue") === "entregue");
  const recusadas = emTransito.filter((c) => (statusCaixa[c.id] ?? "entregue") !== "entregue");
  const statusFinal =
    entregues.length === 0 ? "Recusada" : recusadas.length > 0 ? "Entregue parcial" : "Entregue";

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !saidaSel) return;
    setEnviandoFoto(true);
    try {
      setCanhoto(await uploadCanhotoEntrega(file, saidaSel.id));
      toast.success("Canhoto anexado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar foto");
    } finally {
      setEnviandoFoto(false);
    }
  };

  const montarPayload = () => {
    if (!saidaSel) return null;
    return {
      saida_id: saidaSel.id,
      ordem_codigo: saidaSel.cargas?.numero_ordem ?? saidaSel.cargas?.codigo,
      cliente_nome: saidaSel.clientes?.nome,
      caixas: emTransito.map((c) => ({
        caixa_id: c.id,
        status: (statusCaixa[c.id] ?? "entregue") as StatusCaixa,
        motivo: motivos[c.id]?.trim() || null,
      })),
      recebedor_nome: recebedor.trim() || null,
      canhoto_foto_url: canhoto,
      vazias: Object.fromEntries(Object.entries(vazias).filter(([, q]) => q > 0)),
      observacoes: obs.trim() || null,
    };
  };

  const enviar = async () => {
    const payload = montarPayload();
    if (!payload) return;
    if (recusadas.length > 0 && recusadas.some((c) => !motivos[c.id]?.trim())) {
      toast.error("Informe o motivo de cada caixa recusada");
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      guardar(payload);
      toast.success("Entrega guardada offline", { description: "Sobe quando o sinal voltar." });
      setSaidaSel(null);
      initRef.current = null;
      return;
    }

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
      setSaidaSel(null);
      initRef.current = null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao confirmar entrega";
      if (/failed to fetch|network/i.test(msg)) {
        guardar(payload);
        toast.error("Sem conexão — entrega ficou na fila");
        setSaidaSel(null);
        initRef.current = null;
        return;
      }
      toast.error(msg);
    }
  };

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
        title="Entrega na loja"
        subtitle="Confirme as caixas entregues, as recusas e as vazias retiradas"
        actions={
          <Link
            to="/expedicao"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Painel
          </Link>
        }
      />

      {(offline || pendentes > 0) && (
        <div className="rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs px-3 py-2 mb-3 flex items-center gap-2">
          <WifiOff size={14} />
          {offline ? "Modo offline" : ""}
          {pendentes > 0 && ` · ${pendentes} entrega(s) na fila`}
        </div>
      )}

      {!saidaSel && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-navy">Ordens em trânsito</h2>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && saidas.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma ordem em trânsito{isAdmin ? "" : " no seu nome"}.
            </p>
          )}
          {saidas.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSaidaSel(s)}
              className="card-base p-4 text-left w-full active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-navy tabular-nums">
                  {s.cargas?.numero_ordem ?? s.cargas?.codigo}
                </span>
                <span className="chip chip-info">{s.total_caixas} cx</span>
              </div>
              <div className="text-sm text-ink flex items-center gap-1 mt-0.5">
                <Store size={14} className="text-primary" /> {s.clientes?.nome ?? "Loja"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Saiu às {formatTime(s.saida_em)}
                {s.cargas?.data_carga ? ` · ${formatDateBRT(s.cargas.data_carga)}` : ""}
                {s.motoristas?.nome ? ` · ${s.motoristas.nome}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}

      {saidaSel && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setSaidaSel(null);
              initRef.current = null;
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ChevronLeft size={16} /> Outras ordens
          </button>

          <div className="card-base p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-navy text-lg tabular-nums">
                {saidaSel.cargas?.numero_ordem ?? saidaSel.cargas?.codigo}
              </span>
              <span
                className={`chip ${
                  statusFinal === "Entregue"
                    ? "chip-ok"
                    : statusFinal === "Entregue parcial"
                      ? "chip-warn"
                      : "chip-danger"
                }`}
              >
                {statusFinal}
              </span>
            </div>
            <div className="text-sm text-ink">{saidaSel.clientes?.nome}</div>
            <div className="text-xs text-muted-foreground">
              {saidaSel.clientes?.cnpj ? `CNPJ ${saidaSel.clientes.cnpj} · ` : ""}
              {emTransito.length} caixa(s) no caminhão
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
                    {cx.tipo_caixa_sigla && (
                      <span className="chip chip-muted shrink-0">{cx.tipo_caixa_sigla}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["entregue", "Entregue"],
                        ["recusada", "Recusada"],
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

                  {st !== "entregue" && (
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
              <p className="text-sm text-muted-foreground">
                Esta ordem não tem caixas em trânsito.
              </p>
            )}
          </div>

          <div className="card-base p-4 space-y-3">
            <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
              <Undo2 size={14} /> Vazias retiradas na loja
            </h3>
            {tipos.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  {t.sigla} · <span className="text-muted-foreground">{t.nome}</span>
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
                <Camera size={16} />{" "}
                {enviandoFoto ? "Enviando…" : canhoto ? "Trocar foto" : "Fotografar"}
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
                {recusadas.length} caixa(s) recusada(s) voltam para o packing e viram laudo de
                quebra com os produtos.
              </span>
            </div>
          )}

          <Button
            className="w-full min-h-12"
            disabled={confirmar.isPending || emTransito.length === 0}
            onClick={enviar}
          >
            <Check size={16} /> Confirmar entrega · {entregues.length}/{emTransito.length} cx
          </Button>
        </div>
      )}
    </div>
  );
}
