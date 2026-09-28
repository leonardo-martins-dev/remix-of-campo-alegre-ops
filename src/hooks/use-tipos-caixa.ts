import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TipoCaixa } from "@/lib/caixas-map";
import { sortedTipos } from "@/lib/caixas-map";
import { useAuth } from "@/lib/auth";

export type { TipoCaixa };

/**
 * Tipos de caixa. Operador: sem custo_unitario (coluna revogada).
 * Admin: RPC traz custo (NOP-159).
 */
export function useTiposCaixa(includeInactive = false) {
  const { isAdmin, canViewValoresCaixa } = useAuth();
  const loadCusto = isAdmin && canViewValoresCaixa;

  return useQuery({
    queryKey: ["tipos-caixa", includeInactive, loadCusto ? "com-custo" : "ops"],
    queryFn: async () => {
      if (loadCusto || (isAdmin && includeInactive)) {
        const { data, error } = await supabase.rpc("admin_tipos_caixa_full", {
          p_include_inactive: includeInactive,
        });
        if (error) throw error;
        return sortedTipos((data ?? []) as TipoCaixa[], includeInactive);
      }
      let q = supabase
        .from("tipos_caixa")
        .select("id, sigla, nome, ordem, ativo")
        .order("ordem");
      if (!includeInactive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []).map((r) => ({
        ...r,
        custo_unitario: 0,
      })) as TipoCaixa[];
      return sortedTipos(rows, includeInactive);
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
        .select("id, sigla, nome, ordem, ativo")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Nenhum registro atualizado");
      // custo só via RPC na leitura; merge do payload se veio
      return {
        ...data,
        custo_unitario: payload.custo_unitario ?? 0,
      } as TipoCaixa;
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
        .select("id, sigla, nome, ordem, ativo")
        .single();
      if (error) throw error;
      return { ...data, custo_unitario: payload.custo_unitario } as TipoCaixa;
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
