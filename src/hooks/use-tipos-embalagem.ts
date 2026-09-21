import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type TipoEmbalagem = {
  id: string;
  nome: string;
  unidade_contagem: string;
  qty_por_pacote: number | null;
  ativo: boolean;
};

/** Unidades sugeridas — o campo é livre, aceita variações do galpão. */
export const UNIDADES_CONTAGEM = ["unidade", "pacote", "rolo", "caixa fechada"];

/** Quantidade por pacote só faz sentido quando a contagem é por embalagem fechada. */
export function usaQtyPorPacote(unidade: string) {
  const u = unidade.trim().toLowerCase();
  return u.includes("pacote") || u.includes("caixa") || u.includes("fardo");
}

export function useTiposEmbalagem(includeInactive = false) {
  return useQuery({
    queryKey: ["tipos-embalagem", includeInactive],
    queryFn: async () => {
      let q = supabase
        .from("tipos_embalagem")
        .select("id, nome, unidade_contagem, qty_por_pacote, ativo")
        .order("nome");
      if (!includeInactive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TipoEmbalagem[];
    },
  });
}

export function useCreateTipoEmbalagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      nome: string;
      unidade_contagem: string;
      qty_por_pacote: number | null;
    }) => {
      const { data, error } = await supabase
        .from("tipos_embalagem")
        .insert({
          nome: payload.nome.trim(),
          unidade_contagem: payload.unidade_contagem.trim(),
          qty_por_pacote: payload.qty_por_pacote,
          ativo: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TipoEmbalagem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos-embalagem"] }),
  });
}

export function useUpdateTipoEmbalagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      nome?: string;
      unidade_contagem?: string;
      qty_por_pacote?: number | null;
      ativo?: boolean;
    }) => {
      const { id, ...fields } = payload;
      const { data, error } = await supabase
        .from("tipos_embalagem")
        .update(fields)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      if (!data) throw new Error("Nenhum registro atualizado");
      return data as TipoEmbalagem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos-embalagem"] }),
  });
}

export function useDeleteTipoEmbalagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tipos_embalagem").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos-embalagem"] }),
  });
}
