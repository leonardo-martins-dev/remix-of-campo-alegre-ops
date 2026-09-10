import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

export type MotivoAjuste = {
  id: string;
  nome: string;
  sentido: string;
  natureza: string;
  entra_em_custo: boolean;
  exige_posicao_contraria: boolean;
  ativo: boolean;
};

export function useMotivosAjuste() {
  return useQuery({
    queryKey: ["motivos-ajuste-caixa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("motivos_ajuste_caixa")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as MotivoAjuste[];
    },
  });
}

export function useSaveMotivoAjuste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<MotivoAjuste> & { nome: string; sentido: string; natureza: string }) => {
      if (payload.id) {
        const { error } = await supabase.from("motivos_ajuste_caixa").update(payload).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("motivos_ajuste_caixa").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["motivos-ajuste-caixa"] }),
  });
}

export function useContagensCaixa(posicaoId?: string | null) {
  return useQuery({
    queryKey: ["contagens-caixa", posicaoId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("contagens_caixa")
        .select("*, posicoes_caixa(id, tipo, ref_id), profiles:contado_por(nome), contagem_caixa_itens(*)")
        .order("created_at", { ascending: false })
        .limit(40);
      if (posicaoId) q = q.eq("posicao_id", posicaoId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRegistrarInventario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      posicao_id: string;
      origem: "interna" | "motorista" | "fornecedor";
      contado_por: string;
      itens: { tipo_caixa: string; qtd_contada: number; qtd_calculada: number }[];
    }) => {
      const { data: contagem, error } = await supabase
        .from("contagens_caixa")
        .insert({
          posicao_id: payload.posicao_id,
          origem: payload.origem,
          data: todayBRT(),
          contado_por: payload.contado_por,
          status: "pendente",
        })
        .select()
        .single();
      if (error) throw error;
      const { error: iErr } = await supabase.from("contagem_caixa_itens").insert(
        payload.itens.map((it) => ({
          contagem_id: contagem.id,
          tipo_caixa: it.tipo_caixa,
          qtd_contada: it.qtd_contada,
          qtd_calculada: it.qtd_calculada,
          diferenca: it.qtd_contada - it.qtd_calculada,
        }))
      );
      if (iErr) throw iErr;
      return contagem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contagens-caixa"] }),
  });
}

export function useConciliarInventario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      contagemId: string;
      motivoId: string;
      observacao?: string;
      posicaoContrariaId?: string | null;
    }) => {
      const { error } = await supabase.rpc("conciliar_inventario", {
        p_contagem_id: payload.contagemId,
        p_motivo_id: payload.motivoId,
        p_observacao: payload.observacao ?? null,
        p_posicao_contraria_id: payload.posicaoContrariaId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contagens-caixa"] });
      qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
