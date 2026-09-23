/**
 * NOP-328 — a tela de chegada trata 1 ou N pedidos com a mesma casca de 3
 * passos, então os dados por pedido são carregados em paralelo (useQueries).
 * As chaves de cache são as mesmas dos hooks de pedido único — as mutações
 * continuam invalidando ["conferencia", pedidoId] e afins sem mudança.
 */
import { useQueries } from "@tanstack/react-query";
import { fetchConferencia } from "@/hooks/use-conferencia";
import { fetchSaldoItensPedido } from "@/hooks/use-pedidos";
import { fetchCaixasItemConferencia } from "@/hooks/use-caixas-item";
import { fetchSaidaRocaPedido } from "@/hooks/use-saida-roca";
import { resolverSugestoes } from "@/hooks/use-sugestao-caixas";

/** Conferência (aberta ou última) de cada pedido — alinhado por índice. */
export function useConferenciasPorPedido(pedidoIds: string[]) {
  return useQueries({
    queries: pedidoIds.map((id) => ({
      queryKey: ["conferencia", id],
      queryFn: () => fetchConferencia(id),
      enabled: !!id,
    })),
  });
}

/** Saldo por item (entregas anteriores) de cada pedido. */
export function useSaldosPorPedido(pedidoIds: string[]) {
  return useQueries({
    queries: pedidoIds.map((id) => ({
      queryKey: ["saldo-itens", id],
      queryFn: () => fetchSaldoItensPedido(id),
      enabled: !!id,
    })),
  });
}

/** Caixas já gravadas por item, por conferência. */
export function useCaixasItemPorConferencia(conferenciaIds: (string | null)[]) {
  return useQueries({
    queries: conferenciaIds.map((id) => ({
      queryKey: ["caixas-item-conferencia", id],
      queryFn: () => fetchCaixasItemConferencia(id!),
      enabled: !!id,
    })),
  });
}

export type SaidaRocaArg = {
  pedidoId: string;
  conferenciaId: string | null;
  conferenciaNumero: number | null;
};

/** NOP-129 — saída na roça da entrega atual de cada pedido (prefill das caixas). */
export function useSaidasRocaPorPedido(args: SaidaRocaArg[]) {
  return useQueries({
    queries: args.map((a) => ({
      queryKey: ["saida-roca-pedido", a.pedidoId, a.conferenciaId, a.conferenciaNumero],
      queryFn: () => fetchSaidaRocaPedido(a.pedidoId, a.conferenciaId, a.conferenciaNumero),
      enabled: !!a.pedidoId,
    })),
  });
}

export type SugestaoArg = {
  pedidoId: string;
  fornecedorId: string | null;
  itens: { produto_id: string | null | undefined; quantidade: number }[];
};

/** Sugestão de caixas (fator real do cadastro) por pedido. */
export function useSugestoesPorPedido(args: SugestaoArg[]) {
  return useQueries({
    queries: args.map((a) => {
      const itens = a.itens
        .filter(
          (i): i is { produto_id: string; quantidade: number } =>
            !!i.produto_id && i.quantidade > 0,
        )
        .map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade }));
      const itemsKey = itens.map((i) => `${i.produto_id}:${i.quantidade}`).join("|");
      return {
        queryKey: ["sugestao-caixas", a.fornecedorId, itemsKey],
        queryFn: () => resolverSugestoes(a.fornecedorId!, itens),
        enabled: !!a.fornecedorId && itens.length > 0,
        staleTime: 30000,
      };
    }),
  });
}
