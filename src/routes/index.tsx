import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  Truck,
  PackageCheck,
  ClipboardCheck,
  ArrowLeftRight,
  AlertTriangle,
  AlertCircle,
  Box,
  Warehouse,
  CheckCircle2,
  Activity,
  Settings,
  UserPlus,
  LayoutDashboard,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import { resolveNavProfile, PROFILE_PRIMARY, type NavProfile } from "@/lib/nav";
import { usePedidosDia, usePendenciasVinculo } from "@/hooks/use-pedidos";
import { useOrdensExpedicao } from "@/hooks/use-ordem-expedicao";
import { usePosicoesPendentes } from "@/hooks/use-minimo-estoque";
import { useQuebras } from "@/hooks/use-quebra";
import { useContarValesPendentes } from "@/hooks/use-vales";
import { useStatusInventarioEmbalagem } from "@/hooks/use-inventario-embalagens";
import { useParadasMotoristaDia } from "@/hooks/use-motorista-caixas";
import { useAlertas, useDashboard } from "@/hooks/use-dashboard";
import { todayBRT } from "@/lib/utils-date";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/")({
  component: MeuTurno,
  head: () => ({ meta: [{ title: "Meu turno · Campo Alegre" }] }),
});

type PendencyCard = {
  id: string;
  title: string;
  desc: string;
  count: number;
  to: string;
  icon: LucideIcon;
};

function MeuTurno() {
  const { profile, isAdmin, viewMode, canViewValoresCaixa } = useAuth();
  const navProfile = resolveNavProfile(profile, isAdmin, viewMode);

  if (navProfile === "fornecedor") {
    return <Navigate to="/fornecedor" />;
  }

  return (
    <div>
      <PageHeader
        title="Meu turno"
        subtitle={subtitleFor(navProfile)}
      />
      <QuickMenu profile={navProfile} />
      {navProfile === "motorista" ? (
        <MotoristaTurno motoristaId={profile?.motorista_id ?? undefined} />
      ) : navProfile === "admin" ? (
        <AdminTurno showMoney={canViewValoresCaixa} />
      ) : (
        <OperadorTurno />
      )}
    </div>
  );
}

function subtitleFor(p: NavProfile): string {
  switch (p) {
    case "admin":
      return "Pendências por ação — toque para resolver";
    case "motorista":
      return "Sua rota e próximas lojas de hoje";
    default:
      return "Pendências do turno — sem painel de valores";
  }
}

function QuickMenu({ profile }: { profile: NavProfile }) {
  const items = PROFILE_PRIMARY[profile].filter((i) => i.to !== "/" || i.id === "adm-ops");
  // show distinct destinations only
  const seen = new Set<string>();
  const unique = items.filter((i) => {
    const key = `${i.to}:${i.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {unique.map((it) => {
        const Icon = it.icon;
        return (
          <Link
            key={it.id}
            to={it.to}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-navy hover:bg-secondary touch-target"
          >
            <Icon size={14} />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

function PendencyGrid({ cards }: { cards: PendencyCard[] }) {
  const visible = cards.filter((c) => c.count > 0);
  if (visible.length === 0) {
    return (
      <div className="card-base p-6 text-center">
        <CheckCircle2 className="mx-auto mb-2 text-muted-foreground" size={28} />
        <p className="text-sm font-semibold text-navy">Nada pendente no momento</p>
        <p className="text-xs text-muted-foreground mt-1">Quando houver movimento, os cartões aparecem aqui.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
      {visible.map((c) => {
        const Icon = c.icon;
        return (
          <Link
            key={c.id}
            to={c.to}
            className="card-base p-4 md:p-5 flex items-start gap-3 md:gap-4 hover:bg-secondary/50 active:bg-secondary/70 transition-colors touch-target min-h-[4.5rem]"
          >
            <div
              className="h-11 w-11 shrink-0 rounded-lg flex items-center justify-center"
              style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}
            >
              <Icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-navy">{c.title}</div>
                <span className="chip chip-warn tabular-nums">{c.count}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.desc}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function OperadorTurno() {
  const hoje = todayBRT();
  const { data: pedidos = [], isLoading: l1 } = usePedidosDia(hoje);
  const { data: ordens = [], isLoading: l2 } = useOrdensExpedicao({
    data: hoje,
    status: ["importada", "conferida"],
  });
  const { data: contagens = [], isLoading: l3 } = usePosicoesPendentes();
  const { data: quebras = [], isLoading: l4 } = useQuebras({ from: hoje, to: hoje });

  if (l1 || l2 || l3 || l4) {
    return <p className="text-sm text-muted-foreground py-8">Carregando seu turno…</p>;
  }

  const chegadas = pedidos.filter((p: { status: string }) =>
    ["pendente", "parcial", "em_transito", "aguardando_liberacao"].includes(p.status),
  ).length;

  const cards: PendencyCard[] = [
    {
      id: "chegadas",
      title: "Chegadas para conferir",
      desc: "Receber e conferir pedidos do dia",
      count: chegadas,
      to: "/recebimento/conferir",
      icon: PackageCheck,
    },
    {
      id: "separar",
      title: "Ordens para separar",
      desc: "Importadas ou conferidas aguardando separação",
      count: ordens.length,
      to: "/expedicao",
      icon: Truck,
    },
    {
      id: "contagens",
      title: "Contagens pendentes",
      desc: "Posições sem contagem na semana",
      count: contagens.length,
      to: "/caixas/inventario",
      icon: Warehouse,
    },
    {
      id: "quebras",
      title: "Ocorrências do turno",
      desc: "Quebras e faltas de qualidade de hoje",
      count: quebras.length,
      to: "/quebra",
      icon: AlertTriangle,
    },
  ];

  return <PendencyGrid cards={cards} />;
}

function MotoristaTurno({ motoristaId }: { motoristaId?: string }) {
  const { data: paradas = [], isLoading } = useParadasMotoristaDia(motoristaId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8">Carregando sua rota…</p>;
  }

  const pendentes = paradas.filter(
    (p) => p.carga_status !== "concluida" && !p.hora_fim,
  );
  const proximas = pendentes.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link to="/expedicao/saida" search={{ cargaId: undefined, clienteId: undefined }} className="card-base p-4 hover:bg-secondary/50 touch-target">
          <div className="text-xs text-muted-foreground">Menu</div>
          <div className="text-sm font-bold text-navy flex items-center gap-2 mt-1">
            <Truck size={16} /> Saída
          </div>
        </Link>
        <Link to="/expedicao/entrega" search={{ cargaId: undefined }} className="card-base p-4 hover:bg-secondary/50 touch-target">
          <div className="text-xs text-muted-foreground">Menu</div>
          <div className="text-sm font-bold text-navy flex items-center gap-2 mt-1">
            <CheckCircle2 size={16} /> Entrega
          </div>
        </Link>
        <Link to="/caixas/movimentacao" className="card-base p-4 hover:bg-secondary/50 touch-target">
          <div className="text-xs text-muted-foreground">Menu</div>
          <div className="text-sm font-bold text-navy flex items-center gap-2 mt-1">
            <ArrowLeftRight size={16} /> Vazias
          </div>
        </Link>
      </div>

      {!motoristaId && (
        <p className="text-sm text-muted-foreground">
          Conta sem motorista vinculado no login — peça ao admin para associar.
        </p>
      )}

      {proximas.length === 0 ? (
        <div className="card-base p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 text-muted-foreground" size={28} />
          <p className="text-sm font-semibold text-navy">Nenhuma loja na rota agora</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-navy">Próximas lojas</h3>
          {proximas.map((p) => (
            <Link
              key={`${p.carga_id}-${p.cliente_id}`}
              to="/expedicao/entrega"
              search={{ cargaId: p.carga_id }}
              className="card-base p-4 flex items-center justify-between hover:bg-secondary/50 touch-target"
            >
              <div>
                <div className="text-sm font-bold text-navy">{p.cliente}</div>
                <div className="text-xs text-muted-foreground">
                  Carga {p.carga_codigo}
                  {p.rota ? ` · ${p.rota}` : ""}
                </div>
              </div>
              <ClipboardCheck size={16} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminTurno({ showMoney }: { showMoney: boolean }) {
  const { data: alertas = [], isLoading: lAlertas } = useAlertas(true);
  const { data: dash, isLoading: lDash } = useDashboard();
  const { data: pendVinculo = [] } = usePendenciasVinculo();
  const { data: valesCount = 0 } = useContarValesPendentes();
  const { data: invEmb } = useStatusInventarioEmbalagem();
  const { data: contagens = [] } = usePosicoesPendentes();

  if (lAlertas || lDash) {
    return <p className="text-sm text-muted-foreground py-8">Carregando pendências…</p>;
  }

  const cards: PendencyCard[] = [
    {
      id: "vinculos",
      title: "Vínculos pendentes",
      desc: "Aliases e cadastros a resolver",
      count: Array.isArray(pendVinculo) ? pendVinculo.length : Number(dash?.pendenciasVinculo ?? 0),
      to: "/gestao",
      icon: Settings,
    },
    {
      id: "divergencias",
      title: "Divergências hoje",
      desc: "Conferências fora da tolerância",
      count: dash?.divergenciasDia?.todas ?? 0,
      to: "/recebimento",
      icon: AlertCircle,
    },
    {
      id: "vales",
      title: "Vales pendentes",
      desc: "Solicitações aguardando ação",
      count: typeof valesCount === "number" ? valesCount : 0,
      to: "/recebimento/vales",
      icon: ClipboardCheck,
    },
    {
      id: "contagens",
      title: "Contagens de caixas",
      desc: "Posições pendentes na semana",
      count: contagens.length,
      to: "/caixas/inventario",
      icon: Warehouse,
    },
    {
      id: "embalagens",
      title: "Inventário de embalagens",
      desc: invEmb?.pendente ? "Pendente ou atrasado" : "Em dia",
      count: invEmb?.pendente ? 1 : 0,
      to: "/embalagens/inventario",
      icon: Box,
    },
  ];

  const alertaCards: PendencyCard[] = (alertas ?? [])
    .filter((a) => showMoney || !/R\$|capital|custo|perda/i.test(`${a.title} ${a.desc}`))
    .slice(0, 6)
    .map((a, i) => ({
      id: `alerta-${i}`,
      title: a.title,
      desc: a.desc,
      count: 1,
      to: a.href || "/",
      icon: a.tone === "danger" ? AlertCircle : AlertTriangle,
    }));

  return (
    <div className="space-y-6">
      <section id="pendencias">
        <h3 className="text-sm font-bold text-navy mb-3">Pendências</h3>
        <PendencyGrid cards={cards} />
      </section>

      {alertaCards.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-navy mb-3">Alertas</h3>
          <PendencyGrid cards={alertaCards} />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Link to="/indicadores" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
          <Activity size={14} /> Indicadores
        </Link>
        <Link to="/gestao" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
          <Settings size={14} /> Cadastros
        </Link>
        <Link to="/gestao/usuarios" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
          <UserPlus size={14} /> Usuários
        </Link>
        <Link to="/receber" className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
          <LayoutDashboard size={14} /> Operação
        </Link>
      </div>
    </div>
  );
}
