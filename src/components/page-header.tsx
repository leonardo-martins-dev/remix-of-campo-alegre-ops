import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6 mb-5 lg:mb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl md:text-2xl font-bold text-navy tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && (
        <div className="w-full min-w-0 lg:w-auto lg:max-w-[min(100%,42rem)] lg:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
