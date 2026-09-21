import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { groupCompraToRpc, groupVendaToRpc, stableHash, type AliasRow } from "./aliases.js";
import type { WiseCompraRow, WiseVendaRow } from "../../schemas/wise.js";

const aliases: AliasRow[] = [
  {
    tipo: "fornecedor",
    nome_externo: "HORTA VERDE [1]",
    codigo_externo: "9:1",
    entidade_id: "11111111-1111-1111-1111-111111111111",
  },
  {
    tipo: "fornecedor",
    nome_externo: "HORTA VERDE",
    codigo_externo: "F1",
    entidade_id: "11111111-1111-1111-1111-111111111111",
  },
  {
    tipo: "produto",
    nome_externo: "Alface",
    codigo_externo: "P1",
    entidade_id: "22222222-2222-2222-2222-222222222222",
  },
];

describe("groupCompraToRpc", () => {
  it("resolves aliases by ID:EMPRESA and builds RPC payload", () => {
    const rows: WiseCompraRow[] = [
      {
        wise_pedido_id: "100",
        DATA_PREV_ENTREGA: "2026-09-22",
        EMPRESA: 1,
        fornecedor_wise: "9",
        fornecedor_nome: "HORTA VERDE",
        fornecedor_codigo: "F1",
        STATUS: "A",
        produto_wise: "P1",
        produto_nome: "Alface",
        QTDE: 10,
        TOTAL: 100,
        unidade: "cx",
      },
    ];
    const pedidos = groupCompraToRpc(rows, aliases);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]!.fornecedor_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(pedidos[0]!.itens[0]!.produto_id).toBe("22222222-2222-2222-2222-222222222222");
    expect(pedidos[0]!.itens[0]!.preco_unitario).toBe(10);
    expect(pedidos[0]!.pendencias).toHaveLength(0);
  });

  it("adds pendencias when alias missing", () => {
    const rows: WiseCompraRow[] = [
      {
        wise_pedido_id: "200",
        DATA_PREV_ENTREGA: null,
        EMPRESA: 1,
        fornecedor_wise: "99",
        fornecedor_nome: "DESCONHECIDO",
        fornecedor_codigo: null,
        STATUS: null,
        produto_wise: "PX",
        produto_nome: "Produto X",
        QTDE: 1,
        TOTAL: null,
        unidade: "cx",
      },
    ];
    const pedidos = groupCompraToRpc(rows, aliases);
    expect(pedidos[0]!.fornecedor_id).toBeNull();
    expect(pedidos[0]!.itens[0]!.produto_id).toBeNull();
    expect(pedidos[0]!.pendencias.some((p) => p.tipo === "fornecedor")).toBe(true);
    expect(pedidos[0]!.pendencias.some((p) => p.tipo === "produto")).toBe(true);
  });

  it("stableHash is deterministic", () => {
    const a = stableHash({ x: 1, y: [2, 3] });
    const b = stableHash({ x: 1, y: [2, 3] });
    expect(a).toBe(b);
    expect(a).toHaveLength(40);
  });
});

describe("groupVendaToRpc", () => {
  it("maps cliente by codigo", () => {
    const rows: WiseVendaRow[] = [
      {
        wise_carregamento_id: "V1",
        DATA_EMBARQUE: "2026-09-21",
        DATA_ENTREGA: null,
        DATA_EMISSAO: "2026-09-20",
        EMPRESA: 1,
        cliente_wise: "5",
        cliente_nome: "Loja Centro",
        cliente_codigo: "101",
        CANCELADO: "N",
        produto_wise: "P1",
        produto_nome: "Alface",
        QTDE: 5,
      },
    ];
    const clientes = new Map([["101", "33333333-3333-3333-3333-333333333333"]]);
    const cargas = groupVendaToRpc(rows, aliases, clientes);
    expect(cargas[0]!.cliente_id).toBe("33333333-3333-3333-3333-333333333333");
    expect(cargas[0]!.data_carga).toBe("2026-09-21");
    expect(cargas[0]!.itens[0]!.produto_id).toBe("22222222-2222-2222-2222-222222222222");
  });
});

describe("idempotency hash", () => {
  it("same pedidos same hash across runs", () => {
    const rows: WiseCompraRow[] = [
      {
        wise_pedido_id: "1",
        DATA_PREV_ENTREGA: "2026-09-22",
        EMPRESA: 1,
        fornecedor_wise: "9",
        fornecedor_nome: "HORTA VERDE",
        fornecedor_codigo: "F1",
        STATUS: "A",
        produto_wise: "P1",
        produto_nome: "Alface",
        QTDE: 10,
        TOTAL: 100,
        unidade: "cx",
      },
    ];
    const p1 = groupCompraToRpc(rows, aliases);
    const p2 = groupCompraToRpc(rows, aliases);
    expect(stableHash(p1)).toBe(stableHash(p2));
    expect(createHash("sha256").update(JSON.stringify(p1)).digest("hex").slice(0, 40)).toBe(
      stableHash(p1),
    );
  });
});
