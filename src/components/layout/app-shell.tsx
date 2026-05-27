import { Link, useRouterState, Outlet } from "@tanstack/react-router";
import {
  LayoutDashboard, PackageCheck, AlertTriangle, Truck, Tv, Box,
  PiggyBank, RotateCcw, Activity, Settings, ChevronDown, Bell, Search, Sprout
} from "lucide-react";
import { useState } from "react";

type Item = { to: string; label: string; icon: any };
type Group = { label: string; items: Item[] };

const groups: Group[] = [
  { label: "Navegação", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
  ]},
  { label: "Recebimento", items: [
    { to: "/recebimento", label: "Conferência", icon: PackageCheck },
    { to: "/recebimento/faltas", label: "Relatório de Faltas", icon: AlertTriangle },
  ]},
  { label: "Expedição", items: [
    { to: "/expedicao", label: "Painel de Carga", icon: Truck },
    { to: "/expedicao/tv", label: "Modo TV", icon: Tv },
  ]},
  { label: "Caixas", items: [
    { to: "/caixas/saldo", label: "Saldo por Cliente", icon: Box },
    { to: "/caixas/economia", label: "Custo & Perda", icon: PiggyBank },
    { to: "/caixas/retorno", label: "Registro de Retorno", icon: RotateCcw },
  ]},
  { label: "Indicadores", items: [
    { to: "/indicadores", label: "Tempos & Ciclo", icon: Activity },
  ]},
  { label: "Gestão", items: [
    { to: "/gestao", label: "Configurações", icon: Settings },
  ]},
];

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(true);
  const isTv = pathname.startsWith("/expedicao/tv");
  const isMobile = pathname.startsWith("/caixas/retorno");

  if (isTv) return <Outlet />;

  return (
    <div className="min-h-screen flex bg-background">
      {open && (
        <aside className="w-64 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
          <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--brand-green)" }}>
              <Sprout className="text-white" size={20}/>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold text-navy">Campo Alegre</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Packing House</div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-4 space-y-5">
            {groups.map(g => (
              <div key={g.label} className="px-3">
                <div className="label-group px-3 mb-2">{g.label}</div>
                <div className="space-y-0.5">
                  {g.items.map(it => {
                    const active = pathname === it.to;
                    const Icon = it.icon;
                    return (
                      <Link key={it.to} to={it.to}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          active ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" : "text-ink hover:bg-secondary"
                        }`}>
                        <Icon size={16} />
                        <span>{it.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="p-3 border-t border-sidebar-border">
            <div className="text-[10px] text-muted-foreground px-2">v0.1 · Mock data</div>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-card border-b border-border flex items-center px-5 gap-4">
          <button onClick={() => setOpen(o => !o)} className="h-9 w-9 rounded-md hover:bg-secondary flex items-center justify-center text-navy">
            <div className="space-y-1">
              <div className="h-0.5 w-4 bg-navy rounded"/>
              <div className="h-0.5 w-4 bg-navy rounded"/>
              <div className="h-0.5 w-4 bg-navy rounded"/>
            </div>
          </button>
          <div className="relative max-w-md w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input placeholder="Buscar pedido, fornecedor, cliente..." className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button className="h-9 w-9 rounded-md hover:bg-secondary flex items-center justify-center relative text-navy">
              <Bell size={16}/>
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full" style={{ background: "var(--danger)" }}/>
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-border">
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "var(--navy)" }}>RM</div>
              <div className="leading-tight">
                <div className="text-xs font-semibold text-navy">Rafael Martins</div>
                <div className="text-[10px] text-muted-foreground">Operação</div>
              </div>
              <ChevronDown size={14} className="text-muted-foreground"/>
            </div>
          </div>
        </header>
        <main className={`flex-1 overflow-auto ${isMobile ? "" : "p-6"}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
