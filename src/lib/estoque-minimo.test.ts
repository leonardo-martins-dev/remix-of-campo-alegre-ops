import {
  countFornecedoresUnicos,
  isFornecedorElegivelAlerta,
  isFornecedorTeste,
  sugerirMinimoDoGiro,
  textoAcaoAlerta,
} from "./estoque-minimo";

if (!isFornecedorTeste("FORNECEDOR TESTE")) {
  throw new Error("deve detectar TESTE no nome");
}
if (!isFornecedorTeste("Cadastro de teste CA")) {
  throw new Error("deve detectar 'teste' minúsculo");
}
if (!isFornecedorTeste("test")) {
  throw new Error("deve detectar nome 'test'");
}
if (isFornecedorTeste("JOSE DA SILVA")) {
  throw new Error("nome real não é teste");
}

if (sugerirMinimoDoGiro(0, 14) !== 0) {
  throw new Error("giro zero → sugestão 0");
}
if (sugerirMinimoDoGiro(28, 14) !== 14) {
  throw new Error("28 em 14d = 2 semanas → média 14");
}
if (sugerirMinimoDoGiro(15, 14) !== 8) {
  throw new Error("15/2 = 7.5 → CEIL 8");
}
if (sugerirMinimoDoGiro(10, 7) !== 10) {
  throw new Error("10 em 7d = 1 semana → 10");
}
if (sugerirMinimoDoGiro(5, 3) !== 5) {
  throw new Error("período < 7d usa divisor 1");
}

if (textoAcaoAlerta(12, "VM") !== "Enviar 12 caixa(s) tipo VM") {
  throw new Error("textoAcaoAlerta formato");
}

const n = countFornecedoresUnicos([
  { fornecedor_id: "a" },
  { fornecedor_id: "a" },
  { fornecedor_id: "b" },
]);
if (n !== 2) throw new Error(`unicos esperado 2, veio ${n}`);

if (
  !isFornecedorElegivelAlerta({ nome: "João", ativo: true, mesclado_em_id: null })
) {
  throw new Error("ativo real deve ser elegível");
}
if (
  isFornecedorElegivelAlerta({ nome: "X", ativo: false, mesclado_em_id: null })
) {
  throw new Error("inativo não elegível");
}
if (
  isFornecedorElegivelAlerta({
    nome: "X",
    ativo: true,
    mesclado_em_id: "uuid",
  })
) {
  throw new Error("mesclado não elegível");
}
if (isFornecedorElegivelAlerta({ nome: "TESTE LAB", ativo: true })) {
  throw new Error("teste não elegível");
}

console.log("estoque-minimo ok");
