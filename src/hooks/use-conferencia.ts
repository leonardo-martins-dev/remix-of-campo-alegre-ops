import type { User } from "@supabase/supabase-js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/ensure-profile";

export function useConferencia(pedidoId: string | null) {
  return useQuery({
    queryKey: ["conferencia", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conferencias")
        .select(`
          *,
          itens_conferencia(
            id, quantidade_recebida, conferido, divergencia, quantidade_divergencia,
            tem_problema_qualidade, quantidade_qualidade, foto_url,
            itens_pedido(id, quantidade_pedida, produtos(nome, unidade), itens_pedido_rateio(quantidade, destinatarios(nome)))
          )
        `)
        .eq("pedido_id", pedidoId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useStartConferencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pedidoId,
      conferenteId,
      user,
    }: {
      pedidoId: string;
      conferenteId: string;
      user: User;
    }) => {
      await ensureUserProfile(user);

      const { data: existing } = await supabase
        .from("conferencias")
        .select("id")
        .eq("pedido_id", pedidoId)
        .in("status", ["em_andamento", "parcial"])
        .maybeSingle();

      if (existing) return existing;

      const { data: pedido } = await supabase
        .from("pedidos_recebimento")
        .select("itens_pedido(id)")
        .eq("id", pedidoId)
        .single();

      const { data: conf, error: cErr } = await supabase
        .from("conferencias")
        .insert({ pedido_id: pedidoId, conferente_id: conferenteId, status: "em_andamento" })
        .select()
        .single();
      if (cErr) {
        if (cErr.code === "23503") throw new Error("Perfil do usuário não encontrado. Faça logout e login novamente.");
        throw cErr;
      }

      const itens = pedido?.itens_pedido ?? [];
      if (itens.length) {
        const { error: iErr } = await supabase.from("itens_conferencia").insert(
          itens.map((it: { id: string }) => ({
            conferencia_id: conf.id,
            item_pedido_id: it.id,
            quantidade_recebida: 0,
            conferido: false,
          }))
        );
        if (iErr) throw iErr;
      }

      return conf;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["conferencia", v.pedidoId] }),
  });
}

export function useSaveConferenciaItens() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conferenciaId,
      pedidoId,
      itens,
      status,
    }: {
      conferenciaId: string;
      pedidoId: string;
      status: "parcial" | "finalizada";
      itens: {
        id: string;
        quantidade_recebida: number;
        conferido: boolean;
        divergencia: string | null;
        quantidade_divergencia: number;
        tem_problema_qualidade: boolean;
        quantidade_qualidade: number;
      }[];
    }) => {
      for (const it of itens) {
        const { error } = await supabase
          .from("itens_conferencia")
          .update({
            quantidade_recebida: it.quantidade_recebida,
            conferido: it.conferido,
            divergencia: it.divergencia,
            quantidade_divergencia: it.quantidade_divergencia,
            tem_problema_qualidade: it.tem_problema_qualidade,
            quantidade_qualidade: it.quantidade_qualidade,
            updated_at: new Date().toISOString(),
          })
          .eq("id", it.id);
        if (error) throw new Error(error.message);
      }

      const { error: cErr } = await supabase
        .from("conferencias")
        .update({ status, ...(status === "finalizada" ? { finalizada_em: new Date().toISOString() } : {}) })
        .eq("id", conferenciaId);
      if (cErr) throw new Error(cErr.message);

      if (status === "finalizada") {
        const hasDivergencia = itens.some((it) => it.divergencia != null);
        const pedidoStatus = hasDivergencia ? "divergencia" : "conferido";

        const { error: pErr } = await supabase
          .from("pedidos_recebimento")
          .update({ status: pedidoStatus, updated_at: new Date().toISOString() })
          .eq("id", pedidoId);
        if (pErr) throw new Error(pErr.message);

        const { error: cicloErr } = await supabase.from("registros_ciclo").insert({
          pedido_id: pedidoId,
          hora_chegada_fornecedor: new Date().toISOString(),
          hora_conferencia_ok: new Date().toISOString(),
          data_registro: new Date().toISOString().slice(0, 10),
        });
        if (cicloErr) console.warn("registros_ciclo:", cicloErr.message);
      }
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["conferencia", v.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["faltas"] });
      qc.invalidateQueries({ queryKey: ["fill-rate"] });
    },
  });
}

export function useAddItemAvulso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pedidoId,
      conferenciaId,
      produtoId,
      quantidade,
    }: {
      pedidoId: string;
      conferenciaId: string;
      produtoId: string;
      quantidade: number;
    }) => {
      const { data: item, error: iErr } = await supabase
        .from("itens_pedido")
        .insert({ pedido_id: pedidoId, produto_id: produtoId, quantidade_pedida: quantidade })
        .select()
        .single();
      if (iErr) throw iErr;

      const { error: cErr } = await supabase.from("itens_conferencia").insert({
        conferencia_id: conferenciaId,
        item_pedido_id: item.id,
        quantidade_recebida: quantidade,
        conferido: true,
      });
      if (cErr) throw cErr;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["conferencia", v.pedidoId] }),
  });
}

export async function uploadConferenciaFoto(file: File, itemId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${itemId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("conferencia-fotos").upload(path, file);
  if (upErr) throw upErr;
  const { data: urlData } = supabase.storage.from("conferencia-fotos").getPublicUrl(path);
  const { error } = await supabase.from("itens_conferencia").update({ foto_url: urlData.publicUrl }).eq("id", itemId);
  if (error) throw error;
  return urlData.publicUrl;
}
