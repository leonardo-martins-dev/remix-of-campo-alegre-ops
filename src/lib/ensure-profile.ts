import type { User } from "@supabase/supabase-js";
import { supabase, type Profile } from "./supabase";
import { resolveProfile } from "./roles";
import { isSuperAdmin } from "./super-admin";

export async function ensureUserProfile(user: User): Promise<Profile | null> {
  const { data, error } = await supabase.rpc("ensure_user_profile");
  if (data) return data as Profile;
  if (error && error.code !== "PGRST202" && error.code !== "42883") {
    console.warn("ensure_user_profile:", error.message);
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id, nome, email, role, avatar_url, ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return resolveProfile(existing as Profile, user);

  const role = isSuperAdmin(user.email) || user.app_metadata?.role === "admin" ? "admin" : "user";
  const nome =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Usuário";

  const { data: upserted, error: upsertErr } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: user.email!, nome, role, ativo: true }, { onConflict: "id" })
    .select("id, nome, email, role, avatar_url, ativo")
    .single();

  if (upsertErr) {
    console.error("ensureUserProfile upsert:", upsertErr.message);
    return resolveProfile(null, user);
  }
  return resolveProfile(upserted as Profile, user);
}
