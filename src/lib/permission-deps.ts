/**
 * NOP-362 — mapa fixo de dependências entre permissões (slug → requer).
 * Espelhado em supabase/migrations/00060_nop362_permission_deps.sql.
 * Derivado do que cada tela consome (hub + listagens + cadastros).
 */

/** Módulos na ordem do menu (NOP-321). */
export const PERMISSION_MODULES = [
  "Recebimento",
  "Expedição",
  "Caixas",
  "Embalagens",
  "Cadastros",
  "Gestão",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

/** Slug da permissão de Usuários (trava do último admin). */
export const USUARIOS_SLUG = "gestao/usuarios";

/**
 * Dependências diretas: ao marcar a chave, estas também precisam estar ligadas.
 * Hubs (receber/expedir/caixas/embalagens) entram para o menu NOP-321 funcionar.
 */
export const PERMISSION_DEPS: Record<string, readonly string[]> = {
  // Recebimento
  recebimento: ["receber"],
  "recebimento/conferir": ["receber", "recebimento", "fornecedores"],
  "recebimento/faltas": ["receber", "recebimento"],
  "recebimento/vales": ["receber", "recebimento"],
  "recebimento/liberacoes": ["receber", "recebimento", "recebimento/vales"],
  "recebimento/saida-roca": ["receber"],

  // Expedição
  expedicao: ["expedir"],
  "expedicao/saida": ["expedir", "expedicao"],
  "expedicao/entrega": ["expedir", "expedicao"],
  "expedicao/minha-rota": ["expedir", "expedicao"],
  "expedicao/rotas": ["expedir", "expedicao"],
  "expedicao/tv": ["expedir", "expedicao"],
  "expedicao/rastreio": ["expedir", "expedicao"],

  // Caixas
  "caixas/saldo": ["caixas"],
  "caixas/movimentacao": ["caixas", "caixas/saldo"],
  "caixas/inventario": ["caixas", "caixas/saldo"],
  "caixas/economia": ["caixas", "caixas/saldo"],
  "caixas/galpao": ["caixas"],
  "caixas/retorno": ["caixas", "caixas/movimentacao"],
  "caixas/fornecedor": ["caixas", "caixas/movimentacao"],
  "caixas/motorista": ["caixas", "caixas/movimentacao"],

  // Embalagens
  "embalagens/saldo": ["embalagens"],
  "embalagens/inventario": ["embalagens", "embalagens/saldo"],

  // Cadastros / quebra
  "quebra/lancar": ["quebra"],
  fornecedores: [],

  // Gestão
  "gestao/regras": ["gestao"],
  "gestao/usuarios": ["gestao"],
  "relatorios/custos": ["indicadores"],
};

/** Módulo de exibição a partir do slug (ordem do menu). */
export function moduleForSlug(slug: string): PermissionModule | "Outros" {
  if (slug === "receber" || slug.startsWith("recebimento")) return "Recebimento";
  if (slug === "expedir" || slug.startsWith("expedicao")) return "Expedição";
  if (slug === "caixas" || slug.startsWith("caixas/")) return "Caixas";
  if (slug === "embalagens" || slug.startsWith("embalagens/")) return "Embalagens";
  if (
    slug === "gestao" ||
    slug === "fornecedores" ||
    slug === "quebra" ||
    slug === "quebra/lancar" ||
    slug.startsWith("gestao/")
  ) {
    if (slug === "gestao/usuarios" || slug === "gestao/regras") return "Gestão";
    if (slug === "gestao") return "Cadastros";
    if (slug.startsWith("gestao/")) return "Cadastros";
    return "Cadastros";
  }
  if (slug === "indicadores" || slug === "relatorios/custos" || slug === "dashboard") {
    return "Gestão";
  }
  return "Outros";
}

/** Fecho transitivo das dependências de um slug. */
export function requiredDepsOf(slug: string, seen = new Set<string>()): string[] {
  const direct = PERMISSION_DEPS[slug] ?? [];
  const out: string[] = [];
  for (const d of direct) {
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
    out.push(...requiredDepsOf(d, seen));
  }
  return [...new Set(out)];
}

/** Quem depende (direta ou indiretamente) deste slug. */
export function dependentsOf(slug: string, allSlugs: Iterable<string>): string[] {
  const out: string[] = [];
  for (const s of allSlugs) {
    if (s === slug) continue;
    if (requiredDepsOf(s).includes(slug)) out.push(s);
  }
  return out;
}

export function grantWithDeps(
  enabled: ReadonlySet<string>,
  slug: string,
): { next: Set<string>; added: string[] } {
  const next = new Set(enabled);
  const added: string[] = [];
  const need = [slug, ...requiredDepsOf(slug)];
  for (const s of need) {
    if (!next.has(s)) {
      next.add(s);
      if (s !== slug) added.push(s);
    }
  }
  return { next, added };
}

export function revokeWithDependents(
  enabled: ReadonlySet<string>,
  slug: string,
  catalogSlugs: Iterable<string>,
): { next: Set<string>; removed: string[] } {
  const next = new Set(enabled);
  const removed: string[] = [];
  const toDrop = new Set([slug, ...dependentsOf(slug, catalogSlugs)]);
  for (const s of toDrop) {
    if (next.has(s)) {
      next.delete(s);
      removed.push(s);
    }
  }
  return { next, removed };
}

/** Lacunas: permissões ligadas sem todas as deps. */
export function incompletePermissions(
  enabled: ReadonlySet<string>,
): { slug: string; missing: string[] }[] {
  const gaps: { slug: string; missing: string[] }[] = [];
  for (const slug of enabled) {
    const missing = requiredDepsOf(slug).filter((d) => !enabled.has(d));
    if (missing.length > 0) gaps.push({ slug, missing });
  }
  return gaps;
}

export function isPermissionSetComplete(enabled: ReadonlySet<string>): boolean {
  return incompletePermissions(enabled).length === 0;
}

/** Completa lacunas sem inventar permissões novas além das deps. */
export function completePermissionGaps(enabled: ReadonlySet<string>): {
  next: Set<string>;
  added: string[];
} {
  const next = new Set(enabled);
  const added: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const gap of incompletePermissions(next)) {
      for (const m of gap.missing) {
        if (!next.has(m)) {
          next.add(m);
          added.push(m);
          changed = true;
        }
      }
    }
  }
  return { next, added: [...new Set(added)] };
}

export type PageRef = { id: string; slug: string; nome: string; grupo?: string | null; ordem?: number };

export function groupPagesByModule(pages: PageRef[]): {
  module: PermissionModule | "Outros";
  pages: PageRef[];
}[] {
  const buckets = new Map<PermissionModule | "Outros", PageRef[]>();
  for (const mod of PERMISSION_MODULES) buckets.set(mod, []);
  buckets.set("Outros", []);

  const sorted = [...pages].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  for (const p of sorted) {
    const mod = moduleForSlug(p.slug);
    buckets.get(mod)!.push(p);
  }

  const out: { module: PermissionModule | "Outros"; pages: PageRef[] }[] = [];
  for (const mod of PERMISSION_MODULES) {
    const list = buckets.get(mod) ?? [];
    if (list.length > 0) out.push({ module: mod, pages: list });
  }
  const outros = buckets.get("Outros") ?? [];
  if (outros.length > 0) out.push({ module: "Outros", pages: outros });
  return out;
}

export function counterLabel(enabledInGroup: number, total: number): string {
  return `${Math.max(0, enabledInGroup)} de ${Math.max(0, total)}`;
}
