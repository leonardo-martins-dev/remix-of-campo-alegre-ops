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
  PackageCheck as ConferirIcon,
  type LucideIcon,
} from "lucide-react";

export const SLUG_TO_PATH: Record<string, string> = {
  dashboard: "/",
  recebimento: "/recebimento",
  "recebimento/conferir": "/recebimento/conferir",
  "recebimento/faltas": "/recebimento/faltas",
  expedicao: "/expedicao",
  "expedicao/tv": "/expedicao/tv",
  "caixas/saldo": "/caixas/saldo",
  "caixas/economia": "/caixas/economia",
  "caixas/retorno": "/caixas/retorno",
  indicadores: "/indicadores",
  gestao: "/gestao",
  "gestao/usuarios": "/gestao/usuarios",
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
  PackageCheckConferir: ConferirIcon,
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
