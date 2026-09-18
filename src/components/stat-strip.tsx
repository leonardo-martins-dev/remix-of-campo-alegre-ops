export function StatStrip({ items }: { items: { label: string; value: string; tone?: "ok" | "warn" | "danger" | "info" }[] }) {
  const color = (t?: string) =>
    t === "ok" ? "var(--success)" : t === "warn" ? "var(--warning)" : t === "danger" ? "var(--danger)" : t === "info" ? "var(--info)" : "var(--navy)";
  return (
    <div className="card-base px-3 py-3 md:px-5 mb-5 grid grid-cols-2 md:grid-cols-2 lg:flex lg:flex-wrap lg:items-center gap-3 md:gap-4 lg:gap-x-10 lg:gap-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2 min-w-0">
          <span className="text-[10px] md:text-xs uppercase tracking-wider text-muted-foreground leading-tight">{it.label}</span>
          <span className="text-lg md:text-xl font-bold tabular-nums" style={{ color: color(it.tone) }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}
