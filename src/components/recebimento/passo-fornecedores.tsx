import { useMemo, useState } from "react";
import { Check, Truck } from "lucide-react";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { resumoSelecao } from "@/lib/conferir-chegada";

export type GrupoFornecedor = {
  fornecedorId: string;
  nome: string;
  /** todos os pedidos abertos do fornecedor hoje */
  pedidoIds: string[];
  /** os que já estão na sessão de conferência */
  pedidoIdsSelecionados: string[];
  itensTotal: number;
  emTransito: boolean;
  saidaResumo: string | null;
  codigos: string[];
};

/** Quantos cards aparecem antes de "ver todos" quando ninguém saiu da roça. */
const CARDS_INICIAIS = 6;

/**
 * NOP-328 passo 1 — fornecedores no caminhão.
 * NOP-318: sugeridos (em trânsito / já escolhidos) primeiro e busca para o
 * resto — nunca uma parede de botões com dezenas de fornecedores.
 */
export function PassoFornecedores({
  grupos,
  loading,
  onToggle,
  onSelecionarTodos,
  onLimparSelecao,
}: {
  grupos: GrupoFornecedor[];
  loading: boolean;
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

  const visiveis = verTodos
    ? grupos
    : sugeridos.length > 0
      ? sugeridos
      : grupos.slice(0, CARDS_INICIAIS);

  const ocultos = grupos.length - visiveis.length;
  const todosMarcados = grupos.length > 0 && selecionadosIds.length === grupos.length;

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

  return (
    <div className="space-y-3">
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

      {loading && <p className="text-sm text-muted-foreground">Carregando pedidos do dia…</p>}
      {!loading && grupos.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum pedido aberto hoje. Importe ou cadastre um pedido para conferir a chegada.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        {visiveis.map((g) => {
          const marcado = g.pedidoIdsSelecionados.length > 0;
          const parcial = marcado && g.pedidoIdsSelecionados.length < g.pedidoIds.length;
          return (
            <button
              key={g.fornecedorId}
              type="button"
              onClick={() => onToggle(g.fornecedorId)}
              aria-pressed={marcado}
              className={[
                "w-full text-left rounded-xl border p-3 flex gap-3 items-start transition-colors min-h-16",
                marcado
                  ? "border-primary bg-primary-soft/50 ring-2 ring-primary/20"
                  : "border-border bg-card hover:border-primary/40",
              ].join(" ")}
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
                  <span className="font-bold text-navy text-sm truncate">{g.nome}</span>
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
