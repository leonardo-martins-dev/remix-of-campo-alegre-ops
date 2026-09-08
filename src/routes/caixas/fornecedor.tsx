import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useFornecedores } from "@/hooks/use-cadastros";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useMovimentosFornecedor, useRegistrarMovimentoFornecedor } from "@/hooks/use-ledger";
import { NumberStepper } from "@/components/number-stepper";

export const Route = createFileRoute("/caixas/fornecedor")({
  component: Page,
  head: () => ({ meta: [{ title: "Movimento com fornecedor · Campo Alegre" }] }),
});

function Page() {
  const { user } = useAuth();
  const { data: fornecedores = [] } = useFornecedores();
  const { data: tipos = [] } = useTiposCaixa();
  const [fornecedorId, setFornecedorId] = useState("");
  const [natureza, setNatureza] = useState<"entrega_vazias" | "recebimento_cheias">("entrega_vazias");
  const [tipo, setTipo] = useState("");
  const [qtd, setQtd] = useState(0);
  const [obs, setObs] = useState("");
  const { data: extrato = [] } = useMovimentosFornecedor(fornecedorId || null);
  const registrar = useRegistrarMovimentoFornecedor();

  async function handleSave() {
    if (!user || !fornecedorId || !tipo || qtd <= 0) {
      toast.error("Preencha fornecedor, tipo e quantidade");
      return;
    }
    try {
      await registrar.mutateAsync({
        fornecedor_id: fornecedorId,
        tipo_caixa: tipo,
        quantidade: qtd,
        natureza,
        registrado_por: user.id,
        observacoes: obs,
      });
      toast.success("Movimento registrado");
      setQtd(0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader title="Movimento com fornecedor" subtitle="Uso na doca — fornecedor passou só para buscar vazias" />
      <div className="max-w-lg space-y-4 rounded-xl border border-border bg-card p-4">
        <select className="h-11 w-full rounded-md border px-2" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
          <option value="">Fornecedor…</option>
          {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <select className="h-11 w-full rounded-md border px-2" value={natureza} onChange={(e) => setNatureza(e.target.value as typeof natureza)}>
          <option value="entrega_vazias">Entregou vazias</option>
          <option value="recebimento_cheias">Recebeu cheias</option>
        </select>
        <select className="h-11 w-full rounded-md border px-2" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Tipo de caixa…</option>
          {tipos.map((t) => <option key={t.id} value={t.sigla}>{t.nome} ({t.sigla})</option>)}
        </select>
        <NumberStepper value={qtd} onChange={setQtd} />
        <Input placeholder="Observação" value={obs} onChange={(e) => setObs(e.target.value)} />
        <Button className="min-h-11 w-full" onClick={handleSave} disabled={registrar.isPending}>Registrar</Button>
      </div>
      {fornecedorId && (
        <div className="mt-6 max-w-lg text-sm space-y-1">
          <h3 className="font-semibold">Extrato</h3>
          {(extrato as { id: string; created_at: string; tipo_caixa: string; quantidade: number; natureza: string; documento_tipo: string }[]).map((m) => (
            <p key={m.id}>{m.created_at.slice(0, 16)} · {m.natureza} {m.quantidade} {m.tipo_caixa} · {m.documento_tipo}</p>
          ))}
        </div>
      )}
    </div>
  );
}
