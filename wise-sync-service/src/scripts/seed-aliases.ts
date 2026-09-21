/**
 * Seed aliases from CMP218 PRODUTO/ENTIDADE matched to local cadastro.
 * Run: npm run seed:aliases (requires .env with MSSQL + Supabase service-role)
 */
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import { getSupabase } from "../lib/supabase.js";
import { queryReadonly, closeMssql } from "../services/wise/mssql-client.js";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  logger.info("seed aliases start");
  const sb = getSupabase();

  const [{ data: produtos }, { data: fornecedores }] = await Promise.all([
    sb.from("produtos").select("id, nome, codigo").eq("ativo", true),
    sb.from("fornecedores").select("id, nome, codigo_wise").eq("ativo", true),
  ]);

  const prodByCodigo = new Map<string, string>();
  const prodByNome = new Map<string, string>();
  for (const p of produtos ?? []) {
    if (p.codigo) prodByCodigo.set(String(p.codigo).trim(), p.id);
    prodByNome.set(norm(p.nome), p.id);
  }

  const fornByCodigo = new Map<string, string>();
  const fornByNome = new Map<string, string>();
  for (const f of fornecedores ?? []) {
    if ((f as { codigo_wise?: string }).codigo_wise) {
      fornByCodigo.set(String((f as { codigo_wise: string }).codigo_wise).trim(), f.id);
    }
    fornByNome.set(norm(f.nome), f.id);
  }

  const empresas = env.WISE_EMPRESAS.join(",");
  const produtosWise = await queryReadonly<{ ID: string | number; DESCRICAO: string }>(
    `SELECT CAST(ID AS varchar(50)) AS ID, DESCRICAO FROM PRODUTO WITH (NOLOCK)`,
  );
  const entidades = await queryReadonly<{
    ID: string | number;
    EMPRESA: number;
    CODIGO: string | number | null;
    RAZAO: string;
  }>(
    `SELECT CAST(ID AS varchar(50)) AS ID, EMPRESA, CAST(CODIGO AS varchar(50)) AS CODIGO, RAZAO
     FROM ENTIDADE WITH (NOLOCK)
     WHERE EMPRESA IN (${empresas})`,
  );

  let matchedProd = 0;
  let pendingProd = 0;
  const aliasRows: {
    tipo: string;
    nome_externo: string;
    codigo_externo: string | null;
    entidade_id: string;
    origem: string;
  }[] = [];

  for (const pr of produtosWise) {
    const codigo = String(pr.ID);
    const nome = pr.DESCRICAO ?? codigo;
    const entidade_id = prodByCodigo.get(codigo) ?? prodByNome.get(norm(nome));
    if (entidade_id) {
      aliasRows.push({
        tipo: "produto",
        nome_externo: nome,
        codigo_externo: codigo,
        entidade_id,
        origem: "wise",
      });
      matchedProd++;
    } else {
      pendingProd++;
    }
  }

  let matchedForn = 0;
  let pendingForn = 0;
  for (const e of entidades) {
    // Always key ENTIDADE by ID+EMPRESA (handoff armadilha 3.1)
    const idEmpresa = `${e.ID}:${e.EMPRESA}`;
    const codigoWise = e.CODIGO != null ? String(e.CODIGO).trim() : null;
    const nome = e.RAZAO ?? idEmpresa;
    const entidade_id =
      (codigoWise && fornByCodigo.get(codigoWise)) ||
      fornByNome.get(norm(nome)) ||
      null;
    if (entidade_id) {
      aliasRows.push({
        tipo: "fornecedor",
        // Unique (tipo,origem,nome_externo): include EMPRESA to avoid cross-CNPJ collide
        nome_externo: `${nome} [${e.EMPRESA}]`,
        codigo_externo: idEmpresa,
        entidade_id,
        origem: "wise",
      });
      // Also keep CODIGO alias when present (clientes/fornecedores.codigo_wise)
      if (codigoWise) {
        aliasRows.push({
          tipo: "fornecedor",
          nome_externo: nome,
          codigo_externo: codigoWise,
          entidade_id,
          origem: "wise",
        });
      }
      matchedForn++;
    } else {
      pendingForn++;
    }
  }

  // upsert in chunks
  for (let i = 0; i < aliasRows.length; i += 200) {
    const chunk = aliasRows.slice(i, i + 200);
    const { error } = await sb.from("aliases").upsert(chunk, {
      onConflict: "tipo,origem,nome_externo",
    });
    if (error) throw new Error(error.message);
  }

  const { count: clientesComCodigo } = await sb
    .from("clientes")
    .select("id", { count: "exact", head: true })
    .eq("ativo", true)
    .not("codigo", "is", null);

  logger.info(
    {
      matchedProd,
      pendingProd,
      matchedForn,
      pendingForn,
      aliasesUpserted: aliasRows.length,
      clientesComCodigo: clientesComCodigo ?? 0,
    },
    "seed aliases coverage",
  );

  await closeMssql();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, "seed aliases failed");
  process.exit(1);
});
