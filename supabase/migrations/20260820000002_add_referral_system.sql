-- Fase 3: sistema de referidos con recompensa en puntos (reutiliza el leaderboard existente)
alter table public.riders
  add column if not exists codigo_referido text;

update public.riders
set codigo_referido = upper(substr(regexp_replace(coalesce(slug, nombre, id::text), '[^a-zA-Z0-9]', '', 'g'), 1, 6)) || substr(id::text, 1, 4)
where codigo_referido is null;

create unique index if not exists idx_riders_codigo_referido on public.riders (codigo_referido);

create table if not exists public.referidos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  referidor_id uuid not null references public.riders(id) on delete cascade,
  telefono_invitado text not null,
  referido_id uuid references public.riders(id) on delete set null,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),
  premiado_at timestamptz
);

create index if not exists idx_referidos_telefono on public.referidos (telefono_invitado);
create index if not exists idx_referidos_referidor on public.referidos (referidor_id);
alter table public.referidos enable row level security;

create table if not exists public.puntos_bonus (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders(id) on delete cascade,
  motivo text not null,
  puntos integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_puntos_bonus_rider on public.puntos_bonus (rider_id);
alter table public.puntos_bonus enable row level security;
