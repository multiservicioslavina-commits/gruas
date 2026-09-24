-- Corrección de seguridad — auditoría de septiembre 2026.
--
-- verify_admin_credentials no tenía ningún límite de intentos. El panel manda
-- usuario:contraseña en el cuerpo de CADA llamada, así que se podían probar
-- contraseñas contra admin_users sin freno alguno.
--
-- El límite se pone en el RPC y no en la edge function por tres razones: es
-- atómico, sobrevive a los arranques en frío del runtime de Deno, y cubre a
-- cualquier otro que llame al RPC en el futuro.
--
-- De paso, cada ingreso correcto vuelve a cifrar la contraseña con coste 12 si
-- el hash guardado traía uno más bajo (el usuario sembrado venía con coste 4).
-- Es transparente: la contraseña del admin no cambia, sólo su hash.

CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  username        text PRIMARY KEY,
  fallos          integer NOT NULL DEFAULT 0,
  primer_fallo_at timestamptz,
  bloqueado_hasta timestamptz
);

-- Sólo la alcanzan el propio RPC (SECURITY DEFINER) y service_role.
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_login_attempts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_admin_credentials(p_username text, p_password text)
RETURNS TABLE(role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  c_max     constant integer  := 8;                  -- fallos antes de bloquear
  c_ventana constant interval := interval '15 minutes';
  c_bloqueo constant interval := interval '15 minutes';
  v_fila    public.admin_login_attempts%ROWTYPE;
  v_role    text;
  v_fallos  integer;
BEGIN
  SELECT * INTO v_fila FROM public.admin_login_attempts
   WHERE username = p_username FOR UPDATE;

  -- Bloqueado: no se comprueba siquiera la contraseña.
  IF v_fila.bloqueado_hasta IS NOT NULL AND v_fila.bloqueado_hasta > now() THEN
    RETURN;
  END IF;

  SELECT a.role INTO v_role
    FROM public.admin_users a
   WHERE a.username = p_username
     AND a.password_hash = extensions.crypt(p_password, a.password_hash);

  IF v_role IS NOT NULL THEN
    DELETE FROM public.admin_login_attempts WHERE username = p_username;

    UPDATE public.admin_users a
       SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 12))
     WHERE a.username = p_username
       AND split_part(a.password_hash, '$', 3)::int < 12;

    role := v_role;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Fallo: cuenta dentro de la ventana y bloquea al llegar al tope.
  v_fallos := CASE
    WHEN v_fila.username IS NULL THEN 1
    WHEN v_fila.primer_fallo_at IS NULL OR v_fila.primer_fallo_at < now() - c_ventana THEN 1
    ELSE v_fila.fallos + 1
  END;

  INSERT INTO public.admin_login_attempts (username, fallos, primer_fallo_at, bloqueado_hasta)
  VALUES (
    p_username,
    v_fallos,
    CASE WHEN v_fallos = 1 THEN now() ELSE v_fila.primer_fallo_at END,
    CASE WHEN v_fallos >= c_max THEN now() + c_bloqueo ELSE NULL END
  )
  ON CONFLICT (username) DO UPDATE
     SET fallos          = EXCLUDED.fallos,
         primer_fallo_at = EXCLUDED.primer_fallo_at,
         bloqueado_hasta = EXCLUDED.bloqueado_hasta;

  RETURN;
END;
$function$;
