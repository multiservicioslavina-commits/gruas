-- Directorio de clubes: verificacion oficial, proxima rodada y postulaciones
-- de aspirantes que llegan desde la tarjeta publica en ridera.com.co/clubes/.

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS verificado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS proxima_rodada JSONB;

-- Postulaciones de aspirantes a un club (distinto de connect_members, que es
-- el acceso al chat del club: aqui es "quiero entrar al club" desde la
-- tarjeta publica del directorio, antes de que exista ninguna cuenta).
CREATE TABLE IF NOT EXISTS club_postulaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  moto_marca TEXT,
  moto_modelo TEXT,
  moto_cc TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  avisado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_club_postulaciones_club_id ON club_postulaciones(club_id);

-- RLS activado y sin policies: solo el edge function (service_role) puede
-- leer o escribir aqui. Lleva telefonos de aspirantes, no debe quedar
-- expuesto por PostgREST con la llave anonima como si fuera una tabla publica.
ALTER TABLE club_postulaciones ENABLE ROW LEVEL SECURITY;
