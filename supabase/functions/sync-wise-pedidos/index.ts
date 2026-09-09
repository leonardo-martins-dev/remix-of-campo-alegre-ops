import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WisePedidoRow = {
  pedido: string;
  codigo_fornecedor: string;
  fornecedor: string;
  codigo_produto: string;
  produto: string;
  quantidade: number;
  unidade: string;
  preco_unitario: number | null;
  loja: string;
  data_prevista: string | null;
};

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== "") return obj[k];
    const found = Object.keys(obj).find((ok) => ok.toLowerCase().replace(/\s+/g, "_") === k);
    if (found && obj[found] != null && obj[found] !== "") return obj[found];
  }
  return "";
}

function normalizeRow(raw: Record<string, unknown>): WisePedidoRow | null {
  const pedido = String(pick(raw, ["pedido", "n_pedido", "numero_pedido", "wise_pedido_id", "codigo"]) ?? "").trim();
  const produto = String(pick(raw, ["produto", "descricao", "item"]) ?? "").trim();
  const quantidade = Number(pick(raw, ["quantidade", "qtd", "qtde", "qty"]) ?? 0);
  if (!pedido || (!produto && !pick(raw, ["codigo_produto", "sku"])) || !(quantidade > 0)) return null;
  const precoRaw = pick(raw, ["preco_unitario", "preco", "valor_unitario"]);
  return {
    pedido,
    codigo_fornecedor: String(pick(raw, ["codigo_fornecedor", "cod_fornecedor"]) ?? "").trim(),
    fornecedor: String(pick(raw, ["fornecedor", "nome_fornecedor"]) ?? "").trim(),
    codigo_produto: String(pick(raw, ["codigo_produto", "sku"]) ?? "").trim(),
    produto,
    quantidade,
    unidade: String(pick(raw, ["unidade", "un"]) ?? "un").trim() || "un",
    preco_unitario: precoRaw == null || precoRaw === "" ? null : Number(precoRaw),
    loja: String(pick(raw, ["loja", "cliente", "filial", "cnpj"]) ?? "").trim(),
    data_prevista: String(pick(raw, ["data_prevista", "data_entrega"]) ?? "").slice(0, 10) || null,
  };
}

function extractRows(payload: unknown): WisePedidoRow[] {
  const bag = payload as Record<string, unknown>;
  const raw = (bag?.pedidos ?? bag?.data ?? bag?.rows ?? payload) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => (r && typeof r === "object" ? normalizeRow(r as Record<string, unknown>) : null))
    .filter((r): r is WisePedidoRow => !!r);
}

async function probePurchaseEndpoints(data: string): Promise<{
  rows: WisePedidoRow[];
  source: string;
  probed: string[];
}> {
  const wiseUrl = Deno.env.get("WISE_API_URL");
  const wiseKey = Deno.env.get("WISE_API_KEY");
  const probed: string[] = [];
  if (!wiseUrl || !wiseKey) {
    return { rows: [], source: "unconfigured", probed };
  }

  const base = wiseUrl.replace(/\/$/, "");
  const candidates = ["/pedidos-compra", "/pedidos", "/compras"];

  for (const path of candidates) {
    const url = `${base}${path}?data=${data}`;
    probed.push(url);
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${wiseKey}`, Accept: "application/json" },
      });
      if (!res.ok) continue;
      const rows = extractRows(await res.json());
      if (rows.length) return { rows, source: `api:${path}`, probed };
    } catch {
      // keep probing
    }
  }

  return { rows: [], source: "probe-empty", probed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const data = body.data ?? new Date().toISOString().slice(0, 10);

    if (Array.isArray(body.rows) && body.rows.length) {
      const rows = (body.rows as Record<string, unknown>[])
        .map((r) => normalizeRow(r))
        .filter((r): r is WisePedidoRow => !!r);
      return new Response(
        JSON.stringify({
          data,
          rows,
          source: "client",
          message: `${rows.length} pedido(s) recebido(s) do cliente.`,
          probed: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { rows, source, probed } = await probePurchaseEndpoints(data);
    return new Response(
      JSON.stringify({
        data,
        rows,
        source,
        probed,
        message: rows.length
          ? `${rows.length} pedido(s) na API Wise.`
          : "Endpoint de pedido de compra Wise não encontrado. Importe o arquivo (contingência). Parser PDF da OS fica bloqueado até sample real.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
