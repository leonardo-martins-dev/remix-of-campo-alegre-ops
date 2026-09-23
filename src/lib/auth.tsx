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
import { ensureUserProfile } from "./ensure-profile";
import { FORNECEDOR_SLUGS } from "./pages";
import { OPS_HUBS, hubChildSlugs } from "./nav";
import {
  canViewValoresCaixa as resolveCanViewValoresCaixa,
  isValoresCaixaSlug,
  resolveIsAdmin,
  type ViewMode,
} from "./roles";

const VIEW_MODE_KEY = "ca-view-mode";

function readViewMode(): ViewMode {
  if (typeof sessionStorage === "undefined") return "admin";
  const raw = sessionStorage.getItem(VIEW_MODE_KEY);
  return raw === "operador" ? "operador" : "admin";
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** Modo de interface na sessão (admin pode alternar para operador sem re-login). */
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  /** Valores/saldos de caixa — regra centralizada por modo/perfil. */
  canViewValoresCaixa: boolean;
  pages: AccessiblePage[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPageAccess: (slug: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(user: User): Promise<Profile | null> {
  return ensureUserProfile(user);
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
  const [viewMode, setViewModeState] = useState<ViewMode>(readViewMode);

  const setViewMode = useCallback((mode: ViewMode) => {
    try {
      sessionStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* sessionStorage indisponível */
    }
    setViewModeState(mode);
  }, []);

  const loadUserData = useCallback(async (user: User) => {
    const [p, pg] = await Promise.all([
      fetchProfile(user),
      fetchAccessiblePages(user.id),
    ]);
    setProfile(p);
    setPages(pg);
    if (resolveIsAdmin(p, user)) {
      supabase.rpc("encerrar_pedidos_vencidos").then(({ error }) => {
        if (error && error.code !== "PGRST202") {
          console.warn("encerrar_pedidos_vencidos:", error.message);
        }
      });
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        loadUserData(s.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        loadUserData(s.user);
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
    if (session?.user) await loadUserData(session.user);
  }, [session, loadUserData]);

  const user = session?.user ?? null;
  const isAdmin = resolveIsAdmin(profile, user);

  const canViewValoresCaixa = resolveCanViewValoresCaixa(isAdmin, viewMode);

  const visiblePages = useMemo(() => {
    if (canViewValoresCaixa) return pages;
    return pages.filter((p) => !isValoresCaixaSlug(p.slug));
  }, [pages, canViewValoresCaixa]);

  const hasPageAccess = useCallback(
    (slug: string) => {
      if (profile?.role === "fornecedor") {
        return FORNECEDOR_SLUGS.includes(slug);
      }
      if (isValoresCaixaSlug(slug) && !resolveCanViewValoresCaixa(resolveIsAdmin(profile, user), viewMode)) {
        return false;
      }
      if (slug === "gestao/usuarios") {
        return resolveIsAdmin(profile, user);
      }
      if (resolveIsAdmin(profile, user)) return true;
      if (pages.some((p) => p.slug === slug)) return true;
      // NOP-321: hubs acessíveis se o usuário tem qualquer filho
      const hub = OPS_HUBS.find((h) => h.slug === slug);
      if (hub) {
        return hubChildSlugs(hub).some((s) => pages.some((p) => p.slug === s));
      }
      return false;
    },
    [profile, user, pages, viewMode]
  );

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      isAdmin,
      viewMode: isAdmin ? viewMode : ("operador" as ViewMode),
      setViewMode,
      canViewValoresCaixa,
      pages: visiblePages,
      loading,
      signIn,
      signOut,
      refreshProfile,
      hasPageAccess,
    }),
    [
      session,
      user,
      profile,
      isAdmin,
      viewMode,
      setViewMode,
      canViewValoresCaixa,
      visiblePages,
      loading,
      signIn,
      signOut,
      refreshProfile,
      hasPageAccess,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
