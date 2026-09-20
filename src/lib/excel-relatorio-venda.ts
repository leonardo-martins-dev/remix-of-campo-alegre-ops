import { normalizeKey } from "./normalize";
import { parseBrNumberLoose } from "./parse-br-number";

/** Linha achatada do relatório HTML de pedidos de venda (Wise/ERP). */
export type RelatorioVendaRow = {
  data: string;
  numero_pedido: string;
  vendedor: string;
  cliente: string;
  /** CNPJ do supermercado quando o relatório traz a coluna. */
  cnpj: string | null;
  codigo_produto: string;
  produto: string;
  unidade: string;
  quantidade: number;
};

const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;

/** Procura um CNPJ em qualquer célula do cabeçalho do pedido. */
export function extractCnpj(cells: string[]): string | null {
  for (const c of cells) {
    const m = CNPJ_RE.exec(c ?? "");
    if (m) return m[0];
  }
  return null;
}

export function isRelatorioVendaHtml(buffer: ArrayBuffer): boolean {
  const head = new TextDecoder("utf-8").decode(buffer.slice(0, 8000));
  const looksHtml = /<html[\s>]/i.test(head) || /<table[\s>]/i.test(head);
  const looksReport =
    /tabela_relatorio/i.test(head) ||
    /Nr\.\s*Ped\./i.test(head) ||
    /data-nomedb=["']CBX02["']/i.test(head);
  return looksHtml && looksReport;
}

function cellText(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function isProductHeader(cells: string[]): boolean {
  const a = normalizeKey(cells[0] ?? "");
  return a === "codigo" || a === "codigos" || a.startsWith("codigo");
}

/**
 * Relatório vem como .xls mas é HTML: cada pedido = linha cabeçalho + linha com tabela de itens.
 */
export function parseRelatorioVendaHtml(buffer: ArrayBuffer): RelatorioVendaRow[] {
  const html = new TextDecoder("utf-8").decode(buffer);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table =
    doc.querySelector("table#tabela_relatorio") ??
    doc.querySelector("table.tabela_relatorio") ??
    doc.querySelector("table");
  if (!table) return [];

  const body = table.querySelector("tbody") ?? table;
  const rows = Array.from(body.children).filter(
    (el): el is HTMLTableRowElement => el.tagName === "TR"
  );
  const out: RelatorioVendaRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const hdrCells = Array.from(rows[i].children)
      .filter((el) => el.tagName === "TD")
      .map((el) => cellText(el));
    if (hdrCells.length < 4) continue;

    const nested = rows[i].querySelector("table");
    // Cabeçalho do pedido: Data | Nr.Ped | Vend | Cliente | ...
    const looksOrder =
      !nested &&
      /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(hdrCells[0] ?? "") &&
      /^\d+$/.test(String(hdrCells[1] ?? "").replace(/\D/g, "")) &&
      !!(hdrCells[3] || hdrCells[2]);

    if (!looksOrder) continue;

    const data = hdrCells[0] ?? "";
    const numero_pedido = String(hdrCells[1] ?? "").replace(/\D/g, "") || String(hdrCells[1] ?? "").trim();
    const vendedor = hdrCells[2] ?? "";
    const cliente = (hdrCells[3] || hdrCells[2] || "").trim();
    const cnpj = extractCnpj(hdrCells);
    if (!numero_pedido || !cliente) continue;

    const itemsRow = rows[i + 1];
    const nestTable = itemsRow?.querySelector("table");
    if (!nestTable) continue;

    const itemTrs = Array.from(nestTable.querySelectorAll("tr"));
    for (const tr of itemTrs) {
      const cells = Array.from(tr.querySelectorAll("td")).map(cellText);
      if (cells.length < 4) continue;
      if (isProductHeader(cells)) continue;

      const codigo_produto = String(cells[0] ?? "").trim();
      const produto = String(cells[1] ?? "").trim();
      const unidade = String(cells[2] ?? "").trim();
      const quantidade = parseBrNumberLoose(cells[3]);
      if (!produto || quantidade <= 0) continue;
      if (/totais|ticket/i.test(produto)) continue;

      out.push({
        data,
        numero_pedido,
        vendedor,
        cliente,
        cnpj,
        codigo_produto,
        produto,
        unidade,
        quantidade,
      });
    }
    i += 1; // pula a linha da tabela aninhada
  }

  return out;
}

/** Remove sufixos de unidade do cadastro para casar com o relatório. */
export function normalizeProdutoMatch(nome: string): string {
  return normalizeKey(nome)
    .replace(/[-–—]\s*(und|un|kg|cx|pct|mc|g|pc|pct)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMapsRelatorioVenda(entities: {
  clientes: { id: string; nome: string }[];
  produtos: { id: string; nome: string; codigo?: string | null }[];
}) {
  const clienteByName = new Map<string, string>();
  for (const c of entities.clientes) {
    clienteByName.set(normalizeKey(c.nome), c.id);
  }

  const produtoByCode = new Map<string, string>();
  const produtoByName = new Map<string, string>();
  for (const p of entities.produtos) {
    if (p.codigo) produtoByCode.set(normalizeKey(p.codigo), p.id);
    produtoByName.set(normalizeProdutoMatch(p.nome), p.id);
    produtoByName.set(normalizeKey(p.nome), p.id);
  }

  return { clienteByName, produtoByCode, produtoByName };
}

export type RelatorioVendaBuildResult = {
  cargas: {
    codigo: string;
    /** Nº do pedido de venda no Wise, sem o prefixo PV-. */
    numero_ordem: string;
    cliente_id: string;
    cliente_nome: string;
    cliente_cnpj: string | null;
    /** Soma das quantidades do pedido (Qtde Total Itens do papel). */
    qtde_itens: number;
    itens: {
      produto_id: string;
      quantidade_romaneio: number;
      caixas_g: number;
      caixas_i: number;
      caixas_p: number;
    }[];
  }[];
  clientesFaltantes: string[];
  produtosFaltantes: { codigo: string; produto: string }[];
  pedidos: number;
  itens: number;
};

export function buildCargasFromRelatorioVenda(
  rows: RelatorioVendaRow[],
  maps: ReturnType<typeof buildMapsRelatorioVenda>,
  opts?: { clienteIdsByName?: Map<string, string> }
): RelatorioVendaBuildResult {
  const clienteByName = new Map(maps.clienteByName);
  if (opts?.clienteIdsByName) {
    for (const [k, v] of opts.clienteIdsByName) clienteByName.set(k, v);
  }

  const byPedido = new Map<string, RelatorioVendaBuildResult["cargas"][0]>();

  const clientesFaltantes = new Set<string>();
  const produtosFaltantes = new Map<string, { codigo: string; produto: string }>();

  for (const row of rows) {
    const cliKey = normalizeKey(row.cliente);
    const cliente_id = clienteByName.get(cliKey);
    if (!cliente_id) {
      clientesFaltantes.add(row.cliente);
      continue;
    }

    const codeKey = row.codigo_produto ? normalizeKey(row.codigo_produto) : "";
    const produto_id =
      (codeKey ? maps.produtoByCode.get(codeKey) : undefined) ??
      maps.produtoByName.get(normalizeProdutoMatch(row.produto)) ??
      maps.produtoByName.get(normalizeKey(row.produto));

    if (!produto_id) {
      const k = `${row.codigo_produto}|${row.produto}`;
      if (!produtosFaltantes.has(k)) {
        produtosFaltantes.set(k, { codigo: row.codigo_produto, produto: row.produto });
      }
      continue;
    }

    const key = row.numero_pedido;
    if (!byPedido.has(key)) {
      byPedido.set(key, {
        codigo: `PV-${row.numero_pedido}`,
        numero_ordem: row.numero_pedido,
        cliente_id,
        cliente_nome: row.cliente,
        cliente_cnpj: row.cnpj ?? null,
        qtde_itens: 0,
        itens: [],
      });
    }
    const carga = byPedido.get(key)!;
    if (!carga.cliente_cnpj && row.cnpj) carga.cliente_cnpj = row.cnpj;
    carga.qtde_itens += row.quantidade;
    carga.itens.push({
      produto_id,
      quantidade_romaneio: row.quantidade,
      caixas_g: 0,
      caixas_i: 0,
      caixas_p: 0,
    });
  }

  return {
    cargas: [...byPedido.values()].filter((c) => c.itens.length > 0),
    clientesFaltantes: [...clientesFaltantes].sort((a, b) => a.localeCompare(b, "pt-BR")),
    produtosFaltantes: [...produtosFaltantes.values()],
    pedidos: new Set(rows.map((r) => r.numero_pedido)).size,
    itens: rows.length,
  };
}
