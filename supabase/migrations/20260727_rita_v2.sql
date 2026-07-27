-- ─────────────────────────────────────────────────────────────────
-- Rita v2: consentimiento, memoria, auditoria y busqueda sin tildes
-- ─────────────────────────────────────────────────────────────────

-- Consentimiento de comunicaciones (habeas data / Ley 1581 Colombia)
create table if not exists public.rita_consentimiento (
  telefono              text primary key,
  acepta                boolean not null default false,
  categorias            text[] not null default '{}',
  canal                 text not null default 'whatsapp',
  fecha_consentimiento  timestamptz,
  fecha_revocacion      timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.rita_consentimiento is
  'Consentimiento explicito del usuario para recibir comunicaciones de Ridera. Guarda fecha, canal, estado y categorias elegidas.';
comment on column public.rita_consentimiento.categorias is
  'Categorias aceptadas: noticias, rodadas, marketplace, eventos, mantenimiento, seguridad_vial, promociones, novedades';

-- Preferencias y memoria de largo plazo del rider
create table if not exists public.rita_preferencias (
  telefono    text not null,
  clave       text not null,
  valor       text not null,
  updated_at  timestamptz not null default now(),
  primary key (telefono, clave)
);

comment on table public.rita_preferencias is
  'Memoria de largo plazo de Rita: rutas favoritas, talleres favoritos, estilo de conduccion, destinos pendientes, etc.';

-- Auditoria de acciones ejecutadas por Rita
create table if not exists public.rita_acciones_log (
  id           uuid primary key default gen_random_uuid(),
  telefono     text not null,
  herramienta  text not null,
  parametros   jsonb,
  ok           boolean not null default true,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists rita_acciones_log_telefono_idx
  on public.rita_acciones_log (telefono, created_at desc);

comment on table public.rita_acciones_log is
  'Registro de cada herramienta que Rita ejecuta, con parametros y resultado. Para auditoria y depuracion.';

-- RLS activo sin policies: solo service_role (edge functions) tiene acceso
alter table public.rita_consentimiento enable row level security;
alter table public.rita_preferencias   enable row level security;
alter table public.rita_acciones_log   enable row level security;

-- ── Busqueda sin tildes ───────────────────────────────────────────
-- El buscador de Rita normaliza el mensaje del usuario quitando tildes, pero los
-- datos SI las tienen: 'jardin' nunca hacia match contra 'Jardín'. Eso dejaba
-- invisibles 50 de 125 municipios y las 124 rutas.
create extension if not exists unaccent;

-- unaccent() es STABLE, no IMMUTABLE, y las columnas generadas exigen IMMUTABLE.
-- Fijar el diccionario explicitamente la vuelve deterministica.
create or replace function public.sin_tildes(txt text)
returns text
language sql
immutable
strict
parallel safe
as $$ select lower(public.unaccent('public.unaccent'::regdictionary, txt)) $$;

comment on function public.sin_tildes(text) is
  'Pasa a minusculas y quita tildes. Usada en columnas generadas para que las busquedas de Rita funcionen escriba el usuario con tilde o sin ella.';

alter table public.rita_municipios
  add column if not exists nombre_norm text generated always as (public.sin_tildes(nombre)) stored;
create index if not exists rita_municipios_nombre_norm_idx
  on public.rita_municipios (nombre_norm text_pattern_ops);

alter table public.rita_rutas
  add column if not exists destino_norm text generated always as (public.sin_tildes(destino)) stored,
  add column if not exists titulo_norm  text generated always as (public.sin_tildes(titulo))  stored;
create index if not exists rita_rutas_destino_norm_idx on public.rita_rutas (destino_norm text_pattern_ops);
create index if not exists rita_rutas_titulo_norm_idx  on public.rita_rutas (titulo_norm  text_pattern_ops);

alter table public.talleres
  add column if not exists ciudad_norm text generated always as (public.sin_tildes(ciudad)) stored;
create index if not exists talleres_ciudad_norm_idx on public.talleres (ciudad_norm text_pattern_ops);

alter table public.motos_venta
  add column if not exists ciudad_norm text generated always as (public.sin_tildes(ciudad)) stored,
  add column if not exists marca_norm  text generated always as (public.sin_tildes(marca))  stored,
  add column if not exists modelo_norm text generated always as (public.sin_tildes(modelo)) stored;
create index if not exists motos_venta_ciudad_norm_idx on public.motos_venta (ciudad_norm text_pattern_ops);
create index if not exists motos_venta_marca_norm_idx  on public.motos_venta (marca_norm  text_pattern_ops);

alter table public.garage_motos
  add column if not exists marca_norm  text generated always as (public.sin_tildes(marca))  stored,
  add column if not exists modelo_norm text generated always as (public.sin_tildes(modelo)) stored;
create index if not exists garage_motos_marca_norm_idx on public.garage_motos (marca_norm text_pattern_ops);
