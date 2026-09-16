import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { usePendenciasVinculo } from "@/hooks/use-pedidos";
import {
  Handshake,
  Store,
  Package,
  ArrowLeftRight,
  Box,
  Route as RouteIcon,
  Truck,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/gestao")({
  component: Page,
  head: () => ({ meta: [{ title: "Cadastros · Campo Alegre" }] }),
});

type CadastroCard = {
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  badge?: number;
};

function Page() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChildRoute = pathname.startsWith("/gestao/") && pathname !== "/gestao";
  const { isAdmin } = useAuth();

  if (isChildRoute) {
    return <Outlet />;
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Cadastros" subtitle="Acesso restrito a administradores" />
        <p className="text-sm text-muted-foreground">Você não tem permissão para acessar esta área.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Cadastros" subtitle="Gerencie fornecedores, clientes, produtos e configurações do galpão" />
      <CadastrosHub />
    </div>
  );
}

function CadastrosHub() {
  const { data: pendencias = [] } = usePendenciasVinculo();
  const pendCount = (pendencias as unknown[]).length;

  const cards: CadastroCard[] = [
    {
      title: "Fornecedores",
      description: "Cadastro, aliases Wise, conversões e estoque mínimo",
      icon: Handshake,
      href: "/gestao/fornecedores",
      badge: pendCount > 0 ? pendCount : undefined,
    },
    {
      title: "Clientes",
      description: "Supermercados, CNPJs e nomes alternativos",
      icon: Store,
      href: "/gestao/clientes",
    },
    {
      title: "Produtos",
      description: "Catálogo Wise + fatores un/cx padrão (vinculado a Unidades por caixa)",
      icon: Package,
      href: "/gestao/produtos",
    },
    {
      title: "Unidades por caixa",
      description: "Fatores un/cx por produto, tipo de caixa e fornecedor — Conferir e Expedição",
      icon: ArrowLeftRight,
      href: "/gestao/conversao",
    },
    {
      title: "Tipos de caixa",
      description: "Sigla, nome, cor e custo unitário de cada tipo",
      icon: Box,
      href: "/gestao/tipos-caixa",
    },
    {
      title: "Rotas",
      description: "Rotas de expedição, dias, motorista e caminhão padrão",
      icon: RouteIcon,
      href: "/gestao/rotas",
    },
    {
      title: "Motoristas e caminhões",
      description: "Frota de entrega do galpão",
      icon: Truck,
      href: "/gestao/frota",
    },
    {
      title: "Regras do sistema",
      description: "Tolerâncias, motivos de ajuste e saldos de abertura",
      icon: Settings,
      href: "/gestao/regras",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c) => (
        <Link key={c.href} to={c.href} className="group focus-visible:outline-none">
          <Card className="h-full transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring cursor-pointer">
            <CardHeader className="flex flex-row items-start gap-3 space-y-0">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <c.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base flex items-center gap-2">
                  {c.title}
                  {c.badge != null && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-destructive-foreground">
                      {c.badge}
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="mt-1 text-xs">{c.description}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}
