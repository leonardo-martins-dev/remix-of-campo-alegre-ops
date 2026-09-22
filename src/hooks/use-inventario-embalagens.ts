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
      qc.invalidateQueries({ queryKey: ["embalagem-saldo"] });
      qc.invalidateQueries({ queryKey: ["embalagem-contagens-recentes"] });
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
      qc.invalidateQueries({ queryKey: ["embalagem-saldo"] });
    },
  });
}

/** NOP-296 — saldo Packing por tipo (última contagem + ajustes posteriores). */
export type SaldoEmbalagem = {
  tipo_embalagem_id: string;
  nome: string;
  unidade_contagem: string;
  qty_por_pacote: number | null;
  ultima_contagem_id: string | null;
  ultima_quantidade: number | null;
  ultima_data: string | null;
  ultima_responsavel: string | null;
  ajustes_pos_contagem: number;
  saldo: number;
};

export type ContagemEmbalagemResumo = {
  id: string;
  data: string;
  created_at: string;
  observacao: string | null;
  contado_por: string | null;
  contado_por_nome: string | null;
  total_itens: number;
  totais: { tipo_embalagem_id: string; nome: string; unidade_contagem: string; quantidade: number }[];
};

export function useSaldoEmbalagens() {
  return useQuery({
    queryKey: ["embalagem-saldo"],
    queryFn: async () => {
      const fromView = await supabase.from("v_saldo_embalagem").select("*");
      if (!fromView.error && fromView.data) {
        return fromView.data as SaldoEmbalagem[];
      }

      // Fallback se a view NOP-296 ainda não estiver no banco.
      const [{ data: tipos, error: errTipos }, { data: atual, error: errAtual }, { data: ajustes, error: errAj }] =
        await Promise.all([
          supabase
            .from("tipos_embalagem")
            .select("id, nome, unidade_contagem, qty_por_pacote")
            .eq("ativo", true)
            .order("nome"),
          supabase.from("v_embalagem_contagem_atual").select("*"),
          supabase
            .from("ajustes_embalagem")
            .select("tipo_embalagem_id, quantidade, registrado_em")
            .order("registrado_em", { ascending: true }),
        ]);
      if (errTipos) throw errTipos;
      if (errAtual) throw errAtual;
      if (errAj) throw errAj;

      const status = await supabase
        .from("contagens_embalagem")
        .select("id, data, created_at, contado_por, profiles:contado_por(nome)")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (status.error) throw status.error;

      const lastByTipo = new Map<
        string,
        { qtd: number; data: string; created_at: string; contagem_id: string; responsavel: string | null }
      >();
      for (const row of (atual ?? []) as ContagemAtualEmbalagem[]) {
        if (row.ultima_quantidade == null || !row.ultima_data) continue;
        const head = (status.data ?? []).find((c) => c.data === row.ultima_data);
        const perfil = head
          ? Array.isArray(head.profiles)
            ? head.profiles[0]
            : head.profiles
          : null;
        lastByTipo.set(row.tipo_embalagem_id, {
          qtd: Number(row.ultima_quantidade),
          data: row.ultima_data,
          created_at: head?.created_at ?? `${row.ultima_data}T23:59:59Z`,
          contagem_id: head?.id ?? "",
          responsavel: perfil?.nome ?? null,
        });
      }

      return (tipos ?? []).map((t) => {
        const last = lastByTipo.get(t.id);
        const aj = (ajustes ?? []).filter((a) => {
          if (a.tipo_embalagem_id !== t.id) return false;
          if (!last) return true;
          return a.registrado_em > last.created_at;
        });
        const ajustesSum = aj.reduce((s, a) => s + Number(a.quantidade), 0);
        const saldo = (last?.qtd ?? 0) + ajustesSum;
        return {
          tipo_embalagem_id: t.id,
          nome: t.nome,
          unidade_contagem: t.unidade_contagem,
          qty_por_pacote: t.qty_por_pacote,
          ultima_contagem_id: last?.contagem_id || null,
          ultima_quantidade: last?.qtd ?? null,
          ultima_data: last?.data ?? null,
          ultima_responsavel: last?.responsavel ?? null,
          ajustes_pos_contagem: ajustesSum,
          saldo,
        } satisfies SaldoEmbalagem;
      });
    },
  });
}

/** Cabeçalhos recentes com totais por tipo (para o bloco Últimas contagens). */
export function useContagensEmbalagemRecentes(limit = 12) {
  return useQuery({
    queryKey: ["embalagem-contagens-recentes", limit],
    queryFn: async () => {
      const { data: heads, error } = await supabase
        .from("contagens_embalagem")
        .select("id, data, created_at, observacao, contado_por, profiles:contado_por(nome)")
        .order("data", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const ids = (heads ?? []).map((h) => h.id);
      if (!ids.length) return [] as ContagemEmbalagemResumo[];

      const { data: itens, error: errItens } = await supabase
        .from("contagem_embalagem_itens")
        .select("contagem_id, quantidade, tipo_embalagem_id, tipos_embalagem(nome, unidade_contagem)")
        .in("contagem_id", ids);
      if (errItens) throw errItens;

      const byContagem = new Map<string, ContagemEmbalagemResumo["totais"]>();
      for (const it of itens ?? []) {
        const emb = Array.isArray(it.tipos_embalagem) ? it.tipos_embalagem[0] : it.tipos_embalagem;
        const list = byContagem.get(it.contagem_id) ?? [];
        list.push({
          tipo_embalagem_id: it.tipo_embalagem_id,
          nome: emb?.nome ?? "—",
          unidade_contagem: emb?.unidade_contagem ?? "",
          quantidade: Number(it.quantidade),
        });
        byContagem.set(it.contagem_id, list);
      }

      return (heads ?? []).map((h) => {
        const totais = byContagem.get(h.id) ?? [];
        const perfil = Array.isArray(h.profiles) ? h.profiles[0] : h.profiles;
        return {
          id: h.id,
          data: h.data,
          created_at: h.created_at,
          observacao: h.observacao,
          contado_por: h.contado_por,
          contado_por_nome: perfil?.nome ?? null,
          total_itens: totais.length,
          totais: totais.sort((a, b) => a.nome.localeCompare(b.nome)),
        } satisfies ContagemEmbalagemResumo;
      });
    },
  });
}

export function useContagemEmbalagemDetalhe(contagemId: string | null) {
  return useQuery({
    queryKey: ["embalagem-contagem-detalhe", contagemId],
    enabled: !!contagemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contagem_embalagem_itens")
        .select("quantidade, tipo_embalagem_id, tipos_embalagem(nome, unidade_contagem)")
        .eq("contagem_id", contagemId!);
      if (error) throw error;
      return (data ?? []).map((it) => {
        const emb = Array.isArray(it.tipos_embalagem) ? it.tipos_embalagem[0] : it.tipos_embalagem;
        return {
          tipo_embalagem_id: it.tipo_embalagem_id as string,
          nome: emb?.nome ?? "—",
          unidade_contagem: emb?.unidade_contagem ?? "",
          quantidade: Number(it.quantidade),
        };
      });
    },
  });
}
