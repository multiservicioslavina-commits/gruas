-- Fase 1: segmentación (tags) + automatizaciones de ciclo de vida
alter table public.rita_contacts
  add column if not exists tags text[] not null default '{}',
  add column if not exists bienvenida_enviada boolean not null default false,
  add column if not exists reactivacion_enviada_at date;

alter table public.riders
  add column if not exists tags text[] not null default '{}',
  add column if not exists perfil_recordatorio_enviado boolean not null default false;

create index if not exists idx_rita_contacts_tags on public.rita_contacts using gin (tags);
create index if not exists idx_riders_tags on public.riders using gin (tags);
