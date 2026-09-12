-- ============================================================
-- NOP-16: Quebra no galpão com mesmo fluxo do supermercado
-- Adiciona tipo de ocorrência (quebra/falta de qualidade) e evidências
-- ============================================================

-- 1. Tipo de ocorrência para quebras
DO $$ BEGIN
  CREATE TYPE public.tipo_ocorrencia_quebra AS ENUM ('quebra', 'falta_de_qualidade');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Adiciona campos à tabela quebra_itens
ALTER TABLE public.quebra_itens
  ADD COLUMN IF NOT EXISTS tipo_ocorrencia public.tipo_ocorrencia_quebra NOT NULL DEFAULT 'quebra',
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS observacao TEXT;

-- 3. Adiciona campos à tabela quebras (laudo/aprovação)
ALTER TABLE public.quebras
  ADD COLUMN IF NOT EXISTS aprovado_por UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ;

-- 4. Criar bucket de storage para fotos de quebra se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('quebra-fotos', 'quebra-fotos', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Política de storage para fotos de quebra
DROP POLICY IF EXISTS "Authenticated users can upload quebra photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload quebra photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'quebra-fotos');

DROP POLICY IF EXISTS "Anyone can view quebra photos" ON storage.objects;
CREATE POLICY "Anyone can view quebra photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'quebra-fotos');

DROP POLICY IF EXISTS "Authenticated users can update quebra photos" ON storage.objects;
CREATE POLICY "Authenticated users can update quebra photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'quebra-fotos');

DROP POLICY IF EXISTS "Authenticated users can delete quebra photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete quebra photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'quebra-fotos');

-- 6. Índice para melhorar consultas por tipo
CREATE INDEX IF NOT EXISTS idx_quebra_itens_tipo_ocorrencia 
ON public.quebra_itens(tipo_ocorrencia);

-- 7. Comentários para documentação
COMMENT ON COLUMN public.quebra_itens.tipo_ocorrencia IS 'Tipo: quebra ou falta_de_qualidade';
COMMENT ON COLUMN public.quebra_itens.foto_url IS 'URL da foto de evidência';
COMMENT ON COLUMN public.quebra_itens.observacao IS 'Observação específica do item';
COMMENT ON COLUMN public.quebras.aprovado_por IS 'ID do usuário que aprovou o laudo';
COMMENT ON COLUMN public.quebras.aprovado_em IS 'Data/hora de aprovação do laudo';
