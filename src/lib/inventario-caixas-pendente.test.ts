import {
  isContagemCaixaPendenteSemana,
  semanaInventarioBRT,
} from "./utils-date";

// 2026-09-22 = terça → segunda 21/09, sexta 25/09
const sem = semanaInventarioBRT("2026-09-22");
if (sem.inicioSemana !== "2026-09-21") {
  throw new Error(`inicioSemana esperado 2026-09-21, veio ${sem.inicioSemana}`);
}
if (sem.vencimento !== "2026-09-25") {
  throw new Error(`vencimento esperado 2026-09-25, veio ${sem.vencimento}`);
}

if (!isContagemCaixaPendenteSemana(null, "2026-09-22")) {
  throw new Error("nunca contada deve ser pendente");
}
if (!isContagemCaixaPendenteSemana("2026-09-20", "2026-09-22")) {
  throw new Error("contagem da semana anterior deve ser pendente");
}
if (isContagemCaixaPendenteSemana("2026-09-21", "2026-09-22")) {
  throw new Error("contagem na segunda da semana corrente não é pendente");
}
if (isContagemCaixaPendenteSemana("2026-09-22", "2026-09-22")) {
  throw new Error("contagem no próprio dia não é pendente");
}

// sexta: ainda pendente se não contou na semana
if (!isContagemCaixaPendenteSemana(null, "2026-09-25")) {
  throw new Error("nunca contada na sexta deve ser pendente");
}
if (isContagemCaixaPendenteSemana("2026-09-24", "2026-09-25")) {
  throw new Error("contagem quinta da semana não é pendente na sexta");
}

console.log("inventario-caixas-pendente ok");
