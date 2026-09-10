import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

export function useContagensGalpao() {
  return useQuery({
    queryKey: ["contagens-galpao"],
    queryFn: async () => {
      const { data: galpao } = await supabase.from("posicoes_caixa").select("id").eq("tipo", "galpao").maybeSingle();
      if (!galpao) return [];
      const { data, error } = await supabase
        .from("contagens_caixa")
        .select("*, profiles:contado_por(nome), contagem_caixa_itens(*)")
        .eq("posicao_id", galpao.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((c) => {
        const itens = ((c as { contagem_caixa_itens?: { tipo_caixa: string; qtd_contada: number; qtd_calculada: number; diferenca: number }[] }).contagem_caixa_itens ?? [])
          .map((it) => ({ ...it, tipo_caixa_sigla: it.tipo_caixa }));
        return { ...c, contagem_galpao_itens: itens };
      });
    },
  });
}

export function useRegistrarContagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      contado_por: string;
      itens: { tipo_caixa_sigla: string; qtd_contada: number; qtd_calculada: number }[];
    }) => {
      const { data: galpao } = await supabase.from("posicoes_caixa").select("id").eq("tipo", "galpao").maybeSingle();
      if (!galpao) throw new Error("Posição do galpão não encontrada");
      const { data: contagem, error } = await supabase
        .from("contagens_caixa")
        .insert({
          posicao_id: galpao.id,
          origem: "interna",
          data: todayBRT(),
          contado_por: payload.contado_por,
          status: "pendente",
        })
        .select()
        .single();
      if (error) throw error;
      const { error: iErr } = await supabase.from("contagem_caixa_itens").insert(
        payload.itens.map((it) => ({
          contagem_id: contagem.id,
          tipo_caixa: it.tipo_caixa_sigla,
          qtd_contada: it.qtd_contada,
          qtd_calculada: it.qtd_calculada,
          diferenca: it.qtd_contada - it.qtd_calculada,
        }))
      );
      if (iErr) throw iErr;
      return contagem;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contagens-galpao"] });
      qc.invalidateQueries({ queryKey: ["contagens-caixa"] });
    },
  });
}

export function useResolverContagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      contagemId: string;
      acao: "conciliada" | "mantida";
      motivo?: string;
      userId: string;
      itens?: { tipo_caixa_sigla: string; diferenca: number }[];
    }) => {
      if (payload.acao === "mantida") {
        const { error } = await supabase.rpc("manter_inventario", {
          p_contagem_id: payload.contagemId,
          p_observacao: payload.motivo ?? null,
        });
        if (error) throw error;
        return;
      }
      const { data: motivos } = await supabase
        .from("motivos_ajuste_caixa")
        .select("id")
        .eq("natureza", "ajuste")
        .eq("exige_posicao_contraria", false)
        .limit(1);
      const motivoId = motivos?.[0]?.id;
      if (!motivoId) throw new Error("Cadastre um motivo de ajuste em Configurações");
      const { error } = await supabase.rpc("conciliar_inventario", {
        p_contagem_id: payload.contagemId,
        p_motivo_id: motivoId,
        p_observacao: payload.motivo ?? "Ajuste de contagem",
        p_posicao_contraria_id: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contagens-galpao"] });
      qc.invalidateQueries({ queryKey: ["contagens-caixa"] });
      qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
    },
  });
}
