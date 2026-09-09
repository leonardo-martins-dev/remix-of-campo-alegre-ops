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
      const { data: result, error } = await supabase.functions.invoke("sync-wise-cargas", {
        body: rows?.length ? { rows } : {},
      });
      if (error) throw error;
      return (result?.carregamentos ?? []) as WiseCarregamento[];
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

      const { data: existing } = await supabase
        .from("cargas")
        .select("id")
        .eq("wise_carregamento_id", carregamento.id)
        .maybeSingle();

      let carga = existing as { id: string } | null;
      if (!carga) {
        const { data: created, error } = await supabase
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
        if (!created) throw new Error("Falha ao persistir carga Wise");
        carga = created;
        await supabase.from("carga_caixas_resumo").insert({ carga_id: created.id });
      } else {
        await supabase
          .from("cargas")
          .update({ codigo: carregamento.codigo, cliente_id, data_carga: todayBRT() })
          .eq("id", carga.id);
      }

      if (!carga) throw new Error("Falha ao persistir carga Wise");

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
        .filter((it): it is NonNullable<typeof it> => !!it);

      if (itens.length) {
        for (const it of itens) {
          const { data: rom } = await supabase
            .from("romaneio_itens")
            .select("id")
            .eq("carga_id", carga.id)
            .eq("produto_id", it.produto_id)
            .maybeSingle();
          if (rom) {
            const { error: uErr } = await supabase
              .from("romaneio_itens")
              .update({ quantidade_romaneio: it.quantidade_romaneio })
              .eq("id", rom.id);
            if (uErr) throw uErr;
          } else {
            const { error: rErr } = await supabase.from("romaneio_itens").insert(it);
            if (rErr) throw rErr;
          }
        }
      }
      return carga;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas"] }),
  });
}
