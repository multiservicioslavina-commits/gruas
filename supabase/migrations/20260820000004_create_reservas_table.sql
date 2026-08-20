-- Fase 4: reservas sin pago para talleres, almacenes, hoteles, restaurantes
create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  entidad_tipo text not null,
  entidad_id uuid not null,
  entidad_nombre text,
  rider_id uuid references public.riders(id) on delete set null,
  nombre_contacto text not null,
  telefono_contacto text not null,
  fecha_solicitada date,
  hora_solicitada text,
  nota text,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reservas_entidad on public.reservas (entidad_tipo, entidad_id);
create index if not exists idx_reservas_estado on public.reservas (estado);
alter table public.reservas enable row level security;
