import { excludeTesteSaldos, isQaParceiroNome } from "./qa-teste";

const mixed = [
  { posicao_tipo: "galpao", saldo: 10, is_teste: false },
  { posicao_tipo: "fornecedor", saldo: 3, is_teste: true },
  { posicao_tipo: "cliente", saldo: 2, is_teste: false },
];
const clean = excludeTesteSaldos(mixed);
if (clean.length !== 2 || clean.some((r) => r.is_teste)) {
  throw new Error(`excludeTesteSaldos falhou: ${JSON.stringify(clean)}`);
}

const legacy = [{ posicao_tipo: "galpao", saldo: 1 }];
if (excludeTesteSaldos(legacy).length !== 1) {
  throw new Error("legacy sem is_teste deve passar intacto");
}

const nomes = ["BOB 1", "TESTE QA 1", "FORN V4 TEST", "Aguardando vínculo", "CAMPO ALEGRE LAVOURA"];
const flags = nomes.map(isQaParceiroNome);
if (JSON.stringify(flags) !== JSON.stringify([true, true, true, true, false])) {
  throw new Error(`isQaParceiroNome: ${flags}`);
}

console.log("qa-teste ok");
