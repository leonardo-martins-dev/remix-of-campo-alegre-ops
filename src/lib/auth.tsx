import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, type AccessiblePage, type Profile } from "./supabase";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  pages: AccessiblePage[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPageAccess: (slug: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, email, role, avatar_url, ativo")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data as Profile;
}

async function fetchAccessiblePages(userId: string): Promise<AccessiblePage[]> {
  const { data, error } = await supabase.rpc("get_user_accessible_pages", {
    p_user_id: userId,
  });
  if (error) {
    console.error("get_user_accessible_pages:", error.message);
    return [];
  }
  return (data ?? []) as AccessiblePage[];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pages, setPages] = useState<AccessiblePage[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (userId: string) => {
    const [p, pg] = await Promise.all([
      fetchProfile(userId),
      fetchAccessiblePages(userId),
    ]);
    setProfile(p);
    setPages(pg);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        loadUserData(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        loadUserData(s.user.id);
      } else {
        setProfile(null);
        setPages([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserData]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPages([]);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadUserData(session.user.id);
  }, [session, loadUserData]);

  const hasPageAccess = useCallback(
    (slug: string) => {
      if (profile?.role === "admin") return true;
      return pages.some((p) => p.slug === slug);
    },
    [profile, pages]
  );

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      pages,
      loading,
      signIn,
      signOut,
      refreshProfile,
      hasPageAccess,
    }),
    [session, profile, pages, loading, signIn, signOut, refreshProfile, hasPageAccess]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
