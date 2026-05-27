import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Minus, WifiOff, Check, ChevronDown, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { clientesSaldo } from "@/lib/mock";
import { Donut } from "@/components/charts";

export const Route = createFileRoute("/caixas/retorno")({
  component: Page,
  head: () => ({ meta: [{ title: "Registro de Retorno · Campo Alegre" }] }),
});

function Page() {
  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
      <div>
        <PageHeader
          title="Registro de Retorno"
          subtitle="App do motorista — uso direto no caminhão"
        />
        <PhoneFrame />
      </div>
      <DesktopPanel />
    </div>
  );
}

function PhoneFrame() {
  const [clienteIdx, setClienteIdx] = useState(0);
  const cliente = clientesSaldo[clienteIdx];
  const [open, setOpen] = useState(false);
  const [ret, setRet] = useState({ G: 0, I: 0, P: 0 });
  const saldoAtual = {
    G: (cliente.G.env - cliente.G.ret) - ret.G,
    I: (cliente.I.env - cliente.I.ret) - ret.I,
    P: (cliente.P.env - cliente.P.ret) - ret.P,
  };

  const Step = ({ tipo, label, color }: { tipo: "G"|"I"|"P"; label: string; color: string }) => (
    <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-60">{label}</div>
          <div className="text-[11px] opacity-50 mt-0.5">Saldo após retorno: <span className="font-bold">{saldoAtual[tipo]}</span></div>
        </div>
        <span className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold" style={{ background: color, color: "white" }}>{tipo}</span>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={()=>setRet(r=>({ ...r, [tipo]: Math.max(0, r[tipo]-1) }))}
          className="h-12 w-12 rounded-2xl bg-white/10 active:bg-white/20 flex items-center justify-center"><Minus size={18}/></button>
        <span className="text-5xl font-bold tabular-nums">{ret[tipo]}</span>
        <button onClick={()=>setRet(r=>({ ...r, [tipo]: r[tipo]+1 }))}
          className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: "var(--primary)" }}><Plus size={18}/></button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto" style={{ width: 340 }}>
      <div className="rounded-[36px] p-2 shadow-xl" style={{ background: "#0F1B2D" }}>
        <div className="rounded-[28px] overflow-hidden text-white" style={{ background: "#16243A", minHeight: 640 }}>
          {/* Status bar */}
          <div className="px-6 py-3 flex items-center justify-between text-xs">
            <span className="font-semibold">9:42</span>
            <div className="flex items-center gap-1.5">
              <WifiOff size={12}/> <span className="opacity-60">offline</span>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="flex items-center gap-2 mb-1">
              <Smartphone size={14} className="opacity-70"/>
              <span className="text-xs uppercase tracking-wider opacity-60">Motorista · Carlos</span>
            </div>
            <h2 className="text-2xl font-bold">Registrar retorno</h2>

            <button onClick={()=>setOpen(o=>!o)}
              className="mt-4 w-full px-4 py-3 rounded-2xl flex items-center justify-between text-left"
              style={{ background: "rgba(255,255,255,0.08)" }}>
              <div>
                <div className="text-[10px] uppercase tracking-wider opacity-60">Loja</div>
                <div className="font-bold">{cliente.cliente}</div>
              </div>
              <ChevronDown size={16}/>
            </button>
            {open && (
              <div className="mt-2 rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                {clientesSaldo.map((c,i)=>(
                  <button key={c.cliente} onClick={()=>{ setClienteIdx(i); setOpen(false); setRet({G:0,I:0,P:0}); }}
                    className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 ${i===clienteIdx?"text-primary":""}`}>
                    {c.cliente}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3 mt-4">
              <Step tipo="G" label="Caixa Grande"   color="var(--primary-dark)"/>
              <Step tipo="I" label="Caixa Isopor"   color="var(--info)"/>
              <Step tipo="P" label="Caixa Plástica" color="var(--brand-green)"/>
            </div>

            <div className="mt-4 rounded-xl p-3 flex items-center gap-2 text-[11px]" style={{ background: "rgba(240,169,43,0.12)", color: "#F0C97A" }}>
              <WifiOff size={14}/> Funciona offline · sincroniza ao recuperar sinal
            </div>

            <button className="mt-4 w-full h-13 py-3 rounded-2xl text-base font-bold flex items-center justify-center gap-2"
              style={{ background: "var(--primary)", color: "white" }}>
              <Check size={18}/> Confirmar retorno · {ret.G+ret.I+ret.P} cx
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopPanel() {
  const ultimos = [
    { hora: "09:32", loja: "Carrefour Pinheiros", G:8, I:0, P:6 },
    { hora: "09:14", loja: "Assaí Tatuapé",       G:6, I:2, P:4 },
    { hora: "08:55", loja: "Atacadão Mooca",      G:10, I:0, P:8 },
    { hora: "08:21", loja: "Carrefour Morumbi",   G:4, I:2, P:3 },
    { hora: "07:50", loja: "Assaí Santo Amaro",   G:7, I:1, P:5 },
  ];
  const totG = ultimos.reduce((a,r)=>a+r.G,0), totI = ultimos.reduce((a,r)=>a+r.I,0), totP = ultimos.reduce((a,r)=>a+r.P,0);

  return (
    <div>
      <PageHeader title="Retornos de hoje" subtitle="Painel do desktop · sincroniza com os apps dos motoristas" />
      <div className="card-base p-5 mb-4">
        <div className="flex items-center gap-6">
          <Donut size={140} thickness={16}
            segments={[
              { label: "G", value: totG, color: "var(--primary-dark)" },
              { label: "I", value: totI, color: "var(--info)" },
              { label: "P", value: totP, color: "var(--brand-green)" },
            ]}
            center={{ label: "Caixas", value: (totG+totI+totP).toString() }}
          />
          <div className="flex-1 space-y-3">
            <Pill color="var(--primary-dark)" label="Grande"   value={totG}/>
            <Pill color="var(--info)"          label="Isopor"   value={totI}/>
            <Pill color="var(--brand-green)"   label="Plástica" value={totP}/>
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
            {ultimos.map((r,i)=>(
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{r.hora}</td>
                <td className="px-4 py-2.5 font-semibold text-navy">{r.loja}</td>
                <td className="px-4 py-2.5 text-right">{r.G}</td>
                <td className="px-4 py-2.5 text-right">{r.I}</td>
                <td className="px-4 py-2.5 text-right">{r.P}</td>
                <td className="px-4 py-2.5 text-right font-bold text-navy">{r.G+r.I+r.P}</td>
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
      <span className="flex items-center gap-2 text-ink"><span className="h-3 w-3 rounded" style={{ background: color }}/>{label}</span>
      <span className="font-bold text-navy text-lg">{value}</span>
    </div>
  );
}
