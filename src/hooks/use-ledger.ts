import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";
import type { CaixasMap } from "@/lib/caixas-map";

export function useSaldosCaixa() {
  return useQuery({
    queryKey: ["saldos-caixa"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_saldos_caixa").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMovimentacoesPosicao(posicaoId: string | null) {
  return useQuery({
    queryKey: ["movimentacoes-posicao", posicaoId],
    enabled: !!posicaoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_caixa")
        .select("*")
        .or(`origem_posicao_id.eq.${posicaoId},destino_posicao_id.eq.${posicaoId}`)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePosicoes() {
  return useQuery({
    queryKey: ["posicoes-caixa"],
    queryFn: async () => {
      const { data, error } = await supabase.from("posicoes_caixa").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRegistrarMovimentoFornecedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      fornecedor_id: string;
      tipo_caixa: string;
      quantidade: number;
      natureza: "entrega_vazias" | "recebimento_cheias" | "retorno";
      registrado_por: string;
      observacoes?: string;
      conferencia_id?: string;
    }) => {
      let { data: galpao } = await supabase.from("posicoes_caixa").select("id").eq("tipo", "galpao").maybeSingle();
      if (!galpao) {
        const { data: createdGalpao, error: galpaoErr } = await supabase
          .from("posicoes_caixa")
          .insert({ tipo: "galpao" })
          .select("id")
          .single();
        if (galpaoErr) throw galpaoErr;
        galpao = createdGalpao;
      }
      let { data: forn } = await supabase
        .from("posicoes_caixa")
        .select("id")
        .eq("tipo", "fornecedor")
        .eq("ref_id", payload.fornecedor_id)
        .maybeSingle();
      if (!forn) {
        const { data: created } = await supabase
          .from("posicoes_caixa")
          .insert({ tipo: "fornecedor", ref_id: payload.fornecedor_id })
          .select("id")
          .single();
        forn = created;
      }
      if (!galpao || !forn) throw new Error("Posição de caixa não encontrada");

      const vazias = payload.natureza === "entrega_vazias";
      const origem = vazias ? galpao.id : forn.id;
      const destino = vazias ? forn.id : galpao.id;

      const { error } = await supabase.from("movimentacoes_caixa").insert({
        fornecedor_id: payload.fornecedor_id,
        tipo: payload.natureza === "recebimento_cheias" ? "recebimento_cheias" : payload.natureza === "entrega_vazias" ? "entrega_vazias" : "retorno",
        tipo_caixa: payload.tipo_caixa,
        quantidade: payload.quantidade,
        origem_posicao_id: origem,
        destino_posicao_id: destino,
        natureza: payload.natureza,
        documento_tipo: payload.conferencia_id ? "entrega" : "avulso",
        documento_id: payload.conferencia_id ?? null,
        registrado_por: payload.registrado_por,
        observacoes: payload.observacoes ?? null,
        data_movimento: todayBRT(),
        confirmacao_status: "pendente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
      qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
    },
  });
}

export function useSaldosAbertura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      posicao_id: string;
      tipo_caixa: string;
      quantidade: number;
      registrado_por: string;
    }) => {
      const { error } = await supabase.from("movimentacoes_caixa").insert({
        tipo: "ajuste",
        natureza: "abertura",
        tipo_caixa: payload.tipo_caixa,
        quantidade: payload.quantidade,
        destino_posicao_id: payload.posicao_id,
        origem_posicao_id: null,
        registrado_por: payload.registrado_por,
        data_movimento: todayBRT(),
        observacoes: "Saldo de abertura",
        confirmacao_status: "nao_aplicavel",
        documento_tipo: "abertura",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saldos-caixa"] }),
  });
}

export function useConfirmarMovimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      acao: "confirmado" | "contestado" | "resolvido";
      userId: string;
      qtd_contestada?: number;
      observacao?: string;
    }) => {
      const { error } = await supabase
        .from("movimentacoes_caixa")
        .update({
          confirmacao_status: payload.acao,
          confirmado_por: payload.userId,
          confirmado_em: new Date().toISOString(),
          qtd_contestada: payload.qtd_contestada ?? null,
          observacoes: payload.observacao ?? undefined,
        })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["movimentacoes"] }),
  });
}

export function useMovimentosFornecedor(fornecedorId: string | null) {
  return useQuery({
    queryKey: ["mov-fornecedor", fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_caixa")
        .select("*")
        .eq("fornecedor_id", fornecedorId!)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type { CaixasMap };
