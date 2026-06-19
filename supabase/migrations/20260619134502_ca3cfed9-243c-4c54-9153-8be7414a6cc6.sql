-- Tighten RLS: require authentication
DROP POLICY IF EXISTS "Acesso aberto a clientes" ON public.clientes;
DROP POLICY IF EXISTS "Acesso aberto a consultas" ON public.consultas;

REVOKE ALL ON public.clientes FROM anon;
REVOKE ALL ON public.consultas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultas TO authenticated;
GRANT ALL ON public.clientes TO service_role;
GRANT ALL ON public.consultas TO service_role;

CREATE POLICY "Autenticados gerenciam clientes" ON public.clientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados gerenciam consultas" ON public.consultas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);