import { Plus, Minus } from "lucide-react";

interface Props {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
  size?: "sm" | "md";
  width?: string;
}

export function NumberStepper({ value, onChange, min = 0, step = 1, size = "md", width }: Props) {
  const h = size === "sm" ? "h-6 w-6" : "h-7 w-7";
  const ic = size === "sm" ? 11 : 12;
  const w = width ?? (size === "sm" ? "w-10" : "w-12");
  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(min, n) : min);
  return (
    <div className="inline-flex items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        className={`${h} rounded-md border border-border hover:bg-secondary flex items-center justify-center text-navy`}
      >
        <Minus size={ic} />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
        onFocus={(e) => e.currentTarget.select()}
        className={`${w} text-center font-bold text-navy bg-transparent border border-transparent rounded focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 px-1 ${size === "sm" ? "text-xs h-6" : "text-sm h-7"} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        className={`${h} rounded-md border border-border hover:bg-secondary flex items-center justify-center text-navy`}
      >
        <Plus size={ic} />
      </button>
    </div>
  );
}
