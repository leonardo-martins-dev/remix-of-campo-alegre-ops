import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    let persisted = 0;
    if (body.persist !== false && carregamentos.length) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data: clientes } = await admin.from("clientes").select("id, nome");
        const { data: produtos } = await admin.from("produtos").select("id, nome, codigo");
        const clienteByName = new Map((clientes ?? []).map((c: { id: string; nome: string }) => [c.nome.trim().toLowerCase(), c.id]));
        const produtoByName = new Map((produtos ?? []).map((p: { id: string; nome: string }) => [p.nome.trim().toLowerCase(), p.id]));
        const produtoByCode = new Map(
          (produtos ?? [])
            .filter((p: { codigo?: string | null }) => p.codigo)
            .map((p: { id: string; codigo?: string | null }) => [String(p.codigo).trim().toLowerCase(), p.id])
        );

        for (const carga of carregamentos) {
          const cliente_id = clienteByName.get(carga.cliente.trim().toLowerCase());
          if (!cliente_id) continue;
          const { data: existing } = await admin
            .from("cargas")
            .select("id")
            .eq("wise_carregamento_id", carga.id)
            .maybeSingle();

          let cargaId = existing?.id as string | undefined;
          if (!cargaId) {
            const { data: created, error } = await admin
              .from("cargas")
              .insert({
                codigo: carga.codigo,
                cliente_id,
                data_carga: data,
                status: "aguardando",
                origem: "wisetec",
                wise_carregamento_id: carga.id,
              })
              .select("id")
              .single();
            if (error) continue;
            cargaId = created.id;
            await admin.from("carga_caixas_resumo").insert({ carga_id: cargaId });
          }

          for (const it of carga.itens) {
            const produto_id =
              produtoByName.get(it.produto.trim().toLowerCase()) ??
              produtoByCode.get(it.produto.trim().toLowerCase());
            if (!produto_id || !cargaId) continue;
            const { data: rom } = await admin
              .from("romaneio_itens")
              .select("id")
              .eq("carga_id", cargaId)
              .eq("produto_id", produto_id)
              .maybeSingle();
            if (rom) {
              await admin.from("romaneio_itens").update({ quantidade_romaneio: it.quantidade }).eq("id", rom.id);
            } else {
              await admin.from("romaneio_itens").insert({
                carga_id: cargaId,
                produto_id,
                quantidade_romaneio: it.quantidade,
                quantidade_real: 0,
                status: "pendente",
              });
            }
          }
          persisted += 1;
        }
      }
    }

    return new Response(
      JSON.stringify({
        data,
        carregamentos,
        source,
        persisted,
        message:
          carregamentos.length > 0
            ? `${carregamentos.length} carregamento(s) disponível(is)${persisted ? ` · ${persisted} persistido(s)` : ""}.`
            : "Nenhum carregamento para hoje. Importe Excel Wise ou configure WISE_API_URL/WISE_API_KEY. Parser PDF da Ordem de Separação aguarda sample real.",
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
