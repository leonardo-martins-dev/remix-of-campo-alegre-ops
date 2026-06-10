import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { validateRateio } from "@/lib/rateio";
import { dateRangeBRT, todayBRT } from "@/lib/utils-date";

function assertItensRateio(
  itens: { produto_id: string; quantidade: number; rateio: { destinatario_id: string; quantidade: number }[] }[]
) {
  for (const item of itens) {
    const v = validateRateio(item.quantidade, item.rateio);
    if (!v.ok) throw new Error(v.error);
  }
}

export function usePedidosRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("pedidos-recebimento-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos_recebimento" },
        () => {
          qc.invalidateQueries({ queryKey: ["pedidos"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

export type PedidoRow = {
  id: string;
  codigo: string;
  fornecedor_id: string;
  origem: string;
  data_pedido: string;
  hora_chegada: string | null;
  status: string;
  fornecedores: { nome: string } | null;
  itens_count?: number;
};

export function usePedidosDia(date = todayBRT()) {
  return useQuery({
    queryKey: ["pedidos", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_recebimento")
        .select(`
          id, codigo, fornecedor_id, origem, data_pedido, hora_chegada, status,
          fornecedores(nome),
          itens_pedido(id, itens_pedido_rateio(destinatario_id, quantidade, destinatarios(nome)))
        `)
        .eq("data_pedido", date)
        .order("hora_chegada", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePedido(pedidoId: string | null) {
  return useQuery({
    queryKey: ["pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_recebimento")
        .select(`
          *,
          fornecedores(nome),
          itens_pedido(
            id, quantidade_pedida,
            produtos(id, nome, unidade),
            itens_pedido_rateio(id, quantidade, destinatarios(id, nome))
          )
        `)
        .eq("id", pedidoId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePedidoManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      codigo: string;
      fornecedor_id: string;
      itens: { produto_id: string; quantidade: number; rateio: { destinatario_id: string; quantidade: number }[] }[];
      created_by: string;
    }) => {
      assertItensRateio(payload.itens);

      const { data: pedido, error: pErr } = await supabase
        .from("pedidos_recebimento")
        .insert({
          codigo: payload.codigo,
          fornecedor_id: payload.fornecedor_id,
          origem: "manual",
          data_pedido: todayBRT(),
          hora_chegada: new Date().toISOString(),
          status: "pendente",
          created_by: payload.created_by,
        })
        .select()
        .single();
      if (pErr) throw pErr;

      for (const item of payload.itens) {
        const { data: itemRow, error: iErr } = await supabase
          .from("itens_pedido")
          .insert({ pedido_id: pedido.id, produto_id: item.produto_id, quantidade_pedida: item.quantidade })
          .select()
          .single();
        if (iErr) throw iErr;

        if (item.rateio.length) {
          const { error: rErr } = await supabase.from("itens_pedido_rateio").insert(
            item.rateio.map((r) => ({ item_pedido_id: itemRow.id, destinatario_id: r.destinatario_id, quantidade: r.quantidade }))
          );
          if (rErr) throw rErr;
        }
      }
      return pedido;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pedidos"] }),
  });
}

export function useImportPedidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      pedidos: {
        codigo: string;
        fornecedor_id: string;
        created_by: string;
        itens: { produto_id: string; quantidade: number; rateio: { destinatario_id: string; quantidade: number }[] }[];
      }[]
    ) => {
      for (const p of pedidos) {
        assertItensRateio(p.itens);

        const { data: pedido, error: pErr } = await supabase
          .from("pedidos_recebimento")
          .insert({
            codigo: p.codigo,
            fornecedor_id: p.fornecedor_id,
            origem: "excel",
            data_pedido: todayBRT(),
            hora_chegada: new Date().toISOString(),
            status: "pendente",
            created_by: p.created_by,
          })
          .select()
          .single();
        if (pErr) throw pErr;

        for (const item of p.itens) {
          const { data: itemRow, error: iErr } = await supabase
            .from("itens_pedido")
            .insert({ pedido_id: pedido.id, produto_id: item.produto_id, quantidade_pedida: item.quantidade })
            .select()
            .single();
          if (iErr) throw iErr;
          if (item.rateio.length) {
            const { error: rErr } = await supabase.from("itens_pedido_rateio").insert(
              item.rateio.map((r) => ({ item_pedido_id: itemRow.id, destinatario_id: r.destinatario_id, quantidade: r.quantidade }))
            );
            if (rErr) throw rErr;
          }
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pedidos"] }),
  });
}

export type FaltasFilters = {
  fornecedorId?: string | null;
  period?: "today" | "week" | "month";
  divergencia?: "falta" | "sobra" | "qualidade" | "all";
};

export function useFaltas(filters: FaltasFilters = {}) {
  const { fornecedorId, period = "week", divergencia = "falta" } = filters;
  const { from, to } = dateRangeBRT(period);

  return useQuery({
    queryKey: ["faltas", fornecedorId, period, divergencia],
    queryFn: async () => {
      let q = supabase
        .from("itens_conferencia")
        .select(`
          id, quantidade_recebida, divergencia, quantidade_divergencia, tem_problema_qualidade,
          itens_pedido(
            quantidade_pedida,
            produtos(nome, unidade),
            pedidos_recebimento(codigo, data_pedido, fornecedor_id, fornecedores(id, nome))
          )
        `)
        .not("divergencia", "is", null);

      if (divergencia !== "all") {
        q = q.eq("divergencia", divergencia);
      }

      const { data, error } = await q;
      if (error) throw error;

      return (data ?? []).filter((row) => {
        const ped = row.itens_pedido?.pedidos_recebimento;
        if (!ped) return false;
        if (ped.data_pedido < from || ped.data_pedido > to) return false;
        if (fornecedorId && ped.fornecedor_id !== fornecedorId) return false;
        return true;
      });
    },
  });
}

export function useFaltasResumoFornecedor(period: "today" | "week" | "month" = "week") {
  const { from, to } = dateRangeBRT(period);
  return useQuery({
    queryKey: ["faltas-resumo", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_faltas_por_fornecedor")
        .select("*")
        .gte("data_pedido", from)
        .lte("data_pedido", to);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePedidosAguardandoLiberacao() {
  return useQuery({
    queryKey: ["pedidos-liberacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_recebimento")
        .select(`
          id, codigo, status, data_pedido, hora_chegada,
          fornecedores(nome),
          conferencias(id, status, finalizada_em, itens_conferencia(
            id, divergencia, quantidade_divergencia, quantidade_recebida, foto_url,
            itens_pedido(quantidade_pedida, produtos(nome))
          ))
        `)
        .in("status", ["aguardando_liberacao", "divergencia"])
        .order("hora_chegada", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLiberarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, observacao }: { pedidoId: string; observacao?: string }) => {
      const { data, error } = await supabase.rpc("liberar_pedido_divergencia", {
        p_pedido_id: pedidoId,
        p_observacao: observacao ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["pedidos-liberacao"] });
      qc.invalidateQueries({ queryKey: ["cargas"] });
    },
  });
}

export function useUpdatePedidoAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      pedidoId: string;
      codigo?: string;
      fornecedor_id?: string;
    }) => {
      const { pedidoId, ...fields } = payload;
      const { error } = await supabase.from("pedidos_recebimento").update(fields).eq("id", pedidoId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pedidos"] }),
  });
}

export function useFillRate() {
  return useQuery({
    queryKey: ["fill-rate"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_fill_rate_fornecedor").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useConfigValor(chave: string, fallback: number) {
  return useQuery({
    queryKey: ["config", chave],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes").select("valor").eq("chave", chave).single();
      if (!data?.valor) return fallback;
      const v = typeof data.valor === "string" ? parseFloat(data.valor) : Number(data.valor);
      return Number.isFinite(v) ? v : fallback;
    },
  });
}
