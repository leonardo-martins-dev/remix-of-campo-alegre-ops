import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useTiposCaixa } from "@/hooks/use-tipos-caixa";
import { useConfirmarMovimento, useMovimentosFornecedor, useRegistrarMovimentoFornecedor } from "@/hooks/use-ledger";
import { enqueueFornecedorMov, getFornecedorQueue, removeFornecedorFromQueue } from "@/lib/offline-queue";
import { NumberStepper } from "@/components/number-stepper";

export const Route = createFileRoute("/fornecedor")({
  component: Page,
  head: () => ({ meta: [{ title: "Minhas caixas · Campo Alegre" }] }),
});

function Page() {
  const { user, profile } = useAuth();
  const fornecedorId = profile?.fornecedor_id ?? null;
  const { data: tipos = [] } = useTiposCaixa();
  const { data: movs = [] } = useMovimentosFornecedor(fornecedorId);
  const confirmar = useConfirmarMovimento();
  const registrar = useRegistrarMovimentoFornecedor();
  const [natureza, setNatureza] = useState<"entrega_vazias" | "recebimento_cheias">("entrega_vazias");
  const [tipo, setTipo] = useState("");
  const [qtd, setQtd] = useState(0);
  const [contest, setContest] = useState<Record<string, number>>({});

  useEffect(() => {
    async function flush() {
      if (!navigator.onLine || !user) return;
      for (const item of getFornecedorQueue()) {
        try {
          await registrar.mutateAsync({ ...item, natureza: item.natureza });
          removeFornecedorFromQueue(item.id);
        } catch { /* keep queued */ }
      }
    }
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [user, registrar]);

  if (!fornecedorId) {
    return <p className="text-sm text-muted-foreground">Usuário sem fornecedor vinculado.</p>;
  }
  const fid = fornecedorId;

  async function handleReg() {
    if (!user || !tipo || qtd <= 0) return;
    const payload = {
      fornecedor_id: fid,
      tipo_caixa: tipo,
      quantidade: qtd,
      natureza,
      registrado_por: user.id,
    };
    if (!navigator.onLine) {
      enqueueFornecedorMov(payload);
      toast.success("Guardado offline — sobe quando o sinal voltar");
      return;
    }
    try {
      await registrar.mutateAsync(payload);
      toast.success("Movimento enviado — aguardando Campo Alegre");
      setQtd(0);
    } catch (e) {
      enqueueFornecedorMov(payload);
      toast.error(e instanceof Error ? e.message : "Erro — ficou na fila");
    }
  }

  const pendentes = (movs as { id: string; confirmacao_status: string; tipo_caixa: string; quantidade: number; natureza: string; created_at: string }[])
    .filter((m) => m.confirmacao_status === "pendente");

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="Minhas caixas" subtitle="Confirme ou registre movimentos" />
      <div className="space-y-3">
        {pendentes.map((m) => (
          <div key={m.id} className="rounded-xl border p-3 space-y-2">
            <p className="text-sm font-medium">{m.natureza} · {m.quantidade} {m.tipo_caixa}</p>
            <p className="text-xs text-muted-foreground">{m.created_at.slice(0, 16)}</p>
            <div className="flex gap-2">
              <Button className="min-h-11 flex-1" onClick={() => confirmar.mutate({ id: m.id, acao: "confirmado", userId: user!.id }, { onSuccess: () => toast.success("Confirmado") })}>Confirmar</Button>
              <Button className="min-h-11 flex-1" variant="outline" onClick={() => confirmar.mutate({
                id: m.id, acao: "contestado", userId: user!.id, qtd_contestada: contest[m.id] ?? m.quantidade,
              }, { onSuccess: () => toast.success("Contestação enviada") })}>Contestar</Button>
            </div>
            <Input type="number" placeholder="Qtd que reconhece" value={contest[m.id] ?? ""} onChange={(e) => setContest((s) => ({ ...s, [m.id]: Number(e.target.value) }))} />
          </div>
        ))}
      </div>
      <div className="mt-8 rounded-xl border p-4 space-y-3">
        <h3 className="font-semibold">Registrar movimento</h3>
        <select className="h-11 w-full rounded-md border px-2" value={natureza} onChange={(e) => setNatureza(e.target.value as typeof natureza)}>
          <option value="entrega_vazias">Levei vazias</option>
          <option value="recebimento_cheias">Entreguei cheias</option>
        </select>
        <select className="h-11 w-full rounded-md border px-2" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Tipo…</option>
          {tipos.map((t) => <option key={t.id} value={t.sigla}>{t.sigla} · {t.nome}</option>)}
        </select>
        <NumberStepper value={qtd} onChange={setQtd} />
        <Button className="min-h-11 w-full" onClick={handleReg}>Registrar movimento</Button>
      </div>
    </div>
  );
}
