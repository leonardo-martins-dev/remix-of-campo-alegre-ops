import { useEffect } from "react";
import "@/routes/login.css";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { pathnameToSlug } from "@/lib/pages";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading, profile, hasPageAccess } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const isLogin = pathname === "/login";

  useEffect(() => {
    if (loading) return;

    if (!session && !isLogin) {
      navigate({ to: "/login" });
      return;
    }

    if (session && isLogin) {
      navigate({ to: "/" });
      return;
    }

    if (session && profile && !isLogin) {
      const slug = pathnameToSlug(pathname);
      if (!hasPageAccess(slug)) {
        navigate({ to: "/" });
      }
    }
  }, [loading, session, isLogin, pathname, profile, hasPageAccess, navigate]);

  if (loading) {
    if (isLogin) {
      return (
        <div className="login-page login-page--loading">
          <div className="login-shell">
            <div className="login-form-panel" style={{ gridColumn: "1 / -1" }}>
              <div className="login-card" style={{ textAlign: "center" }}>
                <span className="login-spinner-wrap" style={{ justifyContent: "center", padding: "2rem 0" }}>
                  <span className="login-spinner" aria-hidden />
                  Carregando…
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!session && !isLogin) return null;
  if (session && isLogin) return null;

  return <>{children}</>;
}
