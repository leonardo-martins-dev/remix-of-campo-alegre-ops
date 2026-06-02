import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type Profile = {
  id: string;
  nome: string;
  email: string;
  role: "admin" | "user";
  avatar_url: string | null;
  ativo: boolean;
};

export type AccessiblePage = {
  page_id: string;
  slug: string;
  nome: string;
  grupo: string;
  icone: string | null;
  ordem: number;
};
