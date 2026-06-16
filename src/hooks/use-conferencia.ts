import type { User } from "@supabase/supabase-js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/ensure-profile";
import { nowISO, todayBRT } from "@/lib/utils-date";

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

      const { data: finalized } = await supabase
        .from("conferencias")
        .select("id, status")
        .eq("pedido_id", pedidoId)
        .eq("status", "finalizada")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (finalized) return finalized;

      const { data: existing } = await supabase
        .from("conferencias")
        .select("id")
        .eq("pedido_id", pedidoId)
        .in("status", ["em_andamento", "parcial"])
        .maybeSingle();

      if (existing) return existing;

      const { data: pedido } = await supabase
        .from("pedidos_recebimento")
        .select("status, itens_pedido(id)")
        .eq("id", pedidoId)
        .single();

      if (pedido?.status && pedido.status !== "pendente") {
        throw new Error("Pedido já conferido. Apenas administradores podem reabrir edição.");
      }

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
      const { data: confAtual, error: confErr } = await supabase
        .from("conferencias")
        .select("status")
        .eq("id", conferenciaId)
        .single();
      if (confErr) throw new Error(confErr.message);
      if (confAtual?.status === "finalizada") {
        throw new Error("Conferência já finalizada. Não é possível alterar.");
      }

      const { data: pedidoAtual } = await supabase
        .from("pedidos_recebimento")
        .select("status")
        .eq("id", pedidoId)
        .single();
      if (
        pedidoAtual?.status &&
        pedidoAtual.status !== "pendente"
      ) {
        throw new Error("Pedido já conferido. Visualização somente leitura.");
      }

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

      const { error: rpcErr } = await supabase.rpc("update_conferencia_status", {
        p_conferencia_id: conferenciaId,
        p_pedido_id: pedidoId,
        p_status: status,
      });
      if (rpcErr) {
        if (rpcErr.code === "PGRST202") {
          const { error: cErr } = await supabase
            .from("conferencias")
            .update({ status })
            .eq("id", conferenciaId);
          if (cErr) throw new Error(cErr.message);
        } else {
          throw new Error(rpcErr.message);
        }
      }

      let cargasGeradas: { carga_id: string; codigo: string }[] = [];

      if (status === "finalizada") {
        const { error: cicloErr } = await supabase.from("registros_ciclo").insert({
          pedido_id: pedidoId,
          hora_chegada_fornecedor: nowISO(),
          hora_conferencia_ok: nowISO(),
          data_registro: todayBRT(),
        });
        if (cicloErr) console.warn("registros_ciclo:", cicloErr.message);

        const { data: genData, error: genErr } = await supabase.rpc("gerar_cargas_pos_conferencia", {
          p_pedido_id: pedidoId,
        });
        if (genErr && genErr.code !== "PGRST202") {
          console.warn("gerar_cargas:", genErr.message);
        } else if (Array.isArray(genData)) {
          cargasGeradas = genData as { carga_id: string; codigo: string }[];
        }
      }

      return { cargasGeradas };
    },
    onSuccess: (result, v) => {
      qc.invalidateQueries({ queryKey: ["conferencia", v.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["faltas"] });
      qc.invalidateQueries({ queryKey: ["fill-rate"] });
      if (v.status === "finalizada") {
        qc.invalidateQueries({ queryKey: ["cargas"] });
        qc.invalidateQueries({ queryKey: ["fila-expedicao"] });
      }
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
