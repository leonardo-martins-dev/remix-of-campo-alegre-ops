import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/utils-date";

export function useSaldoCaixas() {
  return useQuery({
    queryKey: ["saldo-caixas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_saldo_caixas_cliente").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePerdaClientes() {
  return useQuery({
    queryKey: ["perda-clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_perda_por_cliente").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRetornosDia(date = todayISO()) {
  return useQuery({
    queryKey: ["retornos", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retornos_caixa")
        .select("*, clientes(nome)")
        .eq("data_retorno", date)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMovimentacoesCliente(clienteId: string | null) {
  return useQuery({
    queryKey: ["movimentacoes", clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movimentacoes_caixa")
        .select("*")
        .eq("cliente_id", clienteId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMovimentacoesTrend(clienteId: string) {
  return useQuery({
    queryKey: ["mov-trend", clienteId],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const { data, error } = await supabase
        .from("movimentacoes_caixa")
        .select("data_movimento, tipo, quantidade")
        .eq("cliente_id", clienteId)
        .gte("data_movimento", since.toISOString().slice(0, 10));
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRegistrarRetorno() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      cliente_id: string;
      motorista_id?: string;
      registrado_por: string;
      caixas_g: number;
      caixas_i: number;
      caixas_p: number;
      offline?: boolean;
    }) => {
      const { error } = await supabase.from("retornos_caixa").insert({
        ...payload,
        data_retorno: todayISO(),
        sincronizado_em: new Date().toISOString(),
      });
      if (error) throw error;

      await supabase.from("registros_ciclo").insert({
        hora_retorno_caixas: new Date().toISOString(),
        data_registro: todayISO(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["retornos"] });
      qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
    },
  });
}

export function useCobrarCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      cliente_id: string;
      tipo_caixa: "G" | "I" | "P";
      quantidade: number;
      custo_unitario: number;
      created_by: string;
    }) => {
      const { error } = await supabase.from("cobrancas_caixa").insert({
        ...payload,
        status: "pendente",
        data_cobranca: todayISO(),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["perda-clientes"] }),
  });
}

export function useRegistrarPerda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      cliente_id: string;
      tipo_caixa: "G" | "I" | "P";
      quantidade: number;
      registrado_por: string;
    }) => {
      const { error } = await supabase.from("movimentacoes_caixa").insert({
        ...payload,
        tipo: "perda",
        data_movimento: todayISO(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
      qc.invalidateQueries({ queryKey: ["perda-clientes"] });
    },
  });
}
