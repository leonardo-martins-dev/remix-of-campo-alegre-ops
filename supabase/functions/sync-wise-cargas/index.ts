import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type WiseRow = {
  carregamento?: string;
  codigo_carga?: string;
  cliente?: string;
  loja?: string;
  produto?: string;
  item?: string;
  quantidade?: number;
  qtd?: number;
};

type WiseCarregamento = {
  id: string;
  codigo: string;
  cliente: string;
  itens: { produto: string; quantidade: number }[];
};

function normalizeRow(r: WiseRow) {
  const codigo = String(r.carregamento ?? r.codigo_carga ?? "").trim();
  const cliente = String(r.cliente ?? r.loja ?? "").trim();
  const produto = String(r.produto ?? r.item ?? "").trim();
  const quantidade = Number(r.quantidade ?? r.qtd ?? 0);
  return { codigo, cliente, produto, quantidade };
}

function groupWiseRows(rows: WiseRow[]): WiseCarregamento[] {
  const map = new Map<string, WiseCarregamento>();
  for (const raw of rows) {
    const { codigo, cliente, produto, quantidade } = normalizeRow(raw);
    if (!codigo || !cliente || !produto || quantidade <= 0) continue;
    const key = `${codigo}::${cliente}`;
    if (!map.has(key)) {
      map.set(key, { id: key, codigo, cliente, itens: [] });
    }
    map.get(key)!.itens.push({ produto, quantidade });
  }
  return [...map.values()];
}

async function fetchWiseApi(data: string): Promise<WiseCarregamento[]> {
  const wiseUrl = Deno.env.get("WISE_API_URL");
  const wiseKey = Deno.env.get("WISE_API_KEY");
  if (!wiseUrl || !wiseKey) return [];

  const url = `${wiseUrl.replace(/\/$/, "")}/carregamentos?data=${data}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${wiseKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Wise API ${res.status}: ${await res.text()}`);

  const payload = await res.json();
  const rows = (payload.carregamentos ?? payload.data ?? payload) as unknown;
  if (Array.isArray(rows) && rows.length && typeof rows[0] === "object") {
    const first = rows[0] as Record<string, unknown>;
    if ("itens" in first || "codigo" in first) {
      return rows as WiseCarregamento[];
    }
    return groupWiseRows(rows as WiseRow[]);
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const data = body.data ?? new Date().toISOString().slice(0, 10);

    let carregamentos: WiseCarregamento[] = [];
    let source = "stub";

    if (Array.isArray(body.carregamentos) && body.carregamentos.length) {
      carregamentos = body.carregamentos as WiseCarregamento[];
      source = "client";
    } else if (Array.isArray(body.rows) && body.rows.length) {
      carregamentos = groupWiseRows(body.rows as WiseRow[]);
      source = "excel";
    } else {
      const fromApi = await fetchWiseApi(data);
      if (fromApi.length) {
        carregamentos = fromApi;
        source = "api";
      }
    }

    return new Response(
      JSON.stringify({
        data,
        carregamentos,
        source,
        message:
          carregamentos.length > 0
            ? `${carregamentos.length} carregamento(s) disponível(is).`
            : "Nenhum carregamento para hoje. Importe Excel Wise ou configure WISE_API_URL/WISE_API_KEY.",
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
