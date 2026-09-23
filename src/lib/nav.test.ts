import {
  resolveNavProfile,
  isHubAccessible,
  OPS_HUBS,
  SIDEBAR_HIDDEN_SLUGS,
  filterAccessibleLinks,
  GESTAO_LINKS,
  PROFILE_PRIMARY,
} from "./nav";
import type { Profile } from "./supabase";

const base: Profile = {
  id: "1",
  nome: "Teste",
  email: "t@t.com",
  role: "user",
  avatar_url: null,
  ativo: true,
};

if (resolveNavProfile({ ...base, role: "fornecedor" }, false) !== "fornecedor") {
  throw new Error("fornecedor profile");
}
if (resolveNavProfile({ ...base, motorista_id: "m1" }, false) !== "motorista") {
  throw new Error("motorista profile");
}
if (resolveNavProfile(base, false) !== "operador") {
  throw new Error("operador default");
}
if (resolveNavProfile(base, true, "admin") !== "admin") {
  throw new Error("admin profile");
}
if (resolveNavProfile(base, true, "operador") !== "operador") {
  throw new Error("admin modo operador");
}

const allow = (slug: string) => slug === "recebimento" || slug === "recebimento/conferir";
const deny = () => false;
const receber = OPS_HUBS.find((h) => h.id === "receber")!;
if (!isHubAccessible(receber, allow)) throw new Error("hub should allow via child");
if (isHubAccessible(receber, deny)) throw new Error("hub should deny");

if (!SIDEBAR_HIDDEN_SLUGS.has("expedicao/tv") || !SIDEBAR_HIDDEN_SLUGS.has("expedicao/rastreio")) {
  throw new Error("tv/rastreio must be hidden from sidebar");
}

const gestao = filterAccessibleLinks(GESTAO_LINKS, (s) => s === "gestao" || s === "indicadores", {
  adminOnlySlugs: ["gestao/usuarios"],
  isAdmin: false,
});
if (gestao.some((l) => l.id === "usuarios")) throw new Error("usuarios admin-only");
if (!gestao.some((l) => l.id === "cadastros")) throw new Error("cadastros visible");

if (PROFILE_PRIMARY.operador.length !== 4) throw new Error("operador menu size");
if (PROFILE_PRIMARY.motorista.length !== 3) throw new Error("motorista menu size");
if (PROFILE_PRIMARY.admin.length !== 5) throw new Error("admin menu size");

console.log("nav ok");
