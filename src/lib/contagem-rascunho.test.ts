import {
  buildConfirmacoes,
  buildPayloadCaixas,
  buildPayloadEmbalagens,
  clearRascunho,
  countInformados,
  isInformado,
  loadRascunho,
  needsConfirm,
  rascunhoCaixasKey,
  RASCUNHO_EMBALAGENS_KEY,
  RASCUNHO_MAX_IDADE_MS,
  saveRascunho,
  textoConfirmacao,
} from "./contagem-rascunho";

// Shim de localStorage para rodar fora do browser (node/bun). Os imports são
// içados, mas o módulo só toca no storage dentro das funções — então basta
// definir antes da primeira chamada.
const mem = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
} as unknown as Storage;

function ok(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/* ── informado vs não informado ─────────────────────────────── */

const contagem = { G: 0, P: 12 };
ok(isInformado(contagem, "G"), "zero digitado é informado");
ok(isInformado(contagem, "P"), "12 é informado");
ok(!isInformado(contagem, "I"), "chave ausente é não informado");
ok(!isInformado({ G: NaN }, "G"), "NaN não conta como informado");

const prog = countInformados(contagem, ["G", "I", "P"]);
ok(prog.contados === 2 && prog.total === 3, `progresso esperado 2 de 3, veio ${prog.contados} de ${prog.total}`);
ok(countInformados({}, []).total === 0, "sem tipos, total 0");

/* ── confirmações ───────────────────────────────────────────── */

const itens = [
  { id: "1", label: "G", informado: true, qtd: 0, esperado: 40 }, // zera saldo
  { id: "2", label: "I", informado: true, qtd: 0, esperado: 0 }, // zero sem saldo: ok
  { id: "3", label: "P", informado: true, qtd: 30, esperado: 32 }, // dentro da tolerância
  { id: "4", label: "M", informado: true, qtd: 50, esperado: 32 }, // diferença grande
  { id: "5", label: "X", informado: false, qtd: null, esperado: 99 }, // não informado: não confirma
];
const confs = buildConfirmacoes(itens, 5);
ok(confs.length === 2, `esperado 2 confirmações, veio ${confs.length}`);
ok(confs[0].tipo === "zero" && confs[0].label === "G", "primeira confirmação é o zero do G");
ok(confs[1].tipo === "diff" && confs[1].diff === 18, `diferença do M esperada +18, veio ${confs[1].diff}`);

// zero com esperado > 0 entra só como 'zero', nunca duplicado como 'diff'
ok(
  buildConfirmacoes([{ id: "1", label: "G", informado: true, qtd: 0, esperado: 40 }], 5).length === 1,
  "zero não duplica em zero + diff"
);

// exatamente na tolerância não pede confirmação; um a mais pede
ok(buildConfirmacoes([{ id: "1", label: "G", informado: true, qtd: 37, esperado: 32 }], 5).length === 0, "diferença 5 com tolerância 5 passa");
ok(buildConfirmacoes([{ id: "1", label: "G", informado: true, qtd: 38, esperado: 32 }], 5).length === 1, "diferença 6 com tolerância 5 confirma");
ok(buildConfirmacoes([{ id: "1", label: "G", informado: true, qtd: 26, esperado: 32 }], 5).length === 1, "diferença -6 com tolerância 5 confirma");
ok(
  buildConfirmacoes([{ id: "1", label: "G", informado: true, qtd: 33, esperado: 32 }], NaN).length === 1,
  "tolerância inválida vira 0"
);

ok(textoConfirmacao(confs[0]).includes("zerar o saldo"), "texto do zero avisa que zera o saldo");
ok(textoConfirmacao(confs[1]).includes("+18"), "texto da diferença mostra o sinal");


/* ── payload: só informados (fechamento não zera em branco) ── */

const tiposEmb = [
  { tipo_embalagem_id: "e1" },
  { tipo_embalagem_id: "e2" },
  { tipo_embalagem_id: "e3" },
];
const mapEmb = { e1: 0, e3: 4.5 }; // e2 ausente = não informado
const payloadEmb = buildPayloadEmbalagens(mapEmb, tiposEmb);
ok(payloadEmb.length === 2, `embalagens: esperado 2 itens, veio ${payloadEmb.length}`);
ok(payloadEmb[0].tipo_embalagem_id === "e1" && payloadEmb[0].quantidade === 0, "zero digitado entra no payload");
ok(payloadEmb[1].tipo_embalagem_id === "e3" && payloadEmb[1].quantidade === 4.5, "quantidade informada entra");
ok(!payloadEmb.some((i) => i.tipo_embalagem_id === "e2"), "tipo não informado NÃO entra (não vira 0)");
ok(buildPayloadEmbalagens({}, tiposEmb).length === 0, "nada informado → payload vazio");

const tiposCx = [{ sigla: "G" }, { sigla: "P" }, { sigla: "I" }];
const mapCx = { G: 0, P: 12 }; // I ausente
const calc = { G: 40, P: 10, I: 99 };
const payloadCx = buildPayloadCaixas(mapCx, tiposCx, calc);
ok(payloadCx.length === 2, `caixas: esperado 2 itens, veio ${payloadCx.length}`);
ok(payloadCx[0].tipo_caixa === "G" && payloadCx[0].qtd_contada === 0 && payloadCx[0].qtd_calculada === 40, "G zero + esperado");
ok(payloadCx[1].tipo_caixa === "P" && payloadCx[1].qtd_contada === 12 && payloadCx[1].qtd_calculada === 10, "P informado");
ok(!payloadCx.some((i) => i.tipo_caixa === "I"), "sigla não informada NÃO entra (não zera saldo I)");
ok(buildPayloadCaixas({}, tiposCx, calc).length === 0, "nada informado → payload caixas vazio");

ok(needsConfirm(itens, 5) === true, "needsConfirm true quando há zero/diff");
ok(
  needsConfirm([{ id: "2", label: "I", informado: true, qtd: 0, esperado: 0 }], 5) === false,
  "needsConfirm false quando zero sem saldo e sem diff"
);
ok(
  needsConfirm([{ id: "5", label: "X", informado: false, qtd: null, esperado: 99 }], 5) === false,
  "não informado nunca pede confirmação"
);

/* ── rascunho ───────────────────────────────────────────────── */

const keyCaixas = rascunhoCaixasKey("pos-1");
ok(keyCaixas === "campo-alegre-rascunho-caixas:pos-1", `chave inesperada: ${keyCaixas}`);
ok(RASCUNHO_EMBALAGENS_KEY === "campo-alegre-rascunho-embalagens", "chave de embalagens inesperada");

ok(loadRascunho(keyCaixas) === null, "sem rascunho salvo, carrega null");

saveRascunho(keyCaixas, { values: { G: 0, P: 12 } });
const salvo = loadRascunho(keyCaixas);
ok(salvo !== null, "rascunho salvo deve carregar");
ok(salvo!.values.G === 0 && salvo!.values.P === 12, "valores do rascunho preservados (zero inclusive)");
ok(!("I" in salvo!.values), "tipo não informado não entra no rascunho");

saveRascunho(RASCUNHO_EMBALAGENS_KEY, {
  values: { emb: 3.5 },
  data: "2026-09-25",
  observacao: "antes da reposição",
});
const embal = loadRascunho(RASCUNHO_EMBALAGENS_KEY);
ok(embal?.data === "2026-09-25", "data volta no rascunho de embalagens");
ok(embal?.observacao === "antes da reposição", "observação volta no rascunho de embalagens");
ok(embal?.values.emb === 3.5, "quantidade decimal preservada");

// nada informado e sem observação → não guarda lixo
saveRascunho(keyCaixas, { values: {} });
ok(loadRascunho(keyCaixas) === null, "rascunho vazio é apagado");

// observação sozinha ainda vale rascunho
saveRascunho(keyCaixas, { values: {}, observacao: "contei só metade" });
ok(loadRascunho(keyCaixas)?.observacao === "contei só metade", "observação sozinha mantém o rascunho");

clearRascunho(keyCaixas);
ok(loadRascunho(keyCaixas) === null, "clearRascunho apaga");

// rascunho velho (semana passada) não volta
saveRascunho(keyCaixas, { values: { G: 7 } });
const futuro = Date.now() + RASCUNHO_MAX_IDADE_MS + 1000;
ok(loadRascunho(keyCaixas, futuro) === null, "rascunho expirado não carrega");
ok(loadRascunho(keyCaixas) === null, "rascunho expirado é removido do storage");

// json corrompido não derruba a tela
mem.set(keyCaixas, "{nao é json");
ok(loadRascunho(keyCaixas) === null, "json inválido carrega null");
ok(mem.get(keyCaixas) === undefined, "json inválido é descartado");

console.log("contagem-rascunho ok");
