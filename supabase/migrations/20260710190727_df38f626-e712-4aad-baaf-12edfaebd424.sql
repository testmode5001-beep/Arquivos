
-- Roles enum + table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Tighten clientes
DROP POLICY IF EXISTS "Autenticados gerenciam clientes" ON public.clientes;
CREATE POLICY "Team members read clientes"
  ON public.clientes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'member') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Team members insert clientes"
  ON public.clientes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'member') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Team members update clientes"
  ON public.clientes FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'member') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'member') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete clientes"
  ON public.clientes FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'member'));

-- Tighten consultas
DROP POLICY IF EXISTS "Autenticados gerenciam consultas" ON public.consultas;
CREATE POLICY "Team members read consultas"
  ON public.consultas FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'member') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Team members insert consultas"
  ON public.consultas FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'member') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete consultas"
  ON public.consultas FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Bootstrap: grant admin+member to all existing users so app keeps working
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'member'::public.app_role FROM auth.users
ON CONFLICT DO NOTHING;
