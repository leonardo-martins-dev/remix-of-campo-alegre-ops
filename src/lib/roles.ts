import type { User } from "@supabase/supabase-js";
import type { Profile } from "./supabase";
import { isSuperAdmin } from "./super-admin";

export function resolveIsAdmin(
  profile: Profile | null,
  user: User | null | undefined
): boolean {
  if (profile?.role === "admin" || (profile?.role as string) === "super_admin") return true;
  if (isSuperAdmin(profile?.email ?? user?.email)) return true;
  return user?.app_metadata?.role === "admin";
}

export function resolveProfile(
  profile: Profile | null,
  user: User | null | undefined
): Profile | null {
  if (profile) {
    if (resolveIsAdmin(profile, user) && profile.role !== "admin") {
      return { ...profile, role: "admin" };
    }
    return profile;
  }
  if (!user?.id || !user.email) return null;

  return {
    id: user.id,
    email: user.email,
    nome:
      (user.user_metadata?.full_name as string | undefined) ??
      user.email.split("@")[0] ??
      "Usuário",
    role: resolveIsAdmin(null, user) ? "admin" : "user",
    avatar_url: null,
    ativo: true,
  };
}
