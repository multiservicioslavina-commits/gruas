create table if not exists public.salud_motero_kb (
  id uuid primary key default gen_random_uuid(),
  categoria text not null, -- 'salud_viaje' | 'primeros_auxilios'
  tema text not null,
  palabras_clave text[] not null default '{}',
  contenido text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_salud_motero_kb_categoria on public.salud_motero_kb (categoria);
alter table public.salud_motero_kb enable row level security;
