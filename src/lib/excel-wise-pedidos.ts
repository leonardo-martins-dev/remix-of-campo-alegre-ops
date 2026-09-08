import * as XLSX from "xlsx";
import { normalizeKey, pickColumn } from "./normalize";

export type WisePedidoRow = {
  pedido: string;
  codigo_fornecedor: string;
  fornecedor: string;
  codigo_produto: string;
  produto: string;
  quantidade: number;
  unidade: string;
  preco_unitario: number | null;
  loja: string;
  data_prevista: string | null;
};

export type WiseParseResult =
  | { ok: true; rows: WisePedidoRow[]; columns: string[] }
  | { ok: false; error: string; columns: string[] };

const COL = {
  pedido: ["pedido", "n pedido", "nº pedido", "numero pedido", "nro pedido", "wise_pedido", "pedido wise", "codigo", "código"],
  codigoFornecedor: ["codigo fornecedor", "cód fornecedor", "cod fornecedor", "codigo_fornecedor"],
  fornecedor: ["fornecedor", "nome fornecedor", "razao social"],
  codigoProduto: ["codigo produto", "cód produto", "cod produto", "codigo_produto", "sku"],
  produto: ["produto", "descricao", "descrição", "item"],
  quantidade: ["quantidade", "qtd", "qtde", "caixas", "qty"],
  unidade: ["unidade", "un", "und"],
  preco: ["preco unitario", "preço unitário", "preco", "preço", "valor unitario", "vl unit"],
  loja: ["loja", "destinatario", "destinatário", "filial", "cliente"],
  data: ["data prevista", "data entrega", "previsao", "previsão", "data_prevista"],
};

function asDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, "0");
      const dd = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${mm}-${dd}`;
    }
  }
  const s = String(value).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s || null;
}

export function parseWisePedido(file: ArrayBuffer): WiseParseResult {
  const wb = XLSX.read(file, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const columns = rows[0] ? Object.keys(rows[0]) : [];

  if (!rows.length) {
    return { ok: false, error: "Arquivo sem linhas de dados.", columns };
  }

  const sample = rows[0];
  const hasPedido = pickColumn(sample, COL.pedido) != null || columns.some((c) => COL.pedido.includes(normalizeKey(c)));
  const hasQtd = pickColumn(sample, COL.quantidade) != null || columns.some((c) => COL.quantidade.includes(normalizeKey(c)));

  if (!hasQtd) {
    return {
      ok: false,
      error: `Coluna de quantidade ausente. Colunas lidas: ${columns.join(", ") || "(nenhuma)"}`,
      columns,
    };
  }
  if (!hasPedido) {
    return {
      ok: false,
      error: `Coluna de nº do pedido ausente. Colunas lidas: ${columns.join(", ") || "(nenhuma)"}`,
      columns,
    };
  }

  const parsed: WisePedidoRow[] = [];
  for (const r of rows) {
    const pedido = String(pickColumn(r, COL.pedido) ?? "").trim();
    const fornecedor = String(pickColumn(r, COL.fornecedor) ?? "").trim();
    const produto = String(pickColumn(r, COL.produto) ?? "").trim();
    const quantidade = Number(pickColumn(r, COL.quantidade) ?? 0);
    if (!pedido && !fornecedor && !produto) continue;
    parsed.push({
      pedido,
      codigo_fornecedor: String(pickColumn(r, COL.codigoFornecedor) ?? "").trim(),
      fornecedor,
      codigo_produto: String(pickColumn(r, COL.codigoProduto) ?? "").trim(),
      produto,
      quantidade,
      unidade: String(pickColumn(r, COL.unidade) ?? "cx").trim() || "cx",
      preco_unitario: pickColumn(r, COL.preco) == null || pickColumn(r, COL.preco) === ""
        ? null
        : Number(pickColumn(r, COL.preco)),
      loja: String(pickColumn(r, COL.loja) ?? "").trim(),
      data_prevista: asDate(pickColumn(r, COL.data)),
    });
  }

  return { ok: true, rows: parsed, columns };
}

export type CadastroMaps = {
  fornecedorByName: Map<string, string>;
  fornecedorByCode: Map<string, string>;
  produtoByName: Map<string, string>;
  produtoByCode: Map<string, string>;
  destinatarioByName: Map<string, string>;
};

export type AliasRow = {
  tipo: "fornecedor" | "produto" | "destinatario";
  nome_externo: string;
  codigo_externo: string | null;
  entidade_id: string;
};

export function applyAliases(maps: CadastroMaps, aliases: AliasRow[]): CadastroMaps {
  const next = {
    fornecedorByName: new Map(maps.fornecedorByName),
    fornecedorByCode: new Map(maps.fornecedorByCode),
    produtoByName: new Map(maps.produtoByName),
    produtoByCode: new Map(maps.produtoByCode),
    destinatarioByName: new Map(maps.destinatarioByName),
  };
  for (const a of aliases) {
    const nome = normalizeKey(a.nome_externo);
    const code = a.codigo_externo ? normalizeKey(a.codigo_externo) : "";
    if (a.tipo === "fornecedor") {
      next.fornecedorByName.set(nome, a.entidade_id);
      if (code) next.fornecedorByCode.set(code, a.entidade_id);
    } else if (a.tipo === "produto") {
      next.produtoByName.set(nome, a.entidade_id);
      if (code) next.produtoByCode.set(code, a.entidade_id);
    } else {
      next.destinatarioByName.set(nome, a.entidade_id);
    }
  }
  return next;
}

export type WiseBuildItem = {
  produto_id: string | null;
  produto_nome: string;
  codigo_produto: string;
  quantidade: number;
  unidade: string;
  preco_unitario: number | null;
  rateio: { destinatario_id: string | null; destinatario_nome: string; quantidade: number }[];
};

export type WiseBuildPedido = {
  wise_pedido_id: string;
  fornecedor_id: string | null;
  fornecedor_nome: string;
  codigo_fornecedor: string;
  data_prevista: string | null;
  itens: WiseBuildItem[];
  pendencias: { tipo: "fornecedor" | "produto" | "destinatario"; nome: string; codigo?: string }[];
};

export function buildWisePedidos(rows: WisePedidoRow[], maps: CadastroMaps): WiseBuildPedido[] {
  const byPedido = new Map<string, WiseBuildPedido>();

  for (const row of rows) {
    if (!row.pedido) continue;
    const fornCode = row.codigo_fornecedor ? maps.fornecedorByCode.get(normalizeKey(row.codigo_fornecedor)) : undefined;
    const fornName = row.fornecedor ? maps.fornecedorByName.get(normalizeKey(row.fornecedor)) : undefined;
    const fornecedor_id = fornCode ?? fornName ?? null;

    const prodCode = row.codigo_produto ? maps.produtoByCode.get(normalizeKey(row.codigo_produto)) : undefined;
    const prodName = row.produto ? maps.produtoByName.get(normalizeKey(row.produto)) : undefined;
    const produto_id = prodCode ?? prodName ?? null;

    const dest_id = row.loja ? maps.destinatarioByName.get(normalizeKey(row.loja)) ?? null : null;

    if (!byPedido.has(row.pedido)) {
      byPedido.set(row.pedido, {
        wise_pedido_id: row.pedido,
        fornecedor_id,
        fornecedor_nome: row.fornecedor,
        codigo_fornecedor: row.codigo_fornecedor,
        data_prevista: row.data_prevista,
        itens: [],
        pendencias: [],
      });
    }
    const ped = byPedido.get(row.pedido)!;
    if (!ped.fornecedor_id && !fornecedor_id) {
      if (row.fornecedor && !ped.pendencias.some((p) => p.tipo === "fornecedor" && p.nome === row.fornecedor)) {
        ped.pendencias.push({ tipo: "fornecedor", nome: row.fornecedor, codigo: row.codigo_fornecedor });
      }
    }
    if (!produto_id) {
      ped.pendencias.push({ tipo: "produto", nome: row.produto || row.codigo_produto, codigo: row.codigo_produto });
    }
    if (row.loja && !dest_id) {
      if (!ped.pendencias.some((p) => p.tipo === "destinatario" && p.nome === row.loja)) {
        ped.pendencias.push({ tipo: "destinatario", nome: row.loja });
      }
    }

    let item = ped.itens.find((i) => (produto_id && i.produto_id === produto_id) || (!produto_id && i.produto_nome === row.produto));
    if (!item) {
      item = {
        produto_id,
        produto_nome: row.produto,
        codigo_produto: row.codigo_produto,
        quantidade: 0,
        unidade: row.unidade,
        preco_unitario: row.preco_unitario,
        rateio: [],
      };
      ped.itens.push(item);
    }
    item.quantidade += row.quantidade || 0;
    if (row.preco_unitario != null) item.preco_unitario = row.preco_unitario;
    if (row.loja) {
      const existing = item.rateio.find((r) => r.destinatario_nome === row.loja || (dest_id && r.destinatario_id === dest_id));
      if (existing) existing.quantidade += row.quantidade || 0;
      else item.rateio.push({ destinatario_id: dest_id, destinatario_nome: row.loja, quantidade: row.quantidade || 0 });
    }
  }

  return [...byPedido.values()];
}

export function downloadWiseModelo() {
  const ws = XLSX.utils.json_to_sheet([
    {
      pedido: "W-2026-1001",
      codigo_fornecedor: "F001",
      fornecedor: "Horta Verde",
      codigo_produto: "ALF-01",
      produto: "Alface Crespa",
      quantidade: 40,
      unidade: "cx",
      preco_unitario: 12.5,
      loja: "Campo Alegre",
      data_prevista: "2026-09-08",
    },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedido Wise");
  XLSX.writeFile(wb, "modelo-pedido-wise.xlsx");
}
