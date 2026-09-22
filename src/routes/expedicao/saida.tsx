import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Boxes, Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { FluxoPassos } from "@/components/fluxo-passos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { useAuth } from "@/lib/auth";
import { useMotoristas } from "@/hooks/use-cadastros";
import { formatDateBRT } from "@/lib/utils-date";
import {
  useCaixasDaSaida,
  useConfirmarSaidaExpedicao,
  useSupermercadosDoDia,
  useVincularClienteCarga,
} from "@/hooks/use-saida-expedicao";
import {
  useOrdensExpedicao,
  useOrdemExpedicao,
  STATUS_ORDEM_LABEL,
  type OrdemExpedicao,
  type StatusOrdem,
} from "@/hooks/use-ordem-expedicao";

export const Route = createFileRoute("/expedicao/saida")({
  validateSearch: (search: Record<string, unknown>) => ({
    cargaId: typeof search.cargaId === "string" ? search.cargaId : undefined,
    clienteId: typeof search.clienteId === "string" ? search.clienteId : undefined,
  }),
  component: Page,
  head: () => ({ meta: [{ title: "Saída para a loja · Campo Alegre" }] }),
});

function Page() {
  const { cargaId: cargaIdSearch, clienteId: clienteIdSearch } = Route.useSearch();
  const { profile, isAdmin } = useAuth();
  const motoristaDoPerfil = profile?.motorista_id ?? null;

  const { data: motoristas = [] } = useMotoristas();
  const { data: supermercados = [], isLoading: loadingLojas } = useSupermercadosDoDia();
  const confirmar = useConfirmarSaidaExpedicao();
  const vincular = useVincularClienteCarga();

  const [motoristaId, setMotoristaId] = useState<string>(motoristaDoPerfil ?? "");
  const [clienteId, setClienteId] = useState<string | null>(clienteIdSearch ?? null);
  const [ordemSel, setOrdemSel] = useState<OrdemExpedicao | null>(null);
  const [obs, setObs] = useState("");
  const [linkClienteId, setLinkClienteId] = useState<string | null>(null);

  const selectedSm = supermercados.find((s) => s.id === clienteId) ?? null;
  const isOrfao = !!selectedSm?.orfao;
  const cargaOrfaId = isOrfao ? selectedSm?.cargasOrfas[0]?.carga_id ?? null : null;

  const { data: ordens = [], isLoading: loadingOrdens } = useOrdensExpedicao({
    clienteId: isOrfao ? null : clienteId,
    status: ["separada"],
  });
  const { data: ordemOrfa } = useOrdemExpedicao(isOrfao ? cargaOrfaId : null);
  const { data: ordemFromSearch } = useOrdemExpedicao(cargaIdSearch ?? null);

  const ordensVisiveis = useMemo(() => {
    if (!isOrfao) return ordens;
    if (!ordemOrfa) return [];
    return ordemOrfa.status_ordem === "separada" ? [ordemOrfa] : [];
  }, [isOrfao, ordens, ordemOrfa]);

  useEffect(() => {
    if (clienteIdSearch) setClienteId(clienteIdSearch);
  }, [clienteIdSearch]);

  useEffect(() => {
    if (!ordemFromSearch || ordemSel) return;
    if (ordemFromSearch.status_ordem !== "separada") return;
    if (ordemFromSearch.cliente_id) setClienteId(ordemFromSearch.cliente_id);
    setOrdemSel(ordemFromSearch);
  }, [ordemFromSearch, ordemSel]);

  const { data: caixas = [] } = useCaixasDaSaida(ordemSel?.carga_id ?? null);
  const [excluidas, setExcluidas] = useState<Record<string, boolean>>({});

  const motoristaNome = motoristas.find((m) => m.id === motoristaId)?.nome ?? null;
  const clienteNome = selectedSm?.nome ?? null;
  const orfasCount = supermercados.filter((s) => s.orfao).length;

  const caixasSeparadas = useMemo(() => caixas.filter((c) => c.status === "separada"), [caixas]);
  const selecionadas = caixasSeparadas.filter((c) => !excluidas[c.id]);

  const step = !motoristaId ? 1 : !clienteId ? 2 : !ordemSel ? 3 : 4;

  const voltar = () => {
    if (ordemSel) {
      setOrdemSel(null);
      setExcluidas({});
      return;
    }
    if (clienteId) {
      setClienteId(null);
      setLinkClienteId(null);
      return;
    }
    if (motoristaId && (isAdmin || !motoristaDoPerfil)) setMotoristaId("");
  };

  const enviar = async () => {
    if (!ordemSel || !motoristaId) return;
    if (!ordemSel.cliente_id) {
      toast.error("Vincule a loja antes de confirmar a saída");
      return;
    }
    if (selecionadas.length === 0) {
      toast.error("Nenhuma caixa marcada para sair");
      return;
    }
    try {
      const res = await confirmar.mutateAsync({
        carga_id: ordemSel.carga_id,
        motorista_id: motoristaId,
        caixa_ids:
          selecionadas.length === caixasSeparadas.length ? null : selecionadas.map((c) => c.id),
        observacoes: obs.trim() || null,
      });
      toast.success("Saída confirmada · ordem em trânsito", {
        description: `${res.total_caixas} caixa(s) com ${motoristaNome ?? "o motorista"}.`,
        action: {
          label: "Ir para entrega",
          onClick: () => {
            window.location.assign(
              `/expedicao/entrega?cargaId=${ordemSel.carga_id}`,
            );
          },
        },
      });
      setOrdemSel(null);
      setExcluidas({});
      setObs("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar saída");
    }
  };

  const vincularLoja = async () => {
    if (!cargaOrfaId || !linkClienteId) {
      toast.error("Escolha o supermercado para vincular");
      return;
    }
    try {
      const res = await vincular.mutateAsync({
        carga_id: cargaOrfaId,
        cliente_id: linkClienteId,
      });
      toast.success(`Loja vinculada: ${res.cliente_nome}`);
      setClienteId(linkClienteId);
      setLinkClienteId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao vincular loja");
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto sm:max-w-3xl">
      <PageHeader
        title="Saída para a loja"
        subtitle="Conferência de expedição: motorista, supermercado e caixas que saem"
        actions={
          <Link
            to="/expedicao"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Painel
          </Link>
        }
      />

      <FluxoPassos
        steps={["Motorista", "Supermercado", "Ordem", "Confirmar"]}
        current={step}
      />

      {step > 1 && (
        <button
          type="button"
          onClick={voltar}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-navy mb-3"
        >
          <ChevronLeft size={16} /> Voltar
        </button>
      )}

      {/* 1 · motorista */}
      {step === 1 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-navy">Quem leva a carga?</h2>
          <SeletorCadastro
            tipo="motorista"
            value={motoristaId || null}
            onChange={(id) => setMotoristaId(id)}
            placeholder="Escolher motorista…"
          />
          {motoristas.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum motorista cadastrado.</p>
          )}
        </div>
      )}

      {/* 2 · supermercado da rota do dia */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Motorista: <span className="font-semibold text-navy">{motoristaNome}</span>
          </div>
          <h2 className="text-lg font-bold text-navy">Para qual supermercado?</h2>
          {orfasCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>{orfasCount} ordem(ns) sem loja</strong>
                {" — "}aparecem no topo da lista. Vincule o supermercado antes de confirmar a saída.
              </div>
            </div>
          )}
          {loadingLojas && <p className="text-sm text-muted-foreground">Carregando lojas…</p>}
          {!loadingLojas && supermercados.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma loja com ordem hoje. Importe as ordens no painel de expedição.
            </p>
          )}
          <SeletorCadastro
            tipo="cliente"
            value={clienteId}
            onChange={(id) => {
              setClienteId(id || null);
              setLinkClienteId(null);
            }}
            items={supermercados.map((sm) => ({
              id: sm.id,
              nome: sm.nome,
              cnpj: sm.cnpj,
              meta: {
                rota: sm.orfao
                  ? "sem loja · vincular"
                  : `${sm.separadas} separada(s)`,
              },
            }))}
            placeholder="Escolher supermercado…"
          />
        </div>
      )}

      {/* 3 · ordens separadas da loja (ou vínculo manual se órfã) */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {motoristaNome} · <span className="font-semibold text-navy">{clienteNome}</span>
          </div>

          {isOrfao && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex gap-2 text-sm text-amber-950">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <strong>Ordem sem supermercado</strong>
                  <p className="text-xs mt-1">
                    A importação não identificou a loja. Vincule manualmente para liberar a saída.
                    {selectedSm?.cnpj ? ` CNPJ na ordem: ${selectedSm.cnpj}` : null}
                  </p>
                </div>
              </div>
              <SeletorCadastro
                tipo="cliente"
                value={linkClienteId}
                onChange={(id) => setLinkClienteId(id || null)}
                placeholder="Vincular a supermercado…"
              />
              <Button
                size="sm"
                disabled={!linkClienteId || vincular.isPending}
                onClick={() => void vincularLoja()}
              >
                {vincular.isPending ? "Vinculando…" : "Vincular loja"}
              </Button>
            </div>
          )}

          <h2 className="text-lg font-bold text-navy">Ordens separadas</h2>
          {loadingOrdens && !isOrfao && (
            <p className="text-sm text-muted-foreground">Carregando ordens…</p>
          )}
          {!loadingOrdens && !isOrfao && ordensVisiveis.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma ordem separada para esta loja hoje. Separe a ordem em Expedição por Rota.
            </p>
          )}
          {isOrfao && ordensVisiveis.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Vincule a loja acima. Depois de vincular, se a ordem estiver separada ela aparece aqui.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2">
            {ordensVisiveis.map((o) => (
              <button
                key={o.carga_id}
                type="button"
                onClick={() => {
                  if (!o.cliente_id) {
                    toast.error("Vincule a loja antes de seguir");
                    return;
                  }
                  setOrdemSel(o);
                }}
                className="card-base p-4 text-left active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-navy tabular-nums">{o.numero_ordem}</span>
                  <span className="chip chip-warn">
                    {STATUS_ORDEM_LABEL[o.status_ordem as StatusOrdem] ?? "Em carga"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {o.caixas_separadas} caixa(s) · {Number(o.total_itens)} itens ·{" "}
                  {formatDateBRT(o.data_carga)}
                </div>
                {o.separado_por_nome && (
                  <div className="text-xs text-muted-foreground">
                    Separado por {o.separado_por_nome}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4 · conferir caixas que saem */}
      {step === 4 && ordemSel && (
        <div className="space-y-4">
          <div className="card-base p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-navy text-lg tabular-nums">
                {ordemSel.numero_ordem}
              </span>
              <span className="chip chip-info">{selecionadas.length} cx</span>
            </div>
            <div className="text-sm text-ink">{ordemSel.cliente_nome}</div>
            <div className="text-xs text-muted-foreground">
              {ordemSel.cliente_cnpj ? `CNPJ ${ordemSel.cliente_cnpj} · ` : ""}
              Motorista {motoristaNome}
            </div>
            {ordemSel.qtde_caixas_wise != null && (
              <div className="text-xs text-muted-foreground mt-1">
                Wise: {ordemSel.qtde_caixas_wise} cx · separadas: {ordemSel.caixas_separadas} cx
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-navy flex items-center gap-2">
              <Boxes size={14} /> Caixas que sobem no caminhão
            </h3>
            {caixasSeparadas.map((cx) => {
              const fora = !!excluidas[cx.id];
              return (
                <label
                  key={cx.id}
                  className={`card-base p-3 flex items-start gap-3 cursor-pointer ${fora ? "opacity-50" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={!fora}
                    onChange={() =>
                      setExcluidas((prev) => {
                        const next = { ...prev };
                        if (fora) delete next[cx.id];
                        else next[cx.id] = true;
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-navy">
                      Cx {cx.numero}
                      {cx.tipo_caixa_sigla ? ` · ${cx.tipo_caixa_sigla}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {cx.codigo_etiqueta}
                    </div>
                  </div>
                  {!fora && <Check size={16} className="text-primary shrink-0 mt-1" />}
                </label>
              );
            })}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Observações</label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          <Button
            className="w-full"
            disabled={confirmar.isPending || selecionadas.length === 0}
            onClick={() => void enviar()}
          >
            {confirmar.isPending ? "Confirmando…" : `Confirmar saída · ${selecionadas.length} cx`}
          </Button>
        </div>
      )}
    </div>
  );
}
