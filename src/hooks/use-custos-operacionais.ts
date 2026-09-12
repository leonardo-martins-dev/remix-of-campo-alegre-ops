import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { dateRangeBRT } from "@/lib/utils-date";

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
      let q = supabase
        .from("v_custo_perda_caixas")
        .select("*")
        .gte("data_movimento", from)
        .lte("data_movimento", to);

      if (filters.fornecedorId) {
        q = q.eq("fornecedor_id", filters.fornecedorId);
      }
      if (filters.clienteId) {
        q = q.eq("cliente_id", filters.clienteId);
      }
      if (filters.tipoCaixa) {
        q = q.eq("tipo_caixa", filters.tipoCaixa);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCustoPerdaRota(filters: CustoFilters) {
  const { from, to } = dateRangeBRT(filters.period);

  return useQuery({
    queryKey: ["custo-perda-rota", filters],
    queryFn: async () => {
      let q = supabase
        .from("v_custo_perda_rota")
        .select("*")
        .gte("data_carga", from)
        .lte("data_carga", to);

      if (filters.rotaId) {
        q = q.eq("rota_id", filters.rotaId);
      }
      if (filters.motoristaId) {
        q = q.eq("motorista_id", filters.motoristaId);
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

export function useCustoRecebimento(filters: CustoFilters) {
  const { from, to } = dateRangeBRT(filters.period);

  return useQuery({
    queryKey: ["custo-recebimento", filters],
    queryFn: async () => {
      let q = supabase
        .from("v_custo_recebimento")
        .select("*")
        .gte("data_pedido", from)
        .lte("data_pedido", to);

      if (filters.fornecedorId) {
        q = q.eq("fornecedor_id", filters.fornecedorId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCustoQuebra(filters: CustoFilters) {
  const { from, to } = dateRangeBRT(filters.period);

  return useQuery({
    queryKey: ["custo-quebra", filters],
    queryFn: async () => {
      let q = supabase
        .from("v_custo_quebra")
        .select("*")
        .gte("data_quebra", from)
        .lte("data_quebra", to);

      if (filters.fornecedorId) {
        q = q.eq("fornecedor_id", filters.fornecedorId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
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
        supabase
          .from("v_custo_perda_caixas")
          .select("fornecedor_id, fornecedor_nome, valor_perda")
          .gte("data_movimento", from)
          .lte("data_movimento", to)
          .not("fornecedor_id", "is", null),
        supabase
          .from("v_custo_recebimento")
          .select("fornecedor_id, fornecedor_nome, divergencia, valor_divergencia")
          .gte("data_pedido", from)
          .lte("data_pedido", to),
        supabase
          .from("v_custo_quebra")
          .select("fornecedor_id, fornecedor_nome, valor")
          .gte("data_quebra", from)
          .lte("data_quebra", to),
      ]);

      const map = new Map<string, {
        fornecedor_id: string;
        fornecedor_nome: string;
        custo_perda: number;
        custo_recebimento: number;
        custo_quebra: number;
        custo_total: number;
      }>();

      for (const row of perda.data ?? []) {
        const id = row.fornecedor_id as string;
        const cur = map.get(id) ?? {
          fornecedor_id: id,
          fornecedor_nome: row.fornecedor_nome as string ?? "",
          custo_perda: 0,
          custo_recebimento: 0,
          custo_quebra: 0,
          custo_total: 0,
        };
        cur.custo_perda += Number(row.valor_perda ?? 0);
        map.set(id, cur);
      }

      for (const row of recebimento.data ?? []) {
        const id = row.fornecedor_id as string;
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
        const id = row.fornecedor_id as string;
        const cur = map.get(id) ?? {
          fornecedor_id: id,
          fornecedor_nome: row.fornecedor_nome as string ?? "",
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
        supabase
          .from("v_custo_perda_caixas")
          .select("cliente_id, cliente_nome, valor_perda")
          .gte("data_movimento", from)
          .lte("data_movimento", to)
          .not("cliente_id", "is", null),
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

      for (const row of perda.data ?? []) {
        const id = row.cliente_id as string;
        const cur = map.get(id) ?? {
          cliente_id: id,
          cliente_nome: row.cliente_nome as string ?? "",
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
