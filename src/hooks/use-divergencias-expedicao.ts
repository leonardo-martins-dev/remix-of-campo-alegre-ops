import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type DivergenciaExpedicao = {
  carga_id: string;
  numero_ordem: string;
  cliente_nome: string;
  status_ordem: string;
  romaneio_conferido_em: string | null;
  romaneio_conferido_por_nome: string | null;
  caixas_romaneio_real: number;
  caixas_separadas: number;
  caixas_saida: number;
  caixas_entregues: number;
  caixas_recusadas: number;
  divergencia_separacao_saida: number;
  divergencia_saida_entrega: number;
  separado_em: string | null;
  saida_conferida_em: string | null;
  saida_conferida_por_nome: string | null;
  entregue_em: string | null;
};

export function useDivergenciasExpedicao(busca: string) {
  const termo = busca.trim();
  return useQuery({
    queryKey: ["divergencias-expedicao", termo],
    queryFn: async () => {
      let q = supabase.from("v_divergencias_expedicao").select("*").limit(40);
      if (termo) {
        const like = `%${termo.replace(/[%,()]/g, "")}%`;
        q = q.or(`numero_ordem.ilike.${like},cliente_nome.ilike.${like}`);
      }
      const { data, error } = await q.order("data_carga", { ascending: false });
      if (error) {
        if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "")) {
          return [] as DivergenciaExpedicao[];
        }
        throw error;
      }
      return (data ?? []) as DivergenciaExpedicao[];
    },
  });
}
