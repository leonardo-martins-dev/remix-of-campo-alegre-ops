import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { dateRangeBRT } from "@/lib/utils-date";


export type CustoPerdaCaixaRow = {
  movimento_id?: string;
  data_movimento?: string;
  tipo_caixa?: string;
  quantidade?: number;
  custo_unitario?: number;
  valor_perda?: number;
  posicao_tipo?: string;
  posicao_ref_id?: string;
  fornecedor_id?: string | null;
  fornecedor_nome?: string | null;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  posicao_nome?: string | null;
  contagem_id?: string | null;
  motivo_nome?: string | null;
  entra_em_custo?: boolean | null;
};

export type CustoPerdaRotaRow = {
  carga_id?: string;
  carga_codigo?: string;
  data_carga?: string;
  rota_id?: string | null;
  rota_nome?: string | null;
  motorista_id?: string | null;
  motorista_nome?: string | null;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  valor_perda_total?: number;
  caixas_perdidas?: number;
};

export type CustoRecebimentoRow = {
  item_conferencia_id?: string;
  pedido_id?: string;
  pedido_codigo?: string;
  data_pedido?: string;
  fornecedor_id?: string | null;
  fornecedor_nome?: string | null;
  divergencia?: string | null;
  quantidade_divergencia?: number;
  valor_divergencia?: number;
  dentro_tolerancia?: boolean | null;
  quantidade_pedida?: number;
  quantidade_recebida?: number;
  produto_id?: string | null;
  produto_nome?: string | null;
};

export type CustoQuebraRow = {
  quebra_id?: string;
  fornecedor_id?: string | null;
  fornecedor_nome?: string | null;
  status?: string | null;
  data_quebra?: string;
  item_id?: string;
  produto_id?: string | null;
  produto_nome?: string | null;
  quantidade?: number;
  valor?: number;
  estimado?: boolean | null;
};

export type CustoFilters = {
  period: "today" | "week" | "month";
  fornecedorId?: string | null;
  clienteId?: string | null;
  rotaId?: string | null;
  motoristaId?: string | null;
  tipoCaixa?: string | null;
};

export function useCustoPerdaCaixas(filters: CustoFilters) {
  const { from, to } = dateRangeBRT(filters.period);

  return useQuery({
    queryKey: ["custo-perda-caixas", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_v_custo_perda_caixas", {
        p_from: from,
        p_to: to,
        p_fornecedor_id: filters.fornecedorId ?? null,
        p_cliente_id: filters.clienteId ?? null,
        p_tipo_caixa: filters.tipoCaixa ?? null,
      });
      if (error) throw error;
      return (data ?? []) as CustoPerdaCaixaRow[];
    },
  });
}

export function useCustoPerdaRota(filters: CustoFilters) {
  const { from, to } = dateRangeBRT(filters.period);

  return useQuery({
    queryKey: ["custo-perda-rota", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_v_custo_perda_rota", {
        p_from: from,
        p_to: to,
        p_rota_id: filters.rotaId ?? null,
        p_motorista_id: filters.motoristaId ?? null,
        p_cliente_id: filters.clienteId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as CustoPerdaRotaRow[];
    },
  });
}

export function useCustoRecebimento(filters: CustoFilters) {
  const { from, to } = dateRangeBRT(filters.period);

  return useQuery({
    queryKey: ["custo-recebimento", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_v_custo_recebimento", {
        p_from: from,
        p_to: to,
        p_fornecedor_id: filters.fornecedorId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as CustoRecebimentoRow[];
    },
  });
}

export function useCustoQuebra(filters: CustoFilters) {
  const { from, to } = dateRangeBRT(filters.period);

  return useQuery({
    queryKey: ["custo-quebra", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_v_custo_quebra", {
        p_from: from,
        p_to: to,
        p_fornecedor_id: filters.fornecedorId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as CustoQuebraRow[];
    },
  });
}

export function useFatorRealDesvio(filters: CustoFilters) {
  return useQuery({
    queryKey: ["fator-real-desvio", filters],
    queryFn: async () => {
      let q = supabase
        .from("v_fator_real_desvio")
        .select("*")
        .order("desvio_pct", { ascending: false });

      if (filters.fornecedorId) {
        q = q.eq("fornecedor_id", filters.fornecedorId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useContagemPendente(filters: CustoFilters) {
  return useQuery({
    queryKey: ["contagem-pendente", filters],
    queryFn: async () => {
      let q = supabase
        .from("v_contagem_pendente")
        .select("*")
        .order("dias_pendente", { ascending: false });

      if (filters.fornecedorId) {
        q = q.eq("fornecedor_id", filters.fornecedorId);
      }
      if (filters.clienteId) {
        q = q.eq("cliente_id", filters.clienteId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRankingFornecedor(filters: CustoFilters) {
  const { from, to } = dateRangeBRT(filters.period);

  return useQuery({
    queryKey: ["ranking-fornecedor", filters],
    queryFn: async () => {
      const [perda, recebimento, quebra] = await Promise.all([
        supabase.rpc("admin_v_custo_perda_caixas", {
          p_from: from,
          p_to: to,
          p_fornecedor_id: null,
          p_cliente_id: null,
          p_tipo_caixa: null,
        }),
        supabase.rpc("admin_v_custo_recebimento", {
          p_from: from,
          p_to: to,
          p_fornecedor_id: null,
        }),
        supabase.rpc("admin_v_custo_quebra", {
          p_from: from,
          p_to: to,
          p_fornecedor_id: null,
        }),
      ]);

      const map = new Map<string, {
        fornecedor_id: string;
        fornecedor_nome: string;
        custo_perda: number;
        custo_recebimento: number;
        custo_quebra: number;
        custo_total: number;
      }>();

      if (perda.error) throw perda.error;
      if (recebimento.error) throw recebimento.error;
      if (quebra.error) throw quebra.error;

      for (const row of perda.data ?? []) {
        const id = row.fornecedor_id as string | null;
        if (!id) continue;
        const cur = map.get(id) ?? {
          fornecedor_id: id,
          fornecedor_nome: (row.fornecedor_nome as string) ?? "",
          custo_perda: 0,
          custo_recebimento: 0,
          custo_quebra: 0,
          custo_total: 0,
        };
        cur.custo_perda += Number(row.valor_perda ?? 0);
        map.set(id, cur);
      }

      for (const row of recebimento.data ?? []) {
        const id = row.fornecedor_id as string | null;
        if (!id) continue;
        const cur = map.get(id) ?? {
          fornecedor_id: id,
          fornecedor_nome: row.fornecedor_nome as string ?? "",
          custo_perda: 0,
          custo_recebimento: 0,
          custo_quebra: 0,
          custo_total: 0,
        };
        if (row.divergencia === "falta" || row.divergencia === "qualidade") {
          cur.custo_recebimento += Number(row.valor_divergencia ?? 0);
        }
        map.set(id, cur);
      }

      for (const row of quebra.data ?? []) {
        const id = row.fornecedor_id as string | null;
        if (!id) continue;
        const cur = map.get(id) ?? {
          fornecedor_id: id,
          fornecedor_nome: (row.fornecedor_nome as string) ?? "",
          custo_perda: 0,
          custo_recebimento: 0,
          custo_quebra: 0,
          custo_total: 0,
        };
        cur.custo_quebra += Number(row.valor ?? 0);
        map.set(id, cur);
      }

      const results = [...map.values()].map((r) => ({
        ...r,
        custo_total: r.custo_perda + r.custo_recebimento + r.custo_quebra,
      }));

      return results.sort((a, b) => b.custo_total - a.custo_total);
    },
  });
}

export function useRankingCliente(filters: CustoFilters) {
  const { from, to } = dateRangeBRT(filters.period);

  return useQuery({
    queryKey: ["ranking-cliente", filters],
    queryFn: async () => {
      const [perda, contagem] = await Promise.all([
        supabase.rpc("admin_v_custo_perda_caixas", {
          p_from: from,
          p_to: to,
          p_fornecedor_id: null,
          p_cliente_id: null,
          p_tipo_caixa: null,
        }),
        supabase
          .from("v_contagem_pendente")
          .select("cliente_id, cliente_nome, total_diferenca")
          .not("cliente_id", "is", null),
      ]);

      const map = new Map<string, {
        cliente_id: string;
        cliente_nome: string;
        custo_perda: number;
        divergencias_abertas: number;
        custo_total: number;
      }>();

      if (perda.error) throw perda.error;
      if (contagem.error) throw contagem.error;

      for (const row of perda.data ?? []) {
        const id = row.cliente_id as string | null;
        if (!id) continue;
        const cur = map.get(id) ?? {
          cliente_id: id,
          cliente_nome: (row.cliente_nome as string) ?? "",
          custo_perda: 0,
          divergencias_abertas: 0,
          custo_total: 0,
        };
        cur.custo_perda += Number(row.valor_perda ?? 0);
        map.set(id, cur);
      }

      for (const row of contagem.data ?? []) {
        const id = row.cliente_id as string;
        const cur = map.get(id) ?? {
          cliente_id: id,
          cliente_nome: row.cliente_nome as string ?? "",
          custo_perda: 0,
          divergencias_abertas: 0,
          custo_total: 0,
        };
        cur.divergencias_abertas += Number(row.total_diferenca ?? 0);
        map.set(id, cur);
      }

      const results = [...map.values()].map((r) => ({
        ...r,
        custo_total: r.custo_perda,
      }));

      return results.sort((a, b) => b.custo_total - a.custo_total);
    },
  });
}

export function useRotas() {
  return useQuery({
    queryKey: ["rotas-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotas")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMotoristas() {
  return useQuery({
    queryKey: ["motoristas-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("motoristas")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}
