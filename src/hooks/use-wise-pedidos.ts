import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { normalizeKey } from "@/lib/normalize";
import {
  applyAliases,
  buildWisePedidos,
  hashArquivo,
  parseWisePedido,
  type AliasRow,
  type LinhaIgnorada,
  type WiseBuildPedido,
} from "@/lib/excel-wise-pedidos";

export type ImportWiseResult = {
  lote_id?: string;
  novos: number;
  atualizados: number;
  itens: number;
  pendencias: number;
  ignoradas: { motivo: string }[];
  status?: string;
};

export type ImportPreview = {
  hash: string;
  filename: string;
  formato: string;
  sheet?: string;
  linhasLidas: number;
  pedidos: WiseBuildPedido[];
  ignoradas: LinhaIgnorada[];
  semItens: boolean;
  semPreco: number;
  unidadeVazia: number;
  existentes: string[];
  arquivoAnterior: { created_at: string; pedidos_novos: number; arquivo: string } | null;
};

export function mapsFromCadastros(
  fornecedores: { id: string; nome: string }[],
  produtos: { id: string; nome: string; codigo?: string | null }[],
  destinatarios: { id: string; nome: string }[],
  clientes: { id: string; nome: string; cnpj?: string | null }[],
  aliases: AliasRow[]
) {
  const fornecedorByName = new Map(fornecedores.map((f) => [normalizeKey(f.nome), f.id]));
  const produtoByName = new Map(produtos.map((p) => [normalizeKey(p.nome), p.id]));
  const produtoByCode = new Map(
    produtos
      .filter((p): p is { id: string; nome: string; codigo?: string | null } => !!p.codigo)
      .map((p) => [normalizeKey(String(p.codigo)), p.id])
  );
  const destinatarioByName = new Map(destinatarios.map((d) => [normalizeKey(d.nome), d.id]));
  const clienteByName = new Map(clientes.map((c) => [normalizeKey(c.nome), c.id]));
  const clienteByCnpj = new Map(
    clientes.filter((c) => c.cnpj).map((c) => [String(c.cnpj).replace(/\D/g, ""), c.id])
  );
  return applyAliases(
    {
      fornecedorByName,
      fornecedorByCode: new Map(),
      produtoByName,
      produtoByCode,
      destinatarioByName,
      clienteByName,
      clienteByCnpj,
    },
    aliases
  );
}

function toRpcPedidos(pedidos: WiseBuildPedido[]) {
  return pedidos.map((p) => ({
    wise_pedido_id: p.wise_pedido_id,
    fornecedor_id: p.fornecedor_id,
    fornecedor_nome: p.fornecedor_nome,
    codigo_fornecedor: p.codigo_fornecedor,
    data_prevista: p.data_prevista,
    itens: p.itens.map((i) => ({
      produto_id: i.produto_id,
      produto_nome: i.produto_nome,
      codigo_produto: i.codigo_produto,
      quantidade: i.quantidade,
      unidade: i.unidade,
      preco_unitario: i.preco_unitario,
    })),
    pendencias: p.pendencias.filter((pen) => pen.tipo === "fornecedor" || pen.tipo === "produto"),
  }));
}

export async function buildImportPreview(payload: {
  file: ArrayBuffer;
  filename: string;
  fornecedores: { id: string; nome: string }[];
  produtos: { id: string; nome: string; codigo?: string | null }[];
  destinatarios: { id: string; nome: string }[];
  clientes?: { id: string; nome: string; cnpj?: string | null }[];
}): Promise<ImportPreview> {
  const parsed = parseWisePedido(payload.file);
  if (!parsed.ok) throw new Error(parsed.error);

  const { data: aliases } = await supabase.from("aliases").select("tipo, nome_externo, codigo_externo, entidade_id");
  const maps = mapsFromCadastros(
    payload.fornecedores,
    payload.produtos,
    payload.destinatarios,
    payload.clientes ?? [],
    (aliases ?? []) as AliasRow[]
  );
  const pedidos = buildWisePedidos(parsed.rows, maps);
  const ids = pedidos.map((p) => p.wise_pedido_id);
  const { data: existing } = ids.length
    ? await supabase.from("pedidos_recebimento").select("wise_pedido_id").in("wise_pedido_id", ids)
    : { data: [] as { wise_pedido_id: string }[] };

  const hash = await hashArquivo(payload.file);
  const { data: prev } = await supabase
    .from("importacoes_pedido")
    .select("created_at, pedidos_novos, arquivo")
    .eq("arquivo_hash", hash)
    .in("status", ["ok", "parcial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const semPreco = pedidos.reduce((n, p) => n + p.itens.filter((i) => i.preco_unitario == null).length, 0);
  const unidadeVazia = pedidos.reduce((n, p) => n + p.itens.filter((i) => !i.unidade).length, 0);

  return {
    hash,
    filename: payload.filename,
    formato: payload.filename.toLowerCase().endsWith(".csv")
      ? "csv"
      : payload.filename.toLowerCase().endsWith(".xls")
        ? "xls"
        : "xlsx",
    sheet: parsed.sheet,
    linhasLidas: parsed.rows.length + parsed.ignoradas.length,
    pedidos,
    ignoradas: parsed.ignoradas,
    semItens: parsed.rows.length === 0 || pedidos.every((p) => p.itens.length === 0),
    semPreco,
    unidadeVazia,
    existentes: (existing ?? []).map((e) => e.wise_pedido_id),
    arquivoAnterior: prev ?? null,
  };
}

async function confirmImport(preview: ImportPreview): Promise<ImportWiseResult> {
  const { data, error } = await supabase.rpc("importar_pedidos_wise", {
    p_arquivo: preview.filename,
    p_formato: preview.formato,
    p_hash: preview.hash,
    p_pedidos: toRpcPedidos(preview.pedidos),
    p_ignoradas: preview.ignoradas.map((i) => ({ motivo: i.motivo })),
  });
  if (error) {
    console.error("importar_pedidos_wise", error);
    throw new Error(error.message || "Erro ao gravar importação");
  }
  const row = data as ImportWiseResult;
  return {
    lote_id: row.lote_id,
    novos: Number(row.novos ?? 0),
    atualizados: Number(row.atualizados ?? 0),
    itens: Number(row.itens ?? 0),
    pendencias: Number(row.pendencias ?? 0),
    ignoradas: Array.isArray(row.ignoradas) ? row.ignoradas : [],
    status: row.status,
  };
}

export function usePreviewWiseImport() {
  return useMutation({
    mutationFn: buildImportPreview,
  });
}

export function useConfirmWiseImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: confirmImport,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["pendencias-vinculo"] });
      qc.invalidateQueries({ queryKey: ["importacoes"] });
    },
  });
}

export function useImportWisePedidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      file: ArrayBuffer;
      filename: string;
      created_by: string;
      fornecedores: { id: string; nome: string }[];
      produtos: { id: string; nome: string; codigo?: string | null }[];
      destinatarios: { id: string; nome: string }[];
      clientes?: { id: string; nome: string; cnpj?: string | null }[];
    }): Promise<ImportWiseResult> => {
      const preview = await buildImportPreview(payload);
      return confirmImport(preview);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["pendencias-vinculo"] });
      qc.invalidateQueries({ queryKey: ["importacoes"] });
    },
  });
}

export function useSyncWisePedidos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      created_by: string;
      fornecedores: { id: string; nome: string }[];
      produtos: { id: string; nome: string; codigo?: string | null }[];
      destinatarios: { id: string; nome: string }[];
      clientes: { id: string; nome: string; cnpj?: string | null }[];
    }): Promise<ImportWiseResult & { source: string; message?: string; probed?: string[] }> => {
      const { data: result, error } = await supabase.functions.invoke("sync-wise-pedidos", {
        body: {},
      });
      if (error) throw error;
      const rows = (result?.rows ?? []) as Parameters<typeof buildWisePedidos>[0];
      if (!rows.length) {
        return {
          novos: 0,
          atualizados: 0,
          itens: 0,
          pendencias: 0,
          ignoradas: [],
          source: result?.source ?? "none",
          message: result?.message ?? "Nenhum pedido na API Wise. Use a importação por arquivo.",
          probed: result?.probed ?? [],
        };
      }
      const { data: aliases } = await supabase.from("aliases").select("tipo, nome_externo, codigo_externo, entidade_id");
      const maps = mapsFromCadastros(
        payload.fornecedores,
        payload.produtos,
        payload.destinatarios,
        payload.clientes,
        (aliases ?? []) as AliasRow[]
      );
      const pedidos = buildWisePedidos(rows, maps);
      const preview: ImportPreview = {
        hash: "sync-wise-api",
        filename: "sync-wise-api",
        formato: "api",
        linhasLidas: rows.length,
        pedidos,
        ignoradas: [],
        semItens: pedidos.every((p) => !p.itens.length),
        semPreco: pedidos.reduce((n, p) => n + p.itens.filter((i) => i.preco_unitario == null).length, 0),
        unidadeVazia: 0,
        existentes: [],
        arquivoAnterior: null,
      };
      const upserted = await confirmImport(preview);
      return { ...upserted, source: result?.source ?? "api", probed: result?.probed ?? [] };
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
        .select("*, profiles:usuario_id(nome), desfeita:desfeita_por(nome)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDesfazerImportacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (importacaoId: string) => {
      const { data, error } = await supabase.rpc("desfazer_importacao", { p_importacao_id: importacaoId });
      if (error) throw new Error(error.message);
      return data as { removidos: number; mantidos: { codigo: string; motivo: string }[]; pendencias_removidas: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["pendencias-vinculo"] });
      qc.invalidateQueries({ queryKey: ["importacoes"] });
    },
  });
}

export function useLimparPendenciasLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (importacaoId: string) => {
      const { data, error } = await supabase.rpc("limpar_pendencias_importacao", { p_importacao_id: importacaoId });
      if (error) throw new Error(error.message);
      return Number(data ?? 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pendencias-vinculo"] });
      qc.invalidateQueries({ queryKey: ["importacoes"] });
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
        if (payload.tipo === "produto") {
          row.unidade = "UN";
          if (payload.codigoExterno) row.codigo = payload.codigoExterno;
        }
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

      if (pend?.pedido_id && entidadeId && payload.acao !== "dispensar") {
        if (payload.tipo === "produto") {
          const { data: loose } = await supabase
            .from("itens_pedido")
            .select("id, nome_externo, codigo_externo")
            .eq("pedido_id", pend.pedido_id)
            .is("produto_id", null);
          const ids = (loose ?? [])
            .filter((i) => i.nome_externo === payload.nomeExterno || (payload.codigoExterno && i.codigo_externo === payload.codigoExterno))
            .map((i) => i.id);
          if (ids.length) {
            await supabase.from("itens_pedido").update({ produto_id: entidadeId }).in("id", ids);
          }
        }
        if (payload.tipo === "fornecedor") {
          await supabase.from("pedidos_recebimento").update({ fornecedor_id: entidadeId }).eq("id", pend.pedido_id);
        }
      }

      if (pend?.pedido_id) {
        const { count } = await supabase
          .from("pendencias_vinculo")
          .select("id", { count: "exact", head: true })
          .eq("pedido_id", pend.pedido_id)
          .eq("tipo", "fornecedor")
          .eq("status", "aberta");
        if (!count) {
          const { data: ped } = await supabase.from("pedidos_recebimento").select("status, fornecedor_id").eq("id", pend.pedido_id).maybeSingle();
          if (ped?.status === "aguardando_vinculo" && ped.fornecedor_id) {
            await supabase.from("pedidos_recebimento").update({ status: "pendente" }).eq("id", pend.pedido_id);
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pendencias-vinculo"] });
      qc.invalidateQueries({ queryKey: ["aliases"] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["cadastros"] });
      qc.invalidateQueries({ queryKey: ["conferencia"] });
    },
  });
}

export function useAliasRapido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      tipo: "fornecedor" | "produto";
      nomeExterno: string;
      codigoExterno?: string | null;
      entidadeId: string;
    }) => {
      const { error } = await supabase.from("aliases").upsert(
        {
          tipo: payload.tipo,
          nome_externo: payload.nomeExterno,
          codigo_externo: payload.codigoExterno ?? null,
          entidade_id: payload.entidadeId,
          origem: "wise",
        },
        { onConflict: "tipo,origem,nome_externo" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aliases"] });
    },
  });
}

export type { WiseBuildPedido };
