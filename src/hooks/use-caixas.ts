import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { validateRetornoQuantities } from "@/lib/offline-queue";
import { dateRangeBRT, todayBRT } from "@/lib/utils-date";

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

export function useRetornosDia(date = todayBRT()) {
  return useQuery({
    queryKey: ["retornos", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retornos_caixa")
        .select("*, clientes(nome), motoristas(nome), profiles:registrado_por(nome, email)")
        .eq("data_retorno", date)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRetornoRanking(period: "today" | "week" | "month" = "week") {
  const { from, to } = dateRangeBRT(period);
  return useQuery({
    queryKey: ["retorno-ranking", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_retorno_ranking_motorista")
        .select("*")
        .gte("data_retorno", from)
        .lte("data_retorno", to)
        .order("total_caixas", { ascending: false });
      if (error) throw error;

      const byMotorista = new Map<
        string,
        {
          motorista_id: string | null;
          motorista: string;
          total_retornos: number;
          total_g: number;
          total_i: number;
          total_p: number;
          total_caixas: number;
          lojas_atendidas: number;
        }
      >();

      for (const row of data ?? []) {
        const key = row.motorista_id ?? "sem-motorista";
        const cur = byMotorista.get(key) ?? {
          motorista_id: row.motorista_id,
          motorista: row.motorista ?? "Não identificado",
          total_retornos: 0,
          total_g: 0,
          total_i: 0,
          total_p: 0,
          total_caixas: 0,
          lojas_atendidas: 0,
        };
        cur.total_retornos += Number(row.total_retornos ?? 0);
        cur.total_g += Number(row.total_g ?? 0);
        cur.total_i += Number(row.total_i ?? 0);
        cur.total_p += Number(row.total_p ?? 0);
        cur.total_caixas += Number(row.total_caixas ?? 0);
        cur.lojas_atendidas = Math.max(cur.lojas_atendidas, Number(row.lojas_atendidas ?? 0));
        byMotorista.set(key, cur);
      }

      return [...byMotorista.values()].sort((a, b) => b.total_caixas - a.total_caixas);
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
      const { data: saldoRows, error: saldoErr } = await supabase
        .from("v_saldo_caixas_cliente")
        .select("tipo_caixa, saldo")
        .eq("cliente_id", payload.cliente_id);
      if (saldoErr) throw saldoErr;

      const saldo = { G: 0, I: 0, P: 0 };
      (saldoRows ?? []).forEach((r: { tipo_caixa: string; saldo: number }) => {
        if (r.tipo_caixa === "G") saldo.G = r.saldo ?? 0;
        if (r.tipo_caixa === "I") saldo.I = r.saldo ?? 0;
        if (r.tipo_caixa === "P") saldo.P = r.saldo ?? 0;
      });

      const validationErr = validateRetornoQuantities(
        { caixas_g: payload.caixas_g, caixas_i: payload.caixas_i, caixas_p: payload.caixas_p },
        saldo
      );
      if (validationErr) throw new Error(validationErr);

      const { error } = await supabase.from("retornos_caixa").insert({
        ...payload,
        data_retorno: todayBRT(),
        sincronizado_em: new Date().toISOString(),
      });
      if (error) throw error;

      await supabase.from("registros_ciclo").insert({
        hora_retorno_caixas: new Date().toISOString(),
        data_registro: todayBRT(),
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
        data_cobranca: todayBRT(),
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
        data_movimento: todayBRT(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
      qc.invalidateQueries({ queryKey: ["perda-clientes"] });
    },
  });
}
