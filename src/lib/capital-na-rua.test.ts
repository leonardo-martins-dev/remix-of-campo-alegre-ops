import { capitalNaRua, type SaldoPosicao } from "./caixas-map";

const saldos: SaldoPosicao[] = [
  { posicao_tipo: "cliente", tipo_caixa: "G", saldo: 10 },
  { posicao_tipo: "fornecedor", tipo_caixa: "G", saldo: 4 },
  { posicao_tipo: "galpao", tipo_caixa: "G", saldo: 99 },
  { posicao_tipo: "cliente", tipo_caixa: "P", saldo: 2 },
  { posicao_tipo: "fornecedor", tipo_caixa: "V", saldo: -15 },
];
const custos = { G: 20, P: 5, V: 38 };

const dashboard = capitalNaRua(saldos, custos);
const saldoPage = capitalNaRua(saldos, custos);

if (dashboard.valor !== saldoPage.valor) {
  throw new Error(`Capital divergente: dashboard=${dashboard.valor} saldo=${saldoPage.valor}`);
}
// 10*20 + 4*20 + 99*20 + 2*5 = 200+80+1980+10 = 2270; negativo V ignorado
if (dashboard.valor !== 2270) {
  throw new Error(`Capital esperado 2270, obtido ${dashboard.valor}`);
}
if (dashboard.qty !== 115) {
  throw new Error(`Qty esperada 115 (galpão incluso, negativo ignorado), obtido ${dashboard.qty}`);
}

console.log("capitalNaRua ok", dashboard);
