/**
 * NOP-467 — dados para consulta reversa de cor da carga.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { VinculoCorCarga } from "@/lib/consulta-cor-carga";
import { one } from "@/lib/embed";

export type FornecedorComCor = {
  id: string;
  nome: string;
  codigoWise: string | null;
  cor: string | null;
};

export type DadosConsultaCorCarga = {
  fornecedoresComCor: FornecedorComCor[];
  /** Cores atribuídas a fornecedores ativos (mesmo sem produto). */
  coresAtribuidas: string[];
  vinculos: VinculoCorCarga[];
};

const KEY = ["consulta-cor-carga"] as const;

export function useConsultaCorCarga(enabled = true) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: async (): Promise<DadosConsultaCorCarga> => {
      const [forn, conv] = await Promise.all([
        supabase
          .from("fornecedores")
          .select("id, nome, codigo_wise, cor, ativo")
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("conversoes_fornecedor")
          .select("fornecedor_id, produto_id, ativo, produtos(id, nome)")
          .eq("ativo", true),
      ]);
      if (forn.error) throw forn.error;
      if (conv.error) throw conv.error;

      type FornRow = {
        id: string;
        nome: string;
        codigo_wise: string | null;
        cor: string | null;
        ativo: boolean;
      };
      const rows = (forn.data ?? []) as FornRow[];

      const fornecedoresComCor: FornecedorComCor[] = rows
        .filter((f) => f.cor)
        .map((f) => ({
          id: f.id,
          nome: f.nome,
          codigoWise: f.codigo_wise ?? null,
          cor: f.cor,
        }));

      const coresAtribuidas = fornecedoresComCor
        .map((f) => f.cor)
        .filter((c): c is string => !!c);

      const fornById = new Map(rows.map((f) => [f.id, f]));

      type ConvRow = {
        fornecedor_id: string;
        produto_id: string;
        produtos?: { id: string; nome: string } | { id: string; nome: string }[] | null;
      };

      const vinculos: VinculoCorCarga[] = [];
      for (const c of (conv.data ?? []) as ConvRow[]) {
        const f = fornById.get(c.fornecedor_id);
        if (!f?.cor || f.ativo === false) continue;
        const p = one(c.produtos);
        if (!p?.nome) continue;
        vinculos.push({
          fornecedorId: f.id,
          fornecedorNome: f.nome,
          fornecedorCodigo: f.codigo_wise,
          cor: f.cor,
          produtoId: c.produto_id,
          produtoNome: p.nome,
        });
      }

      return { fornecedoresComCor, coresAtribuidas, vinculos };
    },
  });
}
