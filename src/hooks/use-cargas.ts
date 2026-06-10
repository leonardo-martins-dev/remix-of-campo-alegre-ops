import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

export function useCargasDia(date = todayBRT()) {
  return useQuery({
    queryKey: ["cargas", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargas")
        .select(`
          id, codigo, status, progresso, hora_inicio, hora_fim, data_carga,
          clientes(nome), motoristas(nome), caminhoes(placa), rotas(nome)
        `)
        .eq("data_carga", date)
        .order("hora_inicio", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCargaDetail(cargaId: string | null) {
  return useQuery({
    queryKey: ["carga", cargaId],
    enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargas")
        .select(`
          *,
          clientes(nome), motoristas(nome), caminhoes(placa), rotas(nome),
          romaneio_itens(id, quantidade_romaneio, quantidade_real, caixas_g, caixas_i, caixas_p, status, produtos(nome, familia_id, familias_produto(nome))),
          carga_caixas_resumo(*)
        `)
        .eq("id", cargaId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateRomaneioItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      cargaId: string;
      itemId: string;
      quantidade_real?: number;
      caixas_g?: number;
      caixas_i?: number;
      caixas_p?: number;
      status?: string;
    }) => {
      const { itemId, cargaId, ...fields } = payload;
      const { error } = await supabase.from("romaneio_itens").update(fields).eq("id", itemId);
      if (error) throw error;
      return cargaId;
    },
    onSuccess: (cargaId) => qc.invalidateQueries({ queryKey: ["carga", cargaId] }),
  });
}

export function useUpdateCargaResumo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      cargaId: string;
      real_g: number;
      real_i: number;
      real_p: number;
      sugerido_g?: number;
      sugerido_i?: number;
      sugerido_p?: number;
    }) => {
      const { cargaId, ...fields } = payload;
      const { error } = await supabase.from("carga_caixas_resumo").upsert(
        { carga_id: cargaId, ...fields, updated_at: new Date().toISOString() },
        { onConflict: "carga_id" }
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["carga", v.cargaId] }),
  });
}

export function useIniciarCarga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cargaId: string) => {
      const { error } = await supabase
        .from("cargas")
        .update({ status: "carregando", hora_inicio: new Date().toISOString(), progresso: 0 })
        .eq("id", cargaId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas"] }),
  });
}

export function useFinalizarCarga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cargaId, pedidoId }: { cargaId: string; pedidoId?: string }) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("cargas")
        .update({ status: "concluida", hora_fim: now, progresso: 100 })
        .eq("id", cargaId);
      if (error) throw error;

      await supabase.from("registros_ciclo").insert({
        carga_id: cargaId,
        hora_inicio_carga: now,
        hora_saida_caminhao: now,
        data_registro: todayBRT(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargas"] });
      qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
    },
  });
}

export function useCreateCarga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      codigo: string;
      cliente_id: string;
      motorista_id?: string;
      caminhao_id?: string;
      rota_id?: string;
      created_by: string;
      itens: { produto_id: string; quantidade_romaneio: number; caixas_g: number; caixas_i: number; caixas_p: number }[];
    }) => {
      const { itens, ...cargaFields } = payload;
      const { data: carga, error } = await supabase
        .from("cargas")
        .insert({ ...cargaFields, data_carga: todayBRT(), status: "aguardando" })
        .select()
        .single();
      if (error) throw error;

      if (itens.length) {
        const { error: rErr } = await supabase.from("romaneio_itens").insert(
          itens.map((it) => ({ carga_id: carga.id, ...it, quantidade_real: 0, status: "pendente" }))
        );
        if (rErr) throw rErr;
      }

      await supabase.from("carga_caixas_resumo").insert({ carga_id: carga.id });
      return carga;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas"] }),
  });
}

export function useImportCargasExcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      cargas: {
        codigo: string;
        cliente_id: string;
        motorista_id?: string;
        created_by: string;
        itens: {
          produto_id: string;
          quantidade_romaneio: number;
          caixas_g: number;
          caixas_i: number;
          caixas_p: number;
        }[];
      }[]
    ) => {
      for (const c of cargas) {
        const { itens, ...fields } = c;
        const { data: carga, error } = await supabase
          .from("cargas")
          .insert({
            ...fields,
            data_carga: todayBRT(),
            status: "aguardando",
            origem: "excel",
          })
          .select()
          .single();
        if (error) throw error;
        if (itens.length) {
          const { error: rErr } = await supabase.from("romaneio_itens").insert(
            itens.map((it) => ({ carga_id: carga.id, ...it, quantidade_real: 0, status: "pendente" }))
          );
          if (rErr) throw rErr;
        }
        await supabase.from("carga_caixas_resumo").insert({ carga_id: carga.id });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas"] }),
  });
}
