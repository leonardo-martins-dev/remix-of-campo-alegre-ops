import * as XLSX from "xlsx";
import { validateRateio } from "./rateio";

export type ExcelPedidoRow = {
  codigo: string;
  fornecedor: string;
  produto: string;
  qtd: number;
  unidade: string;
  destinatario: string;
  qtd_rateio: number;
};

export function parsePedidosExcel(file: ArrayBuffer): ExcelPedidoRow[] {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows.map((r) => ({
    codigo: String(r.codigo ?? r.Codigo ?? r.CODIGO ?? ""),
    fornecedor: String(r.fornecedor ?? r.Fornecedor ?? ""),
    produto: String(r.produto ?? r.Produto ?? ""),
    qtd: Number(r.qtd ?? r.Qtd ?? r.quantidade ?? 0),
    unidade: String(r.unidade ?? r.Unidade ?? "un"),
    destinatario: String(r.destinatario ?? r.Destinatario ?? ""),
    qtd_rateio: Number(r.qtd_rateio ?? r.Qtd_rateio ?? r.quantidade_rateio ?? 0),
  })).filter((r) => r.codigo && r.fornecedor && r.produto);
}

export function exportToExcel(filename: string, sheetName: string, data: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export function buildPedidosFromExcel(
  rows: ExcelPedidoRow[],
  maps: {
    fornecedorByName: Map<string, string>;
    produtoByName: Map<string, string>;
    destinatarioByName: Map<string, string>;
  }
) {
  const byCodigo = new Map<string, {
    codigo: string;
    fornecedor_id: string;
    itens: Map<string, { produto_id: string; quantidade: number; rateio: { destinatario_id: string; quantidade: number }[] }>;
  }>();

  for (const row of rows) {
    const fornecedor_id = maps.fornecedorByName.get(row.fornecedor.trim());
    const produto_id = maps.produtoByName.get(row.produto.trim());
    const destinatario_id = maps.destinatarioByName.get(row.destinatario.trim());
    if (!fornecedor_id || !produto_id) continue;

    if (!byCodigo.has(row.codigo)) {
      byCodigo.set(row.codigo, { codigo: row.codigo, fornecedor_id, itens: new Map() });
    }
    const ped = byCodigo.get(row.codigo)!;
    const key = produto_id;
    if (!ped.itens.has(key)) {
      ped.itens.set(key, { produto_id, quantidade: 0, rateio: [] });
    }
    const item = ped.itens.get(key)!;
    item.quantidade += row.qtd;
    if (destinatario_id && row.qtd_rateio > 0) {
      item.rateio.push({ destinatario_id, quantidade: row.qtd_rateio });
    }
  }

  const pedidos = [...byCodigo.values()].map((p) => ({
    codigo: p.codigo,
    fornecedor_id: p.fornecedor_id,
    itens: [...p.itens.values()],
  }));

  for (const ped of pedidos) {
    for (const item of ped.itens) {
      const v = validateRateio(item.quantidade, item.rateio);
      if (!v.ok) {
        throw new Error(`Pedido ${ped.codigo}: ${v.error}`);
      }
    }
  }

  return pedidos;
}
