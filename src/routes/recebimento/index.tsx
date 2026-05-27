import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileSpreadsheet, Plus, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { pedidosRecebimento } from "@/lib/mock";

export const Route = createFileRoute("/recebimento/")({
  component: Page,
  head: () => ({ meta: [{ title: "Recebimento · Campo Alegre" }] }),
});

const statusChip = (s: string) => {
  if (s === "conferido")   return <span className="chip chip-ok">Conferido</span>;
  if (s === "divergencia") return <span className="chip chip-danger">Com divergência</span>;
  return <span className="chip chip-warn">Pendente</span>;
};

function Page() {
  const [tab, setTab] = useState<"todos"|"pendente"|"conferido"|"divergencia">("todos");
  const filtered = pedidosRecebimento.filter(p => tab === "todos" || p.status === tab);

  return (
    <div>
      <PageHeader
        title="Conferência de Mercadoria"
        subtitle="Pedidos a conferir do dia · recebimento sempre aceito"
        actions={
          <>
            <button className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary">
              <FileSpreadsheet size={14}/> Importar Excel
            </button>
            <button className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark">
              <Plus size={14}/> Lançar pedido manual
            </button>
          </>
        }
      />

      <StatStrip items={[
        { label: "Pedidos hoje", value: "12" },
        { label: "Itens a conferir", value: "146", tone: "warn" },
        { label: "Fill rate hoje", value: "94.3%", tone: "ok" },
        { label: "Divergências", value: "8", tone: "danger" },
      ]} />

      <div className="card-base">
        <div className="flex items-center gap-1 p-2 border-b border-border">
          {([
            ["todos","Todos"],["pendente","A conferir"],["conferido","Conferidos"],["divergencia","Com divergência"]
          ] as const).map(([k,l]) => (
            <button key={k} onClick={()=>setTab(k)}
              className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${tab===k ? "bg-primary-soft text-primary-dark" : "text-muted-foreground hover:bg-secondary"}`}>
              {l}
            </button>
          ))}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Pedido</th>
              <th className="text-left px-4 py-3 font-semibold">Fornecedor</th>
              <th className="text-left px-4 py-3 font-semibold">Itens</th>
              <th className="text-left px-4 py-3 font-semibold">Rateio</th>
              <th className="text-left px-4 py-3 font-semibold">Origem</th>
              <th className="text-left px-4 py-3 font-semibold">Chegada</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3"/>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                <td className="px-4 py-3 font-semibold text-navy">{p.id}</td>
                <td className="px-4 py-3 text-ink">{p.fornecedor}</td>
                <td className="px-4 py-3 text-ink">{p.itens}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {p.rateio.map(([d,q]: any) => (
                      <span key={d} className="chip chip-muted">{d} · {q}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`chip ${p.origem === "Wisetec" ? "chip-info" : "chip-muted"}`}>{p.origem}</span>
                </td>
                <td className="px-4 py-3 text-ink">{p.chegada}</td>
                <td className="px-4 py-3">{statusChip(p.status)}</td>
                <td className="px-4 py-3 text-right">
                  <Link to="/recebimento/conferir" className="inline-flex items-center gap-1 text-primary-dark text-xs font-semibold hover:underline">
                    Conferir <ChevronRight size={12}/>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
