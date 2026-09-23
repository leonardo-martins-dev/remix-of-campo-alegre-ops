import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";
import type { ParadaMinhaRota } from "@/lib/minha-rota";

export type { ParadaMinhaRota } from "@/lib/minha-rota";
export {
  isParadaPendente,
  isParadaConcluida,
  resumoMinhaRota,
} from "@/lib/minha-rota";

/** Paradas do dia do motorista, ordenadas pela rota. */
export function useMinhaRota(motoristaId?: string | null) {
  return useQuery({
    queryKey: ["minha-rota", motoristaId ?? "todos", todayBRT()],
    enabled: motoristaId !== undefined,
    queryFn: async () => {
      let q = supabase
        .from("v_minha_rota_motorista")
        .select("*")
        .order("rota_ordem", { ascending: true })
        .order("saida_em", { ascending: true });
      if (motoristaId) q = q.eq("motorista_id", motoristaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ParadaMinhaRota[];
    },
  });
}
