import { canViewValoresCaixa, isValoresCaixaSlug } from "./roles";

if (canViewValoresCaixa(false, "admin") !== false) {
  throw new Error("operador real não deve ver valores");
}
if (canViewValoresCaixa(true, "admin") !== true) {
  throw new Error("admin em modo admin deve ver valores");
}
if (canViewValoresCaixa(true, "operador") !== false) {
  throw new Error("admin em modo operador não deve ver valores");
}
if (!isValoresCaixaSlug("caixas/saldo") || !isValoresCaixaSlug("caixas/economia")) {
  throw new Error("slugs de valores esperados");
}
if (isValoresCaixaSlug("dashboard") || isValoresCaixaSlug("caixas/movimentacao")) {
  throw new Error("slugs operacionais não são painel de valores");
}
console.log("valores-caixa ok");
