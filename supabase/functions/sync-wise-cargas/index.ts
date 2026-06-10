import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const data = body.data ?? new Date().toISOString().slice(0, 10);

    // Stub: substituir por chamada real à API Wise quando credenciais estiverem disponíveis
    // const wiseUrl = Deno.env.get("WISE_API_URL");
    // const wiseKey = Deno.env.get("WISE_API_KEY");

    const carregamentos: unknown[] = [];

    return new Response(
      JSON.stringify({
        data,
        carregamentos,
        message: "Integração Wise em modo stub — use importação Excel ou aguarde configuração da API.",
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
