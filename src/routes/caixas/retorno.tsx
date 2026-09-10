import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Minus, WifiOff, Check, ChevronDown, Smartphone, Trophy } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Donut } from "@/components/charts";
import { useClientes } from "@/hooks/use-cadastros";
import { useSaldoCaixas, useRetornosDia, useRegistrarRetorno, useRetornoRanking } from "@/hooks/use-caixas";
import { useMotoristas } from "@/hooks/use-cadastros";
import { BarRow } from "@/components/charts";
import { StatStrip } from "@/components/stat-strip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { enqueueRetorno, getRetornoQueue, removeFromQueue, validateRetornoQuantities } from "@/lib/offline-queue";
import { supabase } from "@/lib/supabase";
import { formatTime, todayBRT } from "@/lib/utils-date";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { emptyCaixas, fromLegacyColumns, sumCaixas, tipoColor } from "@/lib/caixas-map";

export const Route = createFileRoute("/caixas/retorno")({
  component: Page,
  head: () => ({ meta: [{ title: "Registro de Retorno · Campo Alegre" }] }),
});

function Page() {
  const [view, setView] = useState<"painel" | "campo">("painel");
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Registro de Retorno"
        subtitle="Ranking e indicadores dos motoristas · modo campo para registro rápido"
        actions={
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setView("painel")}
              className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "painel" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Painel / Ranking
            </button>
            <button
              type="button"
              onClick={() => setView("campo")}
              className={`px-3 h-9 rounded-md text-xs font-semibold ${view === "campo" ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Modo campo
            </button>
          </div>
        }
      />
      {view === "painel" ? <RankingPanel /> : (
        <div className="max-w-sm mx-auto">
          <PhoneFrame />
        </div>
      )}
    </div>
  );
}

function PhoneFrame() {
  const { data: clientes = [] } = useClientes();
  const { data: saldo = [] } = useSaldoCaixas();
  const { data: motoristas = [] } = useMotoristas();
  const { data: tipos = [] } = useTiposCaixa();
  const { user, profile, isAdmin } = useAuth();
  const registrar = useRegistrarRetorno();
  const [motoristaId, setMotoristaId] = useState<string>("");
  const [clienteIdx, setClienteIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [ret, setRet] = useState<Record<string, number>>({});
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!navigator.onLine || !user) return;
    const queue = getRetornoQueue();
    queue.forEach(async (item) => {
      try {
        await supabase.from("retornos_caixa").insert({
          cliente_id: item.cliente_id,
          motorista_id: item.motorista_id,
          registrado_por: item.registrado_por,
          caixas_g: item.caixas_g,
          caixas_i: item.caixas_i,
          caixas_p: item.caixas_p,
          offline: true,
          data_retorno: todayBRT(),
          sincronizado_em: new Date().toISOString(),
        });
        removeFromQueue(item.id);
      } catch {
        /* retry later */
      }
    });
  }, [offline, user]);

  const clientesAtivos = clientes.filter((c) => c.ativo !== false);
  const cliente = clientesAtivos[clienteIdx];
  const saldoCliente = useMemo(() => {
    const base = emptyCaixas(tipos);
    if (!cliente) return base;
    const rows = saldo.filter((s: { cliente_id: string }) => s.cliente_id === cliente.id);
    for (const t of tipos) {
      base[t.sigla] = rows.find((r: { tipo_caixa: string }) => r.tipo_caixa === t.sigla)?.saldo ?? 0;
    }
    return base;
  }, [cliente, saldo, tipos]);

  const saldoAtual = useMemo(() => {
    const next = { ...saldoCliente };
    for (const t of tipos) next[t.sigla] = (saldoCliente[t.sigla] ?? 0) - (ret[t.sigla] ?? 0);
    return next;
  }, [saldoCliente, ret, tipos]);

  const hasSaldoNegativo = tipos.some((t) => (saldoCliente[t.sigla] ?? 0) < 0);
  const saldoResultanteNegativo = tipos.some((t) => (saldoAtual[t.sigla] ?? 0) < 0);
  const totalRet = sumCaixas(ret);

  async function confirmar() {
    if (!cliente || !user) return;
    if (totalRet === 0) {
      toast.error("Informe ao menos uma caixa");
      return;
    }
    if (tipos.some((t) => (ret[t.sigla] ?? 0) > (saldoCliente[t.sigla] ?? 0))) {
      toast.error("Retorno maior que o saldo disponível");
      return;
    }
    if (saldoResultanteNegativo) {
      toast.error("Retorno resultaria em saldo negativo");
      return;
    }

    const resolvedMotorista =
      motoristaId ||
      (profile as { motorista_id?: string } | null)?.motorista_id ||
      undefined;

    const payload = {
      cliente_id: cliente.id,
      registrado_por: user.id,
      motorista_id: resolvedMotorista,
      caixas_g: ret.G ?? 0,
      caixas_i: ret.I ?? 0,
      caixas_p: ret.P ?? 0,
      caixas: ret,
    };

    if (!navigator.onLine) {
      const offlineErr = validateRetornoQuantities(
        { caixas_g: ret.G ?? 0, caixas_i: ret.I ?? 0, caixas_p: ret.P ?? 0, caixas: ret },
        saldoCliente
      );
      if (offlineErr) {
        toast.error(offlineErr);
        return;
      }
      enqueueRetorno(payload);
      toast.success("Retorno salvo offline", { description: "Sincroniza ao recuperar sinal." });
      setRet(emptyCaixas(tipos));
      return;
    }

    registrar.mutate(payload, {
      onSuccess: () => {
        toast.success("Retorno registrado");
        setRet(emptyCaixas(tipos));
      },
      onError: (e) => toast.error(e.message),
    });
  }

  const Step = ({ tipo, label, color }: { tipo: string; label: string; color: string }) => (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-60">{label}</div>
          <div className="text-[11px] opacity-50 mt-0.5">
            Saldo após retorno:{" "}
            <span className={`font-bold ${saldoAtual[tipo] < 0 ? "text-red-400" : ""}`}>
              {saldoAtual[tipo]}
            </span>
          </div>
        </div>
        <span className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: color, color: "white" }}>
          {tipo}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={`Diminuir ${label}`}
          onClick={() => setRet((r) => ({ ...r, [tipo]: Math.max(0, (r[tipo] ?? 0) - 1) }))}
          className="h-12 w-12 rounded-2xl bg-white/10 active:bg-white/20 flex items-center justify-center"
        >
          <Minus size={18} />
        </button>
        <span className="text-5xl font-bold tabular-nums">{ret[tipo] ?? 0}</span>
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          disabled={(ret[tipo] ?? 0) >= (saldoCliente[tipo] ?? 0)}
          onClick={() =>
            setRet((r) => ({
              ...r,
              [tipo]: Math.min(saldoCliente[tipo] ?? 0, (r[tipo] ?? 0) + 1),
            }))
          }
          className="h-12 w-12 rounded-2xl flex items-center justify-center disabled:opacity-40"
          style={{ background: "var(--primary)" }}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );

  if (!clientesAtivos.length) {
    return <p className="text-sm text-muted-foreground">Cadastre clientes em Gestão.</p>;
  }

  return (
    <div className="mx-auto" style={{ width: 340 }}>
      <div className="rounded-[36px] p-2 shadow-xl" style={{ background: "#0F1B2D" }}>
        <div className="rounded-[28px] overflow-hidden text-white" style={{ background: "#16243A", minHeight: 640 }}>
          <div className="px-6 py-3 flex items-center justify-between text-xs">
            <span className="font-semibold">{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            <div className="flex items-center gap-1.5">
              {offline && <WifiOff size={12} />}
              <span className="opacity-60">{offline ? "offline" : "online"}</span>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone size={14} className="opacity-70" />
              <span className="text-xs uppercase tracking-wider opacity-60">Motorista</span>
            </div>
            <h2 className="text-2xl font-bold">Registrar retorno</h2>

            <button
              onClick={() => setOpen((o) => !o)}
              className="mt-4 w-full px-4 py-3 rounded-2xl flex items-center justify-between text-left"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-60">Loja</div>
                <div className="font-bold">{cliente?.nome ?? "—"}</div>
              </div>
              <ChevronDown size={16} />
            </button>
            {open && (
              <div className="mt-2 rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                {clientesAtivos.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setClienteIdx(i);
                      setOpen(false);
                      setRet(emptyCaixas(tipos));
                    }}
                    className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 ${i === clienteIdx ? "text-primary" : ""}`}
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            )}

            {hasSaldoNegativo && (
              <div
                className="mt-4 rounded-xl p-3 text-[11px]"
                style={{ background: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}
              >
                Saldo negativo detectado — verifique movimentações antes de registrar retorno.
              </div>
            )}

            <div className="space-y-3 mt-4">
              {tipos.map((t, i) => (
                <Step key={t.id} tipo={t.sigla} label={t.nome} color={tipoColor(i)} />
              ))}
            </div>

            {(isAdmin || !(profile as { motorista_id?: string } | null)?.motorista_id) && (
              <div className="mt-3">
                <label className="text-[10px] uppercase opacity-60">Motorista</label>
                <Select value={motoristaId} onValueChange={setMotoristaId}>
                  <SelectTrigger className="mt-1 bg-white/10 border-white/20 text-white h-9">
                    <SelectValue placeholder="Selecione o motorista" />
                  </SelectTrigger>
                  <SelectContent>
                    {motoristas.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {offline && (
              <div className="mt-4 rounded-xl p-3 flex items-center gap-2 text-[11px]" style={{ background: "rgba(240,169,43,0.12)", color: "#F0C97A" }}>
                <WifiOff size={14} /> Funciona offline · sincroniza ao recuperar sinal
              </div>
            )}

            <button
              type="button"
              onClick={confirmar}
              disabled={registrar.isPending || saldoResultanteNegativo || (hasSaldoNegativo && totalRet > 0)}
              className="mt-4 w-full py-3 rounded-2xl text-base font-bold flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: "var(--primary)", color: "white" }}
            >
              <Check size={18} /> Confirmar retorno · {totalRet} cx
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RankingPanel() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const { data: ranking = [], isLoading } = useRetornoRanking(period);
  const { data: retornos = [] } = useRetornosDia();
  const top = ranking[0];
  const totalCaixas = ranking.reduce((a, r) => a + r.total_caixas, 0);
  const periodLabel =
    period === "today" ? "hoje" : period === "week" ? "7 dias" : "30 dias";

  return (
    <div className="space-y-6">
      <StatStrip
        items={[
          { label: "Motoristas ativos", value: isLoading ? "…" : String(ranking.length) },
          { label: `Caixas retornadas (${periodLabel})`, value: isLoading ? "…" : String(totalCaixas) },
          { label: "Líder", value: top?.motorista ?? "—", tone: "ok" },
          { label: "Retornos hoje", value: String(retornos.length) },
        ]}
      />

      <div className="card-base p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-warning" />
            <h3 className="text-sm font-bold text-navy">Ranking de motoristas</h3>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
            {(
              [
                ["today", "Hoje"],
                ["week", "7 dias"],
                ["month", "30 dias"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
                  period === k ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-navy"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {ranking.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum retorno com motorista identificado no período. Vincule o motorista ao perfil em Gestão e
            registre retornos com motorista selecionado.
          </p>
        )}
        {ranking.map((r, i) => (
          <BarRow
            key={r.motorista_id ?? r.motorista}
            label={`${i + 1}. ${r.motorista}`}
            value={r.total_caixas}
            max={top?.total_caixas ?? 1}
            suffix={`${r.total_caixas} cx · ${r.total_retornos} retornos`}
          />
        ))}
      </div>

      <DesktopPanel />
    </div>
  );
}

function DesktopPanel() {
  const { data: retornos = [] } = useRetornosDia();
  const { data: tipos = [] } = useTiposCaixa();
  const totais = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tipos) map[t.sigla] = 0;
    for (const r of retornos) {
      const m = fromLegacyColumns(r);
      for (const [k, v] of Object.entries(m)) map[k] = (map[k] ?? 0) + Number(v || 0);
    }
    return map;
  }, [retornos, tipos]);
  const totalAll = Object.values(totais).reduce((a, n) => a + n, 0);

  return (
    <div>
      <h3 className="text-sm font-bold text-navy mb-3">Retornos de hoje</h3>
      <div className="card-base p-5 mb-4">
        <div className="flex items-center gap-6">
          <Donut
            size={140}
            thickness={16}
            segments={tipos.map((t, i) => ({ label: t.sigla, value: totais[t.sigla] ?? 0, color: tipoColor(i) }))}
            center={{ label: "Caixas", value: totalAll.toString() }}
          />
          <div className="flex-1 space-y-3">
            {tipos.map((t, i) => (
              <Pill key={t.id} color={tipoColor(i)} label={t.nome} value={totais[t.sigla] ?? 0} />
            ))}
          </div>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="p-4 border-b border-border"><h3 className="text-sm font-bold text-navy">Últimos registros</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2">Hora</th>
              <th className="text-left px-4 py-2">Motorista</th>
              <th className="text-left px-4 py-2">Loja</th>
              {tipos.map((t) => (
                <th key={t.id} className="text-right px-4 py-2">{t.sigla}</th>
              ))}
              <th className="text-right px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {retornos.map((r: {
              id: string;
              created_at: string;
              caixas?: Record<string, number> | null;
              caixas_g: number;
              caixas_i: number;
              caixas_p: number;
              clientes: { nome: string } | { nome: string }[] | null;
              motoristas: { nome: string } | { nome: string }[] | null;
              profiles: { nome: string } | { nome: string }[] | null;
            }) => {
              const map = fromLegacyColumns(r);
              return (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{formatTime(r.created_at)}</td>
                <td className="px-4 py-2.5 text-ink">{(Array.isArray(r.motoristas) ? r.motoristas[0] : r.motoristas)?.nome ?? (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.nome ?? "—"}</td>
                <td className="px-4 py-2.5 font-semibold text-navy">{(Array.isArray(r.clientes) ? r.clientes[0] : r.clientes)?.nome ?? "—"}</td>
                {tipos.map((t) => (
                  <td key={t.id} className="px-4 py-2.5 text-right">{map[t.sigla] ?? 0}</td>
                ))}
                <td className="px-4 py-2.5 text-right font-bold text-navy">{sumCaixas(map)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pill({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-ink">
        <span className="h-3 w-3 rounded" style={{ background: color }} />
        {label}
      </span>
      <span className="font-bold text-navy text-lg">{value}</span>
    </div>
  );
}
