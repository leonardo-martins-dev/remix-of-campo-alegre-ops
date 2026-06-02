import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayISO } from "@/lib/utils-date";

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

export function usePedidosDia(date = todayISO()) {
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
      const { data: pedido, error: pErr } = await supabase
        .from("pedidos_recebimento")
        .insert({
          codigo: payload.codigo,
          fornecedor_id: payload.fornecedor_id,
          origem: "manual",
          data_pedido: todayISO(),
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
        const { data: pedido, error: pErr } = await supabase
          .from("pedidos_recebimento")
          .insert({
            codigo: p.codigo,
            fornecedor_id: p.fornecedor_id,
            origem: "excel",
            data_pedido: todayISO(),
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

export function useFaltas() {
  return useQuery({
    queryKey: ["faltas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itens_conferencia")
        .select(`
          id, quantidade_recebida, divergencia, quantidade_divergencia, tem_problema_qualidade,
          itens_pedido(quantidade_pedida, produtos(nome, unidade), pedidos_recebimento(codigo, fornecedores(nome)))
        `)
        .not("divergencia", "is", null);
      if (error) throw error;
      return data ?? [];
    },
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
