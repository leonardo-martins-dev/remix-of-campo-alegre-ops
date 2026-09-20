import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SeletorCadastro } from "@/components/seletor-cadastro";
import { formatDateBRT } from "@/lib/utils-date";
import type { ImportPreview } from "@/hooks/use-wise-pedidos";
import { useAliasRapido } from "@/hooks/use-wise-pedidos";
import { buildWisePedidos, type AliasRow } from "@/lib/excel-wise-pedidos";
import { mapsFromCadastros } from "@/hooks/use-wise-pedidos";

type Props = {
  preview: ImportPreview | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  confirming: boolean;
  fornecedores: { id: string; nome: string }[];
  produtos: { id: string; nome: string; codigo?: string | null }[];
  onRebuild: (next: ImportPreview) => void;
  aliases: AliasRow[];
  destinatarios: { id: string; nome: string }[];
  clientes: { id: string; nome: string; cnpj?: string | null }[];
};

export function ImportacaoWiseDialog({
  preview,
  onClose,
  onConfirm,
  confirming,
  fornecedores,
  produtos,
  onRebuild,
  aliases,
  destinatarios,
  clientes,
}: Props) {
  const aliasMut = useAliasRapido();
  const [pickForn, setPickForn] = useState<Record<string, string>>({});
  const [pickProd, setPickProd] = useState<Record<string, string>>({});
  const [extraAliases, setExtraAliases] = useState<AliasRow[]>([]);

  const counts = useMemo(() => {
    if (!preview) return null;
    const novos = preview.pedidos.filter((p) => !preview.existentes.includes(p.wise_pedido_id)).length;
    const existentes = preview.pedidos.length - novos;
    const forn = new Map<string, number>();
    const prod = new Map<string, { n: number; codigo?: string }>();
    for (const p of preview.pedidos) {
      if (!p.fornecedor_id && p.fornecedor_nome) forn.set(p.fornecedor_nome, (forn.get(p.fornecedor_nome) ?? 0) + 1);
      for (const i of p.itens) {
        if (!i.produto_id) {
          const key = i.produto_nome || i.codigo_produto;
          const cur = prod.get(key) ?? { n: 0, codigo: i.codigo_produto };
          cur.n += 1;
          prod.set(key, cur);
        }
      }
    }
    return { novos, existentes, forn, prod };
  }, [preview]);

  if (!preview || !counts) return null;

  const rebuildWithAlias = async (tipo: "fornecedor" | "produto", nome: string, codigo: string | undefined, entidadeId: string) => {
    await aliasMut.mutateAsync({ tipo, nomeExterno: nome, codigoExterno: codigo ?? null, entidadeId });
    const added: AliasRow = { tipo, nome_externo: nome, codigo_externo: codigo ?? null, entidade_id: entidadeId };
    const nextAliases: AliasRow[] = [...aliases, ...extraAliases, added];
    setExtraAliases((s) => [...s, added]);
    const maps = mapsFromCadastros(fornecedores, produtos, destinatarios, clientes, nextAliases);
    const rows = preview.pedidos.flatMap((p) =>
      p.itens.map((i) => ({
        pedido: p.wise_pedido_id,
        codigo_fornecedor: p.codigo_fornecedor,
        fornecedor: p.fornecedor_nome,
        codigo_produto: i.codigo_produto,
        produto: i.produto_nome,
        quantidade: i.quantidade,
        unidade: i.unidade,
        preco_unitario: i.preco_unitario,
        loja: "",
        data_prevista: p.data_prevista,
        familia: i.familia ?? "",
      }))
    );
    onRebuild({ ...preview, pedidos: buildWisePedidos(rows, maps) });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prévia da importação</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {preview.filename} · {preview.linhasLidas} linhas lidas
          {preview.sheet ? ` · aba ${preview.sheet}` : ""}
        </p>
        {preview.arquivoAnterior && (
          <div className="rounded-md bg-warning/15 p-3 text-sm">
            Este arquivo já foi importado em {formatDateBRT(preview.arquivoAnterior.created_at.slice(0, 10))} e criou{" "}
            {preview.arquivoAnterior.pedidos_novos} pedidos.
          </div>
        )}
        {preview.semItens && (
          <div className="rounded-md bg-destructive/10 text-destructive p-3 text-sm">
            Este arquivo não traz itens (produto/quantidade). Importar cria pedidos vazios que não podem ser conferidos. Cancele e use o modelo ou a exportação com itens.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <Stat label="Pedidos novos" value={counts.novos} />
          <Stat label="Já existentes (atualiza)" value={counts.existentes} />
          <Stat label="Linhas com erro" value={preview.ignoradas.length} />
          <Stat label="Itens sem preço" value={preview.semPreco} />
          <Stat label="Unidade vazia" value={preview.unidadeVazia} />
          <Stat label="Fornecedores novos" value={preview.fornecedoresCriados.length} />
        </div>
        {preview.fornecedoresCriados.length > 0 && (
          <div className="rounded-md bg-secondary/60 p-3 text-sm">
            <p className="font-medium">
              {preview.fornecedoresCriados.length} fornecedor(es) cadastrado(s) automaticamente a partir do Wise.
            </p>
            <ul className="mt-2 max-h-40 overflow-auto text-xs text-muted-foreground space-y-0.5">
              {preview.fornecedoresCriados.map((nome) => (
                <li key={nome}>{nome}</li>
              ))}
            </ul>
          </div>
        )}
        {preview.unidadeVazia > 0 && (
          <p className="text-xs text-muted-foreground">Há itens sem unidade. A conferência usa UN/PC/KG — preencha ou deixe vazio para completar depois.</p>
        )}
        {preview.ignoradas.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Linhas ignoradas</div>
            <ul className="text-xs space-y-1 max-h-32 overflow-auto">
              {preview.ignoradas.map((i) => (
                <li key={`${i.linha}-${i.coluna}`}>{i.motivo}</li>
              ))}
            </ul>
          </div>
        )}
        {counts.forn.size > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Fornecedores não reconhecidos</div>
            {[...counts.forn.entries()].map(([nome, n]) => (
              <div key={nome} className="flex gap-2 items-center py-1 text-sm">
                <span className="flex-1">{nome} · {n}x</span>
                <div className="w-52">
                  <SeletorCadastro
                    tipo="fornecedor"
                    value={pickForn[nome] ?? null}
                    onChange={(id) => setPickForn((s) => ({ ...s, [nome]: id }))}
                    placeholder="Vincular a…"
                  />
                </div>
                <Button size="sm" variant="outline" disabled={!pickForn[nome] || aliasMut.isPending} onClick={() => rebuildWithAlias("fornecedor", nome, undefined, pickForn[nome])}>
                  Vincular
                </Button>
              </div>
            ))}
          </div>
        )}
        {counts.prod.size > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Produtos não reconhecidos</div>
            {[...counts.prod.entries()].map(([nome, info]) => (
              <div key={nome} className="flex gap-2 items-center py-1 text-sm">
                <span className="flex-1">{nome}{info.codigo ? ` · ${info.codigo}` : ""} · {info.n}x</span>
                <div className="w-52">
                  <SeletorCadastro
                    tipo="produto"
                    value={pickProd[nome] ?? null}
                    onChange={(id) => setPickProd((s) => ({ ...s, [nome]: id }))}
                    placeholder="Vincular a…"
                  />
                </div>
                <Button size="sm" variant="outline" disabled={!pickProd[nome] || aliasMut.isPending} onClick={() => rebuildWithAlias("produto", nome, info.codigo, pickProd[nome])}>
                  Vincular
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={confirming || preview.semItens} onClick={() => void onConfirm().catch((e) => toast.error(e instanceof Error ? e.message : "Erro ao gravar"))}>
            {confirming ? "Gravando…" : "Confirmar importação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
