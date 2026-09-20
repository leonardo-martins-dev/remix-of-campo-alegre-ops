import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ConteudoCaixa = {
  produto_id: string | null;
  produto: string | null;
  unidade: string | null;
  familia: string | null;
  quantidade: number;
  status: string;
};

export type RastreioCaixa = {
  caixa_id: string;
  carga_id: string;
  codigo_etiqueta: string;
  numero: number;
  total_caixas: number;
  tipo_caixa_sigla: string | null;
  caixa_status: string;
  motivo_recusa: string | null;
  separado_em: string | null;
  saida_em: string | null;
  entregue_em: string | null;
  ordem_codigo: string;
  numero_ordem: string;
  data_carga: string;
  status_ordem: string;
  cliente_id: string;
  cliente_nome: string;
  cliente_cnpj: string | null;
  separado_por_nome: string | null;
  conferido_por_nome: string | null;
  entregue_por_nome: string | null;
  recebedor_nome: string | null;
  conferido_em: string | null;
  ordem_entregue_em: string | null;
  motorista_nome: string | null;
  conteudo: ConteudoCaixa[] | null;
};

/**
 * Busca por ordem (130572), etiqueta de caixa (130572 · 2/4) ou supermercado.
 * Sem busca, mostra as caixas mais recentes.
 */
export function useRastreio(busca: string) {
  const termo = busca.trim();
  return useQuery({
    queryKey: ["rastreio-caixa", termo],
    queryFn: async () => {
      let q = supabase.from("v_rastreio_caixa").select("*");
      if (termo) {
        // Aspas: a etiqueta tem espaços e "·", que separam filtros no PostgREST.
        const like = `"%${termo.replace(/[%,()"]/g, "")}%"`;
        q = q.or(
          `codigo_etiqueta.ilike.${like},numero_ordem.ilike.${like},ordem_codigo.ilike.${like},cliente_nome.ilike.${like}`,
        );
      }
      const { data, error } = await q
        .order("data_carga", { ascending: false })
        .order("numero", { ascending: true })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as RastreioCaixa[];
    },
  });
}
