-- Ya aplicada en Supabase (proyecto vzzxsdtsaahhzyctvmhx)
-- Migración: create_rides_members_tables

-- Tabla rides: cada rodada creada por un líder
create table if not exists public.rides (
  id         text primary key,
  nombre     text,
  lider_id   uuid not null references public.riders(id) on delete cascade,
  estado     text not null default 'activa',
  created_at timestamptz default now()
);

alter table public.rides enable row level security;

-- Tabla members: cada piloto dentro de una rodada
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  ride_id    text not null references public.rides(id) on delete cascade,
  uid        uuid not null references public.riders(id) on delete cascade,
  rol        text not null default 'rider',
  nombre     text,
  lat        double precision,
  lon        double precision,
  speed_kmh  double precision default 0,
  last_seen  timestamptz default now(),
  joined_at  timestamptz default now(),
  unique (ride_id, uid)
);

alter table public.members enable row level security;

-- RLS: rides
create policy "Riders can see rides they belong to"
  on public.rides for select
  using (
    id in (select ride_id from public.members where uid = auth.uid())
    or lider_id = auth.uid()
  );

create policy "Leaders can create rides"
  on public.rides for insert
  with check (lider_id = auth.uid());

create policy "Leaders can update their rides"
  on public.rides for update
  using (lider_id = auth.uid());

-- RLS: members
create policy "Members can read their own ride"
  on public.members for select
  using (ride_id in (
    select ride_id from public.members where uid = auth.uid()
  ));

create policy "Members can update their own row"
  on public.members for update
  using (uid = auth.uid())
  with check (uid = auth.uid());

create policy "Authenticated users can join rides"
  on public.members for insert
  with check (uid = auth.uid());

-- Vista estado en vivo
create or replace view public.member_live_status as
select
  *,
  case
    when extract(epoch from now() - last_seen) > 15 then 'perdido'
    when speed_kmh < 3 then 'detenido'
    else 'en_marcha'
  end as estado
from public.members;
