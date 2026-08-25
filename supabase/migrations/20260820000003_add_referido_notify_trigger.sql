create or replace function public.notify_referido_registrado()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://vzzxsdtsaahhzyctvmhx.supabase.co/functions/v1/referido-notify',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('rider_id', new.id)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_referido_registrado on public.riders;
create trigger trg_notify_referido_registrado
after insert on public.riders
for each row
execute function public.notify_referido_registrado();

create or replace function public.gen_codigo_referido()
returns trigger as $$
begin
  if new.codigo_referido is null then
    new.codigo_referido := upper(substr(regexp_replace(coalesce(new.slug, new.nombre, new.id::text), '[^a-zA-Z0-9]', '', 'g'), 1, 6)) || substr(new.id::text, 1, 4);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_gen_codigo_referido on public.riders;
create trigger trg_gen_codigo_referido
before insert on public.riders
for each row
execute function public.gen_codigo_referido();
