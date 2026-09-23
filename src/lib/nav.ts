import type { LucideIcon } from "lucide-react";
import {
  PackageCheck,
  Truck,
  Box,
  Package,
  ClipboardCheck,
  CheckCircle2,
  Clock,
  ArrowLeftRight,
  Warehouse,
  Settings,
  Activity,
  UserPlus,
  AlertTriangle,
  LayoutDashboard,
  Route,
  PackageOpen,
} from "lucide-react";
import type { Profile } from "./supabase";
import type { ViewMode } from "./roles";

export type NavProfile = "admin" | "operador" | "motorista" | "fornecedor";

export type NavLink = {
  id: string;
  label: string;
  to: string;
  slug?: string;
  icon: LucideIcon;
  desc?: string;
};

export type OpsHub = {
  id: string;
  label: string;
  to: string;
  slug: string;
  icon: LucideIcon;
  desc: string;
  children: NavLink[];
  primaryCta?: NavLink;
};

/** TV e rastreio ficam fora do menu; rotas continuam acessíveis. */
export const SIDEBAR_HIDDEN_SLUGS = new Set([
  "expedicao/tv",
  "expedicao/rastreio",
  "dashboard",
]);

export const OPS_HUBS: OpsHub[] = [
  {
    id: "receber",
    label: "Receber",
    to: "/receber",
    slug: "receber",
    icon: PackageCheck,
    desc: "Chegadas, conferência e pedidos do dia",
    children: [
      {
        id: "aguardar",
        label: "Aguardando",
        to: "/recebimento",
        slug: "recebimento",
        icon: Clock,
        desc: "Pedidos aguardando chegada",
      },
      {
        id: "conferencia",
        label: "Em conferência",
        to: "/recebimento/conferir",
        slug: "recebimento/conferir",
        icon: ClipboardCheck,
        desc: "Conferir carga e gerar vale",
      },
      {
        id: "concluidos",
        label: "Concluídos",
        to: "/recebimento",
        slug: "recebimento",
        icon: CheckCircle2,
        desc: "Recebimentos finalizados",
      },
    ],
    primaryCta: {
      id: "iniciar-chegada",
      label: "Iniciar chegada",
      to: "/recebimento/conferir",
      slug: "recebimento/conferir",
      icon: PackageCheck,
    },
  },
  {
    id: "expedir",
    label: "Expedir",
    to: "/expedir",
    slug: "expedir",
    icon: Truck,
    desc: "Ordens, separação, cargas e entregas",
    children: [
      {
        id: "ordens",
        label: "Ordens",
        to: "/expedicao",
        slug: "expedicao",
        icon: ClipboardCheck,
        desc: "Painel de ordens do dia",
      },
      {
        id: "separacao",
        label: "Separação",
        to: "/expedicao",
        slug: "expedicao",
        icon: PackageOpen,
        desc: "Separar e conferir carga",
      },
      {
        id: "cargas",
        label: "Cargas",
        to: "/expedicao",
        slug: "expedicao",
        icon: Truck,
        desc: "Cargas em andamento",
      },
      {
        id: "minha-rota",
        label: "Minha rota",
        to: "/expedicao/minha-rota",
        slug: "expedicao/minha-rota",
        icon: Route,
        desc: "Rota do dia com entrega e vazias",
      },
      {
        id: "entregas",
        label: "Entregas",
        to: "/expedicao/entrega",
        slug: "expedicao/entrega",
        icon: CheckCircle2,
        desc: "Confirmar entrega nas lojas",
      },
    ],
  },
  {
    id: "caixas",
    label: "Caixas",
    to: "/caixas",
    slug: "caixas",
    icon: Box,
    desc: "Saldos, movimentação e contagem",
    children: [
      {
        id: "saldos",
        label: "Saldos",
        to: "/caixas/saldo",
        slug: "caixas/saldo",
        icon: Box,
        desc: "Saldo por cliente e posição",
      },
      {
        id: "movimentar",
        label: "Movimentar",
        to: "/caixas/movimentacao",
        slug: "caixas/movimentacao",
        icon: ArrowLeftRight,
        desc: "Entrada, saída e transferência",
      },
      {
        id: "contar",
        label: "Contar",
        to: "/caixas/inventario",
        slug: "caixas/inventario",
        icon: Warehouse,
        desc: "Inventário e contagem",
      },
    ],
  },
  {
    id: "embalagens",
    label: "Embalagens",
    to: "/embalagens",
    slug: "embalagens",
    icon: Package,
    desc: "Saldo, contagem e histórico",
    children: [
      {
        id: "saldo-emb",
        label: "Saldo",
        to: "/embalagens/saldo",
        slug: "embalagens/saldo",
        icon: Package,
        desc: "Saldo de embalagens",
      },
      {
        id: "contagem-emb",
        label: "Contagem",
        to: "/embalagens/inventario",
        slug: "embalagens/inventario",
        icon: ClipboardCheck,
        desc: "Inventário semanal",
      },
      {
        id: "historico-emb",
        label: "Histórico",
        to: "/embalagens/saldo",
        slug: "embalagens/saldo",
        icon: Activity,
        desc: "Movimentos recentes",
      },
    ],
  },
];

export const GESTAO_LINKS: NavLink[] = [
  {
    id: "cadastros",
    label: "Cadastros",
    to: "/gestao",
    slug: "gestao",
    icon: Settings,
    desc: "Fornecedores, clientes, produtos",
  },
  {
    id: "parametros",
    label: "Parâmetros",
    to: "/gestao/regras",
    slug: "gestao/regras",
    icon: Settings,
    desc: "Tolerâncias e regras do galpão",
  },
  {
    id: "indicadores",
    label: "Indicadores",
    to: "/indicadores",
    slug: "indicadores",
    icon: Activity,
    desc: "Tempos e ciclo",
  },
  {
    id: "usuarios",
    label: "Usuários",
    to: "/gestao/usuarios",
    slug: "gestao/usuarios",
    icon: UserPlus,
    desc: "Contas e permissões",
  },
];

/** Atalhos primários por perfil (sidebar). */
export const PROFILE_PRIMARY: Record<NavProfile, NavLink[]> = {
  operador: [
    { id: "op-receber", label: "Receber", to: "/receber", slug: "receber", icon: PackageCheck },
    { id: "op-separar", label: "Separar", to: "/expedicao", slug: "expedicao", icon: Truck },
    { id: "op-caixas", label: "Caixas", to: "/caixas", slug: "caixas", icon: Box },
    { id: "op-quebras", label: "Quebras", to: "/quebra", slug: "quebra", icon: AlertTriangle },
  ],
  motorista: [
    { id: "mot-rota", label: "Minha rota", to: "/expedicao/minha-rota", slug: "expedicao/minha-rota", icon: Route },
    { id: "mot-saida", label: "Saída", to: "/expedicao/saida", slug: "expedicao/saida", icon: Truck },
    { id: "mot-entrega", label: "Entrega", to: "/expedicao/entrega", slug: "expedicao/entrega", icon: CheckCircle2 },
  ],
  fornecedor: [
    { id: "for-pedidos", label: "Pedidos", to: "/fornecedor", slug: "fornecedor", icon: PackageCheck },
    {
      id: "for-roca",
      label: "Saída na roça",
      to: "/recebimento/saida-roca",
      slug: "recebimento/saida-roca",
      icon: Route,
    },
    {
      id: "for-mov",
      label: "Movimentos",
      to: "/fornecedor",
      slug: "fornecedor",
      icon: ArrowLeftRight,
    },
  ],
  admin: [
    { id: "adm-ops", label: "Operação", to: "/receber", slug: "receber", icon: LayoutDashboard },
    { id: "adm-pend", label: "Pendências", to: "/", slug: "dashboard", icon: AlertTriangle },
    { id: "adm-ind", label: "Indicadores", to: "/indicadores", slug: "indicadores", icon: Activity },
    { id: "adm-cad", label: "Cadastros", to: "/gestao", slug: "gestao", icon: Settings },
    { id: "adm-usr", label: "Usuários", to: "/gestao/usuarios", slug: "gestao/usuarios", icon: UserPlus },
  ],
};

export function resolveNavProfile(
  profile: Profile | null,
  isAdmin: boolean,
  viewMode: ViewMode = "admin",
): NavProfile {
  if (profile?.role === "fornecedor") return "fornecedor";
  if (isAdmin) return viewMode === "operador" ? "operador" : "admin";
  if (profile?.motorista_id) return "motorista";
  return "operador";
}

export function hubChildSlugs(hub: OpsHub): string[] {
  const slugs = hub.children.map((c) => c.slug).filter(Boolean) as string[];
  if (hub.primaryCta?.slug) slugs.push(hub.primaryCta.slug);
  return [...new Set(slugs)];
}

export function isHubAccessible(
  hub: OpsHub,
  hasPageAccess: (slug: string) => boolean,
): boolean {
  if (hasPageAccess(hub.slug)) return true;
  return hubChildSlugs(hub).some((s) => hasPageAccess(s));
}

export function filterAccessibleLinks(
  links: NavLink[],
  hasPageAccess: (slug: string) => boolean,
  opts?: { adminOnlySlugs?: string[]; isAdmin?: boolean },
): NavLink[] {
  return links.filter((l) => {
    if (!l.slug) return true;
    if (opts?.adminOnlySlugs?.includes(l.slug) && !opts.isAdmin) return false;
    if (l.slug === hubSlugOnly(l.slug)) {
      const hub = OPS_HUBS.find((h) => h.slug === l.slug);
      if (hub) return isHubAccessible(hub, hasPageAccess);
    }
    return hasPageAccess(l.slug);
  });
}

function hubSlugOnly(slug: string): string {
  return slug;
}

export function accessibleHubChildren(
  hub: OpsHub,
  hasPageAccess: (slug: string) => boolean,
): NavLink[] {
  return hub.children.filter((c) => !c.slug || hasPageAccess(c.slug));
}

/** Slugs cobertos pela nav estruturada (não duplicar em "Mais telas"). */
export function structuredNavSlugs(profile: NavProfile): Set<string> {
  const set = new Set<string>(SIDEBAR_HIDDEN_SLUGS);
  for (const hub of OPS_HUBS) {
    set.add(hub.slug);
    for (const s of hubChildSlugs(hub)) set.add(s);
  }
  for (const l of GESTAO_LINKS) if (l.slug) set.add(l.slug);
  for (const l of PROFILE_PRIMARY[profile]) if (l.slug) set.add(l.slug);
  set.add("gestao/fornecedores");
  set.add("gestao/clientes");
  set.add("gestao/produtos");
  set.add("gestao/conversao");
  set.add("gestao/tipos-caixa");
  set.add("gestao/tipos-embalagem");
  set.add("gestao/rotas");
  set.add("gestao/frota");
  set.add("gestao/regras");
  return set;
}
