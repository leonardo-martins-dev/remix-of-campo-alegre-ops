import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

export type CoberturaDia = {
  produto_id: string;
  produto: string;
  codigo: string | null;
  recebido_hoje: number;
  a_expedir_hoje: number;
  saldo_cobertura: number;
};

export function useCoberturaDia() {
  const date = todayBRT();
  return useQuery({
    queryKey: ["cobertura-dia", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_cobertura_dia_produto")
        .select("*")
        .order("saldo_cobertura", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CoberturaDia[];
    },
  });
}
