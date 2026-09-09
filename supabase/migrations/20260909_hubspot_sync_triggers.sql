-- Sincronizacion Ridera -> HubSpot CRM. Dispara sobre el INSERT de la fila,
-- sin importar si esta se creo desde un edge function propio (registrar-club,
-- registrar-gruero) o con un INSERT directo con la llave anonima desde una
-- pagina de WordPress que no vive en este repo (talleres, almacenes): el
-- trigger de Postgres corre igual porque vive en la tabla, no en el camino
-- de entrada. hubspot-sync decide que hacer segun el "tipo".

create or replace function public.notify_hubspot_sync()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://vzzxsdtsaahhzyctvmhx.supabase.co/functions/v1/hubspot-sync',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('tipo', tg_argv[0], 'record', to_jsonb(new))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_hubspot_sync_talleres on public.talleres;
create trigger trg_hubspot_sync_talleres
after insert on public.talleres
for each row execute function public.notify_hubspot_sync('taller');

drop trigger if exists trg_hubspot_sync_grueros on public.grueros;
create trigger trg_hubspot_sync_grueros
after insert on public.grueros
for each row execute function public.notify_hubspot_sync('gruero');

drop trigger if exists trg_hubspot_sync_almacenes on public.almacenes;
create trigger trg_hubspot_sync_almacenes
after insert on public.almacenes
for each row execute function public.notify_hubspot_sync('almacen');

drop trigger if exists trg_hubspot_sync_clubs on public.clubs;
create trigger trg_hubspot_sync_clubs
after insert on public.clubs
for each row execute function public.notify_hubspot_sync('club');

drop trigger if exists trg_hubspot_sync_riders on public.riders;
create trigger trg_hubspot_sync_riders
after insert on public.riders
for each row execute function public.notify_hubspot_sync('rider');
