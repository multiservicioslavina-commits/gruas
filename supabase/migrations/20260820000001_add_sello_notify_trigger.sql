create or replace function public.notify_sello_aprobado()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://vzzxsdtsaahhzyctvmhx.supabase.co/functions/v1/sello-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('rider_id', new.rider_id, 'municipio_id', new.municipio_id)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_sello_aprobado_insert on public.sellos;
create trigger trg_notify_sello_aprobado_insert
after insert on public.sellos
for each row
when (new.estado = 'aprobado')
execute function public.notify_sello_aprobado();

drop trigger if exists trg_notify_sello_aprobado_update on public.sellos;
create trigger trg_notify_sello_aprobado_update
after update of estado on public.sellos
for each row
when (new.estado = 'aprobado' and old.estado is distinct from 'aprobado')
execute function public.notify_sello_aprobado();
