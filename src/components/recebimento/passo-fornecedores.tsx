import { useMemo, useState } from "react";
import { AlertTriangle, Check, Truck } from "lucide-react";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { avisosCorDuplicadaNaSelecao, resumoSelecao } from "@/lib/conferir-chegada";
import { FornecedorCorBadge } from "@/components/fornecedor-cor-badge";
import { fornecedorCorDef } from "@/lib/fornecedor-cores";
import { labelJanela, type JanelaPedidos } from "@/lib/pedidos-abertos";

export type GrupoFornecedor = {
  fornecedorId: string;
  nome: string;
  /** NOP-360 — cor da paleta (null = legado) */
  cor: string | null;
  /** todos os pedidos abertos do fornecedor (janela atual) */
  pedidoIds: string[];
  /** os que já estão na sessão de conferência */
  pedidoIdsSelecionados: string[];
  itensTotal: number;
  emTransito: boolean;
  saidaResumo: string | null;
  codigos: string[];
  /** NOP-457 — datas operacionais (dd/MM/yyyy), mais antiga → mais recente */
  datas: string[];
};

/** Quantos cards aparecem antes de "ver todos" quando ninguém saiu da roça. */
const CARDS_INICIAIS = 6;

const JANELAS: JanelaPedidos[] = ["todos", "30d", "7d", "hoje"];

/**
 * NOP-328 passo 1 — fornecedores no caminhão.
 * NOP-318: sugeridos (em trânsito / já escolhidos) primeiro e busca para o
 * resto — nunca uma parede de botões com dezenas de fornecedores.
 * NOP-457: lista pendentes de qualquer data; filtro de janela visível.
 */
export function PassoFornecedores({
  grupos,
  loading,
  janela,
  onJanelaChange,
  totalAbertos,
  onToggle,
  onSelecionarTodos,
  onLimparSelecao,
}: {
  grupos: GrupoFornecedor[];
  loading: boolean;
  janela: JanelaPedidos;
  onJanelaChange: (j: JanelaPedidos) => void;
  totalAbertos: number;
  onToggle: (fornecedorId: string) => void;
  onSelecionarTodos: () => void;
  onLimparSelecao: () => void;
}) {
  const [verTodos, setVerTodos] = useState(false);

  const selecionadosIds = useMemo(
    () => grupos.filter((g) => g.pedidoIdsSelecionados.length > 0).map((g) => g.fornecedorId),
    [grupos],
  );

  const sugeridos = useMemo(
    () => grupos.filter((g) => g.emTransito || g.pedidoIdsSelecionados.length > 0),
    [grupos],
  );

  // NOP-463: dois fornecedores na mesma cor no caminhão — avisa antes de descarregar.
  const avisosCor = useMemo(
    () =>
      avisosCorDuplicadaNaSelecao(
        grupos
          .filter((g) => g.pedidoIdsSelecionados.length > 0)
          .map((g) => ({ fornecedorId: g.fornecedorId, nome: g.nome, cor: g.cor })),
      ),
    [grupos],
  );

  const visiveis = verTodos
    ? grupos
    : sugeridos.length > 0
      ? sugeridos
      : grupos.slice(0, CARDS_INICIAIS);

  const ocultos = grupos.length - visiveis.length;
  const todosMarcados = grupos.length > 0 && selecionadosIds.length === grupos.length;
  const foraDaJanela = Math.max(0, totalAbertos - grupos.reduce((n, g) => n + g.pedidoIds.length, 0));

  const itensSeletor = useMemo(
    () => grupos.map((g) => ({ id: g.fornecedorId, nome: g.nome, codigo: g.codigos[0] })),
    [grupos],
  );

  const onSeletor = (ids: string[]) => {
    const alvo = new Set(ids);
    for (const g of grupos) {
      const marcado = g.pedidoIdsSelecionados.length > 0;
      if (alvo.has(g.fornecedorId) !== marcado) onToggle(g.fornecedorId);
    }
  };

  const labelDatas = (datas: string[]) => {
    if (datas.length === 0) return null;
    if (datas.length === 1) return datas[0];
    return `${datas[0]} → ${datas[datas.length - 1]}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Janela de pedidos">
        {JANELAS.map((j) => (
          <button
            key={j}
            type="button"
            onClick={() => onJanelaChange(j)}
            className={[
              "px-2.5 min-h-9 rounded-md text-xs font-semibold whitespace-nowrap transition-colors",
              janela === j
                ? "bg-primary-soft text-primary-dark"
                : "text-muted-foreground hover:bg-secondary",
            ].join(" ")}
          >
            {labelJanela(j)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-navy tabular-nums">
          {resumoSelecao(selecionadosIds.length, grupos.length)}
        </span>
        <button
          type="button"
          onClick={todosMarcados ? onLimparSelecao : onSelecionarTodos}
          disabled={grupos.length === 0}
          className="text-sm font-semibold text-primary-dark hover:underline min-h-9 disabled:opacity-50"
        >
          {todosMarcados ? "Limpar seleção" : "Selecionar todos"}
        </button>
      </div>

      {avisosCor.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-warning/50 bg-warning/10 p-3 space-y-1"
        >
          <p className="text-sm font-bold text-navy flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-warning" />
            Cor repetida entre fornecedores selecionados
          </p>
          <ul className="text-xs text-navy/80 space-y-0.5">
            {avisosCor.map((a) => (
              <li key={a.cor}>{a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      {grupos.length > CARDS_INICIAIS && (
        <SeletorCadastro
          tipo="fornecedor"
          label="Buscar fornecedor"
          multiple
          items={itensSeletor}
          values={selecionadosIds}
          onChangeMultiple={(ids) => onSeletor(ids)}
          placeholder="Buscar fornecedor…"
        />
      )}

      {loading && <p className="text-sm text-muted-foreground">Carregando pedidos pendentes…</p>}
      {!loading && grupos.length === 0 && totalAbertos === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum pedido pendente. Importe ou cadastre um pedido para conferir a chegada.
        </p>
      )}
      {!loading && grupos.length === 0 && totalAbertos > 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum pedido em &quot;{labelJanela(janela)}&quot;. Há {totalAbertos} pendente
          {totalAbertos === 1 ? "" : "s"} fora desta janela — amplie o filtro.
        </p>
      )}
      {!loading && grupos.length > 0 && foraDaJanela > 0 && (
        <p className="text-xs text-muted-foreground">
          {foraDaJanela} pedido{foraDaJanela === 1 ? "" : "s"} pendente
          {foraDaJanela === 1 ? "" : "s"} fora de &quot;{labelJanela(janela)}&quot;.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {visiveis.map((g) => {
          const marcado = g.pedidoIdsSelecionados.length > 0;
          const parcial = marcado && g.pedidoIdsSelecionados.length < g.pedidoIds.length;
          const corDef = fornecedorCorDef(g.cor);
          const datasLabel = labelDatas(g.datas);
          return (
            <button
              key={g.fornecedorId}
              type="button"
              onClick={() => onToggle(g.fornecedorId)}
              aria-pressed={marcado}
              className={[
                "w-full text-left rounded-xl border p-3 flex gap-3 items-start transition-colors min-h-16 overflow-hidden",
                marcado
                  ? "border-primary bg-primary-soft/50 ring-2 ring-primary/20"
                  : "border-border bg-card hover:border-primary/40",
              ].join(" ")}
              style={
                corDef
                  ? { boxShadow: `inset 6px 0 0 0 ${corDef.hex}` }
                  : undefined
              }
            >
              <span
                className={[
                  "mt-0.5 h-6 w-6 shrink-0 rounded-md border-2 flex items-center justify-center",
                  marcado
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card",
                ].join(" ")}
                aria-hidden
              >
                {marcado && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-bold text-navy text-sm truncate block">{g.nome}</span>
                    <FornecedorCorBadge cor={g.cor} size="sm" className="mt-0.5" />
                  </span>
                  {g.emTransito && (
                    <span className="chip chip-info shrink-0">
                      <Truck size={10} /> Em trânsito
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  {g.itensTotal} {g.itensTotal === 1 ? "item" : "itens"} no pedido
                  {g.pedidoIds.length > 1 ? ` · ${g.pedidoIds.length} pedidos` : ""}
                  {parcial ? ` · ${g.pedidoIdsSelecionados.length} na conferência` : ""}
                </span>
                {datasLabel && (
                  <span className="block text-xs font-semibold text-navy/80 mt-0.5 tabular-nums">
                    {datasLabel}
                  </span>
                )}
                {g.saidaResumo && (
                  <span className="block text-xs text-primary-dark font-semibold mt-1">
                    {g.saidaResumo}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {(ocultos > 0 || verTodos) && (
        <button
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          className="text-sm font-semibold text-primary-dark hover:underline min-h-9"
        >
          {verTodos
            ? "Mostrar só os do caminhão"
            : `Ver todos os fornecedores (${grupos.length})`}
        </button>
      )}
    </div>
  );
}
