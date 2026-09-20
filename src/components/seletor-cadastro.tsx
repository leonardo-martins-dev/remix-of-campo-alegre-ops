import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Search, Sparkles, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { normalizeKey } from "@/lib/normalize";
import { formatDateBRT } from "@/lib/utils-date";
import {
  agruparPorLetra,
  corDoNome,
  filtrarItens,
  iniciaisDe,
  nomesDuplicados,
  prepararItens,
  SELETOR_LABEL,
  type SeletorItem,
  type SeletorTipo,
} from "@/lib/seletor-cadastro";
import {
  useItensCadastro,
  useProdutosDoFornecedor,
  useRecentesSeletor,
} from "@/hooks/use-seletor-cadastro";

export type { SeletorItem, SeletorTipo };

type Props = {
  tipo: SeletorTipo;
  value?: string | null;
  onChange?: (id: string, item: SeletorItem | null) => void;
  multiple?: boolean;
  values?: string[];
  onChangeMultiple?: (ids: string[], itens: SeletorItem[]) => void;
  /** ids que sobem para "Sugeridos" quando a busca está vazia */
  suggestedIds?: string[];
  /** contexto para priorizar produtos do fornecedor */
  fornecedorId?: string | null;
  /** lista própria (ex.: posições da movimentação) no lugar do cadastro */
  items?: SeletorItem[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  /** mostra a opção "Todos" que devolve id vazio (filtros) */
  allowClear?: boolean;
  clearLabel?: string;
};

/** Linha secundária por tipo de cadastro. */
function detalheDoItem(item: SeletorItem, tipo: SeletorTipo, duplicado: boolean): string | null {
  const partes: string[] = [];
  if (tipo === "produto") {
    if (item.codigo) partes.push(`Cód. ${item.codigo}`);
    if (item.meta?.unidade) partes.push(item.meta.unidade);
  } else if (tipo === "fornecedor") {
    if (item.codigo) partes.push(`Cód. ${item.codigo}`);
    if (item.cnpj) partes.push(item.cnpj);
    if (item.meta?.ultimaEntrega) {
      partes.push(`última entrega ${formatDateBRT(item.meta.ultimaEntrega)}`);
    }
  } else if (tipo === "cliente") {
    if (item.meta?.rota) partes.push(item.meta.rota);
    if (item.cnpj && (duplicado || partes.length === 0)) partes.push(item.cnpj);
  } else if (tipo === "caminhao") {
    if (item.meta?.rota) partes.push(item.meta.rota);
  } else if (tipo === "tipo_caixa") {
    if (item.meta?.sigla) partes.push(item.meta.sigla);
  }
  if (!partes.length && duplicado && item.codigo) partes.push(`Cód. ${item.codigo}`);
  return partes.length ? partes.join(" · ") : null;
}

function Avatar({ item, tipo }: { item: SeletorItem; tipo: SeletorTipo }) {
  if (tipo === "tipo_caixa") {
    return (
      <span
        className="h-9 w-9 shrink-0 rounded-lg border border-border"
        style={{ background: item.meta?.cor ?? "var(--secondary)" }}
        aria-hidden
      />
    );
  }
  if (tipo !== "fornecedor") return null;
  return (
    <span
      className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
      style={{ background: corDoNome(item.nome) }}
      aria-hidden
    >
      {iniciaisDe(item.nome)}
    </span>
  );
}

function Linha({
  item,
  tipo,
  duplicado,
  selecionado,
  ativo,
  multiple,
  onSelect,
  onHover,
}: {
  item: SeletorItem;
  tipo: SeletorTipo;
  duplicado: boolean;
  selecionado: boolean;
  ativo: boolean;
  multiple?: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const detalhe = detalheDoItem(item, tipo, duplicado);
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseMove={onHover}
      data-ativo={ativo ? "true" : undefined}
      className={cn(
        "w-full min-h-12 px-3 py-2 flex items-center gap-3 text-left rounded-lg transition-colors",
        ativo ? "bg-secondary" : "hover:bg-secondary/60",
        selecionado && "bg-primary-soft",
      )}
    >
      <Avatar item={item} tipo={tipo} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-navy truncate">{item.nome}</span>
        {detalhe && <span className="block text-xs text-muted-foreground truncate">{detalhe}</span>}
      </span>
      {tipo === "produto" && item.meta?.familia && (
        <span className="chip chip-muted shrink-0 hidden sm:inline-flex">{item.meta.familia}</span>
      )}
      {multiple ? (
        <span
          className={cn(
            "h-5 w-5 shrink-0 rounded border flex items-center justify-center",
            selecionado ? "bg-primary border-transparent text-primary-foreground" : "border-border",
          )}
        >
          {selecionado && <Check size={13} />}
        </span>
      ) : (
        selecionado && <Check size={16} className="shrink-0 text-primary" />
      )}
    </button>
  );
}

function Painel({
  tipo,
  itens,
  carregando,
  value,
  values,
  multiple,
  suggestedIds,
  fornecedorId,
  allowClear,
  clearLabel,
  onPick,
  onConfirmarMultiplos,
  onFechar,
}: {
  tipo: SeletorTipo;
  itens: SeletorItem[];
  carregando: boolean;
  value?: string | null;
  values: string[];
  multiple?: boolean;
  suggestedIds?: string[];
  fornecedorId?: string | null;
  allowClear?: boolean;
  clearLabel?: string;
  onPick: (item: SeletorItem) => void;
  onConfirmarMultiplos: (ids: string[]) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [familiaSel, setFamiliaSel] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [marcados, setMarcados] = useState<string[]>(values);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  const { recentes } = useRecentesSeletor(tipo);
  const produtosFornecedor = useProdutosDoFornecedor(
    tipo === "produto" && fornecedorId ? fornecedorId : null,
  );

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const duplicados = useMemo(() => nomesDuplicados(itens), [itens]);

  const familias = useMemo(() => {
    if (tipo !== "produto") return [];
    const m = new Map<string, string>();
    for (const i of itens) {
      if (i.meta?.familiaId && i.meta.familia) m.set(i.meta.familiaId, i.meta.familia);
    }
    return [...m.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [itens, tipo]);

  const base = useMemo(() => {
    if (tipo !== "produto" || !familiaSel) return itens;
    return itens.filter((i) => i.meta?.familiaId === familiaSel);
  }, [itens, tipo, familiaSel]);

  const idsFornecedor = produtosFornecedor.data;
  const priorizados = useMemo(() => {
    if (tipo !== "produto" || !fornecedorId || verTodos || !idsFornecedor?.length) return null;
    const doForn = base.filter((i) => idsFornecedor.includes(i.id));
    return doForn.length ? doForn : null;
  }, [tipo, fornecedorId, verTodos, idsFornecedor, base]);

  const resultados = useMemo(() => filtrarItens(base, busca), [base, busca]);

  const buscando = busca.trim().length > 0;

  const secoes = useMemo(() => {
    if (buscando) {
      return [{ titulo: null as string | null, icone: null as null, itens: resultados }];
    }
    const out: {
      titulo: string | null;
      icone: "recente" | "sugerido" | null;
      itens: SeletorItem[];
    }[] = [];
    const usados = new Set<string>();

    const recentesItens = recentes
      .map((id) => porId.get(id))
      .filter((i): i is SeletorItem => !!i && base.includes(i));
    if (recentesItens.length) {
      out.push({ titulo: "Recentes", icone: "recente", itens: recentesItens });
      recentesItens.forEach((i) => usados.add(i.id));
    }

    const sugeridosIds = priorizados
      ? priorizados.map((i) => i.id)
      : (suggestedIds ?? []).filter((id) => porId.has(id));
    const sugeridosItens = sugeridosIds
      .map((id) => porId.get(id))
      .filter((i): i is SeletorItem => !!i && base.includes(i) && !usados.has(i.id));
    if (sugeridosItens.length) {
      out.push({
        titulo: priorizados ? "Produtos deste fornecedor" : "Sugeridos pelo contexto",
        icone: "sugerido",
        itens: sugeridosItens,
      });
      sugeridosItens.forEach((i) => usados.add(i.id));
    }

    const restantes = base.filter((i) => !usados.has(i.id));
    for (const grupo of agruparPorLetra(restantes)) {
      out.push({ titulo: grupo.letra, icone: null, itens: grupo.itens });
    }
    return out;
  }, [buscando, resultados, recentes, porId, base, suggestedIds, priorizados]);

  const planos = useMemo(() => secoes.flatMap((s) => s.itens), [secoes]);

  useEffect(() => {
    setAtivo(0);
  }, [busca, familiaSel, verTodos]);

  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>('[data-ativo="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  const escolher = (item: SeletorItem) => {
    if (multiple) {
      setMarcados((prev) =>
        prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id],
      );
      return;
    }
    onPick(item);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => Math.min(planos.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const alvo = planos[ativo];
      if (alvo) escolher(alvo);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onFechar();
    }
  };

  let indice = -1;

  return (
    <div className="flex flex-1 flex-col min-h-0" onKeyDown={onKeyDown}>
      <div className="p-3 pb-2 border-b border-border">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={SELETOR_LABEL[tipo].placeholder}
            className="w-full h-11 pl-9 pr-9 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {busca && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setBusca("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {tipo === "produto" && familias.length > 1 && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setFamiliaSel(null)}
              className={cn(
                "px-2.5 min-h-8 rounded-full text-xs font-semibold whitespace-nowrap border",
                !familiaSel
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "border-border text-muted-foreground",
              )}
            >
              Todas
            </button>
            {familias.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFamiliaSel(familiaSel === f.id ? null : f.id)}
                className={cn(
                  "px-2.5 min-h-8 rounded-full text-xs font-semibold whitespace-nowrap border",
                  familiaSel === f.id
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "border-border text-muted-foreground",
                )}
              >
                {f.nome}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 mt-2 text-xs text-muted-foreground">
          <span>
            {carregando
              ? "Carregando…"
              : `${planos.length} ${planos.length === 1 ? "resultado" : "resultados"}`}
          </span>
          {tipo === "produto" && fornecedorId && !buscando && (
            <button
              type="button"
              onClick={() => setVerTodos((v) => !v)}
              className="font-semibold text-primary-dark hover:underline"
            >
              {verTodos ? "Priorizar do fornecedor" : "Ver todos"}
            </button>
          )}
        </div>
      </div>

      <div ref={listaRef} className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
        {allowClear && !buscando && (
          <button
            type="button"
            onClick={() => onPick({ id: "", nome: clearLabel ?? "Todos" })}
            className="w-full min-h-12 px-3 py-2 text-left rounded-lg hover:bg-secondary/60 text-sm font-semibold text-muted-foreground"
          >
            {clearLabel ?? `Todos · ${SELETOR_LABEL[tipo].plural}`}
          </button>
        )}

        {secoes.map((secao, si) => (
          <div key={`${secao.titulo ?? "res"}-${si}`}>
            {secao.titulo && (
              <div className="sticky top-0 z-10 bg-card/95 backdrop-blur px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                {secao.icone === "recente" && <Clock size={11} />}
                {secao.icone === "sugerido" && <Sparkles size={11} />}
                {secao.titulo}
              </div>
            )}
            {secao.itens.map((item) => {
              indice += 1;
              const idx = indice;
              return (
                <Linha
                  key={`${secao.titulo ?? "res"}-${item.id}`}
                  item={item}
                  tipo={tipo}
                  duplicado={duplicados.has(normalizeKey(item.nome))}
                  selecionado={multiple ? marcados.includes(item.id) : value === item.id}
                  ativo={idx === ativo}
                  multiple={multiple}
                  onSelect={() => escolher(item)}
                  onHover={() => setAtivo(idx)}
                />
              );
            })}
          </div>
        ))}

        {!carregando && planos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum resultado para “{busca}”.
          </p>
        )}
      </div>

      {multiple && (
        <div className="p-3 border-t border-border flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex-1">
            {marcados.length} selecionado(s)
          </span>
          <button
            type="button"
            onClick={() => setMarcados([])}
            className="min-h-10 px-3 rounded-lg border border-border text-sm font-semibold text-muted-foreground"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={() => onConfirmarMultiplos(marcados)}
            className="min-h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
          >
            Confirmar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Seletor único de cadastro (NOP-131): busca de verdade, recentes, sugestões de
 * contexto e lista A–Z. Bottom sheet no celular, painel flutuante no desktop.
 */
export function SeletorCadastro({
  tipo,
  value,
  onChange,
  multiple,
  values,
  onChangeMultiple,
  suggestedIds,
  fornecedorId,
  items,
  placeholder,
  label,
  disabled,
  className,
  allowClear,
  clearLabel,
}: Props) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { itens: itensCadastro, carregando } = useItensCadastro(tipo, !items);
  const { registrar } = useRecentesSeletor(tipo);

  const itensFinais = useMemo(
    () => (items ? prepararItens(items) : itensCadastro),
    [items, itensCadastro],
  );
  const selecionados = useMemo(
    () => (values ?? []).map((id) => itensFinais.find((i) => i.id === id)).filter(Boolean),
    [values, itensFinais],
  ) as SeletorItem[];
  const atual = value ? (itensFinais.find((i) => i.id === value) ?? null) : null;

  const escolher = (item: SeletorItem) => {
    if (item.id) registrar(item.id);
    onChange?.(item.id, item.id ? item : null);
    setOpen(false);
  };

  const confirmarMultiplos = (ids: string[]) => {
    ids.forEach((id) => registrar(id));
    onChangeMultiple?.(
      ids,
      ids.map((id) => itensFinais.find((i) => i.id === id)).filter(Boolean) as SeletorItem[],
    );
    setOpen(false);
  };

  const painel = (
    <Painel
      tipo={tipo}
      itens={itensFinais}
      carregando={carregando}
      value={value}
      values={values ?? []}
      multiple={multiple}
      suggestedIds={suggestedIds}
      fornecedorId={fornecedorId}
      allowClear={allowClear}
      clearLabel={clearLabel}
      onPick={escolher}
      onConfirmarMultiplos={confirmarMultiplos}
      onFechar={() => setOpen(false)}
    />
  );

  const textoBotao = multiple
    ? selecionados.length
      ? `${selecionados.length} ${SELETOR_LABEL[tipo].plural.toLowerCase()}`
      : (placeholder ?? `Selecionar ${SELETOR_LABEL[tipo].plural.toLowerCase()}…`)
    : (atual?.nome ??
      (value && !itensFinais.length ? "…" : (placeholder ?? `${SELETOR_LABEL[tipo].singular}…`)));

  const gatilho = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && setOpen(true)}
      className={cn(
        "w-full min-h-11 px-3 rounded-lg border border-border bg-card flex items-center gap-2 text-left text-sm disabled:opacity-50",
        className,
      )}
    >
      {atual && <Avatar item={atual} tipo={tipo} />}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate",
            atual || selecionados.length ? "font-semibold text-navy" : "text-muted-foreground",
          )}
        >
          {textoBotao}
        </span>
        {atual && detalheDoItem(atual, tipo, false) && (
          <span className="block text-xs text-muted-foreground truncate">
            {detalheDoItem(atual, tipo, false)}
          </span>
        )}
      </span>
      <ChevronDown size={16} className="shrink-0 text-muted-foreground" />
    </button>
  );

  return (
    <div className="w-full">
      {label && (
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          {label}
        </div>
      )}

      {isMobile ? (
        <>
          {gatilho}
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerContent className="max-h-[85vh]">
              <DrawerTitle className="px-4 pt-1 pb-2 text-base font-bold text-navy">
                {multiple ? SELETOR_LABEL[tipo].plural : SELETOR_LABEL[tipo].singular}
              </DrawerTitle>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{open && painel}</div>
            </DrawerContent>
          </Drawer>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{gatilho}</PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(28rem,calc(100vw-2rem))] p-0 max-h-[70vh] flex flex-col overflow-hidden"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {open && painel}
          </PopoverContent>
        </Popover>
      )}

      {multiple && selecionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selecionados.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-primary-soft text-primary-dark text-xs font-semibold"
            >
              {item.nome}
              {item.codigo ? <span className="opacity-70">· {item.codigo}</span> : null}
              <button
                type="button"
                aria-label={`Remover ${item.nome}`}
                onClick={() =>
                  onChangeMultiple?.(
                    (values ?? []).filter((id) => id !== item.id),
                    selecionados.filter((i) => i.id !== item.id),
                  )
                }
                className="h-5 w-5 rounded-full flex items-center justify-center hover:bg-primary/15"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
