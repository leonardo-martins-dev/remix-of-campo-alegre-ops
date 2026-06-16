import * as XLSX from "xlsx";

/** Colunas aceitas: codigo_carga, cliente, produto, quantidade (+ motorista, caixas G/I/P opcionais) */
export const EXPEDICAO_EXCEL_COLUNAS = [
  "codigo_carga",
  "cliente",
  "produto",
  "quantidade",
  "motorista",
  "caixas_g",
  "caixas_i",
  "caixas_p",
] as const;

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

  return normalizeExpedicaoRows(rows);
}

/** Parser com aliases Wise / ERP supermercado (formato Ygor) */
export function parseWiseExpedicaoExcel(buffer: ArrayBuffer): ExpedicaoExcelRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return normalizeExpedicaoRows(rows, true);
}

function normalizeExpedicaoRows(rows: Record<string, unknown>[], wise = false): ExpedicaoExcelRow[] {
  return rows
    .map((r) => {
      const codigo_carga = String(
        r.codigo_carga ??
          r.Codigo_Carga ??
          r.carregamento ??
          r.Carregamento ??
          r.numero_carga ??
          r.Codigo ??
          r.carga ??
          ""
      ).trim();
      const cliente = String(
        r.cliente ??
          r.Cliente ??
          r.loja ??
          r.Loja ??
          r.loja_destino ??
          r.supermercado ??
          r.destinatario ??
          ""
      ).trim();
      const produto = String(
        r.produto ?? r.Produto ?? r.item ?? r.Item ?? r.descricao ?? r.mercadoria ?? ""
      ).trim();
      const quantidade = Number(
        r.quantidade ?? r.Quantidade ?? r.qty ?? r.qtd ?? r.Qtd ?? r.qtde ?? 0
      );
      return {
        codigo_carga,
        cliente,
        produto,
        quantidade,
        motorista:
          String(r.motorista ?? r.Motorista ?? r.condutor ?? "").trim() || undefined,
        caixas_g: Number(r.caixas_g ?? r.caixas_G ?? r.G ?? r.grande ?? 0) || undefined,
        caixas_i: Number(r.caixas_i ?? r.caixas_I ?? r.I ?? r.isopor ?? 0) || undefined,
        caixas_p: Number(r.caixas_p ?? r.caixas_P ?? r.P ?? r.plastica ?? 0) || undefined,
        _wise: wise,
      } as ExpedicaoExcelRow & { _wise?: boolean };
    })
    .filter((r) => r.codigo_carga && r.cliente && r.produto && r.quantidade > 0)
    .map(({ _wise: _, ...r }) => r);
}

export function downloadExpedicaoTemplate() {
  const exemplo = [
    {
      codigo_carga: "CARGA-001",
      cliente: "Campo Alegre",
      produto: "Alface Crespa",
      quantidade: 120,
      motorista: "João Silva",
      caixas_g: 10,
      caixas_i: 5,
      caixas_p: 0,
    },
    {
      codigo_carga: "CARGA-001",
      cliente: "Campo Alegre",
      produto: "Tomate Saladete",
      quantidade: 80,
      motorista: "João Silva",
      caixas_g: 8,
      caixas_i: 0,
      caixas_p: 2,
    },
    {
      codigo_carga: "CARGA-002",
      cliente: "Anderson",
      produto: "Banana Prata",
      quantidade: 50,
      motorista: "",
      caixas_g: 0,
      caixas_i: 0,
      caixas_p: 0,
    },
  ];
  const ws = XLSX.utils.json_to_sheet(exemplo);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expedicao");
  XLSX.writeFile(wb, "expedicao-import-exemplo.xlsx");
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

export type WiseExportacaoRow = {
  produto: string;
  quantidade: number;
};

export function normalizeProdutoNome(n: string): string {
  return n.trim().toUpperCase().replace(/\s+/g, " ");
}

function parseBrQuantity(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const t = String(raw ?? "").trim();
  if (!t) return 0;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  const normalized = t.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function pickCol(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = k.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
    if (keys.some((key) => norm === key || norm.includes(key))) {
      return String(row[k] ?? "").trim();
    }
  }
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim()) return String(row[key]).trim();
  }
  return "";
}

function pickQty(row: Record<string, unknown>, keys: string[]): number {
  for (const k of Object.keys(row)) {
    const norm = k.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
    if (keys.some((key) => norm === key || norm.includes(key))) {
      return parseBrQuantity(row[k]);
    }
  }
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return parseBrQuantity(row[key]);
  }
  return 0;
}

export function isWiseExportacaoFormat(rows: Record<string, unknown>[]): boolean {
  if (!rows.length) return false;
  const sample = rows.slice(0, 5);
  return sample.some((r) => {
    const desc = pickCol(r, ["descricao", "descrição", "produto", "item"]);
    const qty = pickQty(r, ["qtde", "quantidade", "qtd"]);
    const cliente = pickCol(r, ["cliente", "loja", "destinatario", "destinatário"]);
    return !!desc && qty > 0 && !cliente;
  });
}

export function parseWiseExportacaoProdutos(buffer: ArrayBuffer): WiseExportacaoRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (isWiseExportacaoFormat(rows)) {
    return rows
      .map((r) => ({
        produto: pickCol(r, ["descricao", "descrição", "produto", "item"]),
        quantidade: pickQty(r, ["qtde", "quantidade", "qtd"]),
      }))
      .filter((r) => {
        if (!r.produto || r.quantidade <= 0) return false;
        const upper = r.produto.toUpperCase();
        if (upper.includes("TOTAIS") || upper.includes("TICKET MÉDIO") || upper.includes("TICKET MEDIO")) {
          return false;
        }
        return true;
      });
  }

  return rows
    .map((r) => {
      const vals = Object.values(r).map((v) => String(v ?? "").trim());
      const produto = vals[1] ?? "";
      const quantidade = parseBrQuantity(vals[3] ?? vals[2] ?? 0);
      return { produto, quantidade };
    })
    .filter((r) => {
      if (!r.produto || r.quantidade <= 0) return false;
      const upper = r.produto.toUpperCase();
      if (upper.includes("TOTAIS") || upper.includes("TICKET")) return false;
      if (upper === "CÓDIGO" || upper === "CODIGO" || upper === "DESCRIÇÃO" || upper === "DESCRICAO") {
        return false;
      }
      return true;
    });
}

export function matchProdutosFromWiseExport(
  rows: WiseExportacaoRow[],
  produtos: { id: string; nome: string }[]
) {
  const byNome = new Map(produtos.map((p) => [normalizeProdutoNome(p.nome), p.id]));
  const matched: { produto_id: string; quantidade_romaneio: number }[] = [];
  const missing: string[] = [];

  for (const row of rows) {
    const produto_id = byNome.get(normalizeProdutoNome(row.produto));
    if (produto_id) {
      matched.push({ produto_id, quantidade_romaneio: row.quantidade });
    } else {
      missing.push(row.produto);
    }
  }

  return { matched, missing };
}
