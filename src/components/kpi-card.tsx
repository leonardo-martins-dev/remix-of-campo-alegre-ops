import { Sparkline } from "./charts";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: number; // percent
  deltaSuffix?: string;
  spark?: number[];
  positiveIsGood?: boolean;
  accent?: string;
}

export function KpiCard({ label, value, icon: Icon, delta, deltaSuffix = "%", spark, positiveIsGood = true, accent = "var(--primary)" }: Props) {
  const showDelta = typeof delta === "number";
  const up = (delta ?? 0) >= 0;
  const good = positiveIsGood ? up : !up;
  const color = good ? "var(--success)" : "var(--danger)";
  return (
    <div className="card-base p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: "var(--primary-soft)", color: accent }}>
          <Icon size={16} />
        </span>
      </div>
      <div className="text-3xl font-bold text-navy leading-none">{value}</div>
      <div className="flex items-center justify-between mt-1">
        {showDelta ? (
          <span className="text-xs font-semibold inline-flex items-center gap-1" style={{ color }}>
            {up ? <ArrowUp size={12}/> : <ArrowDown size={12}/>}
            {Math.abs(delta!).toFixed(1)}{deltaSuffix}
          </span>
        ) : <span />}
        {spark && <Sparkline data={spark} color={color}/>}
      </div>
    </div>
  );
}
