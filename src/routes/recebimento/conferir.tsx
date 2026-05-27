import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Save, CheckCircle2, Camera, Info, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { NumberStepper } from "@/components/number-stepper";
import { fornecedores, itensPedido } from "@/lib/mock";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/recebimento/conferir")({
  component: Page,
  head: () => ({ meta: [{ title: "Conferir chegada · Campo Alegre" }] }),
});

function Page() {
  const [fornecedorId, setFornecedorId] = useState<string | null>(null);
  const f = fornecedores.find(x => x.id === fornecedorId);

  if (!f) {
    return (
      <div>
        <PageHeader
          title="Conferir chegada"
          subtitle="Selecione o fornecedor que chegou — o pedido carrega na hora"
          actions={
            <Link
              to="/recebimento"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
            >
              <ArrowLeft size={14} /> Voltar
            </Link>
          }
        />
        <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 mb-5 flex gap-2 text-xs text-primary-dark">
          <Info size={14} className="mt-0.5" />
          <span>
            O recebimento é <strong>sempre aceito</strong>. Divergências não bloqueiam: viram registro no{" "}
            <strong>Relatório de Faltas</strong>.
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {fornecedores.map(fo => (
            <button
              key={fo.id}
              onClick={() => setFornecedorId(fo.id)}
              className="card-base p-4 text-left hover:border-primary hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="chip chip-info">Chegou {fo.hora}</span>
                {fo.itensFaltantes > 0 ? (
                  <span className="chip chip-warn">{fo.itensFaltantes} faltam</span>
                ) : (
                  <span className="chip chip-ok">Tudo conferido</span>
                )}
              </div>
              <div className="text-base font-bold text-navy">{fo.nome}</div>
              <div className="text-xs text-muted-foreground mt-1">{fo.itensTotal} itens no pedido</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <ConferenciaItens key={f.id} fornecedor={f} onBack={() => setFornecedorId(null)} onTrocar={setFornecedorId} />;
}

type LinhaItem = {
  produto: string;
  unid: string;
  pedido: number;
  rateio: any[];
  recebido: number;
  conferido: boolean; // marcado manualmente OU implicitamente quando recebido != 0
  qualidade: { ativo: boolean; qtd: number } | null;
};

function ConferenciaItens({
  fornecedor,
  onBack,
  onTrocar,
}: {
  fornecedor: (typeof fornecedores)[number];
  onBack: () => void;
  onTrocar: (id: string) => void;
}) {
  const [itens, setItens] = useState<LinhaItem[]>(() =>
    itensPedido.map(i => ({
      produto: i.produto,
      unid: i.unid,
      pedido: i.pedido,
      rateio: i.rateio.map(r => [...r]),
      recebido: 0,
      conferido: false,
      qualidade: null,
    }))
  );

  const update = (idx: number, v: number) => {
    setItens(prev =>
      prev.map((it, i) =>
        i === idx ? { ...it, recebido: Math.max(0, v), conferido: true } : it
      )
    );
  };

  const conferirIgualPedido = (idx: number) => {
    setItens(prev =>
      prev.map((it, i) => (i === idx ? { ...it, recebido: it.pedido, conferido: true } : it))
    );
  };

  const toggleQualidade = (idx: number) => {
    setItens(prev =>
      prev.map((it, i) =>
        i !== idx
          ? it
          : { ...it, qualidade: it.qualidade ? null : { ativo: true, qtd: 1 } }
      )
    );
  };

  const stats = useMemo(() => {
    const total = itens.length;
    const conferidos = itens.filter(i => i.conferido).length;
    const divergencias = itens.filter(i => i.conferido && i.recebido !== i.pedido).length;
    const faltantes = total - conferidos;
    return {
      total,
      conferidos,
      divergencias,
      faltantes,
      progresso: total ? Math.round((conferidos / total) * 100) : 0,
    };
  }, [itens]);

  const rateioResumo = useMemo(() => {
    const map: Record<string, { ped: number; rec: number }> = {};
    itens.forEach(it => {
      const fator = it.pedido > 0 ? it.recebido / it.pedido : 0;
      it.rateio.forEach(([d, q]: any) => {
        if (!map[d]) map[d] = { ped: 0, rec: 0 };
        map[d].ped += Number(q);
        map[d].rec += Number(q) * fator;
      });
    });
    return map;
  }, [itens]);

  const finalizar = () => {
    if (stats.faltantes > 0) {
      toast.warning("Alguns itens ainda estão pendentes", {
        description: `${stats.faltantes} item(ns) sem conferência. Finalize mesmo assim?`,
        action: {
          label: "Finalizar mesmo assim",
          onClick: () =>
            toast.success("Conferência finalizada", {
              description: `${stats.conferidos} confirmados · ${stats.divergencias} divergências enviadas ao Relatório de Faltas.`,
            }),
        },
      });
      return;
    }
    toast.success("Conferência finalizada", {
      description: `${stats.conferidos} itens · ${stats.divergencias} divergências enviadas ao Relatório de Faltas.`,
    });
  };

  return (
    <div>
      <PageHeader
        title={fornecedor.nome}
        subtitle={`Pedido PC-204${fornecedor.id.slice(-1)} · Chegou às ${fornecedor.hora} · Conferente: Rafael Martins`}
        actions={
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Trocar fornecedor
          </button>
        }
      />

      {/* Seletor rápido de fornecedor */}
      <div className="flex flex-wrap gap-2 mb-4">
        {fornecedores.map(fo => (
          <button
            key={fo.id}
            onClick={() => onTrocar(fo.id)}
            className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${
              fo.id === fornecedor.id
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-navy hover:bg-secondary"
            }`}
          >
            {fo.nome}
          </button>
        ))}
      </div>

      {/* Card do fornecedor: faltantes ao vivo */}
      <div
        className="card-base p-4 mb-4 flex items-center justify-between border-l-4"
        style={{
          borderLeftColor:
            stats.faltantes === 0
              ? "var(--success)"
              : stats.divergencias > 0
                ? "var(--danger)"
                : "var(--warning)",
        }}
      >
        <div>
          <div className="text-sm font-bold text-navy">{fornecedor.nome}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {stats.faltantes === 0
              ? "Todos os itens conferidos"
              : `${stats.faltantes} item(ns) ainda faltam conferir`}
            {stats.divergencias > 0 && ` · ${stats.divergencias} divergência(s)`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-navy tabular-nums">
            {stats.conferidos}/{stats.total}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">conferidos</div>
        </div>
      </div>

      <div className="bg-primary-soft border border-primary/20 rounded-lg p-3 mb-5 flex gap-2 text-xs text-primary-dark">
        <Info size={14} className="mt-0.5" />
        <span>
          Recebimento sempre aceito. Divergências alimentam o Relatório de Faltas — não interrompem o lançamento.
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <MiniStat label="Itens" value={stats.total.toString()} />
        <MiniStat label="Conferidos" value={`${stats.conferidos}/${stats.total}`} tone="ok" />
        <MiniStat label="Divergências" value={stats.divergencias.toString()} tone="danger" />
        <MiniStat label="Progresso" value={`${stats.progresso}%`} tone="info" />
      </div>

      <div className="card-base p-4 mb-5">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Recebido × pedido por destinatário
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(rateioResumo).map(([d, q]) => {
            const rec = Math.round(q.rec);
            const ok = rec === q.ped;
            return (
              <span
                key={d}
                className={`chip ${ok ? "chip-teal" : rec < q.ped ? "chip-danger" : "chip-info"} text-sm`}
              >
                {d} · {rec}/{q.ped}
              </span>
            );
          })}
        </div>
      </div>

      <div className="card-base overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Produto</th>
              <th className="text-left px-4 py-3">Un.</th>
              <th className="text-right px-4 py-3">Pedida</th>
              <th className="text-left px-4 py-3">Rateio</th>
              <th className="text-center px-4 py-3">Recebida</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {itens.map((it, idx) => {
              const div = it.recebido - it.pedido;
              const pendente = !it.conferido;
              return (
                <tr key={it.produto} className="border-t border-border">
                  <td className="px-4 py-3 font-semibold text-navy">{it.produto}</td>
                  <td className="px-4 py-3 text-muted-foreground">{it.unid}</td>
                  <td className="px-4 py-3 text-right text-ink">{it.pedido}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {it.rateio.map(([d, q]: any) => (
                        <span key={d} className="chip chip-muted">
                          {d}·{q}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <NumberStepper value={it.recebido} onChange={v => update(idx, v)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {pendente && <span className="chip chip-muted">Pendente</span>}
                      {!pendente && div === 0 && <span className="chip chip-ok">OK</span>}
                      {!pendente && div < 0 && <span className="chip chip-danger">Falta {Math.abs(div)}</span>}
                      {!pendente && div > 0 && <span className="chip chip-info">Sobra {div}</span>}
                      {it.qualidade && (
                        <span
                          className="chip"
                          style={{ background: "rgba(240,169,43,0.15)", color: "var(--warning)" }}
                        >
                          Qualidade
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {pendente && (
                        <button
                          onClick={() => conferirIgualPedido(idx)}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-primary-soft text-primary-dark text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
                          title="Marcar conferido com a quantidade pedida"
                        >
                          <Check size={12} /> Conferir
                        </button>
                      )}
                      <button
                        onClick={() => toggleQualidade(idx)}
                        className={`h-7 w-7 rounded-md border flex items-center justify-center transition-colors ${
                          it.qualidade
                            ? "border-transparent bg-[rgba(240,169,43,0.15)] text-[var(--warning)]"
                            : "border-border text-muted-foreground hover:text-navy hover:bg-secondary"
                        }`}
                        title="Marcar problema de qualidade"
                      >
                        <AlertTriangle size={13} />
                      </button>
                      <button
                        className="h-7 w-7 rounded-md border border-border text-muted-foreground hover:text-navy hover:bg-secondary flex items-center justify-center"
                        title="Adicionar foto"
                        onClick={() => toast.info("Câmera ainda mockada", { description: "Anexar foto entra na Fase 2 (mobile)." })}
                      >
                        <Camera size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={() => toast.info("Item avulso", { description: "Abriria o formulário de inclusão." })}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
        >
          <Plus size={14} /> Item avulso
        </button>
        <button
          onClick={() => toast.success("Parcial salva", { description: `${stats.conferidos} itens guardados.` })}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border bg-card text-sm font-semibold text-navy hover:bg-secondary"
        >
          <Save size={14} /> Salvar parcial
        </button>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground">
          Assinatura: <span className="font-semibold text-navy">Rafael Martins</span>
        </div>
        <button
          onClick={finalizar}
          className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-bold hover:bg-primary-dark active:scale-[0.99] transition"
        >
          <CheckCircle2 size={16} /> Finalizar conferência
        </button>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger" | "info";
}) {
  const c =
    tone === "ok"
      ? "var(--success)"
      : tone === "warn"
        ? "var(--warning)"
        : tone === "danger"
          ? "var(--danger)"
          : tone === "info"
            ? "var(--info)"
            : "var(--navy)";
  return (
    <div className="card-base p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1" style={{ color: c }}>
        {value}
      </div>
    </div>
  );
}
