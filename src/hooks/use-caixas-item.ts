import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type CaixaItemConferencia = {
  id: string;
  item_conferencia_id: string;
  tipo_caixa_id: string;
  tipo_caixa_sigla: string;
  qtd_sugerida: number;
  qtd_real: number;
  fator_usado: number | null;
  registrado_por: string | null;
};

export type CaixasItemMap = Map<
  string,
  { tipo_caixa_id: string; sigla: string; sugerida: number; real: number; fator: number | null }[]
>;

export function useCaixasItemConferencia(conferenciaId: string | null | undefined) {
  return useQuery({
    queryKey: ["caixas-item-conferencia", conferenciaId],
    enabled: !!conferenciaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixas_item_conferencia")
        .select(
          `
          id,
          item_conferencia_id,
          tipo_caixa_id,
          tipo_caixa_sigla,
          qtd_sugerida,
          qtd_real,
          fator_usado,
          registrado_por
        `,
        )
        .in(
          "item_conferencia_id",
          (
            await supabase
              .from("itens_conferencia")
              .select("id")
              .eq("conferencia_id", conferenciaId!)
          ).data?.map((i) => i.id) ?? [],
        );

      if (error) throw error;

      const map: CaixasItemMap = new Map();
      for (const row of data ?? []) {
        const existing = map.get(row.item_conferencia_id) ?? [];
        existing.push({
          tipo_caixa_id: row.tipo_caixa_id,
          sigla: row.tipo_caixa_sigla,
          sugerida: row.qtd_sugerida,
          real: row.qtd_real,
          fator: row.fator_usado,
        });
        map.set(row.item_conferencia_id, existing);
      }
      return map;
    },
  });
}

export type SaveCaixasItemPayload = {
  item_conferencia_id: string;
  caixas: {
    tipo_caixa_id: string;
    tipo_caixa_sigla: string;
    qtd_sugerida: number;
    qtd_real: number;
    fator_usado: number | null;
  }[];
  registrado_por: string;
};

export function useSaveCaixasItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveCaixasItemPayload) => {
      await supabase
        .from("caixas_item_conferencia")
        .delete()
        .eq("item_conferencia_id", payload.item_conferencia_id);

      const rows = payload.caixas
        .filter((c) => c.qtd_sugerida > 0 || c.qtd_real > 0)
        .map((c) => ({
          item_conferencia_id: payload.item_conferencia_id,
          tipo_caixa_id: c.tipo_caixa_id,
          tipo_caixa_sigla: c.tipo_caixa_sigla,
          qtd_sugerida: c.qtd_sugerida,
          qtd_real: c.qtd_real,
          fator_usado: c.fator_usado,
          registrado_por: payload.registrado_por,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from("caixas_item_conferencia").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caixas-item-conferencia"] });
    },
  });
}

export function useSaveBulkCaixasItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payloads: SaveCaixasItemPayload[]) => {
      const itemIds = payloads.map((p) => p.item_conferencia_id);

      await supabase.from("caixas_item_conferencia").delete().in("item_conferencia_id", itemIds);

      const rows = payloads.flatMap((payload) =>
        payload.caixas
          .filter((c) => c.qtd_sugerida > 0 || c.qtd_real > 0)
          .map((c) => ({
            item_conferencia_id: payload.item_conferencia_id,
            tipo_caixa_id: c.tipo_caixa_id,
            tipo_caixa_sigla: c.tipo_caixa_sigla,
            qtd_sugerida: c.qtd_sugerida,
            qtd_real: c.qtd_real,
            fator_usado: c.fator_usado,
            registrado_por: payload.registrado_por,
          })),
      );

      if (rows.length > 0) {
        const { error } = await supabase.from("caixas_item_conferencia").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caixas-item-conferencia"] });
    },
  });
}

export type FatorRealItem = {
  item_conferencia_id: string;
  conferencia_id: string;
  pedido_id: string;
  produto_id: string | null;
  produto_nome: string | null;
  quantidade_recebida: number;
  total_caixas_reais: number;
  fator_real: number | null;
  detalhes_caixas:
    | {
        tipo_caixa_sigla: string;
        qtd_sugerida: number;
        qtd_real: number;
        fator_usado: number | null;
      }[]
    | null;
};

export function useFatorRealPorPedido(pedidoId: string | null | undefined) {
  return useQuery({
    queryKey: ["fator-real", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_fator_real_item")
        .select("*")
        .eq("pedido_id", pedidoId!);
      if (error) throw error;
      return (data ?? []) as FatorRealItem[];
    },
  });
}
