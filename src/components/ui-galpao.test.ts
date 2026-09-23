/**
 * NOP-317 — o menu "Detalhes" (HeaderAcoes) derrubava a página inteira ao abrir
 * (React #185, loop de update no DropdownMenuTrigger do Radix). A correção é
 * dupla: bump do @radix-ui/react-dropdown-menu / react-slot e um error boundary
 * local em HeaderAcoes. Aqui testamos a parte pura: a lista de entradas do menu
 * nunca pode conter item vazio, key duplicada ou separador solto.
 *
 * bun test src/components/ui-galpao.test.ts
 */
import {
  hasDetalheItems,
  isEmptyChipValue,
  normalizeDetalheActions,
  type DetalheAction,
} from "./ui-galpao-core";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

/* isEmptyChipValue */
assert(isEmptyChipValue(null), "null => vazio");
assert(isEmptyChipValue(undefined), "undefined => vazio");
assert(isEmptyChipValue("   "), "espaços => vazio");
assert(isEmptyChipValue("—"), "travessão => vazio");
assert(isEmptyChipValue("-"), "hífen => vazio");
assert(isEmptyChipValue("NaN"), "'NaN' => vazio");
assert(isEmptyChipValue(Number.NaN), "NaN => vazio");
assert(isEmptyChipValue(Infinity), "Infinity => vazio");
assert(!isEmptyChipValue(0), "0 não é vazio");
assert(!isEmptyChipValue("SP"), "'SP' não é vazio");
assert(!isEmptyChipValue(false), "false não é vazio");

/* normalizeDetalheActions — casos básicos */
assert(normalizeDetalheActions().length === 0, "sem argumento => []");
assert(normalizeDetalheActions(null).length === 0, "null => []");
assert(normalizeDetalheActions([]).length === 0, "[] => []");
assert(!hasDetalheItems(normalizeDetalheActions([])), "lista vazia não abre menu");

const simples = normalizeDetalheActions([
  { label: "Imprimir" },
  { label: "Exportar", disabled: true },
]);
assert(simples.length === 2, `2 itens => ${simples.length}`);
assert(simples.every((e) => e.kind === "item"), "sem separadores declarados, tudo é item");
assert(hasDetalheItems(simples), "com itens, menu aparece");
assert(
  simples[1].kind === "item" && simples[1].action.disabled === true,
  "flag disabled preservada",
);

/* labels vazios são descartados, mesmo com onClick */
const comVazios = normalizeDetalheActions([
  { label: "" },
  { label: "   " },
  { label: "Cancelar carga", onClick: () => {} },
  null,
  undefined,
]);
assert(comVazios.length === 1, `só o label preenchido sobra => ${comVazios.length}`);
const cancelar = comVazios[0];
assert(cancelar.kind === "item" && cancelar.action.label === "Cancelar carga", "label ok");

/* label só com espaços vem trimado */
const trim = normalizeDetalheActions([{ label: "  Reabrir  " }]);
assert(trim[0].kind === "item" && trim[0].action.label === "Reabrir", "label é trimado");

/* separadores: borda, duplicados e entradas só-separador (label vazio) */
const comSeps = normalizeDetalheActions([
  { label: "", separator: true },
  { label: "Conferir" },
  { label: "", separator: true },
  { label: "", separator: true },
  { label: "Cancelar" },
  { label: "", separator: true },
]);
assert(
  comSeps.map((e) => e.kind).join(",") === "item,separator,item",
  `separadores colapsados => ${comSeps.map((e) => e.kind).join(",")}`,
);

/* separator: true vence o label (comportamento herdado do HeaderAcoes original) */
const sepComLabel = normalizeDetalheActions([
  { label: "A" },
  { label: "ignorado", separator: true },
  { label: "B" },
]);
assert(
  sepComLabel.map((e) => e.kind).join(",") === "item,separator,item",
  "entrada com separator:true nunca vira item clicável",
);

/* menu só de separadores não abre */
const soSeps = normalizeDetalheActions([
  { label: "", separator: true },
  { label: "", separator: true },
]);
assert(soSeps.length === 0, "só separadores => []");
assert(!hasDetalheItems(soSeps), "só separadores não abre o menu");

/* keys estáveis e únicas, mesmo com labels repetidos */
const listaRepetida: DetalheAction[] = [
  { label: "Ver" },
  { label: "", separator: true },
  { label: "Ver" },
];
const keys = normalizeDetalheActions(listaRepetida).map((e) => e.key);
const keysDeNovo = normalizeDetalheActions(listaRepetida).map((e) => e.key);
assert(new Set(keys).size === keys.length, `keys duplicadas: ${keys.join(",")}`);
assert(keys.join(",") === keysDeNovo.join(","), "keys determinísticas entre renders");

/* onClick continua chamável após a normalização (o menu dispara action.onClick) */
let cliques = 0;
const comClick = normalizeDetalheActions([{ label: "Fechar carga", onClick: () => cliques++ }]);
assert(comClick[0].kind === "item", "entrada é item");
if (comClick[0].kind === "item") comClick[0].action.onClick?.();
assert(cliques === 1, `onClick chamado 1x => ${cliques}`);

/* a lista de entrada não é mutada */
const original: DetalheAction[] = [{ label: " X " }, { label: "", separator: true }];
normalizeDetalheActions(original);
assert(original[0].label === " X " && original.length === 2, "entrada não é mutada");

console.log("ui-galpao (NOP-317) ok");
