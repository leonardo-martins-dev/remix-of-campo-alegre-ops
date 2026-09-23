import type { User } from "@supabase/supabase-js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ensureUserProfile } from "@/lib/ensure-profile";
import { one } from "@/lib/embed";
import { nowISO, todayBRT } from "@/lib/utils-date";

const CONFERENCIA_SELECT = `
  *,
  itens_conferencia(
    id, quantidade_recebida, conferido, divergencia, quantidade_divergencia,
    tem_problema_qualidade, quantidade_qualidade, foto_url,
    dentro_tolerancia, valor_divergencia, estimado, tolerancia_pct_aplicada,
    itens_pedido(id, quantidade_pedida, preco_unitario, unidade, cliente_id, nome_externo, codigo_externo, produto_id, clientes(nome), produtos(nome, unidade, tipo_caixa_padrao_id, tolerancia_pct))
  )
`;

export type ConferenciaEdicao = {
  id: string;
  conferencia_id: string;
  editado_por: string;
  editado_em: string;
  motivo: string;
  antes: unknown;
  depois: unknown;
  vales_revisao: number;
  editor?: { nome: string } | null;
};

export function useConferenciaEdicoes(conferenciaId: string | null) {
  return useQuery({
    queryKey: ["conferencia-edicoes", conferenciaId],
    enabled: !!conferenciaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conferencia_edicoes")
        .select(`
          id, conferencia_id, editado_por, editado_em, motivo, antes, depois, vales_revisao,
          editor:profiles!conferencia_edicoes_editado_por_fkey(nome)
        `)
        .eq("conferencia_id", conferenciaId!)
        .order("editado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        editor: one(row.editor as { nome: string } | { nome: string }[] | null),
      })) as ConferenciaEdicao[];
    },
  });
}

/** Item do pedido embutido na conferência (PostgREST devolve objeto ou array). */
export type ItemPedidoEmbed = {
  id?: string;
  quantidade_pedida: number;
  preco_unitario?: number | null;
  unidade?: string | null;
  nome_externo?: string | null;
  produto_id?: string | null;
  produtos?: unknown;
  clientes?: unknown;
};

export type ItemConferenciaRow = {
  id: string;
  quantidade_recebida: number;
  conferido: boolean;
  tem_problema_qualidade: boolean;
  quantidade_qualidade: number;
  foto_url: string | null;
  itens_pedido: ItemPedidoEmbed | ItemPedidoEmbed[] | null;
};

export type ConferenciaRow = {
  id: string;
  pedido_id: string;
  status: string;
  numero?: number | null;
  editada?: boolean | null;
  itens_conferencia?: ItemConferenciaRow[] | null;
};

/** Conferência aberta do pedido; se não houver, a última registrada. */
export async function fetchConferencia(pedidoId: string): Promise<ConferenciaRow | null> {
  const { data: aberta, error: openErr } = await supabase
    .from("conferencias")
    .select(CONFERENCIA_SELECT)
    .eq("pedido_id", pedidoId)
    .in("status", ["em_andamento", "parcial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openErr) throw openErr;
  if (aberta) return aberta as ConferenciaRow;

  const { data, error } = await supabase
    .from("conferencias")
    .select(CONFERENCIA_SELECT)
    .eq("pedido_id", pedidoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ConferenciaRow | null;
}

export function useConferencia(pedidoId: string | null) {
  return useQuery({
    queryKey: ["conferencia", pedidoId],
    enabled: !!pedidoId,
    queryFn: () => fetchConferencia(pedidoId!),
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
        .select("id, status")
        .eq("pedido_id", pedidoId)
        .in("status", ["em_andamento", "parcial"])
        .maybeSingle();

      if (existing) {
        await supabase
          .from("pedidos_recebimento")
          .update({ hora_chegada: nowISO() })
          .eq("id", pedidoId)
          .is("hora_chegada", null);
        return existing;
      }

      const { data: pedido } = await supabase
        .from("pedidos_recebimento")
        .select("status, itens_pedido(id)")
        .eq("id", pedidoId)
        .single();

      const openStatuses = ["pendente", "parcial", "recebido", "em_transito"];
      if (pedido?.status && !openStatuses.includes(pedido.status)) {
        const { data: last } = await supabase
          .from("conferencias")
          .select("id, status")
          .eq("pedido_id", pedidoId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last) return last;
        throw new Error("Pedido encerrado. Apenas administradores podem reabrir.");
      }

      const { data: lastNum } = await supabase
        .from("conferencias")
        .select("numero")
        .eq("pedido_id", pedidoId)
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();
      const numero = (Number(lastNum?.numero) || 0) + 1;

      const { data: conf, error: cErr } = await supabase
        .from("conferencias")
        .insert({ pedido_id: pedidoId, conferente_id: conferenteId, status: "em_andamento", numero })
        .select()
        .single();
      if (cErr) {
        if (cErr.code === "23503") throw new Error("Perfil do usuário não encontrado. Faça logout e login novamente.");
        throw cErr;
      }

      await supabase
        .from("pedidos_recebimento")
        .update({ hora_chegada: nowISO() })
        .eq("id", pedidoId)
        .is("hora_chegada", null);

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
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["conferencia", v.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
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
        dentro_tolerancia?: boolean | null;
        valor_divergencia?: number | null;
        estimado?: boolean;
        tolerancia_pct_aplicada?: number | null;
        /** NOP-129: divergência de transporte (saída na roça × chegada). */
        qtd_saida_caixas?: number | null;
        qtd_chegada_caixas?: number | null;
        divergencia_transporte_caixas?: number | null;
        divergencia_transporte_unidades?: number | null;
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
      const locked = ["encerrado", "aguardando_liberacao", "divergencia"];
      if (pedidoAtual?.status && locked.includes(pedidoAtual.status) && status === "finalizada") {
        throw new Error("Pedido bloqueado. Visualização somente leitura.");
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
            dentro_tolerancia: it.dentro_tolerancia ?? null,
            valor_divergencia: it.valor_divergencia ?? null,
            estimado: it.estimado ?? false,
            tolerancia_pct_aplicada: it.tolerancia_pct_aplicada ?? null,
            qtd_saida_caixas: it.qtd_saida_caixas ?? null,
            qtd_chegada_caixas: it.qtd_chegada_caixas ?? null,
            divergencia_transporte_caixas: it.divergencia_transporte_caixas ?? null,
            divergencia_transporte_unidades: it.divergencia_transporte_unidades ?? null,
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

/** Item payload compartilhado entre save e edição (NOP-308). */
export type ItemConferenciaSave = {
  id: string;
  quantidade_recebida: number;
  conferido: boolean;
  divergencia: string | null;
  quantidade_divergencia: number;
  tem_problema_qualidade: boolean;
  quantidade_qualidade: number;
  dentro_tolerancia?: boolean | null;
  valor_divergencia?: number | null;
  estimado?: boolean;
  tolerancia_pct_aplicada?: number | null;
  qtd_saida_caixas?: number | null;
  qtd_chegada_caixas?: number | null;
  divergencia_transporte_caixas?: number | null;
  divergencia_transporte_unidades?: number | null;
};

/** NOP-308 — edita conferência já finalizada (auditoria + recalcula status/vales). */
export function useSalvarEdicaoConferencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conferenciaId,
      pedidoId,
      motivo,
      itens,
    }: {
      conferenciaId: string;
      pedidoId: string;
      motivo: string;
      itens: ItemConferenciaSave[];
    }) => {
      const { data, error } = await supabase.rpc("salvar_edicao_conferencia", {
        p_conferencia_id: conferenciaId,
        p_pedido_id: pedidoId,
        p_motivo: motivo.trim(),
        p_itens: itens,
      });
      if (error) throw new Error(error.message);
      return data as { edicao_id: string; pedido_status: string; vales_revisao: number };
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["conferencia", v.pedidoId] });
      qc.invalidateQueries({ queryKey: ["conferencia-edicoes", v.conferenciaId] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["faltas"] });
      qc.invalidateQueries({ queryKey: ["fill-rate"] });
      qc.invalidateQueries({ queryKey: ["vales"] });
      qc.invalidateQueries({ queryKey: ["vales-conferente"] });
      qc.invalidateQueries({ queryKey: ["saldos-caixa"] });
      qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
    },
  });
}
