/**
 * NOP-362 — prova as duas travas de servidor que a validação marcava nao_testavel:
 *
 *   1) set_user_page_permissions recusa conjunto incompleto (mesmo mapa do front)
 *   2) remover Usuários (gestao/usuarios) do último admin é recusado (direto e cascata)
 *
 * NÃO depende de NOP-325. Usa usuários descartáveis criados via service role.
 * NÃO altera permissões permanentes de usuários reais.
 * A probe do último admin isola temporariamente os outros admins ativos
 * (profiles.ativo = false) e SEMPRE restaura no finally.
 *
 * Uso (raiz do repo, .env carregado):
 *   set -a && source .env && set +a && bun scripts/assert_nop362_server_guards.mjs
 *
 * Env obrigatório:
 *   SUPABASE_URL (ou VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_ANON_KEY (ou VITE_SUPABASE_ANON_KEY)
 *
 * Exit 0 = PASS. Exit 1 = FAIL (tenta limpar/restaurar antes de sair).
 *
 * Re-run (Davi / esteira) sem trancar admins reais de forma permanente:
 *   - O script cria `nop362.probe.*@noponto.test`, isola, prova, restaura, apaga.
 *   - Se interromper no meio: rode de novo — o finally restaura IDs que ele mesmo
 *     desativou; se o processo morreu, reative manualmente os emails listados no
 *     log "RESTORE_HINT" (daviadmin@noponto.io / admin@noponto.io tipicamente)
 *     com UPDATE profiles SET ativo = true WHERE email IN (...).
 *   - Nunca passe IDs de usuários reais como alvo das RPCs de escrita.
 */
import { createClient } from "@supabase/supabase-js";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
  throw new Error(msg);
}
function ok(msg) {
  console.log("OK:", msg);
}
function info(msg) {
  console.log("··", msg);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error(
    "FAIL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY obrigatórios",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const pwd = `Nop362Probe!${stamp}`;
const emailUser = `nop362.probe.user.${stamp}@noponto.test`;
const emailAdmin = `nop362.probe.admin.${stamp}@noponto.test`;
const probeIds = [];
/** @type {string[]} IDs de admins reais que este run desativou — restaurar sempre */
let isolatedIds = [];

async function cleanupProbeUsers() {
  for (const id of probeIds) {
    await admin.from("user_page_permissions").delete().eq("user_id", id);
    await admin.from("profiles").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

async function restoreIsolated() {
  if (!isolatedIds.length) return;
  const { error } = await admin
    .from("profiles")
    .update({ ativo: true })
    .in("id", isolatedIds);
  if (error) {
    console.error(
      "RESTORE_FAIL:",
      error.message,
      "— reative manualmente:",
      isolatedIds,
    );
  } else {
    ok(`admins reais restaurados (${isolatedIds.length})`);
  }
  isolatedIds = [];
}

async function createProbe(email, role, nome) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pwd,
    email_confirm: true,
    user_metadata: { full_name: nome },
    app_metadata: { role, nome },
  });
  if (error) fail(`createUser ${email}: ${error.message}`);
  const id = data.user.id;
  probeIds.push(id);
  const { error: eProf } = await admin.from("profiles").upsert({
    id,
    nome,
    email,
    role,
    ativo: true,
  });
  if (eProf) fail(`profiles upsert ${email}: ${eProf.message}`);
  return id;
}

function clientAs(accessToken) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function main() {
  info("baseline RPCs (leitura)");
  const { data: depsMap, error: eMap } = await admin.rpc("permission_deps_map");
  if (eMap) fail(`permission_deps_map: ${eMap.message}`);
  if (!depsMap || Object.keys(depsMap).length < 1) fail("mapa de deps vazio");
  ok(`permission_deps_map: ${Object.keys(depsMap).length} chaves`);

  const { data: confDeps, error: eDeps } = await admin.rpc(
    "permission_required_deps",
    { p_slug: "recebimento/conferir" },
  );
  if (eDeps) fail(`permission_required_deps: ${eDeps.message}`);
  for (const need of ["receber", "recebimento", "fornecedores"]) {
    if (!(confDeps ?? []).includes(need))
      fail(`conferir deveria declarar ${need}, veio ${JSON.stringify(confDeps)}`);
  }
  ok(`permission_required_deps(recebimento/conferir) = ${JSON.stringify(confDeps)}`);

  const { data: incompleteFlag, error: eInc } = await admin.rpc(
    "permission_set_is_complete",
    { p_slugs: ["recebimento/conferir"] },
  );
  if (eInc) fail(`permission_set_is_complete incompleto: ${eInc.message}`);
  if (incompleteFlag !== false)
    fail(`conjunto [recebimento/conferir] deveria ser false, veio ${incompleteFlag}`);
  ok("permission_set_is_complete([recebimento/conferir]) === false");

  const completeMini = [
    "receber",
    "recebimento",
    "recebimento/conferir",
    "fornecedores",
  ];
  const { data: completeFlag, error: eComp } = await admin.rpc(
    "permission_set_is_complete",
    { p_slugs: completeMini },
  );
  if (eComp) fail(`permission_set_is_complete completo: ${eComp.message}`);
  if (completeFlag !== true)
    fail(`conjunto completo mini deveria ser true, veio ${completeFlag}`);
  ok("permission_set_is_complete(mini completo) === true");

  const { data: adminCount0, error: eCnt0 } = await admin.rpc(
    "count_admins_with_usuarios",
  );
  if (eCnt0) fail(`count_admins_with_usuarios: ${eCnt0.message}`);
  info(`count_admins_with_usuarios baseline = ${adminCount0}`);

  info("cria usuários descartáveis");
  const userId = await createProbe(emailUser, "user", "NOP362 Probe User");
  const adminId = await createProbe(emailAdmin, "admin", "NOP362 Probe Admin");
  ok(`descartáveis: user=${userId} admin=${adminId}`);

  const anonLogin = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: login, error: eLogin } = await anonLogin.auth.signInWithPassword({
    email: emailAdmin,
    password: pwd,
  });
  if (eLogin || !login?.session?.access_token) {
    fail(`login probe admin: ${eLogin?.message ?? "sem session"}`);
  }
  const asAdmin = clientAs(login.session.access_token);

  // ---------- Probe 1: conjunto incompleto via API ----------
  info("PROBE 1 — salvar conjunto incompleto em usuário descartável");
  const incWrite = await asAdmin.rpc("set_user_page_permissions", {
    p_user_id: userId,
    p_enabled_slugs: ["recebimento/conferir"],
  });
  if (!incWrite.error) {
    fail(
      "set_user_page_permissions aceitou conjunto incompleto — trava ausente?",
    );
  }
  const blockedIncomplete =
    (incWrite.error.message ?? "").includes("incompleto") ||
    (incWrite.error.message ?? "").includes("dependências");
  if (!blockedIncomplete) {
    fail(
      `recusa incompleta com mensagem inesperada: ${incWrite.error.message}`,
    );
  }
  ok(`PROBE1 PASS — recusado: ${incWrite.error.message}`);

  // Controle: conjunto completo grava
  const okWrite = await asAdmin.rpc("set_user_page_permissions", {
    p_user_id: userId,
    p_enabled_slugs: completeMini,
  });
  if (okWrite.error)
    fail(`controle completo deveria gravar: ${okWrite.error.message}`);
  ok("PROBE1 controle — conjunto completo gravou no descartável");

  // ---------- Probe 2: trava do último admin ----------
  info("PROBE 2 — isola admins reais (ativo=false) e tenta remover Usuários");
  const { data: others, error: eOthers } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role", "admin")
    .eq("ativo", true)
    .neq("id", adminId);
  if (eOthers) fail(`listar outros admins: ${eOthers.message}`);
  isolatedIds = (others ?? []).map((o) => o.id);
  const isolatedEmails = (others ?? []).map((o) => o.email);
  console.log(
    "RESTORE_HINT: se este processo morrer, reative:",
    isolatedEmails.join(", ") || "(nenhum)",
  );

  if (isolatedIds.length) {
    const { error: eOff } = await admin
      .from("profiles")
      .update({ ativo: false })
      .in("id", isolatedIds);
    if (eOff) fail(`isolar admins: ${eOff.message}`);
    info(`isolados temporariamente: ${isolatedEmails.join(", ")}`);
  }

  const { data: adminCount1, error: eCnt1 } = await asAdmin.rpc(
    "count_admins_with_usuarios",
  );
  if (eCnt1) fail(`count após isolamento: ${eCnt1.message}`);
  if (adminCount1 !== 1) {
    fail(
      `após isolamento esperava 1 admin ativo (probe), veio ${adminCount1}`,
    );
  }
  ok("cenário sole-admin descartável (count=1)");

  // Direto: conjunto completo em si, mas sem gestao/usuarios
  const directTry = await asAdmin.rpc("set_user_page_permissions", {
    p_user_id: adminId,
    p_enabled_slugs: ["gestao"],
  });
  if (!directTry.error) {
    fail("último admin conseguiu salvar sem gestao/usuarios — trava ausente?");
  }
  if (!(directTry.error.message ?? "").includes("último administrador")) {
    fail(`trava direta com mensagem inesperada: ${directTry.error.message}`);
  }
  ok(`PROBE2 direto PASS — ${directTry.error.message}`);

  // Cascata: set sem gestao nem gestao/usuarios (como se desmarcou o pai)
  const cascadeTry = await asAdmin.rpc("set_user_page_permissions", {
    p_user_id: adminId,
    p_enabled_slugs: ["receber"],
  });
  if (!cascadeTry.error) {
    fail("último admin removeu Usuários por cascata — trava ausente?");
  }
  if (!(cascadeTry.error.message ?? "").includes("último administrador")) {
    fail(`trava cascata com mensagem inesperada: ${cascadeTry.error.message}`);
  }
  ok(`PROBE2 cascata PASS — ${cascadeTry.error.message}`);

  // Controle sole-admin: COM gestao/usuarios deve gravar
  const soleOk = await asAdmin.rpc("set_user_page_permissions", {
    p_user_id: adminId,
    p_enabled_slugs: ["gestao", "gestao/usuarios"],
  });
  if (soleOk.error)
    fail(
      `sole-admin COM Usuários deveria gravar: ${soleOk.error.message}`,
    );
  ok("PROBE2 controle — sole-admin com gestao/usuarios gravou");

  // Restaura antes do controle multi-admin
  await restoreIsolated();

  // Controle multi-admin: remover Usuários de um admin NÃO-último deve passar
  const multiTry = await asAdmin.rpc("set_user_page_permissions", {
    p_user_id: adminId,
    p_enabled_slugs: ["gestao"],
  });
  if (multiTry.error) {
    fail(
      `com >1 admin, remover Usuários do probe deveria passar: ${multiTry.error.message}`,
    );
  }
  ok("PROBE2 controle multi-admin — remover Usuários de admin não-último ok");

  console.log("\nNOP-362 server guards: PASS");
  console.log(
    JSON.stringify(
      {
        probe1_incomplete_set: "PASS",
        probe2_last_admin_direct: "PASS",
        probe2_last_admin_cascade: "PASS",
        disposable_emails: [emailUser, emailAdmin],
        isolated_then_restored: isolatedEmails,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (err) {
  console.error("ABORT:", err?.message ?? err);
  process.exitCode = 1;
} finally {
  try {
    await restoreIsolated();
  } catch (e) {
    console.error("finally restore:", e?.message ?? e);
  }
  try {
    await cleanupProbeUsers();
    ok("cleanup descartáveis");
  } catch (e) {
    console.error("finally cleanup:", e?.message ?? e);
  }
  // sanity: admins reais ativos de volta
  const { data: finalAdmins } = await admin
    .from("profiles")
    .select("email, ativo")
    .eq("role", "admin")
    .order("email");
  console.log("admins finais:", finalAdmins);
  process.exit(process.exitCode ?? 0);
}
