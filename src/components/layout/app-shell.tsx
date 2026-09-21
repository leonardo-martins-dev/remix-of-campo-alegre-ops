import { Link, useNavigate, useRouterState, Outlet } from "@tanstack/react-router";
import {
  ChevronDown, Bell, Search, Sprout, LogOut, Settings, UserPlus, Eye, EyeOff,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getIcon, slugToPath } from "@/lib/pages";
import { initials } from "@/lib/utils-date";
import { useGlobalSearch, useAlertas } from "@/hooks/use-dashboard";
import { one } from "@/lib/embed";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

function SidebarBrand() {
  return (
    <div className="h-14 sm:h-16 shrink-0 flex items-center gap-2 px-5 border-b border-sidebar-border">
      <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--brand-green)" }}>
        <Sprout className="text-white" size={20} />
      </div>
      <div className="leading-tight min-w-0">
        <div className="text-sm font-bold text-navy truncate">Campo Alegre</div>
        <div className="text-xs text-muted-foreground uppercase tracking-widest">Packing House</div>
      </div>
    </div>
  );
}

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const { isAdmin, pages } = useAuth();
  const hasGestaoInSidebar = pages.some((p) => p.slug === "gestao");

  const groups = useMemo(() => {
    const map = new Map<string, typeof pages>();
    for (const p of pages) {
      const list = map.get(p.grupo) ?? [];
      list.push(p);
      map.set(p.grupo, list);
    }
    return [...map.entries()].map(([label, items]) => ({
      label,
      items: items.sort((a, b) => a.ordem - b.ordem),
    }));
  }, [pages]);

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      active ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" : "text-ink hover:bg-secondary"
    }`;

  return (
    <>
      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-4 space-y-5">
        {groups.map((g) => (
          <div key={g.label} className="px-3">
            <div className="label-group px-3 mb-2">{g.label}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const path = slugToPath(it.slug);
                const active = pathname === path;
                const Icon = getIcon(it.icone);
                return (
                  <Link
                    key={it.slug}
                    to={path}
                    onClick={onNavigate}
                    className={linkClass(active)}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="truncate">{it.nome}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        {isAdmin && (
          <div className="px-3">
            <div className="label-group px-3 mb-2">Administração</div>
            <div className="space-y-0.5">
              {!hasGestaoInSidebar && (
                <Link
                  to="/gestao"
                  onClick={onNavigate}
                  className={linkClass(pathname === "/gestao")}
                >
                  <Settings size={16} className="shrink-0" />
                  <span>Configurações</span>
                </Link>
              )}
              <Link
                to="/gestao/usuarios"
                onClick={onNavigate}
                className={linkClass(pathname === "/gestao/usuarios")}
              >
                <UserPlus size={16} className="shrink-0" />
                <span>Criar Usuários</span>
              </Link>
            </div>
          </div>
        )}
      </nav>
      <div className="shrink-0 p-3 border-t border-sidebar-border">
        <div className="text-xs text-muted-foreground px-2">v1.1.0-qa · Supabase</div>
      </div>
    </>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { profile, isAdmin, signOut, canViewValoresCaixa, viewMode, setViewMode } = useAuth();
  const isNarrow = useIsMobile();
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: searchResults } = useGlobalSearch(search);
  const { data: alertas = [] } = useAlertas(canViewValoresCaixa);

  const isTv = pathname.startsWith("/expedicao/tv");
  const isFornecedor = profile?.role === "fornecedor";

  if (isTv || isFornecedor) return <Outlet />;

  const roleLabel = !isAdmin
    ? "Operação"
    : viewMode === "operador"
      ? "Admin · modo operador"
      : "Administrador";
  const toggleNav = () => {
    if (isNarrow) setMobileOpen(true);
    else setDesktopOpen((o) => !o);
  };

  return (
    <div className="h-svh flex overflow-hidden bg-background">
      {/* Desktop: sidebar altura do monitor, scroll só no menu */}
      {!isNarrow && desktopOpen && (
        <aside className="hidden md:flex w-64 shrink-0 h-full bg-sidebar border-r border-sidebar-border flex-col">
          <SidebarBrand />
          <SidebarNav pathname={pathname} />
        </aside>
      )}

      {/* Mobile: drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0 gap-0 bg-sidebar flex flex-col overflow-hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Navegação do Packing House</SheetDescription>
          </SheetHeader>
          <SidebarBrand />
          <SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="h-14 sm:h-16 shrink-0 bg-card border-b border-border flex items-center px-2 sm:px-5 gap-1.5 sm:gap-4">
          <button
            type="button"
            onClick={toggleNav}
            aria-label="Abrir menu"
            className="h-11 w-11 sm:h-9 sm:w-9 shrink-0 rounded-md hover:bg-secondary active:bg-secondary/80 flex items-center justify-center text-navy touch-target"
          >
            <div className="space-y-1.5 sm:space-y-1">
              <div className="h-0.5 w-5 sm:w-4 bg-navy rounded" />
              <div className="h-0.5 w-5 sm:w-4 bg-navy rounded" />
              <div className="h-0.5 w-5 sm:w-4 bg-navy rounded" />
            </div>
          </button>

          <div className="relative flex-1 min-w-0 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              placeholder={isNarrow ? "Buscar..." : "Buscar pedido, fornecedor, cliente..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 sm:h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search.length >= 2 && searchResults && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-auto text-sm">
                {searchResults.pedidos.map((p: { id: string; codigo: string; fornecedores: { nome: string } | { nome: string }[] | null }) => (
                  <button
                    key={p.id}
                    type="button"
                    className="block w-full text-left px-3 py-2 hover:bg-secondary"
                    onClick={() => {
                      navigate({ to: "/recebimento/conferir", search: { pedidoId: p.id } });
                      setSearch("");
                    }}
                  >
                    Pedido {p.codigo} · {one(p.fornecedores)?.nome}
                  </button>
                ))}
                {canViewValoresCaixa &&
                  searchResults.clientes.map((c: { id: string; nome: string }) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full text-left px-3 py-2 hover:bg-secondary"
                    onClick={() => {
                      navigate({ to: "/caixas/saldo" });
                      setSearch("");
                    }}
                  >
                    Cliente · {c.nome}
                  </button>
                ))}
                {searchResults.fornecedores.map((f: { id: string; nome: string }) => (
                  <button
                    key={f.id}
                    type="button"
                    className="block w-full text-left px-3 py-2 hover:bg-secondary"
                    onClick={() => {
                      navigate({ to: "/recebimento" });
                      setSearch("");
                    }}
                  >
                    Fornecedor · {f.nome}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-3 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-11 w-11 sm:h-9 sm:w-9 rounded-md hover:bg-secondary active:bg-secondary/80 flex items-center justify-center relative text-navy touch-target"
                >
                  <Bell size={18} className="sm:w-4 sm:h-4" />
                  {alertas.length > 0 && (
                    <span className="absolute top-2 right-2 sm:top-1.5 sm:right-1.5 h-2 w-2 sm:h-1.5 sm:w-1.5 rounded-full" style={{ background: "var(--danger)" }} />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {alertas.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum alerta</div>
                ) : (
                  alertas.map((a, i) => (
                    <DropdownMenuItem
                      key={i}
                      className="flex flex-col items-start gap-0.5"
                      onClick={() => {
                        if (a.href) navigate({ to: a.href as "/gestao" });
                      }}
                    >
                      <span className="font-semibold text-xs">{a.title}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-2 pl-1.5 sm:pl-3 border-l border-border min-h-[44px] sm:min-h-0 touch-target">
                  <div
                    className="h-9 w-9 sm:h-8 sm:w-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: "var(--navy)" }}
                  >
                    {initials(profile?.nome ?? "U")}
                  </div>
                  <div className="leading-tight text-left hidden sm:block">
                    <div className="text-xs font-semibold text-navy max-w-[9rem] truncate">{profile?.nome ?? "Usuário"}</div>
                    <div className="text-xs text-muted-foreground">{roleLabel}</div>
                  </div>
                  <ChevronDown size={14} className="text-muted-foreground hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => {
                      const next = viewMode === "operador" ? "admin" : "operador";
                      setViewMode(next);
                      if (next === "operador") navigate({ to: "/" });
                    }}
                  >
                    {viewMode === "operador" ? (
                      <Eye size={14} className="mr-2" />
                    ) : (
                      <EyeOff size={14} className="mr-2" />
                    )}
                    {viewMode === "operador" ? "Modo administrador" : "Modo operador"}
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate({ to: "/gestao/usuarios" })}>
                    <UserPlus size={14} className="mr-2" /> Criar Usuários
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate({ to: "/gestao" })}>
                    <Settings size={14} className="mr-2" /> Configurações
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => signOut().then(() => navigate({ to: "/login" }))}>
                  <LogOut size={14} className="mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-auto overscroll-contain">
          {/* Espaçamento padrão = Dashboard Operacional (desktop alinhado à sidebar) */}
          <div className="mx-auto w-full max-w-[1400px] px-3 py-3 md:px-5 md:py-4 lg:px-6 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
