import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { NavLink, OpsHub } from "@/lib/nav";
import { accessibleHubChildren } from "@/lib/nav";
import { useAuth } from "@/lib/auth";

export function OpsHubPage({ hub }: { hub: OpsHub }) {
  const { hasPageAccess } = useAuth();
  const children = accessibleHubChildren(hub, hasPageAccess);
  const cta =
    hub.primaryCta && (!hub.primaryCta.slug || hasPageAccess(hub.primaryCta.slug))
      ? hub.primaryCta
      : null;

  return (
    <div>
      <PageHeader
        title={hub.label}
        subtitle={hub.desc}
        actions={
          cta ? (
            <Button asChild>
              <Link to={cta.to as "/recebimento/conferir"}>{cta.label}</Link>
            </Button>
          ) : undefined
        }
      />
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum destino disponível para o seu perfil.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {children.map((item) => (
            <HubCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function HubCard({ item }: { item: NavLink }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className="card-base p-4 md:p-5 flex items-start gap-3 md:gap-4 hover:bg-secondary/50 active:bg-secondary/70 transition-colors touch-target min-h-[4.5rem]"
    >
      <div
        className="h-11 w-11 shrink-0 rounded-lg flex items-center justify-center"
        style={{ background: "var(--primary-soft)", color: "var(--primary-dark)" }}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-navy">{item.label}</div>
        {item.desc && <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>}
      </div>
    </Link>
  );
}
