/**
 * NOP-328 — casca única da Conferência de recebimento (3 passos do mockup).
 * Reaproveita mutações/NOP-327; a apresentação é PassoFornecedores / PassoItem / PassoFila.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PassoSecao } from "@/components/recebimento/passo-secao";
import {
  PassoFornecedores,
  type GrupoFornecedor,
} from "@/components/recebimento/passo-fornecedores";
import { PassoItem, type ItemEmConferencia } from "@/components/recebimento/passo-item";
import { PassoFila, type LinhaFila } from "@/components/recebimento/passo-fila";
import { useAuth } from "@/lib/auth";
import { one } from "@/lib/embed";
import { isAguardandoVinculo } from "@/lib/seletor-cadastro";
import { formatTime, dateKeyBRT } from "@/lib/utils-date";
import {
  caixasEsperadas,
  itemConferenciaQtyLocked,
  podeEditarConferenciaFinalizada,
  statusItemConferencia,
} from "@/lib/conferir-chegada";
import { useRegistrarHoraChegada } from "@/hooks/use-pedidos";
import {
  useStartConferencia,
  useSaveConferenciaItens,
  useSalvarEdicaoConferencia,
  type ConferenciaRow,
  type ItemConferenciaRow,
} from "@/hooks/use-conferencia";
import {
  useConferenciasPorPedido,
  useSaldosPorPedido,
  useSugestoesPorPedido,
} from "@/hooks/use-conferencia-multi";

type PedidoAberto = {
  id: string;
  codigo: string;
  fornecedor_id: string;
  hora_chegada: string | null;
  status: string;
  fornecedores?: { nome: string } | { nome: string }[] | null;
  itens_pedido?: unknown[];
};

type SaidaResumo = {
  pedido_id: string;
  registrado_em: string;
  total_caixas: number;
  motorista_nome: string | null;
  veiculo_fornecedor: boolean;
};

type DraftItem = {
  caixas: number;
  conferido: boolean;
  qualidade: boolean;
};

function nomeFornecedor(p: PedidoAberto): string {
  const nomeRaw = one(p.fornecedores)?.nome;
  return !nomeRaw || isAguardandoVinculo(nomeRaw) ? p.codigo : nomeRaw;
}

function itemPedidoEmbed(ic: ItemConferenciaRow) {
  type Ip = {
    id?: string;
    quantidade_pedida?: number;
    produto_id?: string | null;
    unidade?: string | null;
    nome_externo?: string | null;
    produtos?:
      | { nome: string; unidade: string }
      | { nome: string; unidade: string }[]
      | null;
    clientes?: { nome: string } | { nome: string }[] | null;
  };
  return one(ic.itens_pedido as Ip | Ip[] | null);
}

export function ConferenciaCaminhao({
  pendentes,
  loadingPedidos,
  saidaPorPedido,
  pedidoIds,
  onChangePedidoIds,
  onAllDone,
}: {
  pendentes: PedidoAberto[];
  loadingPedidos: boolean;
  saidaPorPedido: Map<string, SaidaResumo>;
  pedidoIds: string[];
  onChangePedidoIds: (ids: string[]) => void;
  onAllDone: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const registrarHora = useRegistrarHoraChegada();
  const startMut = useStartConferencia();
  const saveMut = useSaveConferenciaItens();
  const editMut = useSalvarEdicaoConferencia();

  const [horaEditOpen, setHoraEditOpen] = useState(false);
  const [horaEdit, setHoraEdit] = useState("");
  const [itemAtivoId, setItemAtivoId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftItem>>({});
  const [editandoFinalizada, setEditandoFinalizada] = useState(false);
  const [editMotivo, setEditMotivo] = useState("");
  const [assinaturaNome, setAssinaturaNome] = useState("");

  const grupos = useMemo((): GrupoFornecedor[] => {
    const map = new Map<string, GrupoFornecedor & { pedidos: PedidoAberto[] }>();
    for (const p of pendentes) {
      if (!p.fornecedor_id) continue;
      let g = map.get(p.fornecedor_id);
      if (!g) {
        g = {
          fornecedorId: p.fornecedor_id,
          nome: nomeFornecedor(p),
          pedidoIds: [],
          pedidoIdsSelecionados: [],
          itensTotal: 0,
          emTransito: false,
          saidaResumo: null,
          codigos: [],
          pedidos: [],
        };
        map.set(p.fornecedor_id, g);
      }
      g.pedidos.push(p);
      g.pedidoIds.push(p.id);
      g.itensTotal += p.itens_pedido?.length ?? 0;
      g.codigos.push(p.codigo);
      if (pedidoIds.includes(p.id)) g.pedidoIdsSelecionados.push(p.id);
      const saida = saidaPorPedido.get(p.id);
      if (saida) {
        g.emTransito = true;
        if (!g.saidaResumo) {
          const quem = saida.veiculo_fornecedor
            ? "veículo do fornecedor"
            : (saida.motorista_nome ?? "motorista");
          g.saidaResumo = `Saiu da roça ${formatTime(saida.registrado_em)} · ${quem}`;
        }
      }
    }
    return [...map.values()]
      .map(({ pedidos: _p, ...rest }) => rest)
      .sort((a, b) => {
        if (a.emTransito !== b.emTransito) return a.emTransito ? -1 : 1;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [pendentes, saidaPorPedido, pedidoIds]);

  const pedidosSelecionados = useMemo(
    () => pendentes.filter((p) => pedidoIds.includes(p.id)),
    [pendentes, pedidoIds],
  );

  const horaChegada = useMemo(() => {
    const times = pedidosSelecionados
      .map((p) => p.hora_chegada)
      .filter((t): t is string => !!t)
      .sort();
    return times[0] ?? null;
  }, [pedidosSelecionados]);

  useEffect(() => {
    if (horaChegada) setHoraEdit(formatTime(horaChegada));
  }, [horaChegada]);

  const confQueries = useConferenciasPorPedido(pedidoIds);
  const saldoQueries = useSaldosPorPedido(pedidoIds);

  // Garante conferência aberta por pedido selecionado
  useEffect(() => {
    if (!user?.id) return;
    pedidoIds.forEach((id, idx) => {
      const q = confQueries[idx];
      if (!q || q.isLoading || q.isFetching) return;
      const conf = q.data as ConferenciaRow | null | undefined;
      const ped = pendentes.find((p) => p.id === id);
      if (!ped) return;
      if (!["pendente", "parcial", "em_transito"].includes(ped.status)) return;
      if (conf && (conf.status === "em_andamento" || conf.status === "parcial")) return;
      if (conf && conf.status === "finalizada" && !editandoFinalizada) return;
      if (startMut.isPending) return;
      void startMut.mutateAsync({ pedidoId: id, conferenteId: user.id, user }).catch((e) => {
        const msg = e instanceof Error ? e.message : "";
        if (!/já|aberta|encerrado/i.test(msg)) toast.error(msg || "Erro ao iniciar conferência");
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoIds.join(","), confQueries.map((q) => q.dataUpdatedAt).join(","), user?.id, editandoFinalizada]);

  const sugestaoArgs = useMemo(
    () =>
      pedidoIds.map((id, idx) => {
        const ped = pendentes.find((p) => p.id === id);
        const conf = confQueries[idx]?.data as ConferenciaRow | null | undefined;
        const itens = (conf?.itens_conferencia ?? []).map((ic) => {
          const ip = itemPedidoEmbed(ic);
          return {
            produto_id: ip?.produto_id,
            quantidade: Number(ip?.quantidade_pedida ?? 0),
          };
        });
        return {
          pedidoId: id,
          fornecedorId: ped?.fornecedor_id ?? null,
          itens,
        };
      }),
    [pedidoIds, pendentes, confQueries],
  );
  const sugQueries = useSugestoesPorPedido(sugestaoArgs);

  type FilaItem = {
    key: string;
    itemId: string;
    pedidoId: string;
    conferenciaId: string;
    conferenciaStatus: string;
    fornecedorNome: string;
    pedidoCodigo: string;
    produto: string;
    fotoUrl: string | null;
    cliente: string | null;
    pedidoQtd: number;
    unidade: string;
    fator: number | null;
    esperadoCaixas: number | null;
    jaRecebidoUn: number;
    saldo: number;
    aVincular: boolean;
    semConversao: boolean;
    qualidadeDb: boolean;
  };

  const fila = useMemo((): FilaItem[] => {
    const out: FilaItem[] = [];
    pedidoIds.forEach((pedidoId, idx) => {
      const ped = pendentes.find((p) => p.id === pedidoId);
      const conf = confQueries[idx]?.data as ConferenciaRow | null | undefined;
      const saldos = (saldoQueries[idx]?.data ?? []) as {
        item_pedido_id: string;
        recebido_acumulado: number;
        saldo: number;
      }[];
      const sugMap = sugQueries[idx]?.data;
      if (!ped || !conf?.itens_conferencia) return;
      for (const ic of conf.itens_conferencia) {
        const ip = itemPedidoEmbed(ic);
        const prod = one(ip?.produtos ?? null);
        const produtoId = ip?.produto_id ?? null;
        const sug = produtoId ? sugMap?.get(produtoId) : undefined;
        const fator = sug?.sugestoes?.[0]?.fator ?? null;
        const pedidoQtd = Number(ip?.quantidade_pedida ?? 0);
        const saldoRow = saldos.find((s) => s.item_pedido_id === ip?.id);
        const ja = Number(saldoRow?.recebido_acumulado ?? 0);
        const saldoRestante = Number(saldoRow?.saldo ?? Math.max(0, pedidoQtd - ja));
        const esperado = caixasEsperadas(saldoRestante > 0 ? saldoRestante : pedidoQtd, fator);
        out.push({
          key: `${pedidoId}:${ic.id}`,
          itemId: ic.id,
          pedidoId,
          conferenciaId: conf.id,
          conferenciaStatus: conf.status,
          fornecedorNome: nomeFornecedor(ped),
          pedidoCodigo: ped.codigo,
          produto: prod?.nome ?? ip?.nome_externo ?? "—",
          fotoUrl: ic.foto_url,
          cliente: one(ip?.clientes ?? null)?.nome ?? null,
          pedidoQtd,
          unidade: ip?.unidade || prod?.unidade || "un",
          fator,
          esperadoCaixas: esperado,
          jaRecebidoUn: ja,
          saldo: saldoRestante,
          aVincular: !produtoId,
          semConversao: !!sug?.sem_conversao || fator == null,
          qualidadeDb: ic.tem_problema_qualidade,
        });
      }
    });
    return out;
  }, [pedidoIds, pendentes, confQueries, saldoQueries, sugQueries]);

  // Hidrata drafts a partir da conferência
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      pedidoIds.forEach((_, idx) => {
        const conf = confQueries[idx]?.data as ConferenciaRow | null | undefined;
        for (const ic of conf?.itens_conferencia ?? []) {
          if (next[ic.id]) continue;
          next[ic.id] = {
            caixas: Number(ic.quantidade_recebida) || 0,
            conferido: !!ic.conferido,
            qualidade: !!ic.tem_problema_qualidade,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [pedidoIds, confQueries]);

  // Item ativo padrão: primeiro não conferido
  useEffect(() => {
    if (fila.length === 0) {
      setItemAtivoId(null);
      return;
    }
    if (itemAtivoId && fila.some((f) => f.itemId === itemAtivoId)) return;
    const pend = fila.find((f) => !(drafts[f.itemId]?.conferido));
    setItemAtivoId(pend?.itemId ?? fila[0].itemId);
  }, [fila, itemAtivoId, drafts]);

  const toggleFornecedor = (fornecedorId: string) => {
    const g = grupos.find((x) => x.fornecedorId === fornecedorId);
    if (!g) return;
    const allOn = g.pedidoIds.every((id) => pedidoIds.includes(id));
    if (allOn) {
      onChangePedidoIds(pedidoIds.filter((id) => !g.pedidoIds.includes(id)));
    } else {
      onChangePedidoIds([...new Set([...pedidoIds, ...g.pedidoIds])]);
    }
  };

  const selecionarTodos = () => {
    onChangePedidoIds(grupos.flatMap((g) => g.pedidoIds));
  };

  const limparSelecao = () => onChangePedidoIds([]);

  const iniciarSelecao = async () => {
    if (pedidoIds.length === 0) {
      toast.error("Selecione ao menos um fornecedor");
      return;
    }
    try {
      await registrarHora.mutateAsync({ pedidoIds, onlyIfNull: true });
    } catch {
      /* segue */
    }
    toast.success(
      pedidoIds.length === 1
        ? "Conferência pronta"
        : `${pedidoIds.length} pedidos na conferência do caminhão`,
    );
  };

  const salvarHora = async () => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(horaEdit.trim());
    if (!m) {
      toast.error("Use o formato HH:mm");
      return;
    }
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh > 23 || mm > 59) {
      toast.error("Hora inválida");
      return;
    }
    if (pedidoIds.length === 0) {
      toast.error("Selecione fornecedores antes de gravar a hora");
      return;
    }
    const day = dateKeyBRT(horaChegada) || dateKeyBRT(new Date().toISOString());
    const isoGuess = new Date(
      `${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`,
    ).toISOString();
    try {
      await registrarHora.mutateAsync({
        pedidoIds,
        horaChegada: isoGuess,
        onlyIfNull: false,
      });
      toast.success("Hora de chegada atualizada");
      setHoraEditOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar hora");
    }
  };

  const ativo = fila.find((f) => f.itemId === itemAtivoId) ?? null;
  const draftAtivo = ativo ? drafts[ativo.itemId] : null;

  const confAbertaAtivo =
    !!ativo &&
    (ativo.conferenciaStatus === "em_andamento" || ativo.conferenciaStatus === "parcial");
  const confFinalizadaAtivo = !!ativo && ativo.conferenciaStatus === "finalizada";
  const readOnlyAtivo = confFinalizadaAtivo && !editandoFinalizada;
  const bloqueadoAtivo = ativo
    ? itemConferenciaQtyLocked({
        conferenciaAberta: confAbertaAtivo,
        editando: editandoFinalizada,
        readOnly: readOnlyAtivo,
        conferido: draftAtivo?.conferido ?? false,
        temValePendente: false,
      })
    : true;

  const itemView: ItemEmConferencia | null = ativo && draftAtivo
    ? {
        itemId: ativo.itemId,
        fornecedorNome: ativo.fornecedorNome,
        pedidoCodigo: ativo.pedidoCodigo,
        produto: ativo.produto,
        fotoUrl: ativo.fotoUrl,
        cliente: ativo.cliente,
        pedidoQtd: ativo.pedidoQtd,
        unidade: ativo.unidade,
        fator: ativo.fator,
        esperadoCaixas: ativo.esperadoCaixas,
        caixasRecebidas: draftAtivo.caixas,
        jaRecebidoUn: ativo.jaRecebidoUn,
        conferido: draftAtivo.conferido,
        bloqueado: bloqueadoAtivo,
        semConversao: ativo.semConversao,
        valePendente: false,
        qualidade: draftAtivo.qualidade,
        temFoto: !!ativo.fotoUrl,
        aVincular: ativo.aVincular,
        saldoZero: ativo.saldo <= 0,
        multiTipo: false,
      }
    : null;

  const linhasFila: LinhaFila[] = fila.map((f) => {
    const d = drafts[f.itemId] ?? { caixas: 0, conferido: false, qualidade: false };
    const st = statusItemConferencia({
      conferido: d.conferido,
      atual: f.itemId === itemAtivoId,
      caixasRecebidas: d.caixas,
    });
    return {
      itemId: f.itemId,
      fornecedorNome: f.fornecedorNome,
      produto: f.produto,
      esperadoCaixas: f.esperadoCaixas,
      status: st,
      atual: f.itemId === itemAtivoId,
    };
  });

  const restantes = linhasFila.filter((l) => l.status !== "conferido").length;

  const setCaixasAtivo = (n: number) => {
    if (!ativo || bloqueadoAtivo) return;
    setDrafts((prev) => ({
      ...prev,
      [ativo.itemId]: {
        ...(prev[ativo.itemId] ?? { caixas: 0, conferido: false, qualidade: false }),
        caixas: Math.max(0, Math.round(n)),
      },
    }));
  };

  const buildItensPayload = (pedidoId: string, draftMap: Record<string, DraftItem> = drafts) => {
    const confIdx = pedidoIds.indexOf(pedidoId);
    const conf = confQueries[confIdx]?.data as ConferenciaRow | null | undefined;
    return (conf?.itens_conferencia ?? []).map((ic) => {
      const d = draftMap[ic.id] ?? {
        caixas: Number(ic.quantidade_recebida) || 0,
        conferido: ic.conferido,
        qualidade: ic.tem_problema_qualidade,
      };
      const ip = itemPedidoEmbed(ic);
      const pedidoQtd = Number(ip?.quantidade_pedida ?? 0);
      const filaItem = fila.find((f) => f.itemId === ic.id);
      const fator = filaItem?.fator;
      const recebidoUn =
        fator && fator > 0 ? d.caixas * fator : d.caixas;
      const gapUn = recebidoUn + (filaItem?.jaRecebidoUn ?? 0) - pedidoQtd;
      let divergencia: string | null = null;
      if (d.conferido) {
        if (d.qualidade) divergencia = "qualidade";
        else if (gapUn > 0) divergencia = "sobra";
      }
      return {
        id: ic.id,
        quantidade_recebida: d.caixas,
        conferido: d.conferido,
        divergencia,
        quantidade_divergencia: divergencia ? Math.abs(gapUn) : 0,
        tem_problema_qualidade: d.qualidade,
        quantidade_qualidade: d.qualidade ? 1 : 0,
        dentro_tolerancia: divergencia === "qualidade" ? false : divergencia ? true : null,
        valor_divergencia: 0,
        estimado: true,
        tolerancia_pct_aplicada: 5,
      };
    });
  };

  const persistPedido = async (
    pedidoId: string,
    status: "parcial" | "finalizada",
    draftMap: Record<string, DraftItem> = drafts,
  ) => {
    const confIdx = pedidoIds.indexOf(pedidoId);
    const conf = confQueries[confIdx]?.data as ConferenciaRow | null | undefined;
    if (!conf?.id) throw new Error("Conferência não iniciada");
    if (conf.status === "finalizada") {
      if (!editandoFinalizada) throw new Error("Conferência já finalizada");
      if (!podeEditarConferenciaFinalizada(isAdmin) || !editMotivo.trim()) {
        throw new Error("Só o ADM edita conferência finalizada, com motivo");
      }
      await editMut.mutateAsync({
        conferenciaId: conf.id,
        pedidoId,
        motivo: editMotivo.trim(),
        itens: buildItensPayload(pedidoId, draftMap),
      });
      return;
    }
    await saveMut.mutateAsync({
      conferenciaId: conf.id,
      pedidoId,
      status,
      itens: buildItensPayload(pedidoId, draftMap),
    });
  };

  const confirmarItem = async () => {
    if (!ativo || !draftAtivo) return;
    const nextDrafts = {
      ...drafts,
      [ativo.itemId]: { ...draftAtivo, conferido: true },
    };
    setDrafts(nextDrafts);
    try {
      await persistPedido(ativo.pedidoId, "parcial", nextDrafts);
      toast.success("Item confirmado");
      const next = fila.find(
        (f) => f.itemId !== ativo.itemId && !(nextDrafts[f.itemId]?.conferido),
      );
      if (next) setItemAtivoId(next.itemId);
    } catch (e) {
      setDrafts((prev) => ({
        ...prev,
        [ativo.itemId]: { ...draftAtivo, conferido: false },
      }));
      toast.error(e instanceof Error ? e.message : "Erro ao confirmar");
    }
  };

  const desmarcarItem = () => {
    if (!ativo || bloqueadoAtivo) return;
    setDrafts((prev) => ({
      ...prev,
      [ativo.itemId]: {
        ...(prev[ativo.itemId] ?? { caixas: 0, conferido: false, qualidade: false }),
        conferido: false,
      },
    }));
  };

  const registrarDivergencia = () => {
    if (!ativo || bloqueadoAtivo) return;
    setDrafts((prev) => ({
      ...prev,
      [ativo.itemId]: {
        ...(prev[ativo.itemId] ?? { caixas: 0, conferido: false, qualidade: false }),
        qualidade: true,
      },
    }));
    toast.message("Divergência marcada", {
      description: "Confirme o item para gravar. Vale e liberação seguem as regras atuais.",
    });
  };

  const finalizarCaminhao = async () => {
    if (pedidoIds.length === 0) {
      toast.error("Selecione os fornecedores do caminhão");
      return;
    }
    try {
      for (const id of pedidoIds) {
        const confIdx = pedidoIds.indexOf(id);
        const conf = confQueries[confIdx]?.data as ConferenciaRow | null | undefined;
        if (conf?.status === "finalizada" && !editandoFinalizada) continue;
        await persistPedido(id, "finalizada");
      }
      toast.success("Recebimento do caminhão finalizado");
      setEditandoFinalizada(false);
      onAllDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao finalizar");
    }
  };

  const salvarParcialTodos = async () => {
    try {
      for (const id of pedidoIds) {
        const confIdx = pedidoIds.indexOf(id);
        const conf = confQueries[confIdx]?.data as ConferenciaRow | null | undefined;
        if (conf?.status === "finalizada") continue;
        await persistPedido(id, "parcial");
      }
      toast.success("Progresso guardado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  const algumaFinalizada = fila.some((f) => f.conferenciaStatus === "finalizada");
  const todasFinalizadas =
    pedidoIds.length > 0 &&
    pedidoIds.every((id, idx) => {
      const conf = confQueries[idx]?.data as ConferenciaRow | null | undefined;
      return conf?.status === "finalizada";
    });

  return (
    <div className="pb-28 max-w-5xl mx-auto w-full min-w-0">
      <PageHeader
        title="Conferência de recebimento"
        subtitle="Selecione os fornecedores do caminhão e confira os itens no descarregamento."
        actions={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <Calendar size={14} className="text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Hora de chegada</span>
              <span className="font-bold text-navy tabular-nums">
                {horaChegada ? formatTime(horaChegada) : "—"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => setHoraEditOpen((v) => !v)}
              >
                <Pencil size={12} /> Editar
              </Button>
            </div>
          </div>
        }
      />

      {horaEditOpen && (
        <div className="card-base p-3 mb-4 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="hora-nop328">
              Nova hora (HH:mm)
            </label>
            <Input
              id="hora-nop328"
              value={horaEdit}
              onChange={(e) => setHoraEdit(e.target.value)}
              className="w-28 min-h-11"
              placeholder="16:33"
            />
          </div>
          <Button type="button" className="min-h-11" onClick={() => void salvarHora()}>
            Salvar hora
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setHoraEditOpen(false)}>
            Cancelar
          </Button>
        </div>
      )}

      {todasFinalizadas && !editandoFinalizada && (
        <div className="rounded-lg border border-border bg-secondary/50 p-3 mb-4 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="text-navy">Conferência encerrada.</strong>{" "}
            {podeEditarConferenciaFinalizada(isAdmin)
              ? "ADM pode reabrir com motivo."
              : "Correções passam pelo ADM."}
          </span>
          {podeEditarConferenciaFinalizada(isAdmin) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const motivo = window.prompt("Motivo da edição (obrigatório)");
                if (!motivo?.trim()) {
                  toast.error("Motivo obrigatório");
                  return;
                }
                setEditMotivo(motivo.trim());
                setEditandoFinalizada(true);
                toast.message("Modo edição ADM");
              }}
            >
              <Pencil size={14} className="mr-1" /> Editar conferência
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4">
        <PassoSecao
          id="passo-1"
          numero={1}
          titulo="Fornecedores no caminhão"
          subtitulo="Selecione quais fornecedores estão presentes neste recebimento."
        >
          <PassoFornecedores
            grupos={grupos}
            loading={loadingPedidos}
            onToggle={toggleFornecedor}
            onSelecionarTodos={selecionarTodos}
            onLimparSelecao={limparSelecao}
          />
          {pedidoIds.length === 0 && grupos.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Toque nos cards e continue — a conferência inicia ao selecionar.
            </p>
          )}
          {pedidoIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void iniciarSelecao()}>
                Atualizar hora de chegada
              </Button>
              <Button type="button" variant="ghost" className="min-h-11" onClick={limparSelecao}>
                Limpar seleção
              </Button>
            </div>
          )}
        </PassoSecao>

        <PassoSecao
          id="passo-2"
          numero={2}
          titulo="Conferência do descarregamento"
          subtitulo="Confira os produtos caixa a caixa do fornecedor selecionado."
          acao={
            pedidoIds.length > 0 ? (
              <button
                type="button"
                className="text-sm font-semibold text-primary-dark hover:underline min-h-9"
                onClick={() => {
                  document.getElementById("passo-1")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Trocar fornecedor
              </button>
            ) : undefined
          }
        >
          {!itemView && (
            <p className="text-sm text-muted-foreground">
              {pedidoIds.length === 0
                ? "Selecione os fornecedores no passo 1 para começar."
                : "Carregando itens da conferência…"}
            </p>
          )}
          {itemView && (
            <PassoItem
              item={itemView}
              onCaixas={setCaixasAtivo}
              onConfirmar={() => void confirmarItem()}
              onDesmarcar={desmarcarItem}
              onDivergencia={registrarDivergencia}
              onFoto={() =>
                toast.message("Foto", {
                  description: "Use a conferência clássica do item para anexar foto, se precisar.",
                })
              }
              salvando={saveMut.isPending || editMut.isPending}
            />
          )}
        </PassoSecao>

        <PassoSecao
          numero={3}
          titulo="Próximos itens do caminhão"
          subtitulo="Itens dos fornecedores selecionados, na sequência de conferência."
          acao={
            <span className="text-sm font-semibold text-navy tabular-nums">
              {restantes} {restantes === 1 ? "item restante" : "itens restantes"}
            </span>
          }
        >
          <PassoFila
            linhas={linhasFila}
            onAbrir={(id) => {
              setItemAtivoId(id);
              document.getElementById("passo-2")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </PassoSecao>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 min-w-0 text-sm text-muted-foreground">
            <User size={16} className="shrink-0" />
            <Input
              value={assinaturaNome}
              onChange={(e) => setAssinaturaNome(e.target.value)}
              placeholder="Assinatura do responsável (opcional)"
              className="min-h-11 max-w-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="min-h-12">
                  <MoreHorizontal size={16} className="mr-1.5" /> Mais ações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void salvarParcialTodos()}>
                  Guardar progresso
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={limparSelecao}>Trocar seleção</DropdownMenuItem>
                {algumaFinalizada && podeEditarConferenciaFinalizada(isAdmin) && !editandoFinalizada && (
                  <DropdownMenuItem
                    onSelect={() => {
                      const motivo = window.prompt("Motivo da edição (obrigatório)");
                      if (!motivo?.trim()) return;
                      setEditMotivo(motivo.trim());
                      setEditandoFinalizada(true);
                    }}
                  >
                    Editar finalizada (ADM)
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              className="min-h-12 font-bold px-4"
              disabled={pedidoIds.length === 0 || saveMut.isPending || (todasFinalizadas && !editandoFinalizada)}
              onClick={() => void finalizarCaminhao()}
            >
              <CheckCircle2 size={16} className="mr-1.5" />
              Finalizar recebimento do caminhão
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
