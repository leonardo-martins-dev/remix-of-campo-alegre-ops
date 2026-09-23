/**
 * NOP-362 — bun src/lib/permission-deps.test.ts
 */
import {
  completePermissionGaps,
  counterLabel,
  dependentsOf,
  grantWithDeps,
  groupPagesByModule,
  incompletePermissions,
  isPermissionSetComplete,
  moduleForSlug,
  requiredDepsOf,
  revokeWithDependents,
  USUARIOS_SLUG,
} from "./permission-deps";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(moduleForSlug("recebimento/conferir") === "Recebimento", "módulo conferir");
assert(moduleForSlug("expedicao/saida") === "Expedição", "módulo saída");
assert(moduleForSlug("caixas/saldo") === "Caixas", "módulo caixas");
assert(moduleForSlug("embalagens/inventario") === "Embalagens", "módulo embalagens");
assert(moduleForSlug("gestao") === "Cadastros", "gestao = cadastros");
assert(moduleForSlug(USUARIOS_SLUG) === "Gestão", "usuários = gestão");
assert(moduleForSlug("gestao/regras") === "Gestão", "regras = gestão");
assert(moduleForSlug("fornecedores") === "Cadastros", "fornecedores em cadastros");

const confDeps = requiredDepsOf("recebimento/conferir");
assert(confDeps.includes("receber"), "conferir → receber");
assert(confDeps.includes("recebimento"), "conferir → recebimento (pedidos)");
assert(confDeps.includes("fornecedores"), "conferir → fornecedores");

const granted = grantWithDeps(new Set(), "recebimento/conferir");
assert(granted.next.has("recebimento/conferir"), "marca conferir");
assert(granted.added.includes("recebimento"), "auto recebeu recebimento");
assert(granted.added.includes("fornecedores"), "auto recebeu fornecedores");
assert(granted.added.includes("receber"), "auto recebeu hub");

const catalog = [
  "receber",
  "recebimento",
  "recebimento/conferir",
  "recebimento/faltas",
  "fornecedores",
];
const revoked = revokeWithDependents(
  new Set(["receber", "recebimento", "recebimento/conferir", "recebimento/faltas", "fornecedores"]),
  "recebimento",
  catalog,
);
assert(revoked.removed.includes("recebimento"), "remove recebimento");
assert(revoked.removed.includes("recebimento/conferir"), "cascata conferir");
assert(revoked.removed.includes("recebimento/faltas"), "cascata faltas");
assert(!revoked.next.has("recebimento/conferir"), "conferir fora");
assert(revoked.next.has("fornecedores"), "fornecedores fica (não depende de recebimento)");

assert(
  dependentsOf("receber", catalog).includes("recebimento/conferir"),
  "dependents hub",
);

const incomplete = incompletePermissions(new Set(["recebimento/conferir"]));
assert(incomplete.length === 1, "1 lacuna");
assert(incomplete[0].missing.includes("fornecedores"), "falta fornecedores");
assert(!isPermissionSetComplete(new Set(["recebimento/conferir"])), "incompleto");

const filled = completePermissionGaps(new Set(["recebimento/conferir"]));
assert(isPermissionSetComplete(filled.next), "completo após fill");
assert(filled.added.includes("fornecedores"), "fill adicionou fornecedores");

assert(counterLabel(3, 7) === "3 de 7", "contador");

const groups = groupPagesByModule([
  { id: "1", slug: "recebimento/conferir", nome: "Conferir", ordem: 11 },
  { id: "2", slug: "gestao/usuarios", nome: "Usuários", ordem: 61 },
  { id: "3", slug: "caixas/saldo", nome: "Saldo", ordem: 30 },
]);
assert(groups[0].module === "Recebimento", "primeiro módulo");
assert(groups.some((g) => g.module === "Gestão"), "tem gestão");
assert(groups.some((g) => g.module === "Caixas"), "tem caixas");

console.log("permission-deps.test.ts: ok");
