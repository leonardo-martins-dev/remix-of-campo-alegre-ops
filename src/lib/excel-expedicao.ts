import * as XLSX from "xlsx";

export type ExpedicaoExcelRow = {
  codigo_carga: string;
  cliente: string;
  produto: string;
  quantidade: number;
  motorista?: string;
  caixas_g?: number;
  caixas_i?: number;
  caixas_p?: number;
};

export function parseExpedicaoExcel(buffer: ArrayBuffer): ExpedicaoExcelRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows
    .map((r) => ({
      codigo_carga: String(r.codigo_carga ?? r.Codigo ?? r.carga ?? "").trim(),
      cliente: String(r.cliente ?? r.Cliente ?? r.loja ?? "").trim(),
      produto: String(r.produto ?? r.Produto ?? "").trim(),
      quantidade: Number(r.quantidade ?? r.Quantidade ?? r.qty ?? 0),
      motorista: String(r.motorista ?? r.Motorista ?? "").trim() || undefined,
      caixas_g: Number(r.caixas_g ?? r.G ?? 0) || undefined,
      caixas_i: Number(r.caixas_i ?? r.I ?? 0) || undefined,
      caixas_p: Number(r.caixas_p ?? r.P ?? 0) || undefined,
    }))
    .filter((r) => r.codigo_carga && r.cliente && r.produto && r.quantidade > 0);
}

export function buildCargasFromExcel(
  rows: ExpedicaoExcelRow[],
  maps: {
    clienteByName: Map<string, string>;
    produtoByName: Map<string, string>;
    motoristaByName: Map<string, string>;
  }
) {
  const byCarga = new Map<
    string,
    {
      codigo: string;
      cliente_id: string;
      motorista_id?: string;
      itens: {
        produto_id: string;
        quantidade_romaneio: number;
        caixas_g: number;
        caixas_i: number;
        caixas_p: number;
      }[];
    }
  >();

  for (const row of rows) {
    const cliente_id = maps.clienteByName.get(row.cliente);
    const produto_id = maps.produtoByName.get(row.produto);
    if (!cliente_id || !produto_id) continue;

    const motorista_id = row.motorista ? maps.motoristaByName.get(row.motorista) : undefined;
    const key = row.codigo_carga;
    if (!byCarga.has(key)) {
      byCarga.set(key, {
        codigo: row.codigo_carga,
        cliente_id,
        motorista_id,
        itens: [],
      });
    }
    const carga = byCarga.get(key)!;
    carga.itens.push({
      produto_id,
      quantidade_romaneio: row.quantidade,
      caixas_g: row.caixas_g ?? 0,
      caixas_i: row.caixas_i ?? 0,
      caixas_p: row.caixas_p ?? 0,
    });
  }

  return [...byCarga.values()];
}
