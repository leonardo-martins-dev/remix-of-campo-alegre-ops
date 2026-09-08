import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TipoCaixa } from "@/lib/caixas-map";
import { sortedTipos } from "@/lib/caixas-map";

export type { TipoCaixa };

export function useTiposCaixa(includeInactive = false) {
  return useQuery({
    queryKey: ["tipos-caixa", includeInactive],
    queryFn: async () => {
      let q = supabase
        .from("tipos_caixa")
        .select("id, sigla, nome, custo_unitario, ordem, ativo")
        .order("ordem");
      if (!includeInactive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return sortedTipos((data ?? []) as TipoCaixa[], includeInactive);
    },
  });
}

export function useUpdateTipoCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      custo_unitario?: number;
      nome?: string;
      sigla?: string;
      ordem?: number;
      ativo?: boolean;
    }) => {
      const { id, ...fields } = payload;
      const { data, error } = await supabase
        .from("tipos_caixa")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error("Nenhum registro atualizado");
      return data as TipoCaixa;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos-caixa"] }),
  });
}

export function useCreateTipoCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { nome: string; sigla: string; custo_unitario: number; ordem?: number }) => {
      const { data, error } = await supabase
        .from("tipos_caixa")
        .insert({
          nome: payload.nome.trim(),
          sigla: payload.sigla.trim().toUpperCase(),
          custo_unitario: payload.custo_unitario,
          ordem: payload.ordem ?? 99,
          ativo: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TipoCaixa;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos-caixa"] }),
  });
}

export function useDeleteTipoCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tipos_caixa").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos-caixa"] }),
  });
}
