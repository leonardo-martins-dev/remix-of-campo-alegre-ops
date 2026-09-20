import { normalizeKey } from "./normalize";

export type TipoCadastro = "fornecedor" | "cliente";

export type CadastroRow = {
  id: string;
  nome: string;
  ativo?: boolean;
  cnpj?: string | null;
  codigo_wise?: string | null;
  mesclado_em_id?: string | null;
};

export type AliasRow = {
  id?: string;
  tipo: string;
  nome_externo: string;
  codigo_externo?: string | null;
  entidade_id?: string | null;
};

/** Sufixos que a planilha do Wise cola no fim da razão social. */
const SUFIXOS = [" e outra", " e outras", " e outro", " e outros", " e cia", " e filhos"];

/** Código Wise / CNPJ grudado no começo do nome: "35.527.016 JOSUE…". */
const CODIGO_NO_NOME = /^(\d[\d.\-/]*)\s+(.{3,})$/;

export function extrairCodigoDoNome(nome: string): { codigo: string; nomeLimpo: string } | null {
  const bruto = (nome ?? "").trim();
  const m = CODIGO_NO_NOME.exec(bruto);
  if (!m) return null;
  const codigo = m[1].replace(/[.\-/]+$/, "");
  const nomeLimpo = m[2].trim();
  // "1000 CAIXAS" não é código de cadastro: exige nome com letra depois.
  if (!/[a-zA-ZÀ-ÿ]/.test(nomeLimpo)) return null;
  if (!codigo) return null;
  return { codigo, nomeLimpo };
}

export const proporSepararCodigo = extrairCodigoDoNome;

/**
 * Chave de comparação de cadastros: sem acento/caixa, sem o código grudado
 * e sem "E OUTRA/E OUTROS".
 */
export function normalizeNomeCadastro(nome: string): string {
  const semCodigo = extrairCodigoDoNome(nome)?.nomeLimpo ?? nome ?? "";
  let k = normalizeKey(semCodigo);
  for (const sufixo of SUFIXOS) {
    if (k.endsWith(sufixo)) {
      k = k.slice(0, -sufixo.length).trim();
      break;
    }
  }
  return k.replace(/[.,;]+$/, "").trim();
}

export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** CNPJ/CPF do cadastro: coluna própria ou o que estiver grudado no nome. */
export function documentoDoCadastro(row: CadastroRow): string | null {
  const doCampo = soDigitos(row.cnpj);
  if (doCampo.length >= 11) return doCampo;
  const doNome = soDigitos(extrairCodigoDoNome(row.nome)?.codigo ?? "");
  return doNome.length >= 11 ? doNome : null;
}

export type GrupoDuplicado = {
  chave: string;
  motivo: "nome" | "documento" | "wise";
  rotulo: string;
  ids: string[];
  itens: CadastroRow[];
};

const MOTIVO_LABEL: Record<GrupoDuplicado["motivo"], string> = {
  nome: "Nome parecido",
  documento: "Mesmo CNPJ/CPF",
  wise: "Mesmo nome no Wise",
};

export function motivoLabel(motivo: GrupoDuplicado["motivo"]): string {
  return MOTIVO_LABEL[motivo];
}

/**
 * Agrupa possíveis duplicados por nome normalizado, documento e nome do Wise.
 * Só entram cadastros ativos e ainda não mesclados.
 */
export function detectarDuplicados(
  rows: CadastroRow[],
  aliases: AliasRow[],
  tipo: TipoCadastro,
): GrupoDuplicado[] {
  const candidatos = rows.filter((r) => r.ativo !== false && !r.mesclado_em_id);
  const porId = new Map(candidatos.map((r) => [r.id, r]));

  const grupos = new Map<string, GrupoDuplicado>();
  const registrar = (
    chave: string,
    motivo: GrupoDuplicado["motivo"],
    rotulo: string,
    ids: string[],
  ) => {
    const unicos = [...new Set(ids)].filter((id) => porId.has(id));
    if (unicos.length < 2) return;
    const atual = grupos.get(chave);
    if (atual) {
      atual.ids = [...new Set([...atual.ids, ...unicos])];
      atual.itens = atual.ids.map((id) => porId.get(id)!).filter(Boolean);
      return;
    }
    grupos.set(chave, {
      chave,
      motivo,
      rotulo,
      ids: unicos,
      itens: unicos.map((id) => porId.get(id)!).filter(Boolean),
    });
  };

  const porNome = new Map<string, string[]>();
  const porDoc = new Map<string, string[]>();
  for (const row of candidatos) {
    const nomeKey = normalizeNomeCadastro(row.nome);
    if (nomeKey.length >= 3) porNome.set(nomeKey, [...(porNome.get(nomeKey) ?? []), row.id]);
    const doc = documentoDoCadastro(row);
    if (doc) porDoc.set(doc, [...(porDoc.get(doc) ?? []), row.id]);
  }

  for (const [chave, ids] of porNome) {
    registrar(`nome:${chave}`, "nome", porId.get(ids[0])?.nome ?? chave, ids);
  }
  for (const [chave, ids] of porDoc) {
    registrar(`doc:${chave}`, "documento", chave, ids);
  }

  // mesmo nome do Wise apontando para cadastros diferentes
  const porWise = new Map<string, { rotulo: string; ids: string[] }>();
  for (const a of aliases) {
    if (a.tipo !== tipo || !a.entidade_id) continue;
    const chave = normalizeNomeCadastro(a.nome_externo);
    if (chave.length < 3) continue;
    const atual = porWise.get(chave) ?? { rotulo: a.nome_externo, ids: [] };
    atual.ids.push(a.entidade_id);
    porWise.set(chave, atual);
  }
  for (const [chave, { rotulo, ids }] of porWise) {
    registrar(`wise:${chave}`, "wise", rotulo, ids);
  }

  return [...grupos.values()]
    .filter((g) => g.itens.length >= 2)
    .sort((a, b) => b.itens.length - a.itens.length || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Cadastros cujo nome começa com código/CNPJ — candidatos a separar. */
export function detectarCodigoNoNome(
  rows: CadastroRow[],
): { row: CadastroRow; codigo: string; nomeLimpo: string }[] {
  const out: { row: CadastroRow; codigo: string; nomeLimpo: string }[] = [];
  for (const row of rows) {
    if (row.ativo === false || row.mesclado_em_id) continue;
    const split = extrairCodigoDoNome(row.nome);
    if (split) out.push({ row, ...split });
  }
  return out.sort((a, b) => a.row.nome.localeCompare(b.row.nome, "pt-BR"));
}
