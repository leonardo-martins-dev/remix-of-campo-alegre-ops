import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type SugestaoCaixa = {
  tipo_caixa_id: string;
  tipo_caixa_sigla: string;
  tipo_caixa_nome: string;
  fator: number;
  quantidade_caixas: number;
};

export type SugestaoItem = {
  produto_id: string;
  quantidade: number;
  sugestoes: SugestaoCaixa[];
  sem_conversao: boolean;
};

export type SugestaoItemMap = Map<string, SugestaoItem>;

async function resolverSugestoes(
  fornecedorId: string,
  itens: { produto_id: string; quantidade: number }[]
): Promise<SugestaoItemMap> {
  const result: SugestaoItemMap = new Map();
  if (!fornecedorId || !itens.length) return result;

  const produtoIds = [...new Set(itens.map((i) => i.produto_id).filter(Boolean))];
  if (!produtoIds.length) return result;

  const { data: tipos } = await supabase
    .from("tipos_caixa")
    .select("id, sigla, nome")
    .eq("ativo", true)
    .order("ordem");

  if (!tipos?.length) return result;

  const { data: conversoesFornecedor } = await supabase
    .from("conversoes_fornecedor")
    .select("produto_id, tipo_caixa_id, fator")
    .eq("fornecedor_id", fornecedorId)
    .eq("ativo", true)
    .in("produto_id", produtoIds);

  const { data: conversoesProduto } = await supabase
    .from("conversoes_produto_caixa")
    .select("produto_id, tipo_caixa_id, fator")
    .eq("ativo", true)
    .in("produto_id", produtoIds);

  const fornKey = (prodId: string, tipoId: string) => `${prodId}:${tipoId}`;
  const fornMap = new Map(
    (conversoesFornecedor ?? []).map((c) => [fornKey(c.produto_id, c.tipo_caixa_id), c.fator])
  );
  const prodMap = new Map(
    (conversoesProduto ?? []).map((c) => [fornKey(c.produto_id, c.tipo_caixa_id), c.fator])
  );

  for (const item of itens) {
    if (!item.produto_id) continue;

    const sugestoes: SugestaoCaixa[] = [];

    for (const tipo of tipos) {
      const key = fornKey(item.produto_id, tipo.id);
      const fator = fornMap.get(key) ?? prodMap.get(key);

      if (fator && fator > 0) {
        sugestoes.push({
          tipo_caixa_id: tipo.id,
          tipo_caixa_sigla: tipo.sigla,
          tipo_caixa_nome: tipo.nome,
          fator,
          quantidade_caixas: Math.ceil(item.quantidade / fator),
        });
      }
    }

    result.set(item.produto_id, {
      produto_id: item.produto_id,
      quantidade: item.quantidade,
      sugestoes,
      sem_conversao: sugestoes.length === 0,
    });
  }

  return result;
}

export function useSugestaoCaixas(
  fornecedorId: string | null | undefined,
  itens: { produto_id: string | null | undefined; quantidade: number }[]
) {
  const filteredItens = itens
    .filter((i): i is { produto_id: string; quantidade: number } => !!i.produto_id && i.quantidade > 0)
    .map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade }));

  const itemsKey = filteredItens.map((i) => `${i.produto_id}:${i.quantidade}`).join("|");

  return useQuery({
    queryKey: ["sugestao-caixas", fornecedorId, itemsKey],
    queryFn: () => resolverSugestoes(fornecedorId!, filteredItens),
    enabled: !!fornecedorId && filteredItens.length > 0,
    staleTime: 30000,
  });
}

export function formatSugestao(sugestao: SugestaoItem): string {
  if (sugestao.sem_conversao) return "";
  return sugestao.sugestoes
    .map((s) => `${s.quantidade_caixas} cx ${s.tipo_caixa_sigla} (${s.fator}/cx)`)
    .join(" ou ");
}

export function useSugestaoSingleItem(
  fornecedorId: string | null | undefined,
  produtoId: string | null | undefined,
  quantidade: number
) {
  return useSugestaoCaixas(fornecedorId, [{ produto_id: produtoId, quantidade }]);
}
