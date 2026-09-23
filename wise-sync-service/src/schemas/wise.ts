import { z } from "zod";

const num = z.coerce.number().finite();
const str = z.union([z.string(), z.number()]).transform((v) => String(v));
const dateLike = z
  .union([z.string(), z.date(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  });

/** Raw PEDFORN + ITEM join row from CMP218 */
export const WiseCompraRowSchema = z.object({
  wise_pedido_id: str,
  DATA_EMISSAO: dateLike.optional(),
  DATA_PREV_ENTREGA: dateLike.optional(),
  EMPRESA: num,
  fornecedor_wise: str,
  fornecedor_nome: z.string().nullable().optional().transform((v) => v ?? ""),
  fornecedor_codigo: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? null : String(v))),
  STATUS: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : String(v).trim().toUpperCase())),
  item_id: str.optional(),
  produto_wise: str,
  produto_nome: z.string().nullable().optional().transform((v) => v ?? ""),
  QTDE: num,
  TOTAL: num.nullable().optional(),
  unidade: z.string().nullable().optional().transform((v) => v ?? "cx"),
});

export type WiseCompraRow = z.infer<typeof WiseCompraRowSchema>;

/** Raw VENDA + ITEM join row */
export const WiseVendaRowSchema = z.object({
  wise_carregamento_id: str,
  DATA_EMBARQUE: dateLike.optional(),
  DATA_ENTREGA: dateLike.optional(),
  DATA_EMISSAO: dateLike.optional(),
  EMPRESA: num,
  cliente_wise: str,
  cliente_nome: z.string().nullable().optional().transform((v) => v ?? ""),
  cliente_codigo: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? null : String(v))),
  CANCELADO: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? "N" : String(v).trim().toUpperCase())),
  produto_wise: str,
  produto_nome: z.string().nullable().optional().transform((v) => v ?? ""),
  QTDE: num,
});

export type WiseVendaRow = z.infer<typeof WiseVendaRowSchema>;

export const RpcPedidoItemSchema = z.object({
  produto_id: z.string().uuid().nullable(),
  quantidade: z.number(),
  preco_unitario: z.number().nullable(),
  unidade: z.string(),
  produto_nome: z.string(),
  codigo_produto: z.string(),
});

export const RpcPendenciaSchema = z.object({
  tipo: z.enum(["produto", "fornecedor"]),
  nome: z.string(),
  codigo: z.string().nullable(),
});

export const RpcPedidoSchema = z.object({
  wise_pedido_id: z.string(),
  fornecedor_id: z.string().uuid().nullable(),
  data_prevista: z.string().nullable(),
  data_pedido: z.string().nullable().optional(),
  itens: z.array(RpcPedidoItemSchema),
  pendencias: z.array(RpcPendenciaSchema),
});

export type RpcPedido = z.infer<typeof RpcPedidoSchema>;

export const RpcCargaItemSchema = z.object({
  produto_id: z.string().uuid().nullable(),
  quantidade: z.number(),
  produto_nome: z.string(),
  codigo_produto: z.string(),
});

export const RpcCargaSchema = z.object({
  wise_carregamento_id: z.string(),
  codigo: z.string(),
  cliente_id: z.string().uuid().nullable(),
  cliente_codigo: z.string().nullable(),
  data_carga: z.string().nullable(),
  itens: z.array(RpcCargaItemSchema),
  pendencias: z.array(
    z.object({
      tipo: z.enum(["produto", "destinatario"]),
      nome: z.string(),
      codigo: z.string().nullable(),
    }),
  ),
});

export type RpcCarga = z.infer<typeof RpcCargaSchema>;

export function parseCompraRows(raw: unknown[]): WiseCompraRow[] {
  return raw.map((r, i) => {
    const parsed = WiseCompraRowSchema.safeParse(r);
    if (!parsed.success) {
      throw new Error(`compra row ${i}: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}

export function parseVendaRows(raw: unknown[]): WiseVendaRow[] {
  return raw.map((r, i) => {
    const parsed = WiseVendaRowSchema.safeParse(r);
    if (!parsed.success) {
      throw new Error(`venda row ${i}: ${parsed.error.message}`);
    }
    return parsed.data;
  });
}
