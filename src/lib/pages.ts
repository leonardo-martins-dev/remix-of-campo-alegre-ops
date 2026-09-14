import {
  LayoutDashboard,
  PackageCheck,
  AlertTriangle,
  Truck,
  Tv,
  Box,
  PiggyBank,
  RotateCcw,
  Activity,
  Settings,
  UserPlus,
  Warehouse,
  Handshake,
  Shield,
  PackageCheck as ConferirIcon,
  Route,
  DollarSign,
  Receipt,
  Store,
  Package,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";

export const SLUG_TO_PATH: Record<string, string> = {
  dashboard: "/",
  recebimento: "/recebimento",
  "recebimento/conferir": "/recebimento/conferir",
  "recebimento/faltas": "/recebimento/faltas",
  "recebimento/vales": "/recebimento/vales",
  "recebimento/liberacoes": "/recebimento/liberacoes",
  expedicao: "/expedicao",
  "expedicao/tv": "/expedicao/tv",
  "expedicao/rotas": "/expedicao/rotas",
  "caixas/saldo": "/caixas/saldo",
  "caixas/economia": "/caixas/economia",
  "caixas/movimentacao": "/caixas/movimentacao",
  "caixas/retorno": "/caixas/movimentacao",
  "caixas/motorista": "/caixas/movimentacao",
  "caixas/galpao": "/caixas/galpao",
  "caixas/inventario": "/caixas/inventario",
  "caixas/fornecedor": "/caixas/movimentacao",
  "quebra/lancar": "/quebra/lancar",
  quebra: "/quebra",
  fornecedores: "/fornecedores",
  fornecedor: "/fornecedor",
  indicadores: "/indicadores",
  gestao: "/gestao",
  "gestao/usuarios": "/gestao/usuarios",
  "gestao/fornecedores": "/gestao/fornecedores",
  "gestao/clientes": "/gestao/clientes",
  "gestao/produtos": "/gestao/produtos",
  "gestao/conversao": "/gestao/conversao",
  "gestao/tipos-caixa": "/gestao/tipos-caixa",
  "gestao/rotas": "/gestao/rotas",
  "gestao/frota": "/gestao/frota",
  "gestao/regras": "/gestao/regras",
  "relatorios/custos": "/relatorios/custos",
};

export const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  PackageCheck,
  AlertTriangle,
  Truck,
  Monitor: Tv,
  Tv,
  Box,
  TrendingDown: PiggyBank,
  PiggyBank,
  RotateCcw,
  Clock: Activity,
  Activity,
  Settings,
  UserPlus,
  Warehouse,
  Handshake,
  Shield,
  PackageCheckConferir: ConferirIcon,
  Route,
  DollarSign,
  Receipt,
  Store,
  Package,
  ArrowLeftRight,
};

export function pathnameToSlug(pathname: string): string {
  if (pathname === "/" || pathname === "") return "dashboard";
  return pathname.replace(/^\//, "");
}

export function slugToPath(slug: string): string {
  return SLUG_TO_PATH[slug] ?? `/${slug}`;
}

export function getIcon(name: string | null): LucideIcon {
  if (!name) return LayoutDashboard;
  return ICON_MAP[name] ?? LayoutDashboard;
}
