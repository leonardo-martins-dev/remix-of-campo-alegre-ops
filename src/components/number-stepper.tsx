import { Plus, Minus } from "lucide-react";

interface Props {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
  size?: "sm" | "md";
  width?: string;
  inputMode?: "numeric" | "decimal" | "text";
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  autoFocus?: boolean;
}

export function NumberStepper({ value, onChange, min = 0, step = 1, size = "md", width, inputMode, onKeyDown, inputRef, autoFocus }: Props) {
  const h = size === "sm" ? "h-8 w-8 sm:h-6 sm:w-6" : "h-10 w-10 sm:h-7 sm:w-7";
  const ic = size === "sm" ? 14 : 16;
  const icSm = size === "sm" ? 11 : 12;
  const w = width ?? (size === "sm" ? "w-12 sm:w-10" : "w-14 sm:w-12");
  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(min, n) : min);
  return (
    <div className="inline-flex items-center justify-center gap-1 sm:gap-1.5">
      <button
        type="button"
        aria-label="Diminuir"
        onClick={() => onChange(clamp(value - step))}
        className={`${h} rounded-lg sm:rounded-md border border-border hover:bg-secondary active:bg-secondary/80 flex items-center justify-center text-navy transition-colors`}
      >
        <Minus size={ic} className="sm:hidden" />
        <Minus size={icSm} className="hidden sm:block" />
      </button>
      <input
        ref={inputRef}
        type="number"
        inputMode={inputMode ?? "numeric"}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value)))}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={onKeyDown}
        className={`${w} text-center font-bold text-navy bg-transparent border border-transparent rounded focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 px-1 ${size === "sm" ? "text-sm h-8 sm:text-xs sm:h-6" : "text-base h-10 sm:text-sm sm:h-7"} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
      />
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => onChange(clamp(value + step))}
        className={`${h} rounded-lg sm:rounded-md border border-border hover:bg-secondary active:bg-secondary/80 flex items-center justify-center text-navy transition-colors`}
      >
        <Plus size={ic} className="sm:hidden" />
        <Plus size={icSm} className="hidden sm:block" />
      </button>
    </div>
  );
}
