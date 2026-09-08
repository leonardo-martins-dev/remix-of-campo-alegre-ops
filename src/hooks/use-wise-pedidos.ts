import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";
import { normalizeKey } from "@/lib/normalize";
import {
  applyAliases,
  buildWisePedidos,
  parseWisePedido,
  type AliasRow,
  type WiseBuildPedido,
} from "@/lib/excel-wise-pedidos";

export type ImportWiseResult = {
  novos: number;
  atualizados: number;
  itens: number;
  pendencias: number;
  ignoradas: { motivo: string }[];
};

function mapsFromCadastros(
  fornecedores: { id: string; nome: string }[],
  produtos: { id: string; nome: string }[],
  destinatarios: { id: string; nome: string }[],
  aliases: AliasRow[]
) {
  const fornecedorByName = new Map(fornecedores.map((f) => [normalizeKey(f.nome), f.id]));
  const produtoByName = new Map(produtos.map((p) => [normalizeKey(p.nome), p.id]));
  const destinatarioByName = new Map(destinatarios.map((d) => [normalizeKey(d.nome), d.id]));
  return applyAliases(
    {
      fornecedorByName,
      fornecedorByCode: new Map(),
      produtoByName,
      produtoByCode: new Map(),
      destinatarioByName,
    },
    aliases
  );
}

export function useImportWisePedidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      file: ArrayBuffer;
      filename: string;
      created_by: string;
      fornecedores: { id: string; nome: string }[];
      produtos: { id: string; nome: string }[];
      destinatarios: { id: string; nome: string }[];
    }): Promise<ImportWiseResult> => {
      const parsed = parseWisePedido(payload.file);
      if (!parsed.ok) throw new Error(parsed.error);

      const { data: aliases } = await supabase.from("aliases").select("tipo, nome_externo, codigo_externo, entidade_id");
      const maps = mapsFromCadastros(
        payload.fornecedores,
        payload.produtos,
        payload.destinatarios,
        (aliases ?? []) as AliasRow[]
      );
      const pedidos = buildWisePedidos(parsed.rows, maps);

      const { data: lote, error: loteErr } = await supabase
        .from("importacoes_pedido")
        .insert({
          arquivo: payload.filename,
          formato: payload.filename.toLowerCase().endsWith(".csv") ? "csv" : "xlsx",
          usuario_id: payload.created_by,
          status: "ok",
        })
        .select()
        .single();
      if (loteErr) throw loteErr;

      let novos = 0;
      let atualizados = 0;
      let itens = 0;
      let pendencias = 0;
      const ignoradas: { motivo: string }[] = [];

      for (const ped of pedidos) {
        const hasPend = ped.pendencias.length > 0 || !ped.fornecedor_id;
        const { data: existing } = await supabase
          .from("pedidos_recebimento")
          .select("id, status")
          .eq("wise_pedido_id", ped.wise_pedido_id)
          .maybeSingle();

        const status = hasPend ? "aguardando_vinculo" : "pendente";
        let pedidoId = existing?.id;
        let fornecedorId = ped.fornecedor_id;

        if (!fornecedorId) {
          const { data: placeholder } = await supabase
            .from("fornecedores")
            .select("id")
            .eq("nome", "Aguardando vínculo")
            .maybeSingle();
          if (placeholder) fornecedorId = placeholder.id;
          else {
            const { data: createdF } = await supabase
              .from("fornecedores")
              .insert({ nome: "Aguardando vínculo" })
              .select("id")
              .single();
            fornecedorId = createdF?.id ?? null;
          }
        }

        if (!existing) {
          if (!fornecedorId) throw new Error(`Pedido ${ped.wise_pedido_id}: sem fornecedor`);
          const { data: created, error } = await supabase
            .from("pedidos_recebimento")
            .insert({
              codigo: ped.wise_pedido_id,
              fornecedor_id: fornecedorId,
              origem: "wisetec",
              wise_pedido_id: ped.wise_pedido_id,
              data_prevista: ped.data_prevista,
              data_pedido: todayBRT(),
              status,
              importacao_id: lote.id,
              created_by: payload.created_by,
            })
            .select("id")
            .single();
          if (error) throw error;
          pedidoId = created.id;
          novos++;
        } else {
          if (["conferido", "recebido", "encerrado", "aguardando_liberacao"].includes(existing.status)) {
            ignoradas.push({ motivo: `Pedido ${ped.wise_pedido_id}: já possui entrega conferida — itens conferidos preservados` });
          }
          await supabase
            .from("pedidos_recebimento")
            .update({
              data_prevista: ped.data_prevista,
              importacao_id: lote.id,
              status: hasPend ? "aguardando_vinculo" : existing.status === "pendente" || existing.status === "aguardando_vinculo" ? status : existing.status,
            })
            .eq("id", existing.id);
          atualizados++;
        }

        if (!pedidoId) continue;

        const conferidos = new Set<string>();
        const { data: confItens } = await supabase
          .from("itens_conferencia")
          .select("item_pedido_id, conferido, conferencias!inner(pedido_id, status)")
          .eq("conferencias.pedido_id", pedidoId)
          .eq("conferido", true);
        (confItens ?? []).forEach((r: { item_pedido_id: string }) => conferidos.add(r.item_pedido_id));

        for (const item of ped.itens) {
          if (!item.produto_id) continue;
          const { data: existingItem } = await supabase
            .from("itens_pedido")
            .select("id")
            .eq("pedido_id", pedidoId)
            .eq("produto_id", item.produto_id)
            .maybeSingle();

          if (existingItem && conferidos.has(existingItem.id)) continue;

          let itemId = existingItem?.id;
          if (existingItem) {
            await supabase
              .from("itens_pedido")
              .update({
                quantidade_pedida: item.quantidade,
                preco_unitario: item.preco_unitario,
                unidade: item.unidade,
              })
              .eq("id", existingItem.id);
          } else {
            const { data: created, error } = await supabase
              .from("itens_pedido")
              .insert({
                pedido_id: pedidoId,
                produto_id: item.produto_id,
                quantidade_pedida: item.quantidade,
                preco_unitario: item.preco_unitario,
                unidade: item.unidade,
              })
              .select("id")
              .single();
            if (error) throw error;
            itemId = created.id;
          }
          itens++;
          if (!itemId) continue;
          await supabase.from("itens_pedido_rateio").delete().eq("item_pedido_id", itemId);
          const rateioOk = item.rateio.filter((r) => r.destinatario_id);
          if (rateioOk.length) {
            await supabase.from("itens_pedido_rateio").insert(
              rateioOk.map((r) => ({
                item_pedido_id: itemId,
                destinatario_id: r.destinatario_id!,
                quantidade: r.quantidade,
              }))
            );
          }
        }

        for (const pen of ped.pendencias) {
          pendencias++;
          await supabase.from("pendencias_vinculo").insert({
            importacao_id: lote.id,
            pedido_id: pedidoId,
            tipo: pen.tipo,
            nome_externo: pen.nome,
            codigo_externo: pen.codigo ?? null,
            ocorrencias: 1,
            status: "aberta",
          });
        }
      }

      await supabase
        .from("importacoes_pedido")
        .update({
          pedidos_novos: novos,
          pedidos_atualizados: atualizados,
          itens,
          pendencias,
          linhas_ignoradas: ignoradas.length,
          ignoradas_motivo: ignoradas,
        })
        .eq("id", lote.id);

      return { novos, atualizados, itens, pendencias, ignoradas };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["pendencias-vinculo"] });
      qc.invalidateQueries({ queryKey: ["importacoes"] });
    },
  });
}

export function useImportacoes() {
  return useQuery({
    queryKey: ["importacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("importacoes_pedido")
        .select("*, profiles:usuario_id(nome)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useResolverPendencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      pendenciaId: string;
      acao: "vincular" | "criar" | "dispensar";
      entidadeId?: string;
      criarNome?: string;
      tipo: "fornecedor" | "produto" | "destinatario";
      nomeExterno: string;
      codigoExterno?: string | null;
      clienteId?: string;
      motivo?: string;
      userId: string;
    }) => {
      let entidadeId = payload.entidadeId ?? null;

      if (payload.acao === "criar") {
        const table = payload.tipo === "fornecedor" ? "fornecedores" : payload.tipo === "produto" ? "produtos" : "destinatarios";
        const row: Record<string, unknown> = { nome: payload.criarNome ?? payload.nomeExterno };
        if (payload.tipo === "produto") row.unidade = "cx";
        const { data, error } = await supabase.from(table).insert(row).select("id").single();
        if (error) throw error;
        entidadeId = data.id;
        if (payload.tipo === "destinatario" && payload.clienteId) {
          await supabase.from("destinatario_cliente_map").upsert({
            destinatario_id: entidadeId,
            cliente_id: payload.clienteId,
          });
        }
      }

      if (payload.acao !== "dispensar" && entidadeId) {
        await supabase.from("aliases").upsert(
          {
            tipo: payload.tipo,
            nome_externo: payload.nomeExterno,
            codigo_externo: payload.codigoExterno ?? null,
            entidade_id: entidadeId,
            origem: "wise",
          },
          { onConflict: "tipo,origem,nome_externo" }
        );
      }

      const { data: pend } = await supabase
        .from("pendencias_vinculo")
        .update({
          status: payload.acao === "dispensar" ? "dispensada" : payload.acao === "criar" ? "criada" : "vinculada",
          motivo: payload.motivo ?? null,
          entidade_id: entidadeId,
          resolved_by: payload.userId,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", payload.pendenciaId)
        .select("pedido_id")
        .single();

      if (pend?.pedido_id) {
        const { count } = await supabase
          .from("pendencias_vinculo")
          .select("id", { count: "exact", head: true })
          .eq("pedido_id", pend.pedido_id)
          .eq("status", "aberta");
        if (!count) {
          await supabase.from("pedidos_recebimento").update({ status: "pendente" }).eq("id", pend.pedido_id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pendencias-vinculo"] });
      qc.invalidateQueries({ queryKey: ["aliases"] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["cadastros"] });
    },
  });
}

export type { WiseBuildPedido };
