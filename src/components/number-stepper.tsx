import { useState, useEffect, useRef, type KeyboardEvent, type Ref } from "react";
import { Plus, Minus } from "lucide-react";

interface Props {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
  size?: "sm" | "md";
  width?: string;
  inputMode?: "numeric" | "decimal" | "text";
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
}

/**
 * Stepper numérico. Enquanto o campo está focado, permite string vazia sem
 * disparar onChange(0) — evita zerar qty/caixas no meio da digitação.
 */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  step = 1,
  size = "md",
  width,
  inputMode,
  onKeyDown,
  inputRef,
  autoFocus,
}: Props) {
  const h = size === "sm" ? "h-9 w-9 lg:h-6 lg:w-6" : "h-11 w-11 lg:h-7 lg:w-7";
  const ic = size === "sm" ? 14 : 16;
  const icSm = size === "sm" ? 11 : 12;
  const w = width ?? (size === "sm" ? "w-14 lg:w-10" : "w-16 lg:w-12");
  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(min, n) : min);

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);

  const commitDraft = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") {
      if (value !== min) onChange(min);
      setDraft(String(min));
      return;
    }
    const n = clamp(parseFloat(trimmed.replace(",", ".")));
    if (n !== value) onChange(n);
    setDraft(String(n));
  };

  return (
    <div className="inline-flex items-center justify-center gap-1 sm:gap-1.5">
      <button
        type="button"
        aria-label="Diminuir"
        onClick={() => {
          const next = clamp(value - step);
          onChange(next);
          setDraft(String(next));
        }}
        className={`${h} rounded-lg lg:rounded-md border border-border hover:bg-secondary active:bg-secondary/80 flex items-center justify-center text-navy transition-colors`}
      >
        <Minus size={ic} className="lg:hidden" />
        <Minus size={icSm} className="hidden lg:block" />
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode={inputMode ?? "numeric"}
        autoFocus={autoFocus}
        value={focused ? draft : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          // Só dígitos, vírgula/ponto e sinal — evita lixo no meio da digitação.
          if (raw !== "" && !/^-?\d*[.,]?\d*$/.test(raw)) return;
          setDraft(raw);
          if (raw.trim() === "" || raw === "-" || raw === "." || raw === "-.") return;
          const n = parseFloat(raw.replace(",", "."));
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        onFocus={(e) => {
          focusedRef.current = true;
          setFocused(true);
          setDraft(String(value));
          e.currentTarget.select();
        }}
        onBlur={() => {
          focusedRef.current = false;
          setFocused(false);
          commitDraft(draft);
        }}
        onKeyDown={onKeyDown}
        className={`${w} text-center font-bold text-navy bg-transparent border border-transparent rounded focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 px-1 ${size === "sm" ? "text-sm h-9 lg:text-xs lg:h-6" : "text-base h-11 lg:text-sm lg:h-7"}`}
      />
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => {
          const next = clamp(value + step);
          onChange(next);
          setDraft(String(next));
        }}
        className={`${h} rounded-lg lg:rounded-md border border-border hover:bg-secondary active:bg-secondary/80 flex items-center justify-center text-navy transition-colors`}
      >
        <Plus size={ic} className="lg:hidden" />
        <Plus size={icSm} className="hidden lg:block" />
      </button>
    </div>
  );
}
