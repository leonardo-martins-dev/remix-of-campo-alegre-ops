import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

export function useContagensGalpao() {
  return useQuery({
    queryKey: ["contagens-galpao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contagens_galpao")
        .select("*, profiles:contado_por(nome), contagem_galpao_itens(*)")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
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
      const { data: contagem, error } = await supabase
        .from("contagens_galpao")
        .insert({ data: todayBRT(), contado_por: payload.contado_por, status: "pendente" })
        .select()
        .single();
      if (error) throw error;
      const { error: iErr } = await supabase.from("contagem_galpao_itens").insert(
        payload.itens.map((it) => ({
          contagem_id: contagem.id,
          tipo_caixa_sigla: it.tipo_caixa_sigla,
          qtd_contada: it.qtd_contada,
          qtd_calculada: it.qtd_calculada,
          diferenca: it.qtd_contada - it.qtd_calculada,
        }))
      );
      if (iErr) throw iErr;
      return contagem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contagens-galpao"] }),
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
      if (payload.acao === "conciliada" && payload.itens) {
        const { data: galpao } = await supabase.from("posicoes_caixa").select("id").eq("tipo", "galpao").maybeSingle();
        if (!galpao) throw new Error("Posição do galpão não encontrada");
        for (const it of payload.itens) {
          if (!it.diferenca) continue;
          const dest = it.diferenca > 0 ? galpao.id : null;
          const orig = it.diferenca < 0 ? galpao.id : null;
          await supabase.from("movimentacoes_caixa").insert({
            tipo: "ajuste",
            natureza: "ajuste",
            tipo_caixa: it.tipo_caixa_sigla,
            quantidade: Math.abs(it.diferenca),
            destino_posicao_id: dest,
            origem_posicao_id: orig,
            registrado_por: payload.userId,
            observacoes: payload.motivo ?? "Ajuste de contagem",
            data_movimento: todayBRT(),
            documento_tipo: "contagem",
            documento_id: payload.contagemId,
            confirmacao_status: "nao_aplicavel",
          });
        }
      }
      const { error } = await supabase
        .from("contagens_galpao")
        .update({ status: payload.acao, observacao: payload.motivo ?? null })
        .eq("id", payload.contagemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contagens-galpao"] });
      qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
    },
  });
}
