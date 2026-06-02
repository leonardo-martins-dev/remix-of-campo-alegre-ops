import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type TipoCaixa = { id: "G" | "I" | "P"; nome: string; custo_unitario: number };

export function useTiposCaixa() {
  return useQuery({
    queryKey: ["tipos-caixa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_caixa")
        .select("id, nome, custo_unitario")
        .order("id");
      if (error) throw error;
      return (data ?? []) as TipoCaixa[];
    },
  });
}

export function useUpdateTipoCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, custo_unitario }: { id: "G" | "I" | "P"; custo_unitario: number }) => {
      const { error } = await supabase
        .from("tipos_caixa")
        .update({ custo_unitario, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos-caixa"] }),
  });
}
