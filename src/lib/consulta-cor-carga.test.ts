/**
 * NOP-467 — bun src/lib/consulta-cor-carga.test.ts
 */
import {
  coresLivresDeAtribuidas,
  listaPorCor,
  lookupCorProduto,
  mapaIrmaosPorStem,
  secoesFolhaPorProduto,
  stemProdutoNome,
  type VinculoCorCarga,
} from "./consulta-cor-carga";
import { FORNECEDOR_CORES } from "./fornecedor-cores";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const V: VinculoCorCarga[] = [
  {
    fornecedorId: "f1",
    fornecedorNome: "SANDRO RODRIGUES",
    cor: "preto",
    produtoId: "p-crespa",
    produtoNome: "ALFACE CRESPA – UND",
  },
  {
    fornecedorId: "f2",
    fornecedorNome: "JOAO ANTONIO LANDGRAF",
    cor: "preto",
    produtoId: "p-hidro",
    produtoNome: "ALFACE CRESPA HIDROPÔNICO -UND",
  },
  {
    fornecedorId: "f3",
    fornecedorNome: "FELIPE PAES",
    cor: "azul",
    produtoId: "p-crespa",
    produtoNome: "ALFACE CRESPA – UND",
  },
  {
    fornecedorId: "f4",
    fornecedorNome: "ZE DA COUVE",
    cor: "azul",
    produtoId: "p-couve",
    produtoNome: "COUVE MANTEIGA -UND",
  },
  {
    fornecedorId: "f5",
    fornecedorNome: "ROGERIO",
    cor: "azul",
    produtoId: "p-coentro",
    produtoNome: "COENTRO -UND",
  },
];

// stem: crespa e crespa hidropônico colapsam
assert(
  stemProdutoNome("ALFACE CRESPA – UND") === stemProdutoNome("ALFACE CRESPA HIDROPÔNICO -UND"),
  "stem irmãos alface",
);
assert(
  stemProdutoNome("COUVE MANTEIGA -UND") !== stemProdutoNome("ALFACE CRESPA – UND"),
  "stem distintos",
);

const irmaos = mapaIrmaosPorStem([
  { id: "p-crespa", nome: "ALFACE CRESPA – UND" },
  { id: "p-hidro", nome: "ALFACE CRESPA HIDROPÔNICO -UND" },
  { id: "p-couve", nome: "COUVE MANTEIGA -UND" },
]);
assert(irmaos.has(stemProdutoNome("ALFACE CRESPA – UND")), "grupo alface");
assert(!irmaos.has(stemProdutoNome("COUVE MANTEIGA -UND")), "couve sozinha sem irmão");

// cor + produto → 1
const um = lookupCorProduto(V, "azul", "p-crespa");
assert(um?.fornecedorNome === "FELIPE PAES", "azul+crespa = Felipe");
assert(lookupCorProduto(V, "azul", "p-inexistente") === null, "sem vínculo");

// cor só → lista por produto (nunca um nome)
const listaAzul = listaPorCor(V, "azul");
assert(listaAzul.length === 3, `azul lista 3 produtos, got ${listaAzul.length}`);
assert(
  listaAzul.every((i) => i.produtoNome && i.fornecedorNome),
  "cada item tem produto+fornecedor",
);
const crespa = listaAzul.find((i) => i.produtoId === "p-crespa");
assert(crespa?.alertaIrmao === true, "crespa flagada como irmã");
assert(
  crespa?.irmaosNomes.some((n) => n.includes("HIDROP")),
  "irmã hidropônica listada",
);

const listaPreto = listaPorCor(V, "preto");
assert(listaPreto.length === 2, "preto: crespa + hidro");
assert(
  listaPreto.every((i) => i.alertaIrmao),
  "ambos pretos flagados",
);

// livres: cores não atribuídas a nenhum fornecedor
const livres = coresLivresDeAtribuidas(["preto", "azul", null, "azul"]);
assert(livres.every((c) => c.id !== "preto" && c.id !== "azul"), "preto/azul não livres");
assert(livres.length === FORNECEDOR_CORES.length - 2, "9 livres");
assert(livres.some((c) => c.id === "verde"), "verde livre");

// folha por produto
const secoes = secoesFolhaPorProduto(V);
assert(secoes.length === 4, `4 produtos, got ${secoes.length}`);
const secCrespa = secoes.find((s) => s.produtoId === "p-crespa");
assert(secCrespa?.cores.length === 2, "crespa: preto+azul");
assert(secCrespa?.alertaIrmao === true, "folha flag irmão");
// irmãos com alerta vêm agrupados no início
const idxC = secoes.findIndex((s) => s.produtoId === "p-crespa");
const idxH = secoes.findIndex((s) => s.produtoId === "p-hidro");
assert(Math.abs(idxC - idxH) === 1, "irmãos adjacentes na folha");

console.log("consulta-cor-carga.test.ts: ok");
