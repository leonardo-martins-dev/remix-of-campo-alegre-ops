export function StatStrip({ items }: { items: { label: string; value: string; tone?: "ok" | "warn" | "danger" | "info" }[] }) {
  const color = (t?: string) =>
    t === "ok" ? "var(--success)" : t === "warn" ? "var(--warning)" : t === "danger" ? "var(--danger)" : t === "info" ? "var(--info)" : "var(--navy)";
  return (
    <div className="card-base px-5 py-3 flex flex-wrap items-center gap-x-10 gap-y-2 mb-5">
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">{it.label}</span>
          <span className="text-lg font-bold" style={{ color: color(it.tone) }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}
