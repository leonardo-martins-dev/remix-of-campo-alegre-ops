import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { one } from "@/lib/embed";
import { dateKeyBRT } from "@/lib/utils-date";

export type TipoOcorrenciaQuebra = "quebra" | "falta_de_qualidade";

export function useQuebras(filters: {
  from?: string;
  to?: string;
  fornecedorId?: string | null;
  produtoId?: string | null;
  tipoOcorrencia?: TipoOcorrenciaQuebra | null;
}) {
  return useQuery({
    queryKey: ["quebras", filters],
    queryFn: async () => {
      let q = supabase
        .from("quebras")
        .select(
          "*, fornecedores(nome), profiles:registrado_por(nome), aprovador:aprovado_por(nome), quebra_itens(*, produtos(nome))",
        )
        .neq("status", "removido")
        .order("registrado_em", { ascending: false });
      if (filters.fornecedorId) q = q.eq("fornecedor_id", filters.fornecedorId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).filter((row) => {
        const d = dateKeyBRT(row.registrado_em as string);
        if (filters.from && d < filters.from) return false;
        if (filters.to && d > filters.to) return false;
        if (filters.produtoId) {
          const itens = row.quebra_itens as { produto_id: string }[] | null;
          if (!itens?.some((i) => i.produto_id === filters.produtoId)) return false;
        }
        if (filters.tipoOcorrencia) {
          const itens = row.quebra_itens as { tipo_ocorrencia: TipoOcorrenciaQuebra }[] | null;
          if (!itens?.some((i) => i.tipo_ocorrencia === filters.tipoOcorrencia)) return false;
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
        .select(
          `
          id, quantidade_recebida,
          itens_pedido(id, produto_id, preco_unitario, quantidade_pedida, pedidos_recebimento(id, codigo, fornecedor_id, data_pedido)),
          conferencias(id, finalizada_em, status)
        `,
        )
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
      fornecedor_id: string | null;
      registrado_por: string;
      observacao?: string;
      itens: {
        produto_id: string;
        quantidade: number;
        conferencia_item_id?: string | null;
        preco_unitario: number | null;
        valor: number;
        estimado: boolean;
        tipo_ocorrencia: TipoOcorrenciaQuebra;
        foto_url?: string | null;
        observacao?: string | null;
      }[];
    }) => {
      const { data: laudo, error } = await supabase
        .from("quebras")
        .insert({
          fornecedor_id: payload.fornecedor_id,
          registrado_por: payload.registrado_por,
          observacao: payload.observacao ?? null,
          status: payload.fornecedor_id ? "registrado" : "origem_nao_identificada",
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
          tipo_ocorrencia: it.tipo_ocorrencia,
          foto_url: it.foto_url ?? null,
          observacao: it.observacao ?? null,
        })),
      );
      if (iErr) throw iErr;
      return laudo;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quebras"] }),
  });
}

export function useVincularFornecedorQuebra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { quebraId: string; fornecedorId: string }) => {
      const { error } = await supabase
        .from("quebras")
        .update({
          fornecedor_id: payload.fornecedorId,
          status: "registrado",
        })
        .eq("id", payload.quebraId);
      if (error) throw error;
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
      const { error } = await supabase
        .from("quebra_itens")
        .update(payload.depois)
        .eq("id", payload.itemId);
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

export async function uploadQuebraFoto(file: File, itemId: string): Promise<string> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${itemId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("quebra-fotos").upload(path, file);
  if (upErr) throw upErr;
  const { data: urlData } = supabase.storage.from("quebra-fotos").getPublicUrl(path);
  const { error } = await supabase
    .from("quebra_itens")
    .update({ foto_url: urlData.publicUrl })
    .eq("id", itemId);
  if (error) throw error;
  return urlData.publicUrl;
}

export function useAprovarQuebra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { quebraId: string; aprovadoPor: string }) => {
      const { error } = await supabase
        .from("quebras")
        .update({
          aprovado_por: payload.aprovadoPor,
          aprovado_em: new Date().toISOString(),
        })
        .eq("id", payload.quebraId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quebras"] }),
  });
}
