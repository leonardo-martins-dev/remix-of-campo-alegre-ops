import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ConversaoProduto = {
  id: string;
  produto_id: string;
  produto_nome: string;
  produto_codigo: string | null;
  tipo_caixa_id: string;
  tipo_caixa_sigla: string;
  tipo_caixa_nome: string;
  fator: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type ConversaoFornecedor = {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  produto_id: string;
  produto_nome: string;
  produto_codigo: string | null;
  tipo_caixa_id: string;
  tipo_caixa_sigla: string;
  tipo_caixa_nome: string;
  fator: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export type ConversaoHistorico = {
  id: string;
  tabela: string;
  registro_id: string;
  acao: string;
  fator_anterior: number | null;
  fator_novo: number | null;
  ativo_anterior: boolean | null;
  ativo_novo: boolean | null;
  alterado_por: string | null;
  alterado_por_nome: string | null;
  created_at: string;
  descricao: string | null;
};

export function useConversoesProduto(includeInactive = false) {
  return useQuery({
    queryKey: ["conversoes-produto", includeInactive],
    queryFn: async () => {
      let q = supabase
        .from("v_conversoes_produto")
        .select("*")
        .order("produto_nome");
      if (!includeInactive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ConversaoProduto[];
    },
  });
}

export function useConversoesFornecedor(includeInactive = false) {
  return useQuery({
    queryKey: ["conversoes-fornecedor", includeInactive],
    queryFn: async () => {
      let q = supabase
        .from("v_conversoes_fornecedor")
        .select("*")
        .order("fornecedor_nome")
        .order("produto_nome");
      if (!includeInactive) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ConversaoFornecedor[];
    },
  });
}

export function useConversaoHistorico(registroId?: string) {
  return useQuery({
    queryKey: ["conversao-historico", registroId],
    queryFn: async () => {
      let q = supabase
        .from("v_conversao_historico")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (registroId) {
        q = q.eq("registro_id", registroId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ConversaoHistorico[];
    },
    enabled: registroId !== undefined,
  });
}

export function useRecentConversaoHistorico() {
  return useQuery({
    queryKey: ["conversao-historico-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_conversao_historico")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ConversaoHistorico[];
    },
  });
}

export function useSaveConversaoProduto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      produto_id: string;
      tipo_caixa_id: string;
      fator: number;
      ativo?: boolean;
    }) => {
      if (payload.fator <= 0) throw new Error("Fator deve ser maior que zero");
      
      if (payload.id) {
        const { error } = await supabase
          .from("conversoes_produto_caixa")
          .update({
            fator: payload.fator,
            ativo: payload.ativo ?? true,
          })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("conversoes_produto_caixa")
          .upsert(
            {
              produto_id: payload.produto_id,
              tipo_caixa_id: payload.tipo_caixa_id,
              fator: payload.fator,
              ativo: payload.ativo ?? true,
            },
            { onConflict: "produto_id,tipo_caixa_id" }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateConversaoQueries(qc),
  });
}

export function useSaveConversaoFornecedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      fornecedor_id: string;
      produto_id: string;
      tipo_caixa_id: string;
      fator: number;
      ativo?: boolean;
    }) => {
      if (payload.fator <= 0) throw new Error("Fator deve ser maior que zero");
      
      if (payload.id) {
        const { error } = await supabase
          .from("conversoes_fornecedor")
          .update({
            fator: payload.fator,
            ativo: payload.ativo ?? true,
          })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("conversoes_fornecedor")
          .upsert(
            {
              fornecedor_id: payload.fornecedor_id,
              produto_id: payload.produto_id,
              tipo_caixa_id: payload.tipo_caixa_id,
              fator: payload.fator,
              ativo: payload.ativo ?? true,
            },
            { onConflict: "fornecedor_id,produto_id,tipo_caixa_id" }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateConversaoQueries(qc),
  });
}

export function useToggleConversaoProduto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("conversoes_produto_caixa")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateConversaoQueries(qc),
  });
}

export function useToggleConversaoFornecedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("conversoes_fornecedor")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateConversaoQueries(qc),
  });
}

export function useDeleteConversaoProduto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("conversoes_produto_caixa")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateConversaoQueries(qc),
  });
}

export function useDeleteConversaoFornecedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("conversoes_fornecedor")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateConversaoQueries(qc),
  });
}

export type ImportConversaoResult = {
  linhasLidas: number;
  conversoesCriadas: number;
  conversoesAtualizadas: number;
  pendencias: { linha: number; motivo: string; dados: Record<string, unknown> }[];
  rejeitadas: { linha: number; motivo: string; dados: Record<string, unknown> }[];
};

export function useSaveImportacaoConversao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      arquivo: string;
      usuario_id: string;
      result: ImportConversaoResult;
    }) => {
      const { error } = await supabase.from("importacoes_conversao").insert({
        arquivo: payload.arquivo,
        usuario_id: payload.usuario_id,
        linhas_lidas: payload.result.linhasLidas,
        conversoes_criadas: payload.result.conversoesCriadas,
        conversoes_atualizadas: payload.result.conversoesAtualizadas,
        pendencias: payload.result.pendencias.length,
        rejeitadas: payload.result.rejeitadas.length,
        detalhes: {
          pendencias: payload.result.pendencias,
          rejeitadas: payload.result.rejeitadas,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversoes-produto"] });
      qc.invalidateQueries({ queryKey: ["conversoes-fornecedor"] });
      qc.invalidateQueries({ queryKey: ["conversao-historico"] });
      qc.invalidateQueries({ queryKey: ["produtos-sem-conversao"] });
    },
  });
}

/** NOP-309 — produtos sem fator de saída e/ou fornecedor×tipo, ordenados por uso recente. */
export type ProdutoSemConversao = {
  produto_id: string;
  produto_nome: string;
  produto_codigo: string | null;
  unidade: string | null;
  ativo: boolean;
  falta_saida: boolean;
  falta_fornecedor: boolean;
  qtd_fornecedores_sem_fator: number;
  fornecedores_sem_fator: { id: string; nome: string }[];
  ultimo_pedido_em: string | null;
  usos_recentes: number;
};

export function useProdutosSemConversao() {
  return useQuery({
    queryKey: ["produtos-sem-conversao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_produtos_sem_conversao")
        .select("*")
        .order("usos_recentes", { ascending: false })
        .order("ultimo_pedido_em", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        fornecedores_sem_fator: Array.isArray(row.fornecedores_sem_fator)
          ? (row.fornecedores_sem_fator as { id: string; nome: string }[])
          : [],
      })) as ProdutoSemConversao[];
    },
  });
}

function invalidateConversaoQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["conversoes-produto"] });
  qc.invalidateQueries({ queryKey: ["conversoes-fornecedor"] });
  qc.invalidateQueries({ queryKey: ["conversao-historico"] });
  qc.invalidateQueries({ queryKey: ["sugestao-caixas"] });
  qc.invalidateQueries({ queryKey: ["produtos-sem-conversao"] });
  qc.invalidateQueries({ queryKey: ["fatores-padrao-saida"] });
}
