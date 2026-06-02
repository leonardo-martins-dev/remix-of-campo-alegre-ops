import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import "./login.css";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Login · Campo Alegre Packing House" }] }),
});

function LogoMark() {
  return (
    <svg className="login-logo" viewBox="0 0 56 56" fill="none" aria-hidden>
      <path
        d="M8 18h40v28H8V18z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8 24h40M18 18V12a4 4 0 014-4h12a4 4 0 014 4v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22 32h12M22 38h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="28" cy="14" r="2" fill="currentColor" />
    </svg>
  );
}

function LoginPage() {
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    navigate({ to: "/" });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div className={`login-page${loading ? " login-page--loading" : ""}`}>
      <div className="login-shell">
        <aside className="login-brand">
          <div className="login-brand-badge">Operação em tempo real</div>
          <LogoMark />
          <h1 className="login-brand-title">
            Campo Alegre
            <span>Packing House</span>
          </h1>
          <p className="login-brand-desc">
            Recebimento, expedição e controle de caixas em um só painel. Acesso restrito à equipe
            autorizada.
          </p>
          <ul className="login-brand-features">
            <li>Conferência e faltas no recebimento</li>
            <li>Expedição, TV de pátio e pedidos</li>
            <li>Saldo de caixas e indicadores operacionais</li>
          </ul>
          <p className="login-brand-footer">
            <strong>Campo Alegre</strong> · Packing House
          </p>
        </aside>

        <section className="login-form-panel">
          <form className="login-card" onSubmit={handleSubmit} noValidate>
            <header className="login-card-header">
              <h2>Entrar</h2>
              <p>Use o email e a senha fornecidos pela administração.</p>
            </header>

            {error && (
              <div className="login-error" role="alert">
                <svg className="login-error-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="seu@email.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Senha</label>
              <div className="login-password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1 1 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="login-submit" disabled={submitting || loading}>
              {submitting ? (
                <span className="login-spinner-wrap">
                  <span className="login-spinner" aria-hidden />
                  Entrando…
                </span>
              ) : (
                "Entrar no painel"
              )}
            </button>

            <p className="login-card-foot">
              Problemas de acesso? Fale com o administrador do sistema.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
