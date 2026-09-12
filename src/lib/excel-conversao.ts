import * as XLSX from "xlsx";
import { normalizeKey, pickColumn } from "./normalize";

export type ConversaoRow = {
  linha: number;
  codigo: string;
  fornecedor: string;
  produto: string;
  tipoCaixa1: string;
  conversao1: number | null;
  tipoCaixa2: string;
  conversao2: number | null;
};

export type ParsedConversao = {
  rows: ConversaoRow[];
  errors: { linha: number; motivo: string }[];
};

const TIPO_CAIXA_ALIASES: Record<string, string> = {
  amerela: "Amarela",
  amarela: "Amarela",
  vermelha: "Vermelha",
  verde: "Verde",
  azul: "Azul",
  branca: "Branca",
  preta: "Preta",
  g: "G",
  i: "I",
  p: "P",
};

export function normalizeTipoCaixa(raw: string): string {
  const trimmed = raw.trim();
  const key = normalizeKey(trimmed);
  return TIPO_CAIXA_ALIASES[key] ?? trimmed;
}

function parseNumericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return null;
    return Math.round(value);
  }
  const str = String(value).replace(/\s/g, "").replace(",", ".");
  const num = parseFloat(str);
  if (!Number.isFinite(num) || num === 0) return null;
  return Math.round(num);
}

export function parseConversaoExcel(file: ArrayBuffer, sheetName?: string): ParsedConversao {
  const wb = XLSX.read(file, { type: "array" });
  
  const targetSheet = sheetName
    ? wb.SheetNames.find((s) => normalizeKey(s).includes(normalizeKey(sheetName)))
    : wb.SheetNames.find((s) => normalizeKey(s).includes("itens") || normalizeKey(s).includes("pedido")) ?? wb.SheetNames[0];
  
  if (!targetSheet) {
    return { rows: [], errors: [{ linha: 0, motivo: "Planilha não encontrada" }] };
  }
  
  const sheet = wb.Sheets[targetSheet];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  
  const rows: ConversaoRow[] = [];
  const errors: { linha: number; motivo: string }[] = [];
  
  for (let i = 0; i < rawRows.length; i++) {
    const r = rawRows[i];
    const linha = i + 2;
    
    const codigo = String(pickColumn(r, ["Código", "Codigo", "CÓDIGO", "CODIGO", "Nº", "N", "Num"]) ?? "").trim();
    const fornecedor = String(pickColumn(r, ["Fornecedor", "FORNECEDOR", "Forn"]) ?? "").trim();
    const produto = String(pickColumn(r, ["Produto", "PRODUTO", "Desc", "Descrição", "Nome"]) ?? "").trim();
    
    const tipoCaixa1Raw = String(pickColumn(r, ["Tipo de Caixa 1", "Tipo Caixa 1", "TipoCaixa1", "Caixa1", "Caixa 1", "Tipo de Caixa"]) ?? "").trim();
    const conversao1Raw = pickColumn(r, ["Conversão 1", "Conversao 1", "Conversao1", "Conv1", "Fator 1", "Fator1", "Conversão"]);
    
    const tipoCaixa2Raw = String(pickColumn(r, ["Tipo de Caixa 2", "Tipo Caixa 2", "TipoCaixa2", "Caixa2", "Caixa 2"]) ?? "").trim();
    const conversao2Raw = pickColumn(r, ["Conversão 2", "Conversao 2", "Conversao2", "Conv2", "Fator 2", "Fator2"]);
    
    if (!codigo && !produto) {
      continue;
    }
    
    if (!produto) {
      errors.push({ linha, motivo: "Produto ausente" });
      continue;
    }
    
    const tipoCaixa1 = tipoCaixa1Raw ? normalizeTipoCaixa(tipoCaixa1Raw) : "";
    const conversao1 = parseNumericValue(conversao1Raw);
    const tipoCaixa2 = tipoCaixa2Raw ? normalizeTipoCaixa(tipoCaixa2Raw) : "";
    const conversao2 = parseNumericValue(conversao2Raw);
    
    rows.push({
      linha,
      codigo,
      fornecedor,
      produto,
      tipoCaixa1,
      conversao1,
      tipoCaixa2,
      conversao2,
    });
  }
  
  return { rows, errors };
}

export type ConversaoImportItem = {
  linha: number;
  produtoCodigo: string;
  produtoNome: string;
  fornecedorNome: string;
  tipoCaixa: string;
  fator: number | null;
  status: "ok" | "pendente" | "rejeitado";
  motivo?: string;
};

export function flattenConversaoRows(rows: ConversaoRow[]): ConversaoImportItem[] {
  const items: ConversaoImportItem[] = [];
  
  for (const row of rows) {
    if (row.tipoCaixa1) {
      items.push({
        linha: row.linha,
        produtoCodigo: row.codigo,
        produtoNome: row.produto,
        fornecedorNome: row.fornecedor,
        tipoCaixa: row.tipoCaixa1,
        fator: row.conversao1,
        status: row.conversao1 && row.conversao1 > 0 ? "ok" : "pendente",
        motivo: !row.conversao1 || row.conversao1 === 0 ? "Fator 0 ou vazio" : undefined,
      });
    }
    
    if (row.tipoCaixa2) {
      items.push({
        linha: row.linha,
        produtoCodigo: row.codigo,
        produtoNome: row.produto,
        fornecedorNome: row.fornecedor,
        tipoCaixa: row.tipoCaixa2,
        fator: row.conversao2,
        status: row.conversao2 && row.conversao2 > 0 ? "ok" : "pendente",
        motivo: !row.conversao2 || row.conversao2 === 0 ? "Fator 0 ou vazio" : undefined,
      });
    }
  }
  
  return items;
}

export function downloadPendencias(
  pendencias: { linha: number; motivo: string; dados: Record<string, unknown> }[]
) {
  const ws = XLSX.utils.json_to_sheet(
    pendencias.map((p) => ({
      Linha: p.linha,
      Motivo: p.motivo,
      ...p.dados,
    }))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pendências");
  XLSX.writeFile(wb, `conversao-pendencias-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
