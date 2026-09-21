import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Thin proxy: triggers wise-sync-service venda sync.
 * Does NOT talk to CMP218 / SQL Server.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const base = Deno.env.get("WISE_SYNC_URL");
  const secret = Deno.env.get("WISE_SYNC_CRON_SECRET") ?? Deno.env.get("CRON_SECRET");
  if (!base || !secret) {
    return new Response(
      JSON.stringify({
        source: "unconfigured",
        carregamentos: [],
        message:
          "WISE_SYNC_URL / WISE_SYNC_CRON_SECRET não configurados. O pull diário roda no wise-sync-service (cron 06:00).",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/v1/sync/venda`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": secret,
      },
    });
    const body = await res.json();
    return new Response(
      JSON.stringify({
        source: "wise-sync-service",
        carregamentos: [],
        result: body,
        message: body.empty_window
          ? "Janela Wise vazia (48h)."
          : body.ok
            ? `Sync venda ok · ${body.cargas ?? 0} cargas`
            : body.error ?? "Falha no sync",
      }),
      { status: res.ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        source: "error",
        carregamentos: [],
        message: e instanceof Error ? e.message : "Erro ao chamar wise-sync-service",
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
