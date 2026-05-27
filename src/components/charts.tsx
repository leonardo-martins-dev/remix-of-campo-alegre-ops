// Lightweight inline SVG charts — no chart library to keep it crisp.

export function Sparkline({ data, color = "#12C2A0", width = 80, height = 22 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1 || 1);
  const pts = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline fill="none" stroke={color} strokeWidth="1.6" points={pts} />
    </svg>
  );
}

export function Donut({ segments, size = 160, thickness = 18, center }: { segments: { label: string; value: number; color: string }[]; size?: number; thickness?: number; center?: { label: string; value: string } }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EFF2F5" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
              stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
              strokeLinecap="butt" />
          );
          offset += len;
          return el;
        })}
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-bold text-navy">{center.value}</div>
          <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{center.label}</div>
        </div>
      )}
    </div>
  );
}

export function BarRow({ label, value, max, color = "#12C2A0", suffix }: { label: string; value: number; max: number; color?: string; suffix?: string }) {
  const pct = Math.min(100, (value / (max || 1)) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-ink">
        <span>{label}</span>
        <span className="font-semibold text-navy">{value}{suffix}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function ProgressRing({ value, size = 140, thickness = 12, label }: { value: number; size?: number; thickness?: number; label?: string }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EFF2F5" strokeWidth={thickness} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--primary)" strokeWidth={thickness}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-bold text-navy">{value}%</div>
        {label && <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>}
      </div>
    </div>
  );
}
