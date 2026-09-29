/**
 * NOP-463 — bun src/lib/sugerir-cores-fornecedores.test.ts
 */
import { PALETA_OPERACIONAL } from "./fornecedor-cores";
import {
  conflitosCorNaSelecao,
  coresLivresNoProduto,
  detectarConflitosCor,
  sugerirCoresFornecedores,
  sugerirQuemTrocar,
  type FornecedorCorInput,
} from "./sugerir-cores-fornecedores";
import { avisosCorDuplicadaNaSelecao } from "./conferir-chegada";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const P = PALETA_OPERACIONAL;
assert(P.length === 11, "paleta de 11 para os cenários abaixo");

function forn(
  id: string,
  produtoIds: string[],
  cor: string | null = null,
  caixasCirculando?: number,
): FornecedorCorInput {
  return { id, nome: `F${id}`, cor, produtoIds, caixasCirculando };
}

/* 1. Clique K11: 11 fornecedores no mesmo produto → 11 cores distintas. */
{
  const couve = Array.from({ length: 11 }, (_, i) => forn(`f${i + 1}`, ["couve"]));
  const sug = sugerirCoresFornecedores(couve, P);
  assert(sug.length === 11, "sugere para todos os 11");
  const cores = sug.map((s) => s.corSugerida);
  assert(new Set(cores).size === 11, `11 cores distintas, veio ${new Set(cores).size}`);
  assert(
    cores.every((c) => P.includes(c)),
    "todas dentro da paleta",
  );
  assert(
    sug.every((s) => s.motivo === "grafo"),
    "motivo grafo",
  );

  // proposta aplicada não gera conflito
  const aplicados = couve.map((f) => ({
    ...f,
    cor: sug.find((s) => s.fornecedorId === f.id)!.corSugerida,
  }));
  assert(detectarConflitosCor(aplicados).length === 0, "K11 sem conflito");
}

/* 2. Dois produtos com fornecedores em comum: respeita os dois. */
{
  const fornecedores = [
    forn("a", ["couve", "alface"]),
    forn("b", ["couve"]),
    forn("c", ["alface"]),
    // já colorido: restrição fixa em alface
    forn("d", ["alface"], P[0]),
  ];
  const sug = sugerirCoresFornecedores(fornecedores, P);
  assert(sug.length === 3, "só os 3 sem cor");
  assert(!sug.some((s) => s.fornecedorId === "d"), "quem tem cor não é sugerido");

  const cor = new Map(sug.map((s) => [s.fornecedorId, s.corSugerida]));
  cor.set("d", P[0]);
  assert(cor.get("a") !== cor.get("b"), "a≠b (couve)");
  assert(cor.get("a") !== cor.get("c"), "a≠c (alface)");
  assert(cor.get("a") !== cor.get("d"), "a≠d (alface, cor fixa)");
  assert(cor.get("c") !== cor.get("d"), "c≠d (alface, cor fixa)");
  // b e c não dividem produto: podem repetir cor, e é bom que repitam
  const aplicados = fornecedores.map((f) => ({ ...f, cor: cor.get(f.id) ?? f.cor }));
  assert(detectarConflitosCor(aplicados).length === 0, "dois produtos sem conflito");

  // O produto de maior grau é atendido primeiro: "a" (grau 2 em ambos) abre a paleta.
  assert(cor.get("a") === P[0] || cor.get("a") === P[1], "a atendido no topo da paleta");
}

/* 3. Fornecedor sem vínculo recebe a cor menos usada globalmente. */
{
  const fornecedores = [
    forn("x1", ["couve"], P[0]),
    forn("x2", ["couve"], P[1]),
    forn("x3", ["alface"], P[0]),
    forn("semvinculo1", []),
    forn("semvinculo2", []),
  ];
  const sug = sugerirCoresFornecedores(fornecedores, P);
  assert(sug.length === 2, "só os sem vínculo");
  assert(
    sug.every((s) => s.motivo === "sem_vinculo_menos_usada"),
    "motivo sem_vinculo_menos_usada",
  );
  const cores = sug.map((s) => s.corSugerida);
  // P[0] tem 2 usos e P[1] tem 1: as duas primeiras livres (uso 0) são P[2] e P[3]
  assert(cores.includes(P[2]), `pega a menos usada P[2], veio ${cores.join(",")}`);
  assert(cores.includes(P[3]), `segunda menos usada P[3], veio ${cores.join(",")}`);
  assert(!cores.includes(P[0]), "não pega a cor mais usada");
}

/* 4. Mais fornecedores que cores no mesmo produto: ainda propõe (admin ajusta). */
{
  const doze = Array.from({ length: 12 }, (_, i) => forn(`g${i + 1}`, ["couve"]));
  const sug = sugerirCoresFornecedores(doze, P);
  assert(sug.length === 12, "propõe para todos, sem deixar ninguém sem cor");
  assert(
    sug.every((s) => P.includes(s.corSugerida)),
    "nada fora da paleta",
  );
}

/* 5. coresLivresNoProduto */
{
  const fornecedores = [
    forn("a", ["couve"], P[0]),
    forn("b", ["couve"], P[2]),
    forn("c", ["alface"], P[1]),
  ];
  const livres = coresLivresNoProduto("couve", fornecedores, P);
  assert(!livres.includes(P[0]) && !livres.includes(P[2]), "tira as usadas em couve");
  assert(livres.includes(P[1]), "P[1] é livre em couve (só usada em alface)");
  assert(livres.length === 9, `9 livres, veio ${livres.length}`);
}

/* 6. detectarConflitosCor + sugerirQuemTrocar */
{
  const fornecedores = [
    { id: "a", nome: "Ademir", cor: P[0], produtoIds: ["couve"], caixasCirculando: 300 },
    { id: "b", nome: "Beatriz", cor: P[0], produtoIds: ["couve"], caixasCirculando: 40 },
    { id: "c", nome: "Carlos", cor: P[1], produtoIds: ["couve"] },
  ];
  const confs = detectarConflitosCor(fornecedores);
  assert(confs.length === 1, `1 conflito, veio ${confs.length}`);
  const c = confs[0];
  assert(c.produtoId === "couve" && c.cor === P[0], "conflito em couve na cor P[0]");
  assert(c.fornecedorAId === "a" && c.fornecedorBId === "b", "par normalizado por id");
  assert(c.sugeridoTrocarId === "b", "troca quem tem menos caixas circulando");

  // empate de caixas → nome alfabético
  assert(
    sugerirQuemTrocar({ id: "z", nome: "Zeca" }, { id: "a", nome: "Ana" }) === "a",
    "empate resolve por nome",
  );
  assert(
    sugerirQuemTrocar(
      { id: "z", nome: "Zeca", caixasCirculando: 1 },
      { id: "a", nome: "Ana", caixasCirculando: 9 },
    ) === "z",
    "menos caixas ganha do alfabético",
  );

  // produtos diferentes não conflitam
  assert(
    detectarConflitosCor([
      { id: "a", nome: "A", cor: P[0], produtoIds: ["couve"] },
      { id: "b", nome: "B", cor: P[0], produtoIds: ["alface"] },
    ]).length === 0,
    "mesma cor em produtos distintos não é conflito",
  );
}

/* 7. Aviso de cor repetida na seleção de Conferir chegada */
{
  const selecao = [
    { fornecedorId: "a", nome: "Ademir", cor: P[0] },
    { fornecedorId: "b", nome: "Beatriz", cor: P[0] },
    { fornecedorId: "c", nome: "Carlos", cor: P[1] },
    { fornecedorId: "d", nome: "Dulce", cor: null },
    { fornecedorId: "e", nome: "Elias", cor: null },
  ];
  const avisos = conflitosCorNaSelecao(selecao);
  assert(avisos.length === 1, `1 aviso, veio ${avisos.length}`);
  assert(avisos[0].cor === P[0], "aviso na cor duplicada");
  assert(
    avisos[0].fornecedores.map((f) => f.nome).join(" e ") === "Ademir e Beatriz",
    "nomeia os dois",
  );
  assert(
    conflitosCorNaSelecao([selecao[0], selecao[2]]).length === 0,
    "cores distintas, sem aviso",
  );
  assert(conflitosCorNaSelecao([selecao[3], selecao[4]]).length === 0, "sem cor não gera aviso");
  // o mesmo fornecedor repetido na lista não é conflito consigo mesmo
  assert(conflitosCorNaSelecao([selecao[0], selecao[0]]).length === 0, "mesmo fornecedor 2x");

  const texto = avisosCorDuplicadaNaSelecao(selecao);
  assert(texto.length === 1, "helper da tela devolve 1 aviso");
  assert(texto[0].nomes.length === 2, "dois nomes");
  assert(texto[0].corNome === "Preto", `rótulo pt-BR da cor, veio ${texto[0].corNome}`);
  assert(texto[0].texto.includes("Ademir e Beatriz"), "texto nomeia os dois");
}

/* 8. Sem nenhum fornecedor sem cor: nada a sugerir. */
{
  assert(
    sugerirCoresFornecedores([forn("a", ["couve"], P[0])], P).length === 0,
    "todos coloridos → nenhuma sugestão",
  );
  assert(sugerirCoresFornecedores([], P).length === 0, "lista vazia");
  assert(sugerirCoresFornecedores([forn("a", [])], []).length === 0, "paleta vazia não quebra");
}

console.log("sugerir-cores-fornecedores.test.ts: ok");
