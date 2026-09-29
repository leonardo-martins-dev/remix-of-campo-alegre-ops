import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CorEmUsoInfo } from "@/components/fornecedor-cor-picker";
import type { FornecedorCorInput } from "@/lib/sugerir-cores-fornecedores";

export function useCoresEmUsoFornecedor(fornecedorId: string | null) {
  return useQuery({
    queryKey: ["fornecedor-cores-em-uso", fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async (): Promise<CorEmUsoInfo[]> => {
      const { data, error } = await supabase.rpc("cores_em_uso_fornecedor", {
        p_fornecedor_id: fornecedorId!,
      });
      if (error) throw error;
      return (data ?? []) as CorEmUsoInfo[];
    },
  });
}

/* ────────────────────── NOP-463 — sugestão em lote ─────────────────────── */

export type DadosSugestaoCores = {
  /** fornecedores ativos + vínculos + saldo de caixas (entrada do algoritmo) */
  fornecedores: FornecedorCorInput[];
  /** produto_id → nome, para o resumo "em COUVE, ALFACE…" */
  nomesProduto: Map<string, string>;
};

const SUGESTOES_KEY = ["fornecedor-cor", "sugestoes"] as const;
const CONFLITOS_KEY = ["fornecedor-cor", "conflitos"] as const;

/**
 * Tudo que o painel precisa para propor cores: fornecedores ativos, seus
 * produtos (conversões ativas) e quantas caixas circulam com cada um.
 */
export function useDadosSugestaoCores(enabled = true) {
  return useQuery({
    queryKey: SUGESTOES_KEY,
    enabled,
    queryFn: async (): Promise<DadosSugestaoCores> => {
      const [forn, conv, saldos] = await Promise.all([
        supabase.from("fornecedores").select("id, nome, cor, ativo").order("nome"),
        supabase
          .from("conversoes_fornecedor")
          .select("fornecedor_id, produto_id, ativo, produtos(nome)")
          .eq("ativo", true),
        supabase
          .from("v_saldos_caixa")
          .select("posicao_tipo, ref_id, saldo")
          .eq("posicao_tipo", "fornecedor"),
      ]);
      if (forn.error) throw forn.error;
      if (conv.error) throw conv.error;
      // saldo é só heurística de "quem trocar": sem ele o painel segue de pé
      const saldoPorForn = new Map<string, number>();
      for (const s of (saldos.data ?? []) as { ref_id: string | null; saldo: number | null }[]) {
        if (!s.ref_id) continue;
        saldoPorForn.set(s.ref_id, (saldoPorForn.get(s.ref_id) ?? 0) + Number(s.saldo ?? 0));
      }

      const nomesProduto = new Map<string, string>();
      const produtosPorForn = new Map<string, string[]>();
      type ConvRow = {
        fornecedor_id: string;
        produto_id: string;
        produtos?: { nome: string } | { nome: string }[] | null;
      };
      for (const c of (conv.data ?? []) as ConvRow[]) {
        const list = produtosPorForn.get(c.fornecedor_id) ?? [];
        if (!list.includes(c.produto_id)) list.push(c.produto_id);
        produtosPorForn.set(c.fornecedor_id, list);
        const p = Array.isArray(c.produtos) ? c.produtos[0] : c.produtos;
        if (p?.nome) nomesProduto.set(c.produto_id, p.nome);
      }

      const fornecedores: FornecedorCorInput[] = (
        (forn.data ?? []) as { id: string; nome: string; cor: string | null; ativo: boolean }[]
      )
        .filter((f) => f.ativo !== false)
        .map((f) => ({
          id: f.id,
          nome: f.nome,
          cor: f.cor ?? null,
          produtoIds: produtosPorForn.get(f.id) ?? [],
          caixasCirculando: saldoPorForn.get(f.id) ?? 0,
        }));

      return { fornecedores, nomesProduto };
    },
  });
}

export type AdesivoAEnviar = {
  fornecedor_id: string;
  fornecedor_nome: string;
  cor: string;
  cor_nome: string;
  /** NOP-466: hold aberto por conflito de cor — não enviar ainda. */
  em_espera?: boolean;
};

export type ResultadoAplicarCores = {
  aplicados: number;
  adesivos: AdesivoAEnviar[];
};

/** Grava as cores revisadas. Nada é gravado sem esta chamada. */
export function useAplicarSugestoesCores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      itens: { fornecedor_id: string; cor: string }[],
    ): Promise<ResultadoAplicarCores> => {
      const { data, error } = await supabase.rpc("aplicar_sugestoes_cores_fornecedores", {
        p_itens: itens,
      });
      if (error) throw error;
      const r = (data ?? {}) as { aplicados?: number; adesivos?: AdesivoAEnviar[] };
      return { aplicados: Number(r.aplicados ?? 0), adesivos: r.adesivos ?? [] };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SUGESTOES_KEY });
      void qc.invalidateQueries({ queryKey: CONFLITOS_KEY });
      void qc.invalidateQueries({ queryKey: ["cadastros", "fornecedores"] });
    },
  });
}

export type ConflitoCorAberto = {
  id: string;
  fornecedor_a_id: string;
  fornecedor_a_nome: string;
  fornecedor_b_id: string;
  fornecedor_b_nome: string;
  produto_id: string;
  produto_nome: string;
  cor: string;
  cor_nome: string;
  sugerido_trocar_id: string | null;
  sugerido_trocar_nome: string | null;
  created_at: string;
};

/** Pendências abertas de cor duplicada em produto (vínculo aceito). */
export function useConflitosCorAbertos() {
  return useQuery({
    queryKey: CONFLITOS_KEY,
    queryFn: async (): Promise<ConflitoCorAberto[]> => {
      const { data, error } = await supabase.rpc("listar_conflitos_cor_abertos");
      if (error) throw error;
      return (data ?? []) as ConflitoCorAberto[];
    },
  });
}

/** Cores da paleta livres num produto — opções para resolver na hora. */
export function useCoresLivresProduto(produtoId: string | null) {
  return useQuery({
    queryKey: ["fornecedor-cor", "livres-produto", produtoId],
    enabled: !!produtoId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("cores_livres_produto", {
        p_produto_id: produtoId!,
      });
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });
}

export function useResolverConflitoCor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { conflitoId: string; fornecedorId: string; novaCor: string }) => {
      const { data, error } = await supabase.rpc("resolver_conflito_cor", {
        p_conflito_id: vars.conflitoId,
        p_fornecedor_id: vars.fornecedorId,
        p_nova_cor: vars.novaCor,
      });
      if (error) throw error;
      return data as { cor: string; cor_nome: string };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CONFLITOS_KEY });
      void qc.invalidateQueries({ queryKey: SUGESTOES_KEY });
      void qc.invalidateQueries({ queryKey: ["fornecedor-cor", "livres-produto"] });
      void qc.invalidateQueries({ queryKey: ["cadastros", "fornecedores"] });
    },
  });
}
