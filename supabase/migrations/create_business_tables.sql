-- Migración: Crear tablas de negocios (talleres, almacenes, grúas)
-- y triggers para publicar en WordPress al aprobarse

-- ════════════════════════════════════════════════════════════════
-- TABLA: TALLERES
-- ════════════════════════════════════════════════════════════════
create table if not exists public.talleres (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  telefono text not null,
  ciudad text not null,
  descripcion text,
  estado text not null default 'pendiente', -- pendiente, aprobado, error
  wp_post_id bigint,
  error_msg text,
  aprobado_en timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.talleres enable row level security;
create policy "Talleres: anyone can insert"
  on public.talleres for insert
  with check (true);
create policy "Talleres: public can read approved"
  on public.talleres for select
  using (estado = 'aprobado');

-- ════════════════════════════════════════════════════════════════
-- TABLA: ALMACENES
-- ════════════════════════════════════════════════════════════════
create table if not exists public.almacenes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  telefono text not null,
  ciudad text not null,
  descripcion text,
  estado text not null default 'pendiente',
  wp_post_id bigint,
  error_msg text,
  aprobado_en timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.almacenes enable row level security;
create policy "Almacenes: anyone can insert"
  on public.almacenes for insert
  with check (true);
create policy "Almacenes: public can read approved"
  on public.almacenes for select
  using (estado = 'aprobado');

-- ════════════════════════════════════════════════════════════════
-- TABLA: GRÚAS
-- ════════════════════════════════════════════════════════════════
create table if not exists public.gruas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  telefono text not null,
  ciudad text not null,
  descripcion text,
  estado text not null default 'pendiente',
  wp_post_id bigint,
  error_msg text,
  aprobado_en timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.gruas enable row level security;
create policy "Grúas: anyone can insert"
  on public.gruas for insert
  with check (true);
create policy "Grúas: public can read approved"
  on public.gruas for select
  using (estado = 'aprobado');

-- ════════════════════════════════════════════════════════════════
-- FUNCTION: Disparar publicación en WordPress
-- ════════════════════════════════════════════════════════════════
create or replace function public.trigger_publish_on_approval()
returns trigger as $$
declare
  fn_url text;
  fn_token text;
  payload jsonb;
begin
  -- Solo procesar si el estado cambió a 'aprobado'
  if new.estado = 'aprobado' and old.estado != 'aprobado' then
    fn_url := 'https://' || current_setting('app.settings.supabase_url') || '/functions/v1/approve-and-publish';
    fn_token := current_setting('app.settings.supabase_anon_key');

    payload := jsonb_build_object(
      'tipo', TG_TABLE_NAME,
      'id', new.id,
      'datos', jsonb_build_object(
        'nombre', new.nombre,
        'email', new.email,
        'telefono', new.telefono,
        'ciudad', new.ciudad,
        'descripcion', new.descripcion
      )
    );

    -- Llamar edge function (asíncrono con pg_net si está disponible)
    begin
      perform
        net.http_post(
          fn_url,
          payload,
          headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || fn_token || '"}'::jsonb
        );
    exception when others then
      raise notice 'Error calling edge function: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- ════════════════════════════════════════════════════════════════
-- TRIGGERS: Escuchar cambios de estado
-- ════════════════════════════════════════════════════════════════
drop trigger if exists trigger_talleres_publish on public.talleres;
create trigger trigger_talleres_publish
  after update on public.talleres
  for each row
  execute function public.trigger_publish_on_approval();

drop trigger if exists trigger_almacenes_publish on public.almacenes;
create trigger trigger_almacenes_publish
  after update on public.almacenes
  for each row
  execute function public.trigger_publish_on_approval();

drop trigger if exists trigger_gruas_publish on public.gruas;
create trigger trigger_gruas_publish
  after update on public.gruas
  for each row
  execute function public.trigger_publish_on_approval();

-- ════════════════════════════════════════════════════════════════
-- VIEW: Panel de admin para revisar pendientes
-- ════════════════════════════════════════════════════════════════
create or replace view public.admin_registros_pendientes as
  select 'taller' as tipo, id, nombre, email, telefono, ciudad, estado, created_at
  from public.talleres
  union all
  select 'almacen', id, nombre, email, telefono, ciudad, estado, created_at
  from public.almacenes
  union all
  select 'grua', id, nombre, email, telefono, ciudad, estado, created_at
  from public.gruas
  order by created_at desc;
