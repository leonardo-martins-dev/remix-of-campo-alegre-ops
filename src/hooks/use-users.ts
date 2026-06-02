import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, role, ativo, created_at")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; role?: string; ativo?: boolean; nome?: string }) => {
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

export function useSetPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      pageId,
      canAccess,
    }: {
      userId: string;
      pageId: string;
      canAccess: boolean;
    }) => {
      const { error } = await supabase.from("user_page_permissions").upsert(
        { user_id: userId, page_id: pageId, can_access: canAccess },
        { onConflict: "user_id,page_id" }
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["permissions", v.userId] });
    },
  });
}

export async function createUserViaEdge(
  nome: string,
  email: string,
  password: string,
  role: "admin" | "user" = "user"
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Não autenticado");

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ nome, email, password, role }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Erro ao criar usuário");
  return body;
}
