import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, Receipt, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useValesPendentes,
  useAplicarVale,
  useRecusarVale,
  type SolicitacaoVale,
} from "@/hooks/use-vales";
import { formatDateBRT } from "@/lib/utils-date";

export const Route = createFileRoute("/recebimento/vales")({
  component: Page,
  head: () => ({ meta: [{ title: "Vales pendentes · Campo Alegre" }] }),
});

function Page() {
  const { isAdmin } = useAuth();
  const { data: vales = [], isLoading } = useValesPendentes();
  const aplicar = useAplicarVale();
  const recusar = useRecusarVale();

  const [selectedVale, setSelectedVale] = useState<SolicitacaoVale | null>(null);
  const [action, setAction] = useState<"aplicar" | "recusar" | null>(null);
  const [valorFinal, setValorFinal] = useState("");
  const [motivoRecusa, setMotivoRecusa] = useState("");

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Acesso restrito a administradores.{" "}
        <Link to="/recebimento" className="text-primary-dark underline">
          Voltar
        </Link>
      </p>
    );
  }

  const openAplicar = (vale: SolicitacaoVale) => {
    setSelectedVale(vale);
    setValorFinal(vale.valor_calculado.toFixed(2));
    setAction("aplicar");
  };

  const openRecusar = (vale: SolicitacaoVale) => {
    setSelectedVale(vale);
    setMotivoRecusa("");
    setAction("recusar");
  };

  const submitAplicar = async () => {
    if (!selectedVale) return;
    const valor = parseFloat(valorFinal);
    if (isNaN(valor) || valor < 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      await aplicar.mutateAsync({ solicitacaoId: selectedVale.id, valorFinal: valor });
      toast.success("Vale aplicado com sucesso");
      setSelectedVale(null);
      setAction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aplicar vale");
    }
  };

  const submitRecusar = async () => {
    if (!selectedVale) return;
    if (!motivoRecusa.trim()) {
      toast.error("Motivo obrigatório para recusar");
      return;
    }
    try {
      await recusar.mutateAsync({ solicitacaoId: selectedVale.id, motivo: motivoRecusa.trim() });
      toast.success("Vale recusado");
      setSelectedVale(null);
      setAction(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao recusar vale");
    }
  };

  return (
    <div>
      <PageHeader
        title="Vales pendentes"
        subtitle="Solicitações de desconto por diferença no recebimento"
        actions={
          <Link
            to="/recebimento"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"
          >
            <ArrowLeft size={14} /> Voltar
          </Link>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && vales.length === 0 && (
        <div className="text-center py-12">
          <Receipt className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground mt-3">Nenhum vale pendente.</p>
        </div>
      )}

      <div className="space-y-4">
        {vales.map((vale) => (
          <div key={vale.id} className="card-base p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <div className="font-bold text-navy">{vale.produto_nome ?? "Produto"}</div>
                <div className="text-sm text-muted-foreground">
                  {vale.fornecedores?.nome ?? "—"} · Pedido {vale.pedidos_recebimento?.codigo ?? "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Conferente: {vale.conferente?.nome ?? "—"} · {formatDateBRT(vale.created_at)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-amber-600">
                  R$ {vale.valor_calculado.toFixed(2)}
                  {vale.estimado && <span className="text-xs font-normal ml-1">(estimado)</span>}
                </div>
                <div className="text-xs text-muted-foreground">Valor calculado</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-sm mb-3">
              <div className="p-2 rounded bg-secondary/50">
                <div className="font-semibold">{vale.quantidade_pedida}</div>
                <div className="text-xs text-muted-foreground">Pedido</div>
              </div>
              <div className="p-2 rounded bg-secondary/50">
                <div className="font-semibold">{vale.quantidade_recebida}</div>
                <div className="text-xs text-muted-foreground">Recebido</div>
              </div>
              <div className="p-2 rounded bg-amber-50 border border-amber-200">
                <div className="font-semibold text-amber-700">{vale.diferenca}</div>
                <div className="text-xs text-amber-600">Diferença</div>
              </div>
            </div>

            {vale.observacao_conferente && (
              <div className="mb-3 p-2 rounded bg-secondary/30 text-sm">
                <span className="font-medium">Obs:</span> {vale.observacao_conferente}
              </div>
            )}

            {vale.fotos && vale.fotos.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {vale.fotos.map((foto) => (
                  <a
                    key={foto.id}
                    href={foto.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative w-16 h-16 rounded-md overflow-hidden border hover:opacity-80"
                  >
                    <img src={foto.url} alt="" className="w-full h-full object-cover" />
                    <ExternalLink size={10} className="absolute bottom-1 right-1 text-white drop-shadow" />
                  </a>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => openAplicar(vale)}
                disabled={aplicar.isPending}
              >
                <CheckCircle2 size={14} className="mr-1" /> Aplicar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => openRecusar(vale)}
                disabled={recusar.isPending}
              >
                <XCircle size={14} className="mr-1" /> Recusar
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={action === "aplicar" && !!selectedVale} onOpenChange={() => { setAction(null); setSelectedVale(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar vale</DialogTitle>
          </DialogHeader>
          {selectedVale && (
            <div className="space-y-4">
              <div className="text-sm">
                <strong>{selectedVale.produto_nome}</strong> · {selectedVale.fornecedores?.nome}
              </div>
              <div className="text-sm text-muted-foreground">
                Diferença: {selectedVale.diferenca} {selectedVale.preco_unitario ? `× R$ ${selectedVale.preco_unitario.toFixed(2)}` : "(preço estimado)"}
              </div>
              <div className="space-y-2">
                <Label>Valor final do vale (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valorFinal}
                  onChange={(e) => setValorFinal(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Valor calculado: R$ {selectedVale.valor_calculado.toFixed(2)}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setSelectedVale(null); }}>
              Cancelar
            </Button>
            <Button onClick={submitAplicar} disabled={aplicar.isPending}>
              {aplicar.isPending ? "Aplicando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={action === "recusar" && !!selectedVale} onOpenChange={() => { setAction(null); setSelectedVale(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar vale</DialogTitle>
          </DialogHeader>
          {selectedVale && (
            <div className="space-y-4">
              <div className="text-sm">
                <strong>{selectedVale.produto_nome}</strong> · {selectedVale.fornecedores?.nome}
              </div>
              <div className="text-sm text-muted-foreground">
                Valor solicitado: R$ {selectedVale.valor_calculado.toFixed(2)}
              </div>
              <div className="space-y-2">
                <Label>Motivo da recusa (obrigatório)</Label>
                <Textarea
                  placeholder="Explique por que o vale está sendo recusado..."
                  value={motivoRecusa}
                  onChange={(e) => setMotivoRecusa(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setSelectedVale(null); }}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={submitRecusar} disabled={recusar.isPending || !motivoRecusa.trim()}>
              {recusar.isPending ? "Recusando..." : "Recusar vale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
