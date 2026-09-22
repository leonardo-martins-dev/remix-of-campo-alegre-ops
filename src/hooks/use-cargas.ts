import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { todayBRT } from "@/lib/utils-date";

/** Card/list row for the day — prefers v_cargas_dia when available. */
export type CargaDia = {
  id: string;
  codigo: string;
  numero_ordem: string | null;
  status: string;
  status_ordem: string | null;
  progresso: number | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  data_carga: string;
  cliente_id: string | null;
  cliente_nome: string;
  rota_id_efetiva: string | null;
  rota_nome: string | null;
  motorista_id: string | null;
  motorista_nome: string | null;
  caminhao_placa: string | null;
  total_linhas: number;
  total_itens: number;
  total_caixas: number;
  romaneio_conferido_em: string | null;
  separado_em: string | null;
  conferido_em: string | null;
  entregue_em: string | null;
  clientes?: { nome: string } | { nome: string }[] | null;
  motoristas?: { nome: string } | { nome: string }[] | null;
  caminhoes?: { placa: string } | { placa: string }[] | null;
  rotas?: { nome: string } | { nome: string }[] | null;
};

function mapCargaDiaRow(row: Record<string, unknown>): CargaDia {
  const totalResumo = Number(row.total_caixas_resumo ?? 0);
  const totalItensCx = Number(row.total_caixas_itens ?? 0);
  const totalOrdem = Number(row.caixas_ordem_count ?? 0);
  return {
    id: row.id as string,
    codigo: row.codigo as string,
    numero_ordem: (row.numero_ordem as string | null) ?? null,
    status: row.status as string,
    status_ordem: (row.status_ordem as string | null) ?? null,
    progresso: (row.progresso as number | null) ?? null,
    hora_inicio: (row.hora_inicio as string | null) ?? null,
    hora_fim: (row.hora_fim as string | null) ?? null,
    data_carga: row.data_carga as string,
    cliente_id: (row.cliente_id as string | null) ?? null,
    cliente_nome: (row.cliente_nome as string) ?? "Sem loja vinculada",
    rota_id_efetiva: (row.rota_id_efetiva as string | null) ?? null,
    rota_nome: (row.rota_nome as string | null) ?? null,
    motorista_id: (row.motorista_id as string | null) ?? null,
    motorista_nome: (row.motorista_nome as string | null) ?? null,
    caminhao_placa: (row.caminhao_placa as string | null) ?? null,
    total_linhas: Number(row.total_linhas ?? 0),
    total_itens: Number(row.total_itens ?? 0),
    total_caixas: totalOrdem || totalResumo || totalItensCx,
    romaneio_conferido_em: (row.romaneio_conferido_em as string | null) ?? null,
    separado_em: (row.separado_em as string | null) ?? null,
    conferido_em: (row.conferido_em as string | null) ?? null,
    entregue_em: (row.entregue_em as string | null) ?? null,
    clientes: row.cliente_nome ? { nome: row.cliente_nome as string } : null,
    motoristas: row.motorista_nome ? { nome: row.motorista_nome as string } : null,
    caminhoes: row.caminhao_placa ? { placa: row.caminhao_placa as string } : null,
    rotas: row.rota_nome ? { nome: row.rota_nome as string } : null,
  };
}

export function useCargasDia(date = todayBRT()) {
  return useQuery({
    queryKey: ["cargas", date],
    queryFn: async (): Promise<CargaDia[]> => {
      const { data, error } = await supabase
        .from("v_cargas_dia")
        .select("*")
        .eq("data_carga", date)
        .order("rota_nome", { ascending: true, nullsFirst: false })
        .order("cliente_nome", { ascending: true });
      if (!error && data) return data.map((r) => mapCargaDiaRow(r as Record<string, unknown>));

      // Fallback before migration 00052 is applied
      const { data: legacy, error: legErr } = await supabase
        .from("cargas")
        .select(`
          id, codigo, numero_ordem, status, status_ordem, progresso, hora_inicio, hora_fim, data_carga,
          cliente_id, rota_id, motorista_id,
          clientes(nome, rota_id, rotas(nome)), motoristas(nome), caminhoes(placa), rotas(nome),
          romaneio_itens(id, quantidade_romaneio, caixas_g, caixas_i, caixas_p),
          carga_caixas_resumo(real_g, real_i, real_p)
        `)
        .eq("data_carga", date)
        .order("hora_inicio", { ascending: true });
      if (legErr) throw legErr;

      return (legacy ?? []).map((c) => {
        const cli = Array.isArray(c.clientes) ? c.clientes[0] : c.clientes;
        const mot = Array.isArray(c.motoristas) ? c.motoristas[0] : c.motoristas;
        const cam = Array.isArray(c.caminhoes) ? c.caminhoes[0] : c.caminhoes;
        const rotaCarga = Array.isArray(c.rotas) ? c.rotas[0] : c.rotas;
        const rotaLoja =
          cli && "rotas" in (cli as object)
            ? Array.isArray((cli as { rotas?: unknown }).rotas)
              ? (cli as { rotas: { nome: string }[] }).rotas[0]
              : ((cli as { rotas: unknown }).rotas as { nome: string } | null)
            : null;
        const itens = (c.romaneio_itens ?? []) as {
          quantidade_romaneio: number;
          caixas_g: number;
          caixas_i: number;
          caixas_p: number;
        }[];
        const resumo = Array.isArray(c.carga_caixas_resumo)
          ? c.carga_caixas_resumo[0]
          : c.carga_caixas_resumo;
        const totalCxItens = itens.reduce(
          (a, i) => a + Number(i.caixas_g ?? 0) + Number(i.caixas_i ?? 0) + Number(i.caixas_p ?? 0),
          0,
        );
        const totalCxResumo = resumo
          ? Number(resumo.real_g ?? 0) + Number(resumo.real_i ?? 0) + Number(resumo.real_p ?? 0)
          : 0;
        const nome = (cli as { nome?: string } | null)?.nome ?? "Sem loja vinculada";
        const rotaNome = rotaCarga?.nome ?? rotaLoja?.nome ?? null;
        return {
          id: c.id,
          codigo: c.codigo,
          numero_ordem: c.numero_ordem ?? null,
          status: c.status,
          status_ordem: c.status_ordem ?? null,
          progresso: c.progresso,
          hora_inicio: c.hora_inicio,
          hora_fim: c.hora_fim,
          data_carga: c.data_carga,
          cliente_id: c.cliente_id,
          cliente_nome: nome,
          rota_id_efetiva: c.rota_id ?? (cli as { rota_id?: string } | null)?.rota_id ?? null,
          rota_nome: rotaNome,
          motorista_id: c.motorista_id,
          motorista_nome: (mot as { nome?: string } | null)?.nome ?? null,
          caminhao_placa: (cam as { placa?: string } | null)?.placa ?? null,
          total_linhas: itens.length,
          total_itens: itens.reduce((a, i) => a + Number(i.quantidade_romaneio ?? 0), 0),
          total_caixas: totalCxResumo || totalCxItens,
          romaneio_conferido_em: null,
          separado_em: null,
          conferido_em: null,
          entregue_em: null,
          clientes: cli ? { nome } : null,
          motoristas: mot ? { nome: (mot as { nome: string }).nome } : null,
          caminhoes: cam ? { placa: (cam as { placa: string }).placa } : null,
          rotas: rotaNome ? { nome: rotaNome } : null,
        } satisfies CargaDia;
      });
    },
  });
}

/** Cargas do dia sem supermercado (NOP-302). */
export function useCargasSemCliente(date = todayBRT()) {
  return useQuery({
    queryKey: ["cargas-sem-cliente", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargas")
        .select("id, codigo, numero_ordem, status, status_ordem, cliente_cnpj, data_carga")
        .eq("data_carga", date)
        .is("cliente_id", null)
        .order("codigo");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useVincularClienteCarga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { carga_id: string; cliente_id: string }) => {
      const { data, error } = await supabase.rpc("vincular_cliente_carga", {
        p_carga_id: payload.carga_id,
        p_cliente_id: payload.cliente_id,
      });
      if (error) throw new Error(error.message);
      return data as { carga_id: string; cliente_id: string; cliente_nome: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargas"] });
      qc.invalidateQueries({ queryKey: ["cargas-sem-cliente"] });
      qc.invalidateQueries({ queryKey: ["supermercados-dia"] });
      qc.invalidateQueries({ queryKey: ["ordens-expedicao"] });
      qc.invalidateQueries({ queryKey: ["pendencias-vinculo"] });
      qc.invalidateQueries({ queryKey: ["carga"] });
    },
  });
}

export function useCargaDetail(cargaId: string | null) {
  return useQuery({
    queryKey: ["carga", cargaId],
    enabled: !!cargaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargas")
        .select(`
          *,
          clientes(nome), motoristas(nome), caminhoes(placa), rotas(nome),
          romaneio_itens(id, produto_id, quantidade_romaneio, quantidade_real, caixas_g, caixas_i, caixas_p, caixas, status, produtos(id, nome, familia_id, familias_produto(nome))),
          carga_caixas_resumo(*)
        `)
        .eq("id", cargaId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateRomaneioItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      cargaId: string;
      itemId: string;
      quantidade_real?: number;
      caixas_g?: number;
      caixas_i?: number;
      caixas_p?: number;
      caixas?: Record<string, number>;
      status?: string;
    }) => {
      const { itemId, cargaId, ...fields } = payload;
      const { error } = await supabase.from("romaneio_itens").update(fields).eq("id", itemId);
      if (error) throw error;
      return cargaId;
    },
    onSuccess: (cargaId) => qc.invalidateQueries({ queryKey: ["carga", cargaId] }),
  });
}

export function useUpdateCargaResumo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      cargaId: string;
      real_g: number;
      real_i: number;
      real_p: number;
      sugerido_g?: number;
      sugerido_i?: number;
      sugerido_p?: number;
      sugerido?: Record<string, number>;
      real?: Record<string, number>;
    }) => {
      const { cargaId, ...fields } = payload;
      const { error } = await supabase.from("carga_caixas_resumo").upsert(
        { carga_id: cargaId, ...fields, updated_at: new Date().toISOString() },
        { onConflict: "carga_id" }
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["carga", v.cargaId] }),
  });
}

export function useIniciarCarga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cargaId: string) => {
      const { error } = await supabase
        .from("cargas")
        .update({ status: "carregando", hora_inicio: new Date().toISOString(), progresso: 0 })
        .eq("id", cargaId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas"] }),
  });
}

export function useConferirPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cargaId: string) => {
      const { data, error } = await supabase.rpc("conferir_pedido_carga", {
        p_carga_id: cargaId,
      });
      if (error) {
        if (error.code === "PGRST202") {
          throw new Error("Migration 00052 ainda não aplicada (conferir_pedido_carga).");
        }
        throw new Error(error.message);
      }
      return data as {
        carga_id: string;
        itens: number;
        sem_fator: number;
        sugerido: Record<string, number>;
        status_ordem: string;
      };
    },
    onSuccess: (_d, cargaId) => {
      qc.invalidateQueries({ queryKey: ["carga", cargaId] });
      qc.invalidateQueries({ queryKey: ["cargas"] });
      qc.invalidateQueries({ queryKey: ["ordens-expedicao"] });
    },
  });
}

export function useFinalizarCarga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cargaId }: { cargaId: string; pedidoId?: string }) => {
      const { data, error } = await supabase.rpc("finalizar_carga_expedicao", {
        p_carga_id: cargaId,
      });
      if (error) {
        // Fallback legado se a migration ainda não estiver no banco
        if (error.code === "PGRST202") {
          const now = new Date().toISOString();
          const { error: upErr } = await supabase
            .from("cargas")
            .update({
              status: "concluida",
              status_ordem: "separada",
              hora_fim: now,
              progresso: 100,
            })
            .eq("id", cargaId);
          if (upErr) throw upErr;
          await supabase.from("registros_ciclo").insert({
            carga_id: cargaId,
            hora_inicio_carga: now,
            hora_saida_caminhao: now,
            data_registro: todayBRT(),
          });
          return { carga_id: cargaId, status_ordem: "separada", total_caixas: 0 };
        }
        throw new Error(error.message);
      }
      return data as { carga_id: string; status_ordem: string; total_caixas: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargas"] });
      qc.invalidateQueries({ queryKey: ["carga"] });
      qc.invalidateQueries({ queryKey: ["ordens-expedicao"] });
      qc.invalidateQueries({ queryKey: ["caixas-ordem"] });
      qc.invalidateQueries({ queryKey: ["saldo-caixas"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes"] });
      qc.invalidateQueries({ queryKey: ["saidas-expedicao"] });
    },
  });
}

export function useCreateCarga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      codigo: string;
      cliente_id: string;
      motorista_id?: string;
      caminhao_id?: string;
      rota_id?: string;
      created_by: string;
      itens: { produto_id: string; quantidade_romaneio: number; caixas_g: number; caixas_i: number; caixas_p: number }[];
    }) => {
      const { itens, ...cargaFields } = payload;
      const { data: carga, error } = await supabase
        .from("cargas")
        .insert({ ...cargaFields, data_carga: todayBRT(), status: "aguardando" })
        .select()
        .single();
      if (error) throw error;

      if (itens.length) {
        const { error: rErr } = await supabase.from("romaneio_itens").insert(
          itens.map((it) => ({ carga_id: carga.id, ...it, quantidade_real: 0, status: "pendente" }))
        );
        if (rErr) throw rErr;
      }

      await supabase.from("carga_caixas_resumo").insert({ carga_id: carga.id });
      return carga;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas"] }),
  });
}

export type FilaExpedicaoItem = {
  pedido_id: string;
  codigo: string;
  status: string;
  data_pedido: string;
  fornecedor: string;
  conferencia_id: string | null;
  finalizada_em: string | null;
};

export type CargaGerada = { carga_id: string; codigo: string };

export function useFilaExpedicao() {
  return useQuery({
    queryKey: ["fila-expedicao"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_fila_expedicao").select("*");
      if (error) throw error;
      return (data ?? []) as FilaExpedicaoItem[];
    },
  });
}

export function useGerarCargasPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pedidoId: string) => {
      const { data, error } = await supabase.rpc("gerar_cargas_pos_conferencia", {
        p_pedido_id: pedidoId,
      });
      if (error) {
        if (error.code === "PGRST202") return [] as CargaGerada[];
        throw error;
      }
      return (data ?? []) as CargaGerada[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargas"] });
      qc.invalidateQueries({ queryKey: ["fila-expedicao"] });
    },
  });
}

export function useImportCargasExcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      cargas: {
        codigo: string;
        cliente_id: string;
        motorista_id?: string;
        created_by: string;
        itens: {
          produto_id: string;
          quantidade_romaneio: number;
          caixas_g: number;
          caixas_i: number;
          caixas_p: number;
        }[];
      }[]
    ) => {
      for (const c of cargas) {
        const { itens, ...fields } = c;
        const { data: carga, error } = await supabase
          .from("cargas")
          .insert({
            ...fields,
            data_carga: todayBRT(),
            status: "aguardando",
            origem: "excel",
          })
          .select()
          .single();
        if (error) throw error;
        if (itens.length) {
          const { error: rErr } = await supabase.from("romaneio_itens").insert(
            itens.map((it) => ({ carga_id: carga.id, ...it, quantidade_real: 0, status: "pendente" }))
          );
          if (rErr) throw rErr;
        }
        await supabase.from("carga_caixas_resumo").insert({ carga_id: carga.id });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cargas"] }),
  });
}

/** Importa relatório de pedido de venda: cria clientes faltantes e cargas PV-{nr}. */
export function useImportRelatorioVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      created_by: string;
      rows: import("@/lib/excel-relatorio-venda").RelatorioVendaRow[];
      clientes: { id: string; nome: string }[];
      produtos: { id: string; nome: string; codigo?: string | null }[];
    }) => {
      const {
        buildMapsRelatorioVenda,
        buildCargasFromRelatorioVenda,
      } = await import("@/lib/excel-relatorio-venda");
      const { normalizeKey } = await import("@/lib/normalize");

      const maps = buildMapsRelatorioVenda({
        clientes: payload.clientes,
        produtos: payload.produtos,
      });

      const nomesClientes = [...new Set(payload.rows.map((r) => r.cliente.trim()).filter(Boolean))];
      const faltantes = nomesClientes.filter((n) => !maps.clienteByName.has(normalizeKey(n)));

      // CNPJ do relatório, quando vem na linha do pedido (NOP-130).
      const cnpjPorCliente = new Map<string, string>();
      for (const r of payload.rows) {
        const nome = r.cliente?.trim();
        if (nome && r.cnpj && !cnpjPorCliente.has(normalizeKey(nome))) {
          cnpjPorCliente.set(normalizeKey(nome), r.cnpj);
        }
      }

      const clienteIdsByName = new Map<string, string>();
      if (faltantes.length) {
        const { data: created, error } = await supabase
          .from("clientes")
          .insert(
            faltantes.map((nome) => ({
              nome,
              cnpj: cnpjPorCliente.get(normalizeKey(nome)) ?? null,
              ativo: true,
            })),
          )
          .select("id, nome");
        if (error) throw error;
        for (const c of created ?? []) {
          clienteIdsByName.set(normalizeKey(c.nome), c.id);
          maps.clienteByName.set(normalizeKey(c.nome), c.id);
        }
      }

      const built = buildCargasFromRelatorioVenda(payload.rows, maps, {
        clienteIdsByName,
      });

      const hoje = todayBRT();
      const codigos = built.cargas.map((c) => c.codigo);
      const jaTem = new Set<string>();
      for (let i = 0; i < codigos.length; i += 80) {
        const chunk = codigos.slice(i, i + 80);
        const { data: existentes } = await supabase
          .from("cargas")
          .select("codigo")
          .eq("data_carga", hoje)
          .in("codigo", chunk);
        for (const c of existentes ?? []) jaTem.add(c.codigo);
      }

      let criadas = 0;
      let puladas = 0;
      let itens = 0;

      for (const c of built.cargas) {
        if (jaTem.has(c.codigo)) {
          puladas += 1;
          continue;
        }

        const { data: carga, error } = await supabase
          .from("cargas")
          .insert({
            codigo: c.codigo,
            cliente_id: c.cliente_id,
            created_by: payload.created_by,
            data_carga: hoje,
            status: "aguardando",
            origem: "excel",
            // NOP-130: a carga já nasce como Ordem de Separação.
            numero_ordem: c.numero_ordem,
            cliente_cnpj: c.cliente_cnpj,
            qtde_itens_wise: c.qtde_itens,
            status_ordem: "importada",
          })
          .select("id")
          .single();
        if (error) throw error;

        if (c.itens.length) {
          const { error: rErr } = await supabase.from("romaneio_itens").insert(
            c.itens.map((it) => ({
              carga_id: carga.id,
              produto_id: it.produto_id,
              quantidade_romaneio: it.quantidade_romaneio,
              caixas_g: it.caixas_g,
              caixas_i: it.caixas_i,
              caixas_p: it.caixas_p,
              quantidade_real: 0,
              status: "pendente",
            }))
          );
          if (rErr) throw rErr;
          itens += c.itens.length;
        }
        await supabase.from("carga_caixas_resumo").insert({ carga_id: carga.id });
        criadas += 1;
      }

      return {
        criadas,
        puladas,
        itens,
        clientesCriados: faltantes.length,
        produtosFaltantes: built.produtosFaltantes,
        pedidosArquivo: built.pedidos,
        itensArquivo: built.itens,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cargas"] });
      qc.invalidateQueries({ queryKey: ["cadastros", "clientes"] });
      qc.invalidateQueries({ queryKey: ["expedicao-por-rota"] });
      qc.invalidateQueries({ queryKey: ["produtos-por-rota"] });
      qc.invalidateQueries({ queryKey: ["cargas-loja-rota"] });
      qc.invalidateQueries({ queryKey: ["clientes-por-rota"] });
    },
  });
}

export function useImportRomaneioItens() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      cargaId: string;
      itens: { produto_id: string; quantidade_romaneio: number }[];
    }) => {
      if (!payload.itens.length) return { imported: 0 };
      const { error } = await supabase.from("romaneio_itens").insert(
        payload.itens.map((it) => ({
          carga_id: payload.cargaId,
          produto_id: it.produto_id,
          quantidade_romaneio: it.quantidade_romaneio,
          quantidade_real: 0,
          status: "pendente",
        }))
      );
      if (error) throw error;
      return { imported: payload.itens.length };
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["carga", v.cargaId] });
      qc.invalidateQueries({ queryKey: ["cargas"] });
    },
  });
}
