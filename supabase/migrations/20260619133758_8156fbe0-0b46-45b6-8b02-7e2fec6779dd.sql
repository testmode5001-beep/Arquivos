
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo integer NOT NULL UNIQUE,
  nome text NOT NULL,
  gaveta text,
  pasta text,
  obs text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clientes_nome ON public.clientes USING gin (to_tsvector('portuguese', nome));
CREATE INDEX idx_clientes_nome_trgm ON public.clientes (lower(nome) text_pattern_ops);
CREATE INDEX idx_clientes_pasta ON public.clientes (pasta);
CREATE INDEX idx_clientes_codigo ON public.clientes (codigo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO anon, authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso aberto a clientes" ON public.clientes FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.consultas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  consultado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consultas_cliente ON public.consultas (cliente_id, consultado_em DESC);

GRANT SELECT, INSERT, DELETE ON public.consultas TO anon, authenticated;
GRANT ALL ON public.consultas TO service_role;
ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso aberto a consultas" ON public.consultas FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_clientes_touch BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
