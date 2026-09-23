import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from "@/lib/super-admin";

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, role, ativo, motorista_id, fornecedor_id, created_at")
        .not("email", "ilike", SUPER_ADMIN_EMAIL)
        .order("nome");
      if (error) throw error;
      return (data ?? []).filter((u) => !isSuperAdmin(u.email));
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: {
      id: string;
      role?: string;
      ativo?: boolean;
      nome?: string;
      motorista_id?: string | null;
      fornecedor_id?: string | null;
    }) => {
      const { error } = await supabase.from("profiles").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

export function useAllPages() {
  return useQuery({
    queryKey: ["pages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pages").select("*").eq("ativo", true).order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUserPermissions(userId: string | null) {
  return useQuery({
    queryKey: ["permissions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_page_permissions")
        .select("id, page_id, can_access, pages(slug, nome)")
        .eq("user_id", userId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Conta admins ativos (trava último admin / Usuários). */
export function useActiveAdminCount() {
  return useQuery({
    queryKey: ["profiles", "admin-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("ativo", true)
        .not("email", "ilike", SUPER_ADMIN_EMAIL);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/**
 * NOP-362 — grava o conjunto completo de permissões via RPC
 * (valida dependências + trava do último admin no servidor).
 */
export function useSetUserPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      enabledSlugs,
    }: {
      userId: string;
      enabledSlugs: string[];
    }) => {
      const { data, error } = await supabase.rpc("set_user_page_permissions", {
        p_user_id: userId,
        p_enabled_slugs: enabledSlugs,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["permissions", v.userId] });
    },
  });
}

/** @deprecated use useSetUserPermissions — mantido só se algum caller legado restar */
export function useSetPermission() {
  const setAll = useSetUserPermissions();
  return useMutation({
    mutationFn: async (_args: {
      userId: string;
      pageId: string;
      canAccess: boolean;
    }) => {
      throw new Error("Use useSetUserPermissions com o conjunto completo (NOP-362)");
    },
    onSuccess: () => setAll,
  });
}

export async function createUserViaEdge(
  nome: string,
  email: string,
  password: string,
  role: "admin" | "user" | "fornecedor" = "user",
  extra?: { motorista_id?: string | null; fornecedor_id?: string | null },
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Não autenticado");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ nome, email, password, role, ...extra }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Erro ao criar usuário");
  return body;
}
