import { taxaRetornoHonesta } from "./caixas-map";

const ok = taxaRetornoHonesta(100, 80);
if (Math.abs(ok.pct - 80) > 0.01) throw new Error(`esperado 80, obtido ${ok.pct}`);
if (ok.overflow) throw new Error("não deveria overflow");

const overflow = taxaRetornoHonesta(100, 151);
if (Math.abs(overflow.pct - 100) > 0.01) throw new Error(`esperado 100, obtido ${overflow.pct}`);
if (!overflow.overflow) throw new Error("deveria marcar overflow");
if (overflow.label !== "151 / 100") throw new Error(`label ${overflow.label}`);

const zero = taxaRetornoHonesta(0, 10);
if (zero.pct !== 0 || zero.overflow) throw new Error("zero envios deve ser 0 sem overflow");

console.log("taxaRetornoHonesta ok");
