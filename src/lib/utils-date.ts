import { formatInTimeZone } from "date-fns-tz";

export const TZ_BRASILIA = "America/Sao_Paulo";

/** Data de hoje no fuso de Brasília (YYYY-MM-DD) */
export function todayBRT(): string {
  return formatInTimeZone(new Date(), TZ_BRASILIA, "yyyy-MM-dd");
}

/** @deprecated Use todayBRT() */
export function todayISO(): string {
  return todayBRT();
}

export function formatTime(iso: string | null | undefined): string {
  return formatTimeBRT(iso);
}

export function formatTimeBRT(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatInTimeZone(new Date(iso), TZ_BRASILIA, "HH:mm");
}

export function formatDateBRT(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatInTimeZone(new Date(iso), TZ_BRASILIA, "dd/MM/yyyy");
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function dateRangeBRT(period: "today" | "week" | "month"): { from: string; to: string } {
  const to = todayBRT();
  const now = new Date();
  if (period === "today") return { from: to, to };
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { from: formatInTimeZone(d, TZ_BRASILIA, "yyyy-MM-dd"), to };
  }
  const d = new Date(now);
  d.setDate(d.getDate() - 30);
  return { from: formatInTimeZone(d, TZ_BRASILIA, "yyyy-MM-dd"), to };
}

export function formatDurationMinutes(min: number | null | undefined): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
