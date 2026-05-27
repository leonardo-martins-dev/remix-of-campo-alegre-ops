import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Pin, PinOff, X, Check, Clock } from "lucide-react";
import { cargasExpedicao, romaneioItens } from "@/lib/mock";

export const Route = createFileRoute("/expedicao/tv")({
  component: TvMode,
  head: () => ({ meta: [{ title: "Modo TV · Campo Alegre" }] }),
});

function TvMode() {
  const cargas = cargasExpedicao;
  const [idx, setIdx] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const t = setInterval(()=>{ elapsedRef.current++; setElapsed(elapsedRef.current); }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (pinned) return;
    const r = setInterval(()=>setIdx(i => (i+1) % cargas.length), 20000);
    return () => clearInterval(r);
  }, [pinned, cargas.length]);

  const carga = cargas[idx];
  const flat = romaneioItens.flatMap(f=>f.itens);
  const conferidos = flat.filter(i=>i.status === "ok").length;
  const totalItens = flat.length;
  const progresso = Math.round((conferidos/totalItens)*100);
  const caixas = flat.reduce((acc, i) => ({ G: acc.G + i.caixas.G, I: acc.I + i.caixas.I, P: acc.P + i.caixas.P }), { G:0, I:0, P:0 });

  const concluidasHoje = cargas.filter(c=>c.status === "concluida").length;
  const naFila = cargas.filter(c=>c.status === "aguardando" || c.status === "carregando").length;

  const mid = Math.ceil(flat.length / 2);
  const col1 = flat.slice(0, mid);
  const col2 = flat.slice(mid);

  const mm = String(Math.floor(elapsed/60)).padStart(2,"0");
  const ss = String(elapsed%60).padStart(2,"0");

  return (
    <div className="min-h-screen text-white" style={{ background: "#0F1B2D", fontFamily: "var(--font-sans)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: "var(--brand-green)" }}>
            <span className="font-bold text-white">CA</span>
          </div>
          <div>
            <div className="text-sm font-bold">Campo Alegre · Modo TV</div>
            <div className="text-xs text-white/50">Carga {idx+1} de {cargas.length}</div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{concluidasHoje}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/50">Concluídas hoje</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: "var(--warning)" }}>{naFila}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/50">Na fila</div>
          </div>
          <div className="text-center px-4 py-2 rounded-lg bg-white/5">
            <div className="text-2xl font-mono font-bold flex items-center gap-2"><Clock size={18}/>{mm}:{ss}</div>
            <div className="text-[10px] uppercase tracking-wider text-white/50">Tempo de carga</div>
          </div>
          <Link to="/expedicao" className="h-10 w-10 rounded-lg hover:bg-white/10 flex items-center justify-center">
            <X size={20}/>
          </Link>
        </div>
      </div>

      {/* Main */}
      <div className="px-10 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-7xl font-bold tracking-tight leading-none">{carga.cliente}</div>
            <div className="mt-3 flex flex-wrap gap-3 text-lg text-white/70">
              <span>🚚 {carga.caminhao}</span>
              <span>· Rota {carga.rota}</span>
              <span>· {carga.motorista}</span>
              <span className="px-3 py-1 rounded-md" style={{ background: "rgba(47,155,224,0.15)", color: "#7CC4F0" }}>
                EM CARREGAMENTO · {conferidos} de {totalItens} itens
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-8xl font-bold leading-none" style={{ color: "var(--primary)" }}>{progresso}%</div>
            <div className="text-sm uppercase tracking-wider text-white/50 mt-2">progresso</div>
          </div>
        </div>

        {/* Items in 2 columns */}
        <div className="grid grid-cols-2 gap-x-12 gap-y-3 my-8">
          {[col1, col2].map((col, ci) => (
            <div key={ci} className="space-y-2">
              {col.map((it, i) => {
                const ok = it.status === "ok";
                const pend = it.status === "pendente";
                const cor = it.status === "corrigido";
                return (
                  <div key={i} className="flex items-center justify-between text-2xl py-2 px-4 rounded-lg"
                    style={{ background: ok ? "rgba(47,164,90,0.15)" : cor ? "rgba(240,169,43,0.15)" : "rgba(255,255,255,0.04)" }}>
                    <div className="flex items-center gap-4">
                      <span className="text-3xl"
                        style={{ color: ok ? "var(--success)" : cor ? "var(--warning)" : pend ? "var(--danger)" : "white" }}>
                        {ok ? "✓" : cor ? "!" : "○"}
                      </span>
                      <span className="font-semibold">{it.produto}</span>
                    </div>
                    <span className="font-mono text-white/70">{it.real}/{it.romaneio}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="grid grid-cols-4 gap-6 mb-6">
          {[
            ["Grande", caixas.G], ["Isopor", caixas.I], ["Plástica", caixas.P],
            ["Total caixas", caixas.G+caixas.I+caixas.P],
          ].map(([l,v]) => (
            <div key={l as string} className="rounded-xl p-5" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="text-sm uppercase tracking-wider text-white/50">{l as string}</div>
              <div className="text-5xl font-bold mt-1">{v as number}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${progresso}%`, background: "var(--primary)" }}/>
        </div>

        {/* Queue */}
        <div className="mt-8">
          <div className="text-xs uppercase tracking-wider text-white/50 mb-3">Fila de cargas</div>
          <div className="grid grid-cols-4 gap-3">
            {cargas.map((c,i) => {
              const active = i === idx;
              const bg = c.status === "concluida" ? "var(--success)" : c.status === "carregando" ? "var(--warning)" : "var(--danger)";
              return (
                <button key={c.id} onClick={()=>{ setIdx(i); setPinned(true); }}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${active ? "border-primary bg-white/10" : "border-transparent bg-white/5 hover:bg-white/10"}`}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: bg }}/>
                    <span className="text-[10px] uppercase text-white/50">{c.id}</span>
                  </div>
                  <div className="font-bold mt-1 truncate">{c.cliente}</div>
                  <div className="text-xs text-white/50">{c.motorista}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/40 backdrop-blur px-3 py-2 rounded-full border border-white/10">
          <button onClick={()=>setIdx(i=>(i-1+cargas.length)%cargas.length)} className="h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center"><ChevronLeft size={18}/></button>
          <button onClick={()=>setPinned(p=>!p)} className={`h-10 px-4 rounded-full flex items-center gap-2 text-sm font-semibold ${pinned ? "bg-primary text-primary-foreground" : "hover:bg-white/10"}`}>
            {pinned ? <><Pin size={14}/> Fixada</> : <><PinOff size={14}/> Auto (20s)</>}
          </button>
          <button onClick={()=>setIdx(i=>(i+1)%cargas.length)} className="h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center"><ChevronRight size={18}/></button>
        </div>
      </div>
    </div>
  );
}

// silence lint
void Check;
