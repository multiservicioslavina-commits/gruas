-- Create trigger for automatic Rita responses
create or replace function trigger_rita_response()
returns trigger as $$
begin
  -- Solo procesar preguntas de usuarios (sender = 'user')
  if new.sender = 'user' then
    -- Llamar Edge Function de manera asincrónica
    perform net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/rita-respond',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'record', row_to_json(new)
      )
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if it exists
drop trigger if exists rita_response_trigger on connect_rita_dms;

-- Create trigger
create trigger rita_response_trigger
after insert on connect_rita_dms
for each row
execute function trigger_rita_response();
