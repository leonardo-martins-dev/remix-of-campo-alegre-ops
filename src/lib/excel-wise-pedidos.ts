import * as XLSX from "xlsx";
import { normalizeKey } from "./normalize";
import { parseBrNumber } from "./parse-br-number";

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
  familia: string;
  linha?: number;
};

export type LinhaIgnorada = {
  linha: number;
  coluna: string;
  valor: string;
  motivo: string;
};

export type WiseParseResult =
  | { ok: true; rows: WisePedidoRow[]; columns: string[]; ignoradas: LinhaIgnorada[]; sheet: string }
  | { ok: false; error: string; columns: string[] };

const COL = {
  pedido: [
    "pedido",
    "n ped",
    "nr ped",
    "nro ped",
    "num ped",
    "n pedido",
    "nº ped",
    "nº pedido",
    "numero pedido",
    "nro pedido",
    "wise_pedido",
    "pedido wise",
  ],
  codigoFornecedor: ["codigo fornecedor", "cód fornecedor", "cod fornecedor", "codigo_fornecedor"],
  fornecedor: ["fornecedor", "nome fornecedor", "razao social"],
  codigoProduto: ["codigo produto", "cód produto", "cod produto", "codigo_produto", "sku", "codigo", "código"],
  produto: ["produto", "descricao", "descrição", "item"],
  quantidade: ["quantidade", "qtd", "qtde", "caixas", "qty"],
  unidade: ["unidade", "un", "und"],
  preco: ["preco unitario", "preço unitário", "preco", "preço", "valor unitario", "vl unit"],
  valorTotal: ["valor", "vl total", "valor total", "total item", "vl item"],
  loja: ["loja", "destinatario", "destinatário", "filial", "cliente"],
  data: ["data prevista", "data entrega", "data compra", "data pedido", "dt compra", "previsao", "previsão", "data_prevista"],
  familia: ["familia", "família", "familia produto", "grupo", "categoria"],
};

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function cleanCell(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return decodeEntities(stripHtml(value));
}

function normalizeHeader(value: string): string {
  return normalizeKey(String(cleanCell(value)))
    .replace(/[º°ª]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickField(row: Record<string, unknown>, aliases: string[]): unknown {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const found = keys.find((k) => normalizeHeader(k) === target);
    if (found != null && row[found] !== "" && row[found] != null) return cleanCell(row[found]);
  }
  return undefined;
}

function hasAnyColumn(columns: string[], aliases: string[]): boolean {
  return columns.some((c) => aliases.some((a) => normalizeHeader(c) === normalizeHeader(a)));
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 1200).toLowerCase();
  return head.includes("<html") || head.includes("<table");
}

function parseHtmlTable(html: string): Record<string, unknown>[] {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  const trs = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  if (trs.length < 2) return [];

  const parseRow = (tr: string): { text: string; colspan: number }[] => {
    const cells: { text: string; colspan: number }[] = [];
    const re = /<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tr))) {
      const colspan = Number((m[1].match(/colspan\s*=\s*['"]?(\d+)/i) ?? [])[1] ?? 1);
      cells.push({
        text: String(cleanCell(m[2]) ?? ""),
        colspan: Number.isFinite(colspan) && colspan > 0 ? colspan : 1,
      });
    }
    return cells;
  };

  const expand = (cells: { text: string; colspan: number }[]): string[] => {
    const out: string[] = [];
    for (const c of cells) {
      out.push(c.text);
      for (let i = 1; i < c.colspan; i++) out.push("");
    }
    return out;
  };

  const headerRow = trs[0];
  if (!headerRow) return [];
  const headers = expand(parseRow(headerRow)).map((h, i) => h || `col${i}`);
  return trs.slice(1).map((tr) => {
    const values = expand(parseRow(tr));
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(cleanCell(k) || k)] = cleanCell(v);
  }
  return out;
}

function readSheetRows(file: ArrayBuffer): { rows: Record<string, unknown>[]; columns: string[]; sheet: string } {
  const text = new TextDecoder("utf-8").decode(file);
  try {
    const wb = XLSX.read(file, { type: "array", cellDates: true, raw: true });
    if (wb.SheetNames.length) {
      const sheetName = pickSheetName(wb.SheetNames);
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true }).map(sanitizeRow);
      const columns = rows[0] ? Object.keys(rows[0]) : [];
      if (rows.length) return { rows, columns, sheet: sheetName };
    }
  } catch {
    /* HTML-as-xls da exportação Wise cai no fallback abaixo */
  }
  if (looksLikeHtml(text)) {
    const rows = parseHtmlTable(text).map(sanitizeRow);
    return { rows, columns: rows[0] ? Object.keys(rows[0]) : [], sheet: "Sheet0" };
  }
  return { rows: [], columns: [], sheet: "" };
}

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

function pickSheetName(names: string[]): string {
  const pedido = names.find((n) => {
    const k = normalizeKey(n);
    return k === "pedido" || k === "pedido wise";
  });
  if (pedido) return pedido;
  const data = names.find((n) => {
    const k = normalizeKey(n);
    return !k.includes("como preencher") && !k.includes("instrucao") && !k.includes("instrucoes");
  });
  return data ?? names[0];
}

function rawLabel(raw: unknown): string {
  if (raw == null) return "";
  return String(raw);
}

export function parseWisePedido(file: ArrayBuffer): WiseParseResult {
  const { rows, columns, sheet: sheetName } = readSheetRows(file);

  if (!rows.length) {
    return { ok: false, error: "Arquivo sem linhas de dados.", columns };
  }

  const hasPedido = hasAnyColumn(columns, COL.pedido);
  const hasQtd = hasAnyColumn(columns, COL.quantidade);

  if (!hasQtd) {
    return {
      ok: false,
      error: `Coluna de quantidade ausente. Colunas lidas: ${columns.join(", ") || "(nenhuma)"}. Este arquivo parece ser só cabeçalho (exportação Wise sem itens).`,
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
  const ignoradas: LinhaIgnorada[] = [];

  rows.forEach((r, idx) => {
    const linha = idx + 2;
    const pedido = String(pickField(r, COL.pedido) ?? "").trim();
    const fornecedor = String(pickField(r, COL.fornecedor) ?? "").trim();
    const produto = String(pickField(r, COL.produto) ?? "").trim();
    if (!pedido && !fornecedor) return;

    if (!pedido) {
      ignoradas.push({ linha, coluna: "pedido", valor: "", motivo: `Linha ${linha}: pedido vazio` });
      return;
    }

    const qtdRaw = pickField(r, COL.quantidade);
    const qtdParsed = parseBrNumber(qtdRaw);
    if (!qtdParsed.ok || qtdParsed.value <= 0) {
      ignoradas.push({
        linha,
        coluna: "quantidade",
        valor: rawLabel(qtdRaw),
        motivo: `Linha ${linha}: quantidade '${rawLabel(qtdRaw)}' não é um número válido (zero, vazia ou inválida)`,
      });
      return;
    }

    const precoRaw = pickField(r, COL.preco);
    let preco_unitario: number | null = null;
    if (precoRaw != null && precoRaw !== "") {
      const precoParsed = parseBrNumber(precoRaw);
      if (!precoParsed.ok || precoParsed.value < 0) {
        ignoradas.push({
          linha,
          coluna: "preco_unitario",
          valor: rawLabel(precoRaw),
          motivo: `Linha ${linha}: preco_unitario '${rawLabel(precoRaw)}' não é um número`,
        });
        return;
      }
      preco_unitario = precoParsed.value;
    } else {
      const totalRaw = pickField(r, COL.valorTotal);
      if (totalRaw != null && totalRaw !== "") {
        const totalParsed = parseBrNumber(totalRaw);
        if (!totalParsed.ok || totalParsed.value < 0) {
          ignoradas.push({
            linha,
            coluna: "valor",
            valor: rawLabel(totalRaw),
            motivo: `Linha ${linha}: valor '${rawLabel(totalRaw)}' não é um número`,
          });
          return;
        }
        preco_unitario = roundMoney(totalParsed.value / qtdParsed.value);
      }
    }

    const unidadeRaw = String(pickField(r, COL.unidade) ?? "").trim();
    parsed.push({
      pedido,
      codigo_fornecedor: String(pickField(r, COL.codigoFornecedor) ?? "").trim(),
      fornecedor,
      codigo_produto: String(pickField(r, COL.codigoProduto) ?? "").trim(),
      produto,
      quantidade: qtdParsed.value,
      // Exportação Wise não traz unidade — padrão UN (conferência).
      unidade: unidadeRaw || "un",
      preco_unitario,
      loja: String(pickField(r, COL.loja) ?? "").trim(),
      data_prevista: asDate(pickField(r, COL.data)),
      familia: String(pickField(r, COL.familia) ?? "").trim(),
      linha,
    });
  });

  return { ok: true, rows: parsed, columns, ignoradas, sheet: sheetName };
}

export type CadastroMaps = {
  fornecedorByName: Map<string, string>;
  fornecedorByCode: Map<string, string>;
  produtoByName: Map<string, string>;
  produtoByCode: Map<string, string>;
  destinatarioByName: Map<string, string>;
  clienteByName: Map<string, string>;
  clienteByCnpj: Map<string, string>;
};

export type AliasRow = {
  tipo: "fornecedor" | "produto" | "destinatario" | "cliente";
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
    clienteByName: new Map(maps.clienteByName),
    clienteByCnpj: new Map(maps.clienteByCnpj),
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
    } else if (a.tipo === "cliente") {
      next.clienteByName.set(nome, a.entidade_id);
      if (code) next.clienteByCnpj.set(code.replace(/\D/g, ""), a.entidade_id);
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
  cliente_id: string | null;
  familia?: string;
  rateio: { destinatario_id: string | null; destinatario_nome: string; quantidade: number }[];
};

export type WisePendencia = { tipo: "fornecedor" | "produto"; nome: string; codigo?: string };

export type WiseBuildPedido = {
  wise_pedido_id: string;
  fornecedor_id: string | null;
  fornecedor_nome: string;
  codigo_fornecedor: string;
  data_prevista: string | null;
  itens: WiseBuildItem[];
  pendencias: WisePendencia[];
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
    const lojaKey = row.loja ? normalizeKey(row.loja) : "";
    const cliente_id = lojaKey
      ? maps.clienteByCnpj.get(lojaKey.replace(/\D/g, "")) ?? maps.clienteByName.get(lojaKey) ?? null
      : null;

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
    if (!ped.fornecedor_id && fornecedor_id) ped.fornecedor_id = fornecedor_id;
    if (!ped.fornecedor_id && row.fornecedor) {
      if (!ped.pendencias.some((p) => p.tipo === "fornecedor" && p.nome === row.fornecedor)) {
        ped.pendencias.push({ tipo: "fornecedor", nome: row.fornecedor, codigo: row.codigo_fornecedor });
      }
    }
    if (!produto_id && (row.produto || row.codigo_produto)) {
      const nome = row.produto || row.codigo_produto;
      if (!ped.pendencias.some((p) => p.tipo === "produto" && p.nome === nome)) {
        ped.pendencias.push({ tipo: "produto", nome, codigo: row.codigo_produto });
      }
    }

    let item = ped.itens.find(
      (i) => (produto_id && i.produto_id === produto_id) || (!produto_id && i.produto_nome === row.produto && i.codigo_produto === row.codigo_produto)
    );
    if (!item) {
      item = {
        produto_id,
        produto_nome: row.produto,
        codigo_produto: row.codigo_produto,
        quantidade: 0,
        unidade: row.unidade,
        preco_unitario: row.preco_unitario,
        cliente_id,
        familia: row.familia,
        rateio: [],
      };
      ped.itens.push(item);
    }
    item.quantidade += row.quantidade || 0;
    if (row.familia) item.familia = row.familia;
    if (row.preco_unitario != null) item.preco_unitario = row.preco_unitario;
    if (row.unidade) item.unidade = row.unidade;
    if (row.loja) {
      const existing = item.rateio.find((r) => r.destinatario_nome === row.loja || (dest_id && r.destinatario_id === dest_id));
      if (existing) existing.quantidade += row.quantidade || 0;
      else item.rateio.push({ destinatario_id: dest_id, destinatario_nome: row.loja, quantidade: row.quantidade || 0 });
    }
  }

  return [...byPedido.values()];
}

export function downloadWiseModelo() {
  const pedidos = [
    {
      pedido: "W-2026-1001",
      codigo_fornecedor: "",
      fornecedor: "CARLA PIEDADE (MARCIO HENRIQUE DE OLIVEIRA)",
      codigo_produto: "956",
      produto: "SALADA TROPICAL HIG",
      quantidade: "40",
      unidade: "UN",
      preco_unitario: "12,50",
      data_prevista: "2026-09-08",
      familia: "1 · Alfaces/folhas",
    },
    {
      pedido: "W-2026-1001",
      codigo_fornecedor: "",
      fornecedor: "CARLA PIEDADE (MARCIO HENRIQUE DE OLIVEIRA)",
      codigo_produto: "312",
      produto: "ALFACE CRESPA",
      quantidade: "1.234,50",
      unidade: "UN",
      preco_unitario: "2,50",
      data_prevista: "2026-09-08",
      familia: "1 · Alfaces/folhas",
    },
    {
      pedido: "W-2026-1002",
      codigo_fornecedor: "",
      fornecedor: "HORTIFRUTI VALE VERDE",
      codigo_produto: "880",
      produto: "COUVE MANTEIGA",
      quantidade: "80",
      unidade: "UN",
      preco_unitario: "3,20",
      data_prevista: "2026-09-09",
      familia: "4 · Couve/ervas",
    },
  ];
  const ws = XLSX.utils.json_to_sheet(pedidos);
  const instrucoes = [
    { coluna: "pedido", obrigatorio: "sim", formato: "texto", exemplo: "30296", notas: "Na exportação Wise (Exportacao.xls) é a coluna Nº Ped. Também aceita pedido, n ped, numero pedido." },
    { coluna: "quantidade", obrigatorio: "sim", formato: "1.234,50 ou 1234.50 ou 1234", exemplo: "6.000", notas: "Na exportação Wise é Qtde (1.234 = milhar). Também aceita qtd, quantidade. Zero/vazia/inválida ignora a linha." },
    { coluna: "fornecedor", obrigatorio: "não", formato: "nome como no Wise", exemplo: "CARLA PIEDADE (MARCIO HENRIQUE DE OLIVEIRA)", notas: "Sem fornecedor o pedido fica aguardando vínculo. Código de fornecedor é opcional e costuma vir vazio no Wise." },
    { coluna: "codigo_fornecedor", obrigatorio: "não", formato: "texto", exemplo: "", notas: "A lista de compra do Wise não traz este campo." },
    { coluna: "produto", obrigatorio: "não", formato: "descrição", exemplo: "ALFACE AMERICANA", notas: "Também aceita descricao, item. Sem cadastro o item entra como 'a vincular'." },
    { coluna: "codigo_produto", obrigatorio: "não", formato: "numérico do Wise", exemplo: "5", notas: "Na exportação Wise é a coluna Código (não é o nº do pedido). Também aceita sku." },
    { coluna: "unidade", obrigatorio: "não", formato: "UN / PC / KG", exemplo: "UN", notas: "Conferência é na unidade do pedido, não em caixas. Vazio não assume cx — a prévia avisa." },
    { coluna: "preco_unitario", obrigatorio: "não", formato: "2,50 ou 2.50", exemplo: "12,50", notas: "Na exportação Wise a coluna Valor é o total da linha; o sistema grava Valor / Qtde. Sem preço o item fica estimado na falta/quebra." },
    { coluna: "data_prevista", obrigatorio: "não", formato: "AAAA-MM-DD ou DD/MM/AAAA", exemplo: "11/09/2026", notas: "Na exportação Wise é Data Compra. Se vazio, usa o parâmetro dias_entrega_prevista." },
    { coluna: "familia", obrigatorio: "não", formato: "família do Wise (1 a 7)", exemplo: "1 · Alfaces/folhas", notas: "Não use Folhas/Frutos/Raízes." },
    { coluna: "(loja)", obrigatorio: "não lida para compra", formato: "—", exemplo: "", notas: "Rateio por loja saiu da compra. Se a coluna existir, é ignorada para vínculo." },
  ];
  const wsHelp = XLSX.utils.json_to_sheet(instrucoes);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedido");
  XLSX.utils.book_append_sheet(wb, wsHelp, "Como preencher");
  XLSX.writeFile(wb, "modelo-pedido-wise.xlsx");
}

export async function hashArquivo(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
