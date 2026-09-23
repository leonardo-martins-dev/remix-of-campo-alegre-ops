import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CorEmUsoInfo } from "@/components/fornecedor-cor-picker";

export function useCoresEmUsoFornecedor(fornecedorId: string | null) {
  return useQuery({
    queryKey: ["fornecedor-cores-em-uso", fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async (): Promise<CorEmUsoInfo[]> => {
      const { data, error } = await supabase.rpc("cores_em_uso_fornecedor", {
        p_fornecedor_id: fornecedorId!,
      });
      if (error) throw error;
      return (data ?? []) as CorEmUsoInfo[];
    },
  });
}
