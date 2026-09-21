import { createHash } from "node:crypto";
import { getSupabase } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import type { WiseCompraRow, WiseVendaRow, RpcPedido, RpcCarga } from "../../schemas/wise.js";

export type AliasRow = {
  tipo: "fornecedor" | "produto" | "destinatario";
  nome_externo: string;
  codigo_externo: string | null;
  entidade_id: string;
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function loadAliases(): Promise<AliasRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("aliases")
    .select("tipo, nome_externo, codigo_externo, entidade_id")
    .eq("origem", "wise");
  if (error) throw new Error(error.message);
  return (data ?? []) as AliasRow[];
}

export async function loadClientesByCodigo(): Promise<Map<string, string>> {
  const sb = getSupabase();
  const { data, error } = await sb.from("clientes").select("id, codigo_wise").eq("ativo", true);
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const c of data ?? []) {
    const codigo = (c as { codigo_wise?: string | null }).codigo_wise;
    if (codigo) map.set(String(codigo).trim(), c.id);
  }
  return map;
}

type AliasIndex = {
  byCodigo: Map<string, string>;
  byNome: Map<string, string>;
};

function indexAliases(rows: AliasRow[], tipo: AliasRow["tipo"]): AliasIndex {
  const byCodigo = new Map<string, string>();
  const byNome = new Map<string, string>();
  for (const a of rows.filter((r) => r.tipo === tipo)) {
    if (a.codigo_externo) byCodigo.set(String(a.codigo_externo).trim(), a.entidade_id);
    byNome.set(norm(a.nome_externo), a.entidade_id);
  }
  return { byCodigo, byNome };
}

function resolve(idx: AliasIndex, codigo: string | null, nome: string): string | null {
  if (codigo && idx.byCodigo.has(codigo)) return idx.byCodigo.get(codigo)!;
  if (nome && idx.byNome.has(norm(nome))) return idx.byNome.get(norm(nome))!;
  return null;
}

export function groupCompraToRpc(rows: WiseCompraRow[], aliases: AliasRow[]): RpcPedido[] {
  const forn = indexAliases(aliases, "fornecedor");
  const prod = indexAliases(aliases, "produto");
  const byPed = new Map<string, WiseCompraRow[]>();
  for (const r of rows) {
    const list = byPed.get(r.wise_pedido_id) ?? [];
    list.push(r);
    byPed.set(r.wise_pedido_id, list);
  }

  const out: RpcPedido[] = [];
  for (const [wiseId, items] of byPed) {
    const head = items[0]!;
    // Prefer ID:EMPRESA (seed), then CODIGO Wise, then nome
    const idEmpresa = `${head.fornecedor_wise}:${head.EMPRESA}`;
    const fornecedor_id =
      resolve(forn, idEmpresa, head.fornecedor_nome) ??
      resolve(forn, head.fornecedor_codigo, head.fornecedor_nome);
    const pendencias: RpcPedido["pendencias"] = [];
    if (!fornecedor_id) {
      pendencias.push({
        tipo: "fornecedor",
        nome: head.fornecedor_nome || `ENTIDADE ${idEmpresa}`,
        codigo: idEmpresa,
      });
    }
    const itens: RpcPedido["itens"] = [];
    for (const it of items) {
      const produto_id = resolve(prod, it.produto_wise, it.produto_nome);
      if (!produto_id) {
        pendencias.push({
          tipo: "produto",
          nome: it.produto_nome || it.produto_wise,
          codigo: it.produto_wise,
        });
      }
      const qtd = it.QTDE;
      const preco =
        it.TOTAL != null && qtd > 0 ? Number((it.TOTAL / qtd).toFixed(4)) : null;
      itens.push({
        produto_id,
        quantidade: qtd,
        preco_unitario: preco,
        unidade: it.unidade || "cx",
        produto_nome: it.produto_nome || it.produto_wise,
        codigo_produto: it.produto_wise,
      });
    }
    // dedupe pendencias by tipo+nome
    const seen = new Set<string>();
    const pendUnique = pendencias.filter((p) => {
      const k = `${p.tipo}|${norm(p.nome)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    out.push({
      wise_pedido_id: wiseId,
      fornecedor_id,
      data_prevista: head.DATA_PREV_ENTREGA ?? null,
      itens,
      pendencias: pendUnique,
    });
  }
  return out;
}

export function groupVendaToRpc(
  rows: WiseVendaRow[],
  aliases: AliasRow[],
  clientesByCodigo: Map<string, string>,
): RpcCarga[] {
  const prod = indexAliases(aliases, "produto");
  const byVenda = new Map<string, WiseVendaRow[]>();
  for (const r of rows) {
    const list = byVenda.get(r.wise_carregamento_id) ?? [];
    list.push(r);
    byVenda.set(r.wise_carregamento_id, list);
  }

  const out: RpcCarga[] = [];
  for (const [wiseId, items] of byVenda) {
    const head = items[0]!;
    const cliente_codigo = head.cliente_codigo;
    const cliente_id =
      (cliente_codigo && clientesByCodigo.get(cliente_codigo)) || null;
    const data_carga = head.DATA_EMBARQUE ?? head.DATA_ENTREGA ?? head.DATA_EMISSAO ?? null;
    const pendencias: RpcCarga["pendencias"] = [];
    if (!cliente_id) {
      pendencias.push({
        tipo: "destinatario",
        nome: head.cliente_nome || `ENTIDADE ${head.cliente_wise}`,
        codigo: cliente_codigo,
      });
    }
    const itens: RpcCarga["itens"] = [];
    for (const it of items) {
      const produto_id = resolve(prod, it.produto_wise, it.produto_nome);
      if (!produto_id) {
        pendencias.push({
          tipo: "produto",
          nome: it.produto_nome || it.produto_wise,
          codigo: it.produto_wise,
        });
      }
      itens.push({
        produto_id,
        quantidade: it.QTDE,
        produto_nome: it.produto_nome || it.produto_wise,
        codigo_produto: it.produto_wise,
      });
    }
    const seen = new Set<string>();
    const pendUnique = pendencias.filter((p) => {
      const k = `${p.tipo}|${norm(p.nome)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    out.push({
      wise_carregamento_id: wiseId,
      codigo: wiseId,
      cliente_id,
      cliente_codigo,
      data_carga,
      itens,
      pendencias: pendUnique,
    });
  }
  return out;
}

export function stableHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 40);
}

export type CoverageReport = {
  produtos_aliases: number;
  fornecedores_aliases: number;
  clientes_com_codigo: number;
};

export async function coverageReport(): Promise<CoverageReport> {
  const aliases = await loadAliases();
  const clientes = await loadClientesByCodigo();
  const report = {
    produtos_aliases: aliases.filter((a) => a.tipo === "produto").length,
    fornecedores_aliases: aliases.filter((a) => a.tipo === "fornecedor").length,
    clientes_com_codigo: clientes.size,
  };
  logger.info(report, "aliases coverage");
  return report;
}
