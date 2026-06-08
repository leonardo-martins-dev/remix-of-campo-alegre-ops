import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Minus, WifiOff, Check, ChevronDown, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Donut } from "@/components/charts";
import { useClientes } from "@/hooks/use-cadastros";
import { useSaldoCaixas, useRetornosDia, useRegistrarRetorno } from "@/hooks/use-caixas";
import { useAuth } from "@/lib/auth";
import { enqueueRetorno, getRetornoQueue, removeFromQueue, validateRetornoQuantities } from "@/lib/offline-queue";
import { supabase } from "@/lib/supabase";
import { formatTime } from "@/lib/utils-date";

export const Route = createFileRoute("/caixas/retorno")({
  component: Page,
  head: () => ({ meta: [{ title: "Registro de Retorno · Campo Alegre" }] }),
});

function Page() {
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
      <div>
        <PageHeader title="Registro de Retorno" subtitle="App do motorista — uso direto no caminhão" />
        <PhoneFrame />
      </div>
      <DesktopPanel />
    </div>
  );
}

function PhoneFrame() {
  const { data: clientes = [] } = useClientes();
  const { data: saldo = [] } = useSaldoCaixas();
  const { user } = useAuth();
  const registrar = useRegistrarRetorno();
  const [clienteIdx, setClienteIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [ret, setRet] = useState({ G: 0, I: 0, P: 0 });
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
          data_retorno: new Date().toISOString().slice(0, 10),
          sincronizado_em: new Date().toISOString(),
        });
        removeFromQueue(item.id);
      } catch {
        /* retry later */
      }
    });
  }, [offline, user]);

  const cliente = clientes[clienteIdx];
  const saldoCliente = useMemo(() => {
    if (!cliente) return { G: 0, I: 0, P: 0 };
    const rows = saldo.filter((s: { cliente_id: string }) => s.cliente_id === cliente.id);
    const get = (tipo: string) => rows.find((r: { tipo_caixa: string }) => r.tipo_caixa === tipo)?.saldo ?? 0;
    return { G: get("G"), I: get("I"), P: get("P") };
  }, [cliente, saldo]);

  const saldoAtual = {
    G: saldoCliente.G - ret.G,
    I: saldoCliente.I - ret.I,
    P: saldoCliente.P - ret.P,
  };

  async function confirmar() {
    if (!cliente || !user) return;
    const total = ret.G + ret.I + ret.P;
    if (total === 0) {
      toast.error("Informe ao menos uma caixa");
      return;
    }
    if (ret.G > saldoCliente.G || ret.I > saldoCliente.I || ret.P > saldoCliente.P) {
      toast.error("Retorno maior que o saldo disponível");
      return;
    }

    const payload = {
      cliente_id: cliente.id,
      registrado_por: user.id,
      caixas_g: ret.G,
      caixas_i: ret.I,
      caixas_p: ret.P,
    };

    if (!navigator.onLine) {
      const offlineErr = validateRetornoQuantities(
        { caixas_g: ret.G, caixas_i: ret.I, caixas_p: ret.P },
        saldoCliente
      );
      if (offlineErr) {
        toast.error(offlineErr);
        return;
      }
      enqueueRetorno(payload);
      toast.success("Retorno salvo offline", { description: "Sincroniza ao recuperar sinal." });
      setRet({ G: 0, I: 0, P: 0 });
      return;
    }

    registrar.mutate(payload, {
      onSuccess: () => {
        toast.success("Retorno registrado");
        setRet({ G: 0, I: 0, P: 0 });
      },
      onError: (e) => toast.error(e.message),
    });
  }

  const Step = ({ tipo, label, color }: { tipo: "G" | "I" | "P"; label: string; color: string }) => (
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
          onClick={() => setRet((r) => ({ ...r, [tipo]: Math.max(0, r[tipo] - 1) }))}
          className="h-12 w-12 rounded-2xl bg-white/10 active:bg-white/20 flex items-center justify-center"
        >
          <Minus size={18} />
        </button>
        <span className="text-5xl font-bold tabular-nums">{ret[tipo]}</span>
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          disabled={ret[tipo] >= saldoCliente[tipo]}
          onClick={() =>
            setRet((r) => ({
              ...r,
              [tipo]: Math.min(saldoCliente[tipo], r[tipo] + 1),
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

  if (!clientes.length) {
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
                {clientes.map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setClienteIdx(i);
                      setOpen(false);
                      setRet({ G: 0, I: 0, P: 0 });
                    }}
                    className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 ${i === clienteIdx ? "text-primary" : ""}`}
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3 mt-4">
              <Step tipo="G" label="Caixa Grande" color="var(--primary-dark)" />
              <Step tipo="I" label="Caixa Isopor" color="var(--info)" />
              <Step tipo="P" label="Caixa Plástica" color="var(--brand-green)" />
            </div>

            {offline && (
              <div className="mt-4 rounded-xl p-3 flex items-center gap-2 text-[11px]" style={{ background: "rgba(240,169,43,0.12)", color: "#F0C97A" }}>
                <WifiOff size={14} /> Funciona offline · sincroniza ao recuperar sinal
              </div>
            )}

            <button
              onClick={confirmar}
              disabled={registrar.isPending}
              className="mt-4 w-full py-3 rounded-2xl text-base font-bold flex items-center justify-center gap-2"
              style={{ background: "var(--primary)", color: "white" }}
            >
              <Check size={18} /> Confirmar retorno · {ret.G + ret.I + ret.P} cx
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopPanel() {
  const { data: retornos = [] } = useRetornosDia();
  const totG = retornos.reduce((a, r) => a + (r.caixas_g ?? 0), 0);
  const totI = retornos.reduce((a, r) => a + (r.caixas_i ?? 0), 0);
  const totP = retornos.reduce((a, r) => a + (r.caixas_p ?? 0), 0);

  return (
    <div>
      <PageHeader title="Retornos de hoje" subtitle="Painel do desktop · sincroniza com os apps dos motoristas" />
      <div className="card-base p-5 mb-4">
        <div className="flex items-center gap-6">
          <Donut
            size={140}
            thickness={16}
            segments={[
              { label: "G", value: totG, color: "var(--primary-dark)" },
              { label: "I", value: totI, color: "var(--info)" },
              { label: "P", value: totP, color: "var(--brand-green)" },
            ]}
            center={{ label: "Caixas", value: (totG + totI + totP).toString() }}
          />
          <div className="flex-1 space-y-3">
            <Pill color="var(--primary-dark)" label="Grande" value={totG} />
            <Pill color="var(--info)" label="Isopor" value={totI} />
            <Pill color="var(--brand-green)" label="Plástica" value={totP} />
          </div>
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <div className="p-4 border-b border-border"><h3 className="text-sm font-bold text-navy">Últimos registros</h3></div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2">Hora</th>
              <th className="text-left px-4 py-2">Loja</th>
              <th className="text-right px-4 py-2">G</th>
              <th className="text-right px-4 py-2">I</th>
              <th className="text-right px-4 py-2">P</th>
              <th className="text-right px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {retornos.map((r: {
              id: string;
              created_at: string;
              caixas_g: number;
              caixas_i: number;
              caixas_p: number;
              clientes: { nome: string } | null;
            }) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{formatTime(r.created_at)}</td>
                <td className="px-4 py-2.5 font-semibold text-navy">{r.clientes?.nome ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">{r.caixas_g}</td>
                <td className="px-4 py-2.5 text-right">{r.caixas_i}</td>
                <td className="px-4 py-2.5 text-right">{r.caixas_p}</td>
                <td className="px-4 py-2.5 text-right font-bold text-navy">{r.caixas_g + r.caixas_i + r.caixas_p}</td>
              </tr>
            ))}
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
