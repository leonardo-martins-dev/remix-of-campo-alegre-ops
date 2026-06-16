import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

export type WiseCarregamento = {
  id: string;
  codigo: string;
  cliente: string;
  cliente_id?: string;
  motorista?: string;
  itens: { produto: string; produto_id?: string; quantidade: number }[];
};

export function useWiseCarregamentos(date = todayBRT()) {
  return useMutation({
    mutationFn: async (rows?: Record<string, unknown>[]): Promise<WiseCarregamento[]> => {
      const { data, error } = await supabase.functions.invoke("sync-wise-cargas", {
        body: rows?.length ? { data, rows } : { data },
      });
      if (error) throw error;
      return (data?.carregamentos ?? []) as WiseCarregamento[];
    },
  });
}

export function useImportWiseCarregamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      carregamento: WiseCarregamento;
      created_by: string;
      maps: { clienteByName: Map<string, string>; produtoByName: Map<string, string> };
    }) => {
      const { carregamento, created_by, maps } = payload;
      const cliente_id =
        carregamento.cliente_id ?? maps.clienteByName.get(carregamento.cliente);
      if (!cliente_id) throw new Error(`Cliente não encontrado: ${carregamento.cliente}`);

      const { data: carga, error } = await supabase
        .from("cargas")
        .insert({
          codigo: carregamento.codigo,
          cliente_id,
          data_carga: todayBRT(),
          status: "aguardando",
          origem: "wisetec",
          wise_carregamento_id: carregamento.id,
          created_by,
        })
        .select()
        .single();
      if (error) throw error;

      const itens = carregamento.itens
        .map((it) => {
          const produto_id = it.produto_id ?? maps.produtoByName.get(it.produto);
          if (!produto_id) return null;
          return {
            carga_id: carga.id,
            produto_id,
            quantidade_romaneio: it.quantidade,
            quantidade_real: 0,
            status: "pendente",
          };
        })
        .filter(Boolean);

      if (itens.length) {
        const { error: rErr } = await supabase.from("romaneio_itens").insert(itens);
        if (rErr) throw rErr;
      }

      await supabase.from("carga_caixas_resumo").insert({ carga_id: carga.id });
      return carga;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas"] }),
  });
}
