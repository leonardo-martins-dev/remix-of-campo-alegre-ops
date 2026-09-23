import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type MinimoEstoque = {
  id: string;
  fornecedor_id: string;
  tipo_caixa: string;
  qtd_minima: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type FornecedorAbaixoMinimo = {
  fornecedor_id: string;
  fornecedor_nome: string;
  tipo_caixa: string;
  qtd_minima: number;
  saldo_atual: number;
  faltando: number;
  custo_unitario: number;
  valor_faltando: number;
};

export type PosicaoPendente = {
  posicao_id: string;
  posicao_tipo: string;
  ref_id: string | null;
  posicao_nome: string;
  ultima_contagem_data: string | null;
  dias_desde_contagem: number;
  frequencia_dias: number;
  /** Segunda-feira da semana corrente (BRT) */
  inicio_semana: string;
  /** Sexta-feira — prazo da contagem (BRT) */
  vencimento: string;
  /** Último responsável pela contagem (null se nunca contada) */
  responsavel: string | null;
  nunca_contado: boolean;
};

export type DivergenciaPendente = {
  contagem_id: string;
  posicao_id: string;
  posicao_tipo: string;
  posicao_nome: string;
  data: string;
  origem: string;
  created_at: string;
  tipo_caixa: string;
  qtd_contada: number;
  qtd_calculada: number;
  diferenca: number;
  custo_unitario: number;
  valor_divergencia: number;
};

export type PainelInventario = {
  posicao_id: string;
  posicao_tipo: string;
  ref_id: string | null;
  posicao_nome: string;
  tipo_caixa: string;
  saldo: number;
  ultima_contagem_data: string | null;
  ultima_contagem_status: string | null;
  dias_desde_contagem: number | null;
  contagem_pendente: boolean;
  divergencia_aberta: number;
  abaixo_minimo: boolean;
  qtd_minima: number;
  faltando: number;
};

export type TotalGeralCaixas = {
  posicao_tipo: string;
  tipo_caixa: string;
  saldo_total: number;
  custo_unitario: number;
  valor_total: number;
};

export function useMinimosEstoque(fornecedorId?: string) {
  return useQuery({
    queryKey: ["minimos-estoque", fornecedorId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("minimo_estoque_fornecedor_caixa")
        .select("*")
        .eq("ativo", true)
        .order("tipo_caixa");
      if (fornecedorId) q = q.eq("fornecedor_id", fornecedorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MinimoEstoque[];
    },
  });
}

export function useSaveMinimoEstoque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      fornecedor_id: string;
      tipo_caixa: string;
      qtd_minima: number;
    }) => {
      const { data: existing } = await supabase
        .from("minimo_estoque_fornecedor_caixa")
        .select("id")
        .eq("fornecedor_id", payload.fornecedor_id)
        .eq("tipo_caixa", payload.tipo_caixa)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("minimo_estoque_fornecedor_caixa")
          .update({ qtd_minima: payload.qtd_minima, ativo: true })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("minimo_estoque_fornecedor_caixa")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["minimos-estoque"] });
      qc.invalidateQueries({ queryKey: ["fornecedores-abaixo-minimo"] });
      qc.invalidateQueries({ queryKey: ["painel-inventario"] });
    },
  });
}

export function useDeleteMinimoEstoque() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("minimo_estoque_fornecedor_caixa")
        .update({ ativo: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["minimos-estoque"] });
      qc.invalidateQueries({ queryKey: ["fornecedores-abaixo-minimo"] });
      qc.invalidateQueries({ queryKey: ["painel-inventario"] });
    },
  });
}

export function useFornecedoresAbaixoMinimo() {
  return useQuery({
    queryKey: ["fornecedores-abaixo-minimo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_fornecedores_abaixo_minimo")
        .select("*");
      if (error) throw error;
      return (data ?? []) as FornecedorAbaixoMinimo[];
    },
  });
}

export function usePosicoesPendentes() {
  return useQuery({
    queryKey: ["posicoes-contagem-pendente"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_posicoes_contagem_pendente")
        .select("*");
      if (error) throw error;
      // NOP-319: nunca contada OU sem contagem na semana = pendente (prazo sexta).
      return (data ?? []) as PosicaoPendente[];
    },
  });
}

export function useDivergenciasPendentes() {
  return useQuery({
    queryKey: ["divergencias-pendentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_divergencias_pendentes")
        .select("*");
      if (error) throw error;
      return (data ?? []) as DivergenciaPendente[];
    },
  });
}

export function usePainelInventario() {
  return useQuery({
    queryKey: ["painel-inventario"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_painel_inventario")
        .select("*");
      if (error) throw error;
      return (data ?? []) as PainelInventario[];
    },
  });
}

export function useTotalGeralCaixas() {
  return useQuery({
    queryKey: ["total-geral-caixas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_total_geral_caixas")
        .select("*");
      if (error) throw error;
      return (data ?? []) as TotalGeralCaixas[];
    },
  });
}
