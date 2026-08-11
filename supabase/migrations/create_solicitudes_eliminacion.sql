-- Solicitudes de eliminación de cuenta y datos.
--
-- Google Play exige, para toda app que permita crear cuenta, una URL pública
-- donde el usuario pueda pedir la eliminación de su cuenta sin necesidad de
-- iniciar sesión ni escribir un correo. Esta tabla recibe esas solicitudes
-- desde /eliminar-cuenta.

CREATE TABLE IF NOT EXISTS public.solicitudes_eliminacion (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto      text NOT NULL,
  tipo_contacto text NOT NULL CHECK (tipo_contacto IN ('email', 'telefono')),
  motivo        text,
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente', 'procesada', 'rechazada')),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  procesado_en  timestamptz,
  nota_interna  text
);

CREATE INDEX IF NOT EXISTS solicitudes_eliminacion_estado_idx
  ON public.solicitudes_eliminacion (estado, creado_en DESC);

ALTER TABLE public.solicitudes_eliminacion ENABLE ROW LEVEL SECURITY;

-- El formulario es público y anónimo: cualquiera puede radicar una solicitud,
-- pero nadie puede leer las de los demás con la anon key. La lectura y el
-- procesamiento se hacen desde el panel admin con service_role, que bypasea RLS.
DROP POLICY IF EXISTS "anon puede radicar solicitud de eliminacion"
  ON public.solicitudes_eliminacion;

CREATE POLICY "anon puede radicar solicitud de eliminacion"
  ON public.solicitudes_eliminacion
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
