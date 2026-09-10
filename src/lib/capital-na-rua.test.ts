import { capitalNaRua, type SaldoPosicao } from "./caixas-map";

const saldos: SaldoPosicao[] = [
  { posicao_tipo: "cliente", tipo_caixa: "G", saldo: 10 },
  { posicao_tipo: "fornecedor", tipo_caixa: "G", saldo: 4 },
  { posicao_tipo: "galpao", tipo_caixa: "G", saldo: 99 },
  { posicao_tipo: "cliente", tipo_caixa: "P", saldo: 2 },
];
const custos = { G: 20, P: 5 };

const dashboard = capitalNaRua(saldos, custos);
const saldoPage = capitalNaRua(saldos, custos);

if (dashboard.valor !== saldoPage.valor) {
  throw new Error(`Capital divergente: dashboard=${dashboard.valor} saldo=${saldoPage.valor}`);
}
if (dashboard.valor !== 10 * 20 + 4 * 20 + 2 * 5) {
  throw new Error(`Capital esperado 290, obtido ${dashboard.valor}`);
}
if (dashboard.qty !== 16) {
  throw new Error(`Qty esperada 16 (sem galpão), obtido ${dashboard.qty}`);
}

console.log("capitalNaRua ok", dashboard);
