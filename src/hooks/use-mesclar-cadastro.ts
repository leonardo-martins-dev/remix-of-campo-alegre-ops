import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TipoCadastro } from "@/lib/mesclar-cadastro";

export type PreviewMesclagem = {
  tipo: TipoCadastro;
  cadastros: {
    id: string;
    nome: string;
    ativo: boolean;
    codigo_wise: string | null;
    cnpj: string | null;
    mesclado_em_id: string | null;
  }[];
  relacionados: { tabela: string; coluna: string; linhas: number }[];
  movimentos_caixa: number;
  saldo_caixas: Record<string, number>;
  aliases: {
    id: string;
    nome_externo: string;
    codigo_externo: string | null;
    entidade_id: string;
  }[];
  conflitos_conversao: {
    produto_id: string;
    produto: string;
    tipo_caixa_id: string;
    tipo_caixa: string;
    opcoes: { fornecedor_id: string; fator: number }[];
  }[];
};

export type ResolucaoConversao = {
  produto_id: string;
  tipo_caixa_id: string;
  fator: number;
};

/** Prévia do que muda de dono na mesclagem. */
export function usePreviewMesclagem(tipo: TipoCadastro, ids: string[]) {
  const chave = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["preview-mesclagem", tipo, chave],
    enabled: ids.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_mesclar_cadastro", {
        p_tipo: tipo,
        p_ids: ids,
      });
      if (error) throw new Error(error.message);
      return data as PreviewMesclagem;
    },
  });
}

function invalidarCadastros(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["cadastros", "fornecedores"] });
  qc.invalidateQueries({ queryKey: ["cadastros", "clientes"] });
  qc.invalidateQueries({ queryKey: ["aliases"] });
  qc.invalidateQueries({ queryKey: ["pendencias-vinculo"] });
  qc.invalidateQueries({ queryKey: ["mesclagens-cadastro"] });
  qc.invalidateQueries({ queryKey: ["preview-mesclagem"] });
  qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
  qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
  qc.invalidateQueries({ queryKey: ["posicoes-caixa"] });
  qc.invalidateQueries({ queryKey: ["pedidos"] });
  qc.invalidateQueries({ queryKey: ["seletor-codigos-fornecedor"] });
  qc.invalidateQueries({ queryKey: ["seletor-entregas-fornecedor"] });
}

export function useMesclarCadastro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      tipo: TipoCadastro;
      sobrevivente_id: string;
      mesclados_ids: string[];
      resolucao_conversoes?: ResolucaoConversao[];
    }) => {
      const { data, error } = await supabase.rpc("mesclar_cadastro", {
        p_tipo: payload.tipo,
        p_sobrevivente_id: payload.sobrevivente_id,
        p_mesclados_ids: payload.mesclados_ids,
        p_resolucao_conversoes: payload.resolucao_conversoes ?? [],
      });
      if (error) throw new Error(error.message);
      return data as { mesclagem_id: string; mesclados: number };
    },
    onSuccess: () => invalidarCadastros(qc),
  });
}

/** Separa o código Wise grudado no nome e guarda o nome antigo como alias. */
export function useAplicarCodigoWise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      tipo: TipoCadastro;
      id: string;
      codigo: string | null;
      nome: string;
    }) => {
      const { data, error } = await supabase.rpc("aplicar_codigo_wise", {
        p_tipo: payload.tipo,
        p_id: payload.id,
        p_codigo: payload.codigo,
        p_nome: payload.nome,
      });
      if (error) throw new Error(error.message);
      return data as { id: string; nome: string; codigo_wise: string | null };
    },
    onSuccess: () => invalidarCadastros(qc),
  });
}

export type MesclagemRegistro = {
  id: string;
  tipo: TipoCadastro;
  sobrevivente_id: string;
  mesclados_ids: string[];
  created_at: string;
  profiles: { nome: string } | { nome: string }[] | null;
};

/** Histórico de mesclagens (auditoria). */
export function useMesclagens(tipo: TipoCadastro) {
  return useQuery({
    queryKey: ["mesclagens-cadastro", tipo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mesclagens_cadastro")
        .select("id, tipo, sobrevivente_id, mesclados_ids, created_at, profiles:user_id(nome)")
        .eq("tipo", tipo)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as MesclagemRegistro[];
    },
  });
}
