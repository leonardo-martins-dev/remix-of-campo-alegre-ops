import { useState, useEffect, useRef, type KeyboardEvent, type Ref } from "react";
import { Plus, Minus } from "lucide-react";

interface BaseProps {
  min?: number;
  step?: number;
  /** `touch` = alvo grande que não encolhe no lg (telas de campo em tablet) */
  size?: "sm" | "md" | "touch";
  width?: string;
  inputMode?: "numeric" | "decimal" | "text";
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  /** Texto do campo vazio — só aparece no modo `nullable`. */
  placeholder?: string;
}

type Props =
  | (BaseProps & {
      /** NOP-322: campo em branco = "não informado"; zero só quando digitado. */
      nullable: true;
      value: number | null;
      onChange: (n: number | null) => void;
    })
  | (BaseProps & {
      nullable?: false;
      value: number;
      onChange: (n: number) => void;
    });

/**
 * Stepper numérico. Enquanto o campo está focado, permite string vazia sem
 * disparar onChange(0) — evita zerar qty/caixas no meio da digitação.
 *
 * Com `nullable`, o campo vazio vale "não informado" (`null`) em vez de `min`:
 * o + parte de `step` (nunca zero) e o − no mínimo volta para "não informado".
 */
export function NumberStepper(props: Props) {
  const {
    min = 0,
    step = 1,
    size = "md",
    width,
    inputMode,
    onKeyDown,
    inputRef,
    autoFocus,
  } = props;
  const nullable = props.nullable === true;
  const value: number | null = props.value;
  const placeholder = props.placeholder ?? (nullable ? "não informado" : undefined);
  // O union garante que só chamamos com null quando nullable.
  const onChange = props.onChange as (n: number | null) => void;

  const h =
    size === "sm"
      ? "h-9 w-9 lg:h-6 lg:w-6"
      : size === "touch"
        ? "h-12 w-12"
        : "h-11 w-11 lg:h-7 lg:w-7";
  const ic = size === "sm" ? 14 : size === "touch" ? 20 : 16;
  const icSm = size === "sm" ? 11 : size === "touch" ? 20 : 12;
  const w = width ?? (size === "sm" ? "w-14 lg:w-10" : size === "touch" ? "w-16" : "w-16 lg:w-12");
  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(min, n) : min);
  const texto = (n: number | null) => (n == null ? "" : String(n));

  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(texto(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setDraft(texto(value));
  }, [value]);

  const vazio = (raw: string) => {
    const t = raw.trim();
    return t === "" || t === "-" || t === "." || t === "-.";
  };

  const commitDraft = (raw: string) => {
    if (vazio(raw)) {
      if (nullable) {
        if (value !== null) onChange(null);
        setDraft("");
        return;
      }
      if (value !== min) onChange(min);
      setDraft(String(min));
      return;
    }
    const n = clamp(parseFloat(raw.trim().replace(",", ".")));
    if (n !== value) onChange(n);
    setDraft(String(n));
  };

  return (
    <div className="inline-flex items-center justify-center gap-1 sm:gap-1.5">
      <button
        type="button"
        aria-label="Diminuir"
        onClick={() => {
          if (value === null) return; // nada a diminuir em "não informado"
          const next = clamp(value - step);
          // No mínimo (normalmente 0), o − devolve o campo para "não informado".
          if (nullable && next === value) {
            onChange(null);
            setDraft("");
            return;
          }
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
        placeholder={placeholder}
        value={focused ? draft : texto(value)}
        onChange={(e) => {
          const raw = e.target.value;
          // Só dígitos, vírgula/ponto e sinal — evita lixo no meio da digitação.
          if (raw !== "" && !/^-?\d*[.,]?\d*$/.test(raw)) return;
          setDraft(raw);
          if (vazio(raw)) return;
          const n = parseFloat(raw.replace(",", "."));
          if (Number.isFinite(n)) onChange(clamp(n));
        }}
        onFocus={(e) => {
          focusedRef.current = true;
          setFocused(true);
          setDraft(texto(value));
          e.currentTarget.select();
        }}
        onBlur={() => {
          focusedRef.current = false;
          setFocused(false);
          commitDraft(draft);
        }}
        onKeyDown={onKeyDown}
        className={`${w} text-center font-bold text-navy bg-transparent border border-transparent rounded focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 px-1 placeholder:text-[10px] placeholder:font-normal placeholder:text-muted-foreground ${
          size === "sm"
            ? "text-sm h-9 lg:text-xs lg:h-6"
            : size === "touch"
              ? "text-lg h-12"
              : "text-base h-11 lg:text-sm lg:h-7"
        }`}
      />
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => {
          // Vindo de "não informado" o + vai para o step: zero só quando digitado.
          const next = value === null ? Math.max(min, step) : clamp(value + step);
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
