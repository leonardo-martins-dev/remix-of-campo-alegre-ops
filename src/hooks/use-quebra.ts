import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { one } from "@/lib/embed";

export function useQuebras(filters: {
  from?: string;
  to?: string;
  fornecedorId?: string | null;
  produtoId?: string | null;
}) {
  return useQuery({
    queryKey: ["quebras", filters],
    queryFn: async () => {
      let q = supabase
        .from("quebras")
        .select("*, fornecedores(nome), profiles:registrado_por(nome), quebra_itens(*, produtos(nome))")
        .neq("status", "removido")
        .order("registrado_em", { ascending: false });
      if (filters.fornecedorId) q = q.eq("fornecedor_id", filters.fornecedorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).filter((row) => {
        const d = (row.registrado_em as string).slice(0, 10);
        if (filters.from && d < filters.from) return false;
        if (filters.to && d > filters.to) return false;
        if (filters.produtoId) {
          const itens = row.quebra_itens as { produto_id: string }[] | null;
          if (!itens?.some((i) => i.produto_id === filters.produtoId)) return false;
        }
        return true;
      });
    },
  });
}

export function useUltimasEntregasProduto(fornecedorId: string | null, produtoId: string | null) {
  return useQuery({
    queryKey: ["entregas-produto", fornecedorId, produtoId],
    enabled: !!fornecedorId && !!produtoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("itens_conferencia")
        .select(`
          id, quantidade_recebida,
          itens_pedido(id, produto_id, preco_unitario, quantidade_pedida, pedidos_recebimento(id, codigo, fornecedor_id, data_pedido)),
          conferencias(id, finalizada_em, status)
        `)
        .eq("conferencias.status", "finalizada")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => {
          const ip = one(r.itens_pedido);
          const ped = one(ip?.pedidos_recebimento);
          return ped?.fornecedor_id === fornecedorId && ip?.produto_id === produtoId;
        })
        .slice(0, 5);
    },
  });
}

export function useRegistrarQuebra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      fornecedor_id: string;
      registrado_por: string;
      observacao?: string;
      itens: {
        produto_id: string;
        quantidade: number;
        conferencia_item_id?: string | null;
        preco_unitario: number | null;
        valor: number;
        estimado: boolean;
      }[];
    }) => {
      const { data: laudo, error } = await supabase
        .from("quebras")
        .insert({
          fornecedor_id: payload.fornecedor_id,
          registrado_por: payload.registrado_por,
          observacao: payload.observacao ?? null,
          status: "registrado",
        })
        .select()
        .single();
      if (error) throw error;
      const { error: iErr } = await supabase.from("quebra_itens").insert(
        payload.itens.map((it) => ({
          quebra_id: laudo.id,
          produto_id: it.produto_id,
          quantidade: it.quantidade,
          conferencia_item_id: it.conferencia_item_id ?? null,
          preco_unitario: it.preco_unitario,
          valor: it.valor,
          estimado: it.estimado,
        }))
      );
      if (iErr) throw iErr;
      return laudo;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quebras"] }),
  });
}

export function useEditarQuebraItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      quebraId: string;
      itemId: string;
      antes: Record<string, unknown>;
      depois: Record<string, unknown>;
      autorId: string;
    }) => {
      const { error } = await supabase.from("quebra_itens").update(payload.depois).eq("id", payload.itemId);
      if (error) throw error;
      await supabase.from("quebra_historico").insert({
        quebra_id: payload.quebraId,
        item_id: payload.itemId,
        antes: payload.antes,
        depois: payload.depois,
        autor_id: payload.autorId,
      });
      await supabase.from("quebras").update({ status: "editado" }).eq("id", payload.quebraId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quebras"] }),
  });
}
