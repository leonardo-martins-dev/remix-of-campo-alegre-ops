import { matchSeletor, montarDetalheFornecedor, type SeletorItem } from "./seletor-cadastro";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const fmt = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Com código real → preferir Cód. (nunca inventar)
{
  const item: Pick<SeletorItem, "codigo" | "cnpj" | "meta"> = {
    codigo: "1949-2",
    cnpj: null,
    meta: { ultimaEntrega: "2026-09-23", numPedidos: 12 },
  };
  const out = montarDetalheFornecedor(item, fmt);
  assert(out === "Cód. 1949-2 · última entrega 23/09/2026", `com código => ${out}`);
  assert(!out!.includes("pedido"), "com código não precisa de nº pedidos");
}

// Sem código: última entrega + nº pedidos (Leo)
{
  const item: Pick<SeletorItem, "codigo" | "cnpj" | "meta"> = {
    codigo: null,
    meta: { ultimaEntrega: "2026-01-15", numPedidos: 3, cidade: "Piedade" },
  };
  const out = montarDetalheFornecedor(item, fmt);
  assert(
    out === "última entrega 15/01/2026 · Piedade · 3 pedidos",
    `fallback completo => ${out}`,
  );
}

// Sem código, 0 pedidos, nome duplicado → ainda mostra 0 pedidos
{
  const item: Pick<SeletorItem, "codigo" | "cnpj" | "meta"> = {
    codigo: null,
    meta: { numPedidos: 0 },
  };
  const outDup = montarDetalheFornecedor(item, fmt, { duplicado: true });
  assert(outDup === "0 pedidos", `dup 0 => ${outDup}`);
  const outSolo = montarDetalheFornecedor(item, fmt, { duplicado: false });
  assert(outSolo === null, `solo 0 => ${outSolo}`);
}

// Nunca inventar Cód. a partir de id/nome
{
  const item: Pick<SeletorItem, "codigo" | "cnpj" | "meta"> = {
    codigo: null,
    meta: { ultimaEntrega: "2026-03-01", numPedidos: 1 },
  };
  const out = montarDetalheFornecedor(item, fmt)!;
  assert(!out.toLowerCase().includes("cód"), `sem código fake => ${out}`);
  assert(out.includes("1 pedido"), out);
}

// Busca por trecho de CNPJ
{
  const item: SeletorItem = {
    id: "1",
    nome: "Loja Exemplo",
    cnpj: "12.345.678/0001-99",
  };
  assert(matchSeletor(item, "345678"), "CNPJ parcial deve bater");
  assert(matchSeletor(item, "12345678000199"), "CNPJ completo digitos");
  assert(!matchSeletor(item, "999888"), "CNPJ dígitos inexistentes não batem");
}

console.log("seletor-cadastro ok");
