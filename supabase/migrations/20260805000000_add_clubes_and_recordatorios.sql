-- Clubes moteros de Antioquia
CREATE TABLE IF NOT EXISTS clubes_moteros_antioquia (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  ciudad_norm TEXT NOT NULL,
  departamento TEXT DEFAULT 'Antioquia',
  tipo TEXT NOT NULL, -- 'recreativo', 'competencia', 'caridad', 'touring', 'custom'
  telefono TEXT,
  whatsapp TEXT,
  facebook TEXT,
  instagram TEXT,
  sitio_web TEXT,
  descripcion TEXT,
  ubicacion TEXT,
  lat FLOAT,
  lng FLOAT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clubes_ciudad_norm ON clubes_moteros_antioquia(ciudad_norm);
CREATE INDEX IF NOT EXISTS idx_clubes_tipo ON clubes_moteros_antioquia(tipo);
CREATE INDEX IF NOT EXISTS idx_clubes_nombre_norm ON clubes_moteros_antioquia(nombre);

-- Recordatorios programados con soporte para Google Calendar
CREATE TABLE IF NOT EXISTS recordatorios_programados (
  id BIGSERIAL PRIMARY KEY,
  telefono TEXT NOT NULL,
  asunto TEXT NOT NULL,
  descripcion TEXT,
  fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL,
  tipo TEXT DEFAULT 'local', -- 'local', 'google_calendar'
  google_event_id TEXT,
  google_calendar_email TEXT,
  recordatorio_minutos INTEGER DEFAULT 30,
  enviado BOOLEAN DEFAULT false,
  enviado_at TIMESTAMP WITH TIME ZONE,
  cancelado BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_telefono ON recordatorios_programados(telefono);
CREATE INDEX IF NOT EXISTS idx_recordatorios_fecha_hora ON recordatorios_programados(fecha_hora);
CREATE INDEX IF NOT EXISTS idx_recordatorios_enviado ON recordatorios_programados(enviado);

-- Tokens de Google Calendar (para autenticación)
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id BIGSERIAL PRIMARY KEY,
  telefono TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  calendar_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_tokens_telefono ON google_calendar_tokens(telefono);
