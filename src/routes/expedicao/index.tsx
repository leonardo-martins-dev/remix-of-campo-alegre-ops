import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Truck, Clock, CheckCircle2, Tv } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { ProgressRing } from "@/components/charts";
import { NumberStepper } from "@/components/number-stepper";
import { cargasExpedicao, romaneioItens } from "@/lib/mock";

export const Route = createFileRoute("/expedicao/")({
  component: Page,
  head: () => ({ meta: [{ title: "Expedição · Campo Alegre" }] }),
});

type TipoCx = "G" | "I" | "P";

function Page() {
  const [familias, setFamilias] = useState(() =>
    romaneioItens.map(f => ({ ...f, itens: f.itens.map(i => ({ ...i, caixas: { ...i.caixas } })) }))
  );
  const [carga] = useState(cargasExpedicao[0]);
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState<"todas" | "carregando" | "aguardando" | "concluida">("todas");

  // Caixas reais enviadas (editáveis) — independente das sugeridas calculadas
  const sugCaixas = useMemo<Record<TipoCx, number>>(() => {
    const sum = (k: TipoCx) => familias.flatMap(f => f.itens).reduce((a, i) => a + i.caixas[k], 0);
    return { G: sum("G"), I: sum("I"), P: sum("P") };
  }, [familias]);

  const [realCaixas, setRealCaixas] = useState<Record<TipoCx, number>>(sugCaixas);
  const [realTouched, setRealTouched] = useState(false);
  // Quando não tocado manualmente, real acompanha o sugerido
  useEffect(() => {
    if (!realTouched) setRealCaixas(sugCaixas);
  }, [sugCaixas, realTouched]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const updateReal = (fi: number, ii: number, v: number) => {
    setFamilias(prev =>
      prev.map((f, i) =>
        i !== fi
          ? f
          : {
              ...f,
              itens: f.itens.map((it, j) => {
                if (j !== ii) return it;
                const real = Math.max(0, v);
                const status: "ok" | "corrigido" | "pendente" =
                  real === it.romaneio ? "ok" : real > 0 ? "corrigido" : "pendente";
                return { ...it, real, status };
              }),
            }
      )
    );
  };

  const updateCaixaItem = (fi: number, ii: number, tipo: TipoCx, v: number) => {
    setFamilias(prev =>
      prev.map((f, i) =>
        i !== fi
          ? f
          : {
              ...f,
              itens: f.itens.map((it, j) =>
                j !== ii ? it : { ...it, caixas: { ...it.caixas, [tipo]: Math.max(0, v) } }
              ),
            }
      )
    );
  };

  const flat = familias.flatMap(f => f.itens);
  const conferidos = flat.filter(i => i.status !== "pendente").length;
  const totalItens = flat.length;
  const progresso = Math.round((conferidos / totalItens) * 100);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const cargasFiltradas = cargasExpedicao.filter(c => tab === "todas" || c.status === tab);

  const finalizar = () => {
    const total = realCaixas.G + realCaixas.I + realCaixas.P;
    toast.success("Carga finalizada", {
      description: `${carga.cliente} · ${total} caixas registradas como enviadas (G ${realCaixas.G} / I ${realCaixas.I} / P ${realCaixas.P}).`,
    });
  };

  return (
    <div>
      <PageHeader
        title="Painel de Carga"
        subtitle="Abastecimento e conferência por loja"
        actions={
          <Link to="/expedicao/tv" className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-navy text-white text-sm font-semibold hover:opacity-90">
            <Tv size={14} /> Abrir Modo TV
          </Link>
        }
      />

      <StatStrip
        items={[
          { label: "Cargas hoje", value: "21" },
          { label: "Em carregamento", value: "4", tone: "info" },
          { label: "Tempo médio de carga", value: "48 min" },
          { label: "Acuracidade de caixas", value: "96.4%", tone: "ok" },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card-base overflow-hidden">
          <div className="p-5 border-b border-border">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h2 className="text-lg font-bold text-navy">{carga.cliente}</h2>
              <span className="chip chip-info">Em carregamento</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="chip chip-muted">🚚 {carga.caminhao}</span>
              <span className="chip chip-muted">👤 {carga.motorista}</span>
              <span className="chip chip-muted">📍 Rota {carga.rota}</span>
              <span className="chip chip-muted">⏱ Início {carga.inicio}</span>
              <span className="chip chip-teal">
                {carga.itens} itens · {realCaixas.G + realCaixas.I + realCaixas.P} caixas
              </span>
            </div>
          </div>

          <div className="divide-y divide-border">
            {familias.map((fam, fi) => (
              <div key={fam.familia}>
                <div className="px-5 py-2 bg-secondary/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Família {fi + 1} · {fam.familia}
                </div>
                <table className="w-full text-sm">
                  <thead className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-5 py-2">Produto</th>
                      <th className="text-right px-3 py-2">Romaneio</th>
                      <th className="text-center px-3 py-2">Real</th>
                      <th className="text-center px-3 py-2">Caixas G / I / P</th>
                      <th className="text-right px-5 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fam.itens.map((it, ii) => (
                      <tr key={it.produto} className="border-t border-border">
                        <td className="px-5 py-3 font-semibold text-navy">{it.produto}</td>
                        <td className="px-3 py-3 text-right text-ink">{it.romaneio}</td>
                        <td className="px-3 py-3">
                          <NumberStepper
                            size="sm"
                            value={it.real}
                            onChange={v => updateReal(fi, ii, v)}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-2">
                            {(["G", "I", "P"] as const).map(k => (
                              <div key={k} className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-muted-foreground w-3">{k}</span>
                                <NumberStepper
                                  size="sm"
                                  width="w-8"
                                  value={it.caixas[k]}
                                  onChange={v => updateCaixaItem(fi, ii, k, v)}
                                />
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {it.status === "ok" && <span className="chip chip-ok">OK</span>}
                          {it.status === "corrigido" && (
                            <span className="chip chip-warn">
                              {it.real > it.romaneio
                                ? `Sobra +${it.real - it.romaneio}`
                                : `Corrigido −${it.romaneio - it.real}`}
                            </span>
                          )}
                          {it.status === "pendente" && <span className="chip chip-muted">Pendente</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        <div className="card-base p-5 self-start sticky top-4">
          <h3 className="text-sm font-bold text-navy mb-4">Resumo da carga</h3>
          <div className="flex items-center justify-center my-3">
            <ProgressRing value={progresso} label="Conferido" />
          </div>
          <div className="flex items-center justify-between text-sm py-3 border-y border-border">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Clock size={14} /> Tempo de carga
            </span>
            <span className="font-mono font-bold text-navy text-lg">
              {mm}:{ss}
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Caixas — sugerido × real
              </div>
              {realTouched && (
                <button
                  onClick={() => {
                    setRealTouched(false);
                    setRealCaixas(sugCaixas);
                  }}
                  className="text-[10px] font-semibold text-primary-dark hover:underline"
                >
                  Resetar
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="text-[10px] text-muted-foreground uppercase">
                <tr>
                  <th className="text-left py-1">Tipo</th>
                  <th className="text-right py-1">Sug.</th>
                  <th className="text-center py-1">Real (enviado)</th>
                  <th className="text-right py-1 w-12">Δ</th>
                </tr>
              </thead>
              <tbody>
                {(["G", "I", "P"] as const).map(k => {
                  const diff = realCaixas[k] - sugCaixas[k];
                  return (
                    <tr key={k} className="border-t border-border">
                      <td className="py-2 font-semibold text-navy">
                        {k === "G" ? "Grande" : k === "I" ? "Isopor" : "Plástica"}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{sugCaixas[k]}</td>
                      <td className="py-2">
                        <NumberStepper
                          size="sm"
                          value={realCaixas[k]}
                          onChange={v => {
                            setRealTouched(true);
                            setRealCaixas(prev => ({ ...prev, [k]: v }));
                          }}
                        />
                      </td>
                      <td
                        className="py-2 text-right font-bold tabular-nums"
                        style={{
                          color:
                            diff === 0 ? "var(--muted-foreground)" : diff > 0 ? "var(--info)" : "var(--danger)",
                        }}
                      >
                        {diff === 0 ? "—" : diff > 0 ? `+${diff}` : `${diff}`}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-secondary/30">
                  <td className="py-2 font-bold text-navy">Total</td>
                  <td className="py-2 text-right text-muted-foreground">
                    {sugCaixas.G + sugCaixas.I + sugCaixas.P}
                  </td>
                  <td className="py-2 text-center font-bold text-navy">
                    {realCaixas.G + realCaixas.I + realCaixas.P}
                  </td>
                  <td className="py-2 text-right" />
                </tr>
              </tbody>
            </table>
          </div>
          <button
            onClick={finalizar}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary-dark active:scale-[0.99] transition"
          >
            <CheckCircle2 size={16} /> Finalizar carga
          </button>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Registra as <strong>caixas reais enviadas</strong> no Controle de Caixas
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-navy flex items-center gap-2">
            <Truck size={14} /> Outras cargas hoje
          </h3>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
            {(
              [
                ["todas", "Todas"],
                ["carregando", "Em carregamento"],
                ["aguardando", "Aguardando"],
                ["concluida", "Finalizadas"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
                  tab === k ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-navy"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {cargasFiltradas.length === 0 && (
            <div className="col-span-full text-center py-8 text-sm text-muted-foreground">
              Nenhuma carga neste filtro.
            </div>
          )}
          {cargasFiltradas.map(c => (
            <div key={c.id} className="card-base p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-muted-foreground">{c.id}</span>
                {c.status === "concluida" && <span className="chip chip-ok">Concluída</span>}
                {c.status === "carregando" && <span className="chip chip-info">Carregando</span>}
                {c.status === "aguardando" && <span className="chip chip-warn">Aguardando</span>}
              </div>
              <div className="font-bold text-navy text-sm">{c.cliente}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {c.itens} itens · {c.caixas} cx · {c.motorista}
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${c.progresso * 100}%`, background: "var(--primary)" }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
