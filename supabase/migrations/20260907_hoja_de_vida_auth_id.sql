-- ─────────────────────────────────────────────────────────────────
-- Hoja de Vida del Motero — Registro con correo + recuperación
--
-- riders gana auth_id, igual que grueros/almacenes: vincula al rider
-- con una cuenta real de Supabase Auth (correo + contraseña), para
-- que "olvidé mi contraseña" funcione con el mismo mecanismo nativo
-- que ya usan esos paneles (resetPasswordForEmail, sin nada custom).
-- Nullable: los riders existentes (solo teléfono, sin cuenta) no se
-- ven afectados y siguen entrando igual que antes.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE riders ADD COLUMN IF NOT EXISTS
  auth_id UUID UNIQUE REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_riders_auth_id ON riders(auth_id);

COMMENT ON COLUMN riders.auth_id IS
  'Cuenta de Supabase Auth (correo + contraseña) del rider, si se registró con correo. NULL para riders solo-teléfono (creados por Rita/WhatsApp o el registro antiguo).';
