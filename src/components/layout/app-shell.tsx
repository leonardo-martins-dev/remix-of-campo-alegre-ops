import { Link, useNavigate, useRouterState, Outlet } from "@tanstack/react-router";
import {
  ChevronDown, Bell, Search, Sprout, LogOut, Settings, UserPlus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getIcon, slugToPath } from "@/lib/pages";
import { initials } from "@/lib/utils-date";
import { useGlobalSearch, useAlertas } from "@/hooks/use-dashboard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { profile, isAdmin, pages, signOut } = useAuth();
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const { data: searchResults } = useGlobalSearch(search);
  const { data: alertas = [] } = useAlertas();

  const isTv = pathname.startsWith("/expedicao/tv");
  const isMobile = pathname.startsWith("/caixas/retorno");

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

  if (isTv) return <Outlet />;

  const roleLabel = isAdmin ? "Administrador" : "Operação";

  return (
    <div className="min-h-screen flex bg-background">
      {open && (
        <aside className="w-64 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
          <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--brand-green)" }}>
              <Sprout className="text-white" size={20} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-navy">Campo Alegre</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Packing House</div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-4 space-y-5">
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
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          active ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" : "text-ink hover:bg-secondary"
                        }`}
                      >
                        <Icon size={16} />
                        <span>{it.nome}</span>
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
                  {isAdmin && !hasGestaoInSidebar && (
                    <Link
                      to="/gestao"
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        pathname === "/gestao"
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                          : "text-ink hover:bg-secondary"
                      }`}
                    >
                      <Settings size={16} />
                      <span>Configurações</span>
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      to="/gestao/usuarios"
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        pathname === "/gestao/usuarios"
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                          : "text-ink hover:bg-secondary"
                      }`}
                    >
                      <UserPlus size={16} />
                      <span>Criar Usuários</span>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </nav>
          <div className="p-3 border-t border-sidebar-border">
            <div className="text-[10px] text-muted-foreground px-2">v1.1.0-qa · Supabase</div>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-card border-b border-border flex items-center px-5 gap-4">
          <button
            onClick={() => setOpen((o) => !o)}
            className="h-9 w-9 rounded-md hover:bg-secondary flex items-center justify-center text-navy"
          >
            <div className="space-y-1">
              <div className="h-0.5 w-4 bg-navy rounded" />
              <div className="h-0.5 w-4 bg-navy rounded" />
              <div className="h-0.5 w-4 bg-navy rounded" />
            </div>
          </button>
          <div className="relative max-w-md w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Buscar pedido, fornecedor, cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {search.length >= 2 && searchResults && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-64 overflow-auto text-sm">
                {searchResults.pedidos.map((p: { id: string; codigo: string; fornecedores: { nome: string } | null }) => (
                  <button
                    key={p.id}
                    className="block w-full text-left px-3 py-2 hover:bg-secondary"
                    onClick={() => { navigate({ to: "/recebimento/conferir", search: { pedidoId: p.id } }); setSearch(""); }}
                  >
                    Pedido {p.codigo} · {p.fornecedores?.nome}
                  </button>
                ))}
                {searchResults.clientes.map((c: { id: string; nome: string }) => (
                  <button
                    key={c.id}
                    className="block w-full text-left px-3 py-2 hover:bg-secondary"
                    onClick={() => { navigate({ to: "/caixas/saldo" }); setSearch(""); }}
                  >
                    Cliente · {c.nome}
                  </button>
                ))}
                {searchResults.fornecedores.map((f: { id: string; nome: string }) => (
                  <button
                    key={f.id}
                    className="block w-full text-left px-3 py-2 hover:bg-secondary"
                    onClick={() => { navigate({ to: "/recebimento" }); setSearch(""); }}
                  >
                    Fornecedor · {f.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 w-9 rounded-md hover:bg-secondary flex items-center justify-center relative text-navy">
                  <Bell size={16} />
                  {alertas.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full" style={{ background: "var(--danger)" }} />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {alertas.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum alerta</div>
                ) : (
                  alertas.map((a, i) => (
                    <DropdownMenuItem key={i} className="flex flex-col items-start gap-0.5">
                      <span className="font-semibold text-xs">{a.title}</span>
                      <span className="text-[10px] text-muted-foreground">{a.desc}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-3 border-l border-border">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "var(--navy)" }}>
                    {initials(profile?.nome ?? "U")}
                  </div>
                  <div className="leading-tight text-left">
                    <div className="text-xs font-semibold text-navy">{profile?.nome ?? "Usuário"}</div>
                    <div className="text-[10px] text-muted-foreground">{roleLabel}</div>
                  </div>
                  <ChevronDown size={14} className="text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
        <main className={`flex-1 overflow-auto ${isMobile ? "" : "p-6"}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
