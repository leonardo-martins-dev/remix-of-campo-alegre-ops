import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Boxes, Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
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
} from "@/hooks/use-saida-expedicao";
import { useOrdensExpedicao, type OrdemExpedicao } from "@/hooks/use-ordem-expedicao";

export const Route = createFileRoute("/expedicao/saida")({
  component: Page,
  head: () => ({ meta: [{ title: "Saída para a loja · Campo Alegre" }] }),
});

function Page() {
  const { profile, isAdmin } = useAuth();
  const motoristaDoPerfil = profile?.motorista_id ?? null;

  const { data: motoristas = [] } = useMotoristas();
  const { data: supermercados = [], isLoading: loadingLojas } = useSupermercadosDoDia();
  const confirmar = useConfirmarSaidaExpedicao();

  const [motoristaId, setMotoristaId] = useState<string>(motoristaDoPerfil ?? "");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [ordemSel, setOrdemSel] = useState<OrdemExpedicao | null>(null);
  const [obs, setObs] = useState("");

  const { data: ordens = [], isLoading: loadingOrdens } = useOrdensExpedicao({
    clienteId,
    status: ["separada"],
  });
  const { data: caixas = [] } = useCaixasDaSaida(ordemSel?.carga_id ?? null);
  const [excluidas, setExcluidas] = useState<Record<string, boolean>>({});

  const motoristaNome = motoristas.find((m) => m.id === motoristaId)?.nome ?? null;
  const clienteNome = supermercados.find((s) => s.id === clienteId)?.nome ?? null;

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
      return;
    }
    if (motoristaId && (isAdmin || !motoristaDoPerfil)) setMotoristaId("");
  };

  const enviar = async () => {
    if (!ordemSel || !motoristaId) return;
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
      });
      setOrdemSel(null);
      setExcluidas({});
      setObs("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar saída");
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

      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
        {["Motorista", "Supermercado", "Ordem", "Confirmar"].map((label, i) => (
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
          {loadingLojas && <p className="text-sm text-muted-foreground">Carregando lojas…</p>}
          {!loadingLojas && supermercados.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma loja com ordem hoje. Importe as ordens no painel de expedição.
            </p>
          )}
          <SeletorCadastro
            tipo="cliente"
            value={clienteId}
            onChange={(id) => setClienteId(id || null)}
            items={supermercados.map((sm) => ({
              id: sm.id,
              nome: sm.nome,
              cnpj: sm.cnpj,
              meta: { rota: `${sm.separadas} separada(s)` },
            }))}
            placeholder="Escolher supermercado…"
          />
        </div>
      )}

      {/* 3 · ordens separadas da loja */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {motoristaNome} · <span className="font-semibold text-navy">{clienteNome}</span>
          </div>
          <h2 className="text-lg font-bold text-navy">Ordens separadas</h2>
          {loadingOrdens && <p className="text-sm text-muted-foreground">Carregando ordens…</p>}
          {!loadingOrdens && ordens.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma ordem separada para esta loja hoje. Separe a ordem em Expedição por Rota.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2">
            {ordens.map((o) => (
              <button
                key={o.carga_id}
                type="button"
                onClick={() => setOrdemSel(o)}
                className="card-base p-4 text-left active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-navy tabular-nums">{o.numero_ordem}</span>
                  <span className="chip chip-warn">Separada</span>
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
                    onChange={(e) =>
                      setExcluidas((prev) => ({ ...prev, [cx.id]: !e.target.checked }))
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-navy tabular-nums">
                      {cx.codigo_etiqueta}
                      {cx.tipo_caixa_sigla ? (
                        <span className="chip chip-muted ml-2">{cx.tipo_caixa_sigla}</span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {(cx.itens_caixa_ordem ?? [])
                        .map((i) => {
                          const prod = Array.isArray(i.produtos) ? i.produtos[0] : i.produtos;
                          return `${Number(i.quantidade)} ${prod?.nome ?? "produto"}`;
                        })
                        .join(" · ") || "Caixa vazia"}
                    </span>
                  </span>
                </label>
              );
            })}
            {caixasSeparadas.length === 0 && (
              <p className="text-sm text-muted-foreground">Esta ordem não tem caixas separadas.</p>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Observação (opcional)
            </div>
            <Input
              className="h-11"
              placeholder="Alguma observação da saída…"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>

          <Button
            className="w-full min-h-12"
            disabled={confirmar.isPending || selecionadas.length === 0}
            onClick={enviar}
          >
            <Check size={16} /> Confirmar saída · {selecionadas.length} cx
          </Button>
        </div>
      )}
    </div>
  );
}
