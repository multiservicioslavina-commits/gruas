-- ─────────────────────────────────────────────────────────────────
-- Hoja de Vida del Motero — Phase 2: Traspaso de Propiedad
--
-- Función atómica para transferir una moto de un dueño a otro sin
-- perder su historial técnico (que ya vive en motorcycle_identity,
-- no en rider_motorcycles) y sin exponer las notas privadas del
-- dueño anterior al nuevo. El registro de propiedad viejo se cierra
-- (fecha_fin_propiedad), nunca se borra, así que rider_motorcycles
-- funciona como el historial de dueños de la moto.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION transfer_motorcycle_ownership(
  p_motorcycle_id UUID,
  p_new_rider_id UUID,
  p_documento_transferencia TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_identity RECORD;
  v_current_owner RECORD;
  v_new_ownership_id UUID;
BEGIN
  SELECT * INTO v_identity FROM motorcycle_identity WHERE id = p_motorcycle_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'motorcycle_id % no existe en motorcycle_identity', p_motorcycle_id;
  END IF;

  SELECT * INTO v_current_owner FROM rider_motorcycles
  WHERE motorcycle_id = p_motorcycle_id AND fecha_fin_propiedad IS NULL
  FOR UPDATE;

  IF FOUND AND v_current_owner.rider_id = p_new_rider_id THEN
    RAISE EXCEPTION 'El rider % ya es el dueño actual de esta moto', p_new_rider_id;
  END IF;

  IF FOUND THEN
    UPDATE rider_motorcycles
    SET fecha_fin_propiedad = CURRENT_DATE,
        esta_activa = FALSE,
        documento_transferencia = COALESCE(p_documento_transferencia, documento_transferencia),
        updated_at = NOW()
    WHERE id = v_current_owner.id;
  END IF;

  -- notas_privadas nunca se copian: el nuevo dueño arranca un registro de
  -- propiedad limpio. El historial técnico sigue disponible porque vive
  -- en motorcycle_id (motorcycle_identity), no en este registro.
  INSERT INTO rider_motorcycles (
    rider_id, motorcycle_id, marca, modelo, cc, placa, esta_activa, documento_transferencia
  ) VALUES (
    p_new_rider_id, p_motorcycle_id, v_identity.marca, v_identity.modelo, v_identity.cc,
    v_identity.placa, TRUE, p_documento_transferencia
  )
  RETURNING id INTO v_new_ownership_id;

  RETURN v_new_ownership_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION transfer_motorcycle_ownership IS
  'Transfiere una moto a un nuevo dueño de forma atómica: cierra el registro de propiedad actual (fecha_fin_propiedad) y crea uno nuevo para el rider entrante. No copia notas_privadas. El historial técnico (mantenimiento, reparaciones, llantas, batería, documentos) no se ve afectado porque cuelga de motorcycle_id, no de este registro.';
