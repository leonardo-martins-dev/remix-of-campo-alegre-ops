import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { validateRateio } from "@/lib/rateio";
import { addDaysBRT, dateRangeBRT, todayBRT } from "@/lib/utils-date";
import { one } from "@/lib/embed";
import { safePct } from "@/lib/indicadores-metricas";

async function fetchConfigNum(chave: string, fallback: number): Promise<number> {
  const { data } = await supabase.from("configuracoes").select("valor").eq("chave", chave).maybeSingle();
  const v = typeof data?.valor === "string" ? parseFloat(data.valor) : Number(data?.valor);
  return Number.isFinite(v) ? v : fallback;
}

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
    let errors = 0;
    const channel = supabase
      .channel("pedidos-recebimento-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos_recebimento" },
        () => {
          qc.invalidateQueries({ queryKey: ["pedidos"] });
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          errors += 1;
          if (errors >= 3) {
            supabase.removeChannel(channel);
          }
        }
        if (status === "SUBSCRIBED") errors = 0;
      });
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
  wise_pedido_id?: string | null;
  data_prevista?: string | null;
  fornecedores: { nome: string } | null;
  itens_count?: number;
};

export function usePedidosDia(date = todayBRT()) {
  return useQuery({
    queryKey: ["pedidos", date],
    queryFn: async () => {
      // Dia operacional: data_prevista (entrega) OU data_pedido (emissão Wise).
      // Pedidos Wise costumam vir com prevista = emissão+1 e o galpão recebe no dia da emissão.
      const { data, error } = await supabase
        .from("pedidos_recebimento")
        .select(`
          id, codigo, fornecedor_id, origem, data_pedido, hora_chegada, status, wise_pedido_id, data_prevista,
          fornecedores(nome),
          itens_pedido(id, cliente_id, clientes(nome), itens_pedido_rateio(destinatario_id, quantidade, destinatarios(nome)))
        `)
        .or(
          `data_prevista.eq.${date},data_pedido.eq.${date},and(data_prevista.is.null,data_pedido.eq.${date})`,
        )
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
            id, quantidade_pedida, preco_unitario, unidade, cliente_id, nome_externo, codigo_externo, produto_id,
            produtos(id, nome, unidade, codigo, tolerancia_pct, tipo_caixa_padrao_id),
            clientes(id, nome, cnpj),
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
      itens: { produto_id: string; quantidade: number; preco_unitario?: number | null; cliente_id?: string | null; rateio: { destinatario_id: string; quantidade: number }[] }[];
      created_by: string;
    }) => {
      const precisaRateio = payload.itens.some((i) => !i.cliente_id && i.rateio.length);
      if (precisaRateio) assertItensRateio(payload.itens);

      const dias = await fetchConfigNum("dias_entrega_prevista", 1);
      const emissao = todayBRT();
      const { data: pedido, error: pErr } = await supabase
        .from("pedidos_recebimento")
        .insert({
          codigo: payload.codigo,
          fornecedor_id: payload.fornecedor_id,
          origem: "manual",
          data_pedido: emissao,
          data_prevista: addDaysBRT(emissao, dias),
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
          .insert({
            pedido_id: pedido.id,
            produto_id: item.produto_id,
            quantidade_pedida: item.quantidade,
            preco_unitario: item.preco_unitario ?? null,
            cliente_id: item.cliente_id ?? null,
          })
          .select()
          .single();
        if (iErr) throw iErr;

        if (!item.cliente_id && item.rateio.length) {
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

        const dias = await fetchConfigNum("dias_entrega_prevista", 1);
        const emissao = todayBRT();
        const { data: pedido, error: pErr } = await supabase
          .from("pedidos_recebimento")
          .insert({
            codigo: p.codigo,
            fornecedor_id: p.fornecedor_id,
            origem: "excel",
            data_pedido: emissao,
            data_prevista: addDaysBRT(emissao, dias),
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
            .insert({
            pedido_id: pedido.id,
            produto_id: item.produto_id,
            quantidade_pedida: item.quantidade,
            preco_unitario: "preco_unitario" in item ? (item as { preco_unitario?: number | null }).preco_unitario ?? null : null,
          })
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
          dentro_tolerancia, valor_divergencia, estimado,
          conferencias(id, numero, finalizada_em, observacoes),
          itens_pedido(
            id, quantidade_pedida, preco_unitario,
            produtos(nome, unidade),
            pedidos_recebimento(id, codigo, data_pedido, status, fornecedor_id, encerrado_em, encerrado_por, motivo_encerramento, fornecedores(id, nome))
          )
        `)
        .not("divergencia", "is", null);

      if (divergencia !== "all") {
        q = q.eq("divergencia", divergencia);
      }

      const { data, error } = await q;
      if (error) throw error;

      const filtered = (data ?? []).filter((row) => {
        const ip = one(row.itens_pedido);
        const ped = one(ip?.pedidos_recebimento);
        if (!ped) return false;
        if (ped.data_pedido < from || ped.data_pedido > to) return false;
        if (fornecedorId && ped.fornecedor_id !== fornecedorId) return false;
        if (ped.status === "parcial" || ped.status === "pendente" || ped.status === "aguardando_vinculo") return false;
        return true;
      });

      const itemIds = filtered
        .map((row) => one(row.itens_pedido)?.id as string | undefined)
        .filter((id): id is string => !!id);
      const encerradoIds = [
        ...new Set(
          filtered
            .map((row) => (one(one(row.itens_pedido)?.pedidos_recebimento) as { encerrado_por?: string | null } | null)?.encerrado_por)
            .filter((id): id is string => !!id)
        ),
      ];

      const [{ data: saldos }, { data: autores }] = await Promise.all([
        itemIds.length
          ? supabase.from("v_saldo_item_pedido").select("item_pedido_id, recebido_acumulado").in("item_pedido_id", itemIds)
          : Promise.resolve({ data: [] as { item_pedido_id: string; recebido_acumulado: number }[] }),
        encerradoIds.length
          ? supabase.from("profiles").select("id, nome").in("id", encerradoIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
      ]);

      const saldoMap = new Map((saldos ?? []).map((s) => [s.item_pedido_id, Number(s.recebido_acumulado)]));
      const autorMap = new Map((autores ?? []).map((a) => [a.id, a.nome]));

      const byItem = new Map<string, (typeof filtered)[number]>();
      for (const row of filtered) {
        const ip = one(row.itens_pedido);
        const itemId = ip?.id as string | undefined;
        if (!itemId) continue;
        const ped = one(ip?.pedidos_recebimento) as { status?: string } | null;
        const conf = one((row as { conferencias?: { observacoes?: string | null; numero?: number | null; finalizada_em?: string | null } | { observacoes?: string | null; numero?: number | null; finalizada_em?: string | null }[] }).conferencias);
        const existing = byItem.get(itemId);
        if (!existing) {
          byItem.set(itemId, row);
          continue;
        }
        const exConf = one((existing as { conferencias?: { observacoes?: string | null; numero?: number | null; finalizada_em?: string | null } | { observacoes?: string | null; numero?: number | null; finalizada_em?: string | null }[] }).conferencias);
        const rowEnc = (conf?.observacoes ?? "").startsWith("encerramento:");
        const exEnc = (exConf?.observacoes ?? "").startsWith("encerramento:");
        if (ped?.status === "encerrado") {
          if (rowEnc && !exEnc) byItem.set(itemId, row);
        } else if (!rowEnc && exEnc) {
          byItem.set(itemId, row);
        } else {
          const rowN = Number(conf?.numero ?? 0);
          const exN = Number(exConf?.numero ?? 0);
          if (rowN > exN || ((conf?.finalizada_em ?? "") > (exConf?.finalizada_em ?? "") && rowN === exN)) {
            byItem.set(itemId, row);
          }
        }
      }

      return [...byItem.values()].map((row) => {
        const ip = one(row.itens_pedido);
        const ped = one(ip?.pedidos_recebimento) as {
          encerrado_em?: string | null;
          encerrado_por?: string | null;
          motivo_encerramento?: string | null;
        } | null;
        return {
          ...row,
          recebido_acumulado: ip?.id ? saldoMap.get(ip.id) ?? 0 : 0,
          encerrado_em: ped?.encerrado_em ?? null,
          encerrado_por_nome: ped?.encerrado_por ? autorMap.get(ped.encerrado_por) ?? null : null,
          motivo_encerramento: ped?.motivo_encerramento ?? null,
        };
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
            dentro_tolerancia, tolerancia_pct_aplicada,
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
      data_prevista?: string | null;
    }) => {
      const { pedidoId, ...fields } = payload;
      const { error } = await supabase.from("pedidos_recebimento").update(fields).eq("id", pedidoId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pedidos"] }),
  });
}

/** Registra a mesma hora de chegada em vários pedidos (chegada única multi-fornecedor). */
export function useRegistrarHoraChegada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pedidoIds,
      horaChegada,
      onlyIfNull = true,
    }: {
      pedidoIds: string[];
      horaChegada?: string;
      /** Se true, só preenche pedidos sem hora (padrão ao iniciar). */
      onlyIfNull?: boolean;
    }) => {
      if (pedidoIds.length === 0) return;
      const iso = horaChegada ?? new Date().toISOString();
      let q = supabase
        .from("pedidos_recebimento")
        .update({ hora_chegada: iso })
        .in("id", pedidoIds);
      if (onlyIfNull) q = q.is("hora_chegada", null);
      const { error } = await q;
      if (error) throw error;
      return iso;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
  });
}

export function useFillRate(period: "today" | "week" | "month" = "week") {
  const { from, to } = dateRangeBRT(period);
  return useQuery({
    queryKey: ["fill-rate", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_fill_rate_pedido")
        .select("*")
        .gte("data_pedido", from)
        .lte("data_pedido", to);
      if (error) throw error;
      const byForn = new Map<
        string,
        {
          fornecedor_id: string;
          fornecedor: string;
          total_itens: number;
          itens_completos: number;
          valor_pedido: number;
          valor_recebido: number;
          fill_rate: number | null;
          fill_rate_valor: number | null;
        }
      >();
      for (const row of data ?? []) {
        const id = String(row.fornecedor_id);
        const cur = byForn.get(id) ?? {
          fornecedor_id: id,
          fornecedor: String(row.fornecedor ?? ""),
          total_itens: 0,
          itens_completos: 0,
          valor_pedido: 0,
          valor_recebido: 0,
          fill_rate: null,
          fill_rate_valor: null,
        };
        cur.total_itens += Number(row.total_itens ?? 0);
        cur.itens_completos += Number(row.itens_completos ?? 0);
        cur.valor_pedido += Number(row.valor_pedido ?? 0);
        cur.valor_recebido += Number(row.valor_recebido ?? 0);
        byForn.set(id, cur);
      }
      // NOP-320: sem denominador → null (nunca 100% em 0/0)
      return [...byForn.values()].map((r) => ({
        ...r,
        fill_rate: safePct(r.itens_completos, r.total_itens),
        fill_rate_valor: safePct(r.valor_recebido, r.valor_pedido),
      }));
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

export function useEncerrarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, motivo }: { pedidoId: string; motivo: string }) => {
      const { error } = await supabase.rpc("encerrar_pedido", {
        p_pedido_id: pedidoId,
        p_motivo: motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["pedidos-liberacao"] });
      qc.invalidateQueries({ queryKey: ["faltas"] });
    },
  });
}

export type SaldoItemPedido = {
  item_pedido_id: string;
  pedido_id?: string;
  recebido_acumulado: number;
  saldo: number;
};

export async function fetchSaldoItensPedido(pedidoId: string): Promise<SaldoItemPedido[]> {
  const { data, error } = await supabase
    .from("v_saldo_item_pedido")
    .select("*")
    .eq("pedido_id", pedidoId);
  if (error) throw error;
  return (data ?? []) as SaldoItemPedido[];
}

export function useSaldoItensPedido(pedidoId: string | null) {
  return useQuery({
    queryKey: ["saldo-itens", pedidoId],
    enabled: !!pedidoId,
    queryFn: () => fetchSaldoItensPedido(pedidoId!),
  });
}

export function usePendenciasVinculo() {
  return useQuery({
    queryKey: ["pendencias-vinculo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencias_vinculo")
        .select("*, pedidos_recebimento(codigo, wise_pedido_id)")
        .eq("status", "aberta")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAliases() {
  return useQuery({
    queryKey: ["aliases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("aliases").select("*").order("nome_externo");
      if (error) throw error;
      return data ?? [];
    },
  });
}
