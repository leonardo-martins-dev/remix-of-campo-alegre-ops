/**
 * NOP-157 — prova que tipo com contagem NÃO pode ser excluído (só inativado).
 *
 * Uso (na raiz do repo, com .env carregado):
 *   set -a && source .env && set +a && bun scripts/assert_tipo_embalagem_delete_blocked.mjs
 *
 * Exit 0 = bloqueio ok. Exit 1 = falhou a asserção.
 */
import { createClient } from "@supabase/supabase-js";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}
function ok(msg) {
  console.log("OK:", msg);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) fail("SUPABASE_URL e chave (service role ou anon) obrigatórios no env");

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: itens, error: eItens } = await sb
  .from("contagem_embalagem_itens")
  .select("tipo_embalagem_id")
  .limit(1);
if (eItens) fail(`ler contagem_embalagem_itens: ${eItens.message}`);
const tipoId = itens?.[0]?.tipo_embalagem_id;
if (!tipoId) fail("nenhum tipo com contagem — não dá pra provar o bloqueio");

const { data: emUso, error: eUso } = await sb.rpc("tipo_embalagem_em_uso", {
  p_id: tipoId,
});
if (eUso) fail(`rpc tipo_embalagem_em_uso: ${eUso.message}`);
if (emUso !== true) fail(`tipo_embalagem_em_uso(${tipoId}) deveria ser true, veio ${emUso}`);
ok(`tipo_embalagem_em_uso(${tipoId}) === true`);

const { count: before } = await sb
  .from("tipos_embalagem")
  .select("*", { count: "exact", head: true });

const { error: eDel } = await sb.from("tipos_embalagem").delete().eq("id", tipoId);
if (!eDel) fail("DELETE de tipo em uso NÃO falhou — trigger ausente?");
const blocked =
  eDel.code === "P0001" ||
  (eDel.message ?? "").includes("não pode ser excluído") ||
  (eDel.message ?? "").includes("inative");
if (!blocked) {
  fail(`DELETE falhou mas com erro inesperado: ${eDel.code} ${eDel.message}`);
}
ok(`DELETE bloqueado: ${eDel.message}`);

const { count: after } = await sb
  .from("tipos_embalagem")
  .select("*", { count: "exact", head: true });
if (before !== after) fail(`contagem de tipos mudou após DELETE falho (${before} → ${after})`);
ok(`tipos_embalagem intactos (${after})`);

// Scratch: sem contagem → excluível; inativo → fora de v_embalagem_contagem_atual.
const nome = `__nop157_assert_${Date.now()}`;
const { data: criado, error: eCria } = await sb
  .from("tipos_embalagem")
  .insert({ nome, unidade_contagem: "unidade", ativo: true })
  .select("id")
  .single();
if (eCria) fail(`criar tipo scratch: ${eCria.message}`);

const { data: inAtualAtivo, error: eAt } = await sb
  .from("v_embalagem_contagem_atual")
  .select("tipo_embalagem_id")
  .eq("tipo_embalagem_id", criado.id);
if (eAt) fail(`v_embalagem_contagem_atual: ${eAt.message}`);
if (!inAtualAtivo?.length) fail("tipo ativo scratch deveria aparecer em v_embalagem_contagem_atual");
ok("tipo ativo entra em v_embalagem_contagem_atual");

const { error: eInat } = await sb
  .from("tipos_embalagem")
  .update({ ativo: false })
  .eq("id", criado.id);
if (eInat) fail(`inativar scratch: ${eInat.message}`);

const { data: inAtualInativo, error: eAt2 } = await sb
  .from("v_embalagem_contagem_atual")
  .select("tipo_embalagem_id")
  .eq("tipo_embalagem_id", criado.id);
if (eAt2) fail(`v_embalagem_contagem_atual (inativo): ${eAt2.message}`);
if (inAtualInativo?.length)
  fail("tipo inativo NÃO deveria aparecer em v_embalagem_contagem_atual");
ok("tipo inativo fora de v_embalagem_contagem_atual (nova contagem)");

// Histórico não filtra ativo — view expõe tipo_ativo (sem contagem scratch = 0 rows, ok).
const { error: eHist } = await sb
  .from("v_historico_contagem_embalagem")
  .select("tipo_embalagem_id, tipo_ativo")
  .limit(1);
if (eHist) fail(`v_historico_contagem_embalagem: ${eHist.message}`);
ok("v_historico_contagem_embalagem acessível (inclui tipo_ativo; sem filtro de ativo)");

const { error: eDelOk } = await sb.from("tipos_embalagem").delete().eq("id", criado.id);
if (eDelOk) fail(`DELETE de tipo sem contagem deveria passar: ${eDelOk.message}`);
ok(`tipo sem contagem excluível (${nome})`);

console.log("\nNOP-157 delete-block + inactive filter: PASS");
