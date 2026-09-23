import {
  averageDurationMinutes,
  durationMinutes,
  fillRateDisplay,
  formatMetaLine,
  MAX_CONFERENCIA_MIN,
  safePct,
} from "./indicadores-metricas";

// safePct: never 100 on zero denom
if (safePct(0, 0) !== null) throw new Error("0/0 deve ser null");
if (safePct(4, 0) !== null) throw new Error("4/0 deve ser null");
if (safePct(0, 10) !== 0) throw new Error("0/10 deve ser 0");
if (safePct(95, 100) !== 95) throw new Error("95/100 = 95");
if (safePct(1, 3) !== 33.3) throw new Error(`1/3 esperado 33.3, veio ${safePct(1, 3)}`);

// fillRateDisplay
const sem = fillRateDisplay({ numerador: 0, denominador: 0, pedidos: 0, entregas: 0 });
if (sem.kind !== "sem_dados" || sem.label !== "sem dados" || sem.pct !== null) {
  throw new Error(`0/0 pedidos esperado sem_dados, veio ${JSON.stringify(sem)}`);
}

const aguard = fillRateDisplay({ numerador: 0, denominador: 0, pedidos: 4, entregas: 0 });
if (aguard.kind !== "aguardando_entrega" || aguard.pct !== null) {
  throw new Error(`4 pedidos 0 entregas esperado aguardando_entrega, veio ${JSON.stringify(aguard)}`);
}

const ok = fillRateDisplay({ numerador: 8, denominador: 10, pedidos: 2, entregas: 2 });
if (ok.kind !== "pct" || ok.pct !== 80 || ok.label !== "80%") {
  throw new Error(`8/10 esperado 80%, veio ${JSON.stringify(ok)}`);
}

// durationMinutes
if (durationMinutes(null, "2026-09-22T12:00:00Z") !== null) throw new Error("inicio null");
if (durationMinutes("2026-09-22T12:00:00Z", "2026-09-22T11:00:00Z") !== null) {
  throw new Error("fim < inicio inválido");
}
const d28 = durationMinutes("2026-09-22T10:00:00Z", "2026-09-22T10:28:00Z");
if (d28 !== 28) throw new Error(`esperado 28, veio ${d28}`);

// average: exclude zero and outliers
const avg = averageDurationMinutes(
  [
    { id: "a", minutes: 28 },
    { id: "b", minutes: 0 },
    { id: "c", minutes: 2915 },
    { id: "d", minutes: 32 },
  ],
  {
    maxValidMin: MAX_CONFERENCIA_MIN,
    formula: "AVG(finalizada_em − iniciada_em) em minutos",
    periodLabel: "últimas finalizadas",
  },
);
if (avg.avgMin !== 30) throw new Error(`média esperada 30, veio ${avg.avgMin}`);
if (avg.sampleSize !== 2) throw new Error(`amostra esperada 2, veio ${avg.sampleSize}`);
if (avg.outliers.length !== 1 || avg.outliers[0].id !== "c") {
  throw new Error(`outlier 2915 esperado, veio ${JSON.stringify(avg.outliers)}`);
}

const empty = averageDurationMinutes([], {
  maxValidMin: 60,
  formula: "x",
  periodLabel: "hoje",
});
if (empty.avgMin !== null || empty.sampleSize !== 0) {
  throw new Error("média vazia deve ser null");
}

const meta = formatMetaLine({
  periodLabel: "hoje",
  sampleSize: 2,
  formula: "itens ok ÷ total",
  outliersCount: 1,
});
if (!meta.includes("n=2") || !meta.includes("Outliers excluídos: 1")) {
  throw new Error(`meta linha inválida: ${meta}`);
}

console.log("indicadores-metricas ok");
