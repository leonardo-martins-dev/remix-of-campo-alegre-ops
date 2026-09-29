import { labelResponsavelPosicao, normalizeResponsavelPosicao } from "./responsavel-posicao";

if (labelResponsavelPosicao(null) !== "sem responsável") {
  throw new Error("null deve ser sem responsável");
}
if (labelResponsavelPosicao("") !== "sem responsável") {
  throw new Error("vazio deve ser sem responsável");
}
if (labelResponsavelPosicao("  ") !== "sem responsável") {
  throw new Error("só espaços deve ser sem responsável");
}
if (labelResponsavelPosicao("Maria") !== "Maria") {
  throw new Error("nome preenchido deve aparecer");
}
if (labelResponsavelPosicao("  João  ") !== "João") {
  throw new Error("trim no label");
}

if (normalizeResponsavelPosicao("") !== null) throw new Error("normalize vazio → null");
if (normalizeResponsavelPosicao("  ") !== null) throw new Error("normalize espaços → null");
if (normalizeResponsavelPosicao("Ana") !== "Ana") throw new Error("normalize nome");
if (normalizeResponsavelPosicao("  Ana  ") !== "Ana") throw new Error("normalize trim");

console.log("responsavel-posicao ok");
