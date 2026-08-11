-- Enable RLS on the 6 remaining unprotected tables.
-- All are accessed server-side via service_role (which bypasses RLS),
-- so no SELECT/INSERT/UPDATE policies are needed — the goal is to block
-- accidental exposure through the anon key.

ALTER TABLE public.rita_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rita_citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rita_errores_reportados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clubes_moteros_antioquia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordatorios_programados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rita_email_campaigns ENABLE ROW LEVEL SECURITY;
