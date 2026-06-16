-- Seed: vincula destinatários do rateio a clientes com o mesmo nome (quando existirem)

INSERT INTO public.destinatario_cliente_map (destinatario_id, cliente_id)
SELECT d.id, c.id
FROM public.destinatarios d
JOIN public.clientes c ON lower(trim(c.nome)) = lower(trim(d.nome)) AND c.ativo = TRUE
WHERE d.ativo = TRUE
ON CONFLICT (destinatario_id, cliente_id) DO NOTHING;

-- Seeds nomeados do sistema (cria cliente se não existir e vincula)
DO $$
DECLARE
  pairs TEXT[][] := ARRAY[
    ARRAY['Campo Alegre', 'Campo Alegre'],
    ARRAY['Anderson', 'Anderson'],
    ARRAY['Parceiro Sul', 'Parceiro Sul']
  ];
  p TEXT[];
  v_dest UUID;
  v_cli UUID;
BEGIN
  FOREACH p SLICE 1 IN ARRAY pairs
  LOOP
    SELECT id INTO v_dest FROM public.destinatarios WHERE lower(trim(nome)) = lower(trim(p[1])) LIMIT 1;
    IF v_dest IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_cli FROM public.clientes WHERE lower(trim(nome)) = lower(trim(p[2])) LIMIT 1;
    IF v_cli IS NULL THEN
      INSERT INTO public.clientes (nome, ativo) VALUES (p[2], TRUE) RETURNING id INTO v_cli;
    END IF;

    INSERT INTO public.destinatario_cliente_map (destinatario_id, cliente_id)
    VALUES (v_dest, v_cli)
    ON CONFLICT (destinatario_id, cliente_id) DO NOTHING;
  END LOOP;
END $$;
