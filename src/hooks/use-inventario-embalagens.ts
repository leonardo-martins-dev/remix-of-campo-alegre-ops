import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

/**
 * NOP-158 — Inventário semanal de embalagens (só Packing).
 *
 * Paralelo ao inventário de caixas e independente de mercadoria: a
 * contagem vence toda sexta-feira (BRT) e a pendência é apenas visual,
 * nunca bloqueia movimentação. A variação entre semanas é o consumo
 * aparente (contagem anterior − contagem atual).
 */

export type SituacaoInventarioEmbalagem = "em_dia" | "pendente" | "atrasado" | "sem_contagem";

export type StatusInventarioEmbalagem = {
  ultima_contagem_id: string | null;
  ultima_contagem_data: string | null;
  ultima_contagem_responsavel: string | null;
  hoje: string;
  inicio_semana: string;
  vencimento: string;
  dias_desde_contagem: number | null;
  nunca_contado: boolean;
  contagem_semana_ok: boolean;
  pendente: boolean;
  situacao: SituacaoInventarioEmbalagem;
};

export type ContagemAtualEmbalagem = {
  tipo_embalagem_id: string;
  nome: string;
  unidade_contagem: string;
  qty_por_pacote: number | null;
  ultima_quantidade: number | null;
  ultima_data: string | null;
  anterior_quantidade: number | null;
  anterior_data: string | null;
  consumo_aparente: number | null;
};

export type HistoricoContagemEmbalagem = {
  contagem_id: string;
  data: string;
  created_at: string;
  observacao: string | null;
  contado_por: string | null;
  contado_por_nome: string | null;
  tipo_embalagem_id: string;
  tipo_nome: string;
  unidade_contagem: string;
  tipo_ativo: boolean;
  quantidade: number;
  quantidade_anterior: number | null;
  data_anterior: string | null;
  consumo_aparente: number | null;
};

export type TipoAjusteEmbalagem = "compra" | "sobra" | "perda" | "outro";

export type AjusteEmbalagem = {
  id: string;
  tipo_embalagem_id: string;
  quantidade: number;
  tipo: TipoAjusteEmbalagem;
  observacao: string;
  registrado_por: string | null;
  registrado_em: string;
  tipos_embalagem?: { nome: string; unidade_contagem: string } | { nome: string; unidade_contagem: string }[] | null;
  profiles?: { nome: string } | { nome: string }[] | null;
};

export const SITUACAO_LABEL: Record<SituacaoInventarioEmbalagem, string> = {
  em_dia: "Em dia",
  pendente: "Pendente",
  atrasado: "Atrasado",
  sem_contagem: "Sem contagem",
};

/** Ajustes que somam (compra/sobra) e que subtraem (perda). "Outro" o usuário escolhe. */
export const TIPOS_AJUSTE: { valor: TipoAjusteEmbalagem; label: string; sentido: 1 | -1 | 0 }[] = [
  { valor: "compra", label: "Compra", sentido: 1 },
  { valor: "sobra", label: "Sobra", sentido: 1 },
  { valor: "perda", label: "Perda", sentido: -1 },
  { valor: "outro", label: "Outro", sentido: 0 },
];

export function useStatusInventarioEmbalagem() {
  return useQuery({
    queryKey: ["inventario-embalagem-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_inventario_embalagem_status")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as StatusInventarioEmbalagem | null;
    },
  });
}

/** Tipos ativos com a quantidade da última contagem (mostrada ao lado do input). */
export function useContagemAtualEmbalagem() {
  return useQuery({
    queryKey: ["embalagem-contagem-atual"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_embalagem_contagem_atual").select("*");
      if (error) throw error;
      return (data ?? []) as ContagemAtualEmbalagem[];
    },
  });
}

export function useHistoricoEmbalagem(tipoId?: string | null) {
  return useQuery({
    queryKey: ["embalagem-historico", tipoId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("v_historico_contagem_embalagem")
        .select("*")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (tipoId) q = q.eq("tipo_embalagem_id", tipoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as HistoricoContagemEmbalagem[];
    },
  });
}

export function useAjustesEmbalagem(tipoId?: string | null) {
  return useQuery({
    queryKey: ["embalagem-ajustes", tipoId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("ajustes_embalagem")
        .select("*, tipos_embalagem(nome, unidade_contagem), profiles:registrado_por(nome)")
        .order("registrado_em", { ascending: false })
        .limit(100);
      if (tipoId) q = q.eq("tipo_embalagem_id", tipoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AjusteEmbalagem[];
    },
  });
}

export function useRegistrarContagemEmbalagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      data?: string;
      contado_por: string | null;
      observacao?: string | null;
      itens: { tipo_embalagem_id: string; quantidade: number }[];
    }) => {
      // RPC fecha cabeçalho + itens na mesma transação (sem contagem vazia).
      const { data, error } = await supabase.rpc("registrar_contagem_embalagem", {
        p_data: payload.data ?? todayBRT(),
        p_contado_por: payload.contado_por,
        p_observacao: payload.observacao ?? null,
        p_itens: payload.itens,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventario-embalagem-status"] });
      qc.invalidateQueries({ queryKey: ["embalagem-contagem-atual"] });
      qc.invalidateQueries({ queryKey: ["embalagem-historico"] });
      qc.invalidateQueries({ queryKey: ["alertas"] });
    },
  });
}

export function useRegistrarAjusteEmbalagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      tipo_embalagem_id: string;
      quantidade: number;
      tipo: TipoAjusteEmbalagem;
      observacao: string;
      registrado_por: string | null;
    }) => {
      const { error } = await supabase.from("ajustes_embalagem").insert({
        tipo_embalagem_id: payload.tipo_embalagem_id,
        quantidade: payload.quantidade,
        tipo: payload.tipo,
        observacao: payload.observacao.trim(),
        registrado_por: payload.registrado_por,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["embalagem-ajustes"] });
      qc.invalidateQueries({ queryKey: ["embalagem-historico"] });
    },
  });
}
