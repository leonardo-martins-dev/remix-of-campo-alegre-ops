#!/usr/bin/env node
/**
 * NOP-325 — reconciliação capital na rua × inventário × ledger.
 * Uso: node --env-file=.env scripts/nop325_reconciliacao.mjs
 * Não altera dados. Lê v_saldos_caixa + cadastros.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(resolve(".env"), "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i);
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[k] === undefined) env[k] = v;
    }
  } catch {
    /* optional */
  }
  return env;
}

const env = loadEnv();
const URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function get(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

function isQaForn(nome) {
  const n = (nome || "").trim();
  if (/^BOB\s*\d+$/i.test(n)) return "bob_seed";
  if (/^TESTE\s*QA/i.test(n)) return "teste_qa_seed";
  if (/^FORN\s+.*TEST/i.test(n)) return "forn_test_seed";
  if (["aguardando vínculo", "aguardando vinculo"].includes(n.toLowerCase())) return "aguardando_vinculo_fantasma";
  return null;
}

async function getSoft(path, fallbackPath) {
  try {
    return await get(path);
  } catch (e) {
    if (fallbackPath) return get(fallbackPath);
    throw e;
  }
}

const [saldos, tipos, forns, clientes, posicoes] = await Promise.all([
  get("v_saldos_caixa?select=*&tipo_caixa=not.is.null"),
  get("tipos_caixa?select=sigla,nome,custo_unitario,ativo"),
  getSoft(
    "fornecedores?select=id,nome,ativo,is_teste,teste_motivo",
    "fornecedores?select=id,nome,ativo",
  ),
  getSoft(
    "clientes?select=id,nome,ativo,is_teste,teste_motivo",
    "clientes?select=id,nome,ativo",
  ),
  getSoft(
    "posicoes_caixa?select=id,tipo,ref_id,is_teste,teste_motivo",
    "posicoes_caixa?select=id,tipo,ref_id",
  ),
]);

const custos = Object.fromEntries(tipos.map((t) => [t.sigla, Number(t.custo_unitario) || 0]));
const fornName = Object.fromEntries(forns.map((f) => [f.id, f.nome]));
const cliName = Object.fromEntries(clientes.map((c) => [c.id, c.nome]));

const signed = {};
const positive = {};
const negatives = [];
for (const s of saldos) {
  const n = Number(s.saldo) || 0;
  const tipo = s.posicao_tipo || "?";
  const cx = s.tipo_caixa || "?";
  signed[tipo] ??= {};
  signed[tipo][cx] = (signed[tipo][cx] || 0) + n;
  if (n > 0) {
    positive[tipo] ??= {};
    positive[tipo][cx] = (positive[tipo][cx] || 0) + n;
  }
  if (n < 0) negatives.push({ ...s, nome: fornName[s.ref_id] || cliName[s.ref_id] || s.ref_id });
}

function pack(map) {
  const out = {};
  let qty = 0;
  let valor = 0;
  for (const [tipo, row] of Object.entries(map)) {
    const q = Object.values(row).reduce((a, b) => a + b, 0);
    const v = Object.entries(row).reduce((a, [cx, n]) => a + n * (custos[cx] || 0), 0);
    out[tipo] = { qty: q, valor: Math.round(v * 100) / 100, by_tipo: row };
    if (tipo === "cliente" || tipo === "fornecedor" || tipo === "galpao") {
      qty += q;
      valor += v;
    }
  }
  return { by: out, qty, valor: Math.round(valor * 100) / 100 };
}

const cap = pack(positive);
const inv = pack(signed);
const qaForns = forns.filter((f) => isQaForn(f.nome) || f.is_teste).map((f) => ({
  id: f.id,
  nome: f.nome,
  ativo: f.ativo,
  is_teste: f.is_teste,
  motivo: f.teste_motivo || isQaForn(f.nome),
}));
const orphanPos = posicoes.filter((p) => p.tipo === "cliente" && !p.ref_id);

const report = {
  cutoff: new Date().toISOString(),
  custos,
  capital_na_rua: { qty: cap.qty, valor: cap.valor, by: cap.by },
  inventario_signed: {
    qty: (signed.galpao ? Object.values(signed.galpao).reduce((a, b) => a + b, 0) : 0)
      + (signed.fornecedor ? Object.values(signed.fornecedor).reduce((a, b) => a + b, 0) : 0)
      + (signed.cliente ? Object.values(signed.cliente).reduce((a, b) => a + b, 0) : 0),
    by: inv.by,
  },
  delta_qty_capital_vs_inventario: cap.qty
    - (
      (signed.galpao ? Object.values(signed.galpao).reduce((a, b) => a + b, 0) : 0)
      + (signed.fornecedor ? Object.values(signed.fornecedor).reduce((a, b) => a + b, 0) : 0)
      + (signed.cliente ? Object.values(signed.cliente).reduce((a, b) => a + b, 0) : 0)
    ),
  negativos: negatives,
  qa_fornecedores: qaForns,
  orphan_cliente_posicoes: orphanPos,
  open_calc_bug_for_capital_formula: false,
  recommend_posting_bug_orphan_cliente: orphanPos.length > 0,
};

const outPath = resolve("docs/NOP-325_RECONCILIACAO_SNAPSHOT.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${outPath}`);
console.log(
  report.delta_qty_capital_vs_inventario === Math.abs(negatives.reduce((a, n) => a + Number(n.saldo), 0))
    ? "OK: delta qty = |sum negativos|"
    : "WARN: delta qty não fecha só com negativos — investigar",
);
