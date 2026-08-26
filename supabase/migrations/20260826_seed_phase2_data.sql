-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 2 — Seed Initial Data
--
-- Datos de prueba para: grupos, rodadas, clima, vías cerradas
-- ─────────────────────────────────────────────────────────────────

-- Insertar grupos moteros de prueba
INSERT INTO rider_groups (nombre, tipo, descripcion, ubicacion) VALUES
  ('GS Colombia', 'club', 'Club oficial de BMW GS en Colombia', 'Medellín'),
  ('Triumph Medellín', 'club', 'Club Triumph Nacional', 'Medellín'),
  ('Rodada Oriente Antioquia', 'rodada_puntual', 'Rodada mensual por el Oriente', 'Medellín'),
  ('Harley-Davidson Club Medellín', 'club', 'HOG Medellín', 'Medellín'),
  ('Kawasaki Lovers', 'grupo_whatsapp', 'Grupo de Kawasaki en Medellín y alrededores', 'Medellín'),
  ('Club de Motos Bogotá', 'club', 'Club principal de Bogotá', 'Bogotá'),
  ('Ducati Racing', 'club', 'Club deportivo Ducati', 'Medellín'),
  ('Adventure Riders Colombia', 'club', 'Trail y aventura', 'Cali')
ON CONFLICT DO NOTHING;

-- Insertar eventos de clima para las próximas 2 semanas
INSERT INTO weather_events (zona, tipo_evento, descripcion, severidad, fecha_evento) VALUES
  ('Oriente Antioquia', 'lluvia', 'Lluvia moderada en la zona', 'media', CURRENT_DATE + INTERVAL '2 days'),
  ('Eje Cafetero', 'tormenta', 'Tormenta eléctrica esperada', 'alta', CURRENT_DATE + INTERVAL '3 days'),
  ('Valle de Aburrá', 'lluvia', 'Lluvias ligeras por la tarde', 'baja', CURRENT_DATE + INTERVAL '1 day'),
  ('Bogotá-Cundinamarca', 'niebla', 'Niebla densa en vías de acceso', 'media', CURRENT_DATE + INTERVAL '5 days'),
  ('Cauca', 'deslizamiento', 'Riesgo de deslizamientos por lluvia', 'alta', CURRENT_DATE + INTERVAL '4 days'),
  ('Santander', 'granizo', 'Alerta de granizo en zona alta', 'alta', CURRENT_DATE + INTERVAL '6 days'),
  ('Putumayo', 'lluvia', 'Lluvia persistente esperada', 'media', CURRENT_DATE + INTERVAL '7 days')
ON CONFLICT DO NOTHING;

-- Insertar incidentes de vía
INSERT INTO road_incidents (nombre_vía, tipo_incidente, descripcion, fecha_inicio, fecha_fin_estimada, ruta_alternativa, severidad) VALUES
  ('Medellín-Bogotá (Ruta 45)', 'derrumbe', 'Derrumbe en km 120 cerca de La Ceja. Se requiere desvío', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '3 days', 'Tomar ruta por Oriente: La Ceja → San Vicente → Cocora', 'alta'),
  ('Túnel de Occidente', 'obras', 'Trabajos de mantenimiento. Tránsito lento', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '10 days', 'Ruta por Guarne (añade 20 min)', 'media'),
  ('Bogotá-Girardot (Vía Ubaté)', 'accidente', 'Accidente múltiple. Una carril cerrado', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day', 'Ruta por Fumeque (más larga pero clara)', 'media'),
  ('Cali-Buenaventura', 'deslizamiento', 'Deslizamiento en Alto de La Línea. Vía cerrada', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 days', 'Ruta alterna por Armenia (9 horas)', 'alta'),
  ('Santa Marta-Riohacha', 'obras', 'Ampliación de vía. Tránsito restringido', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '15 days', 'Pasar a horas off-peak (madrugada)', 'baja')
ON CONFLICT DO NOTHING;

-- Insertar alertas de promociones/eventos importantes
INSERT INTO weather_events (zona, tipo_evento, descripcion, severidad, fecha_evento) VALUES
  ('Medellín', 'evento', '🏍️ Festival de Motos Medellín - Parque Bolívar', 'baja', CURRENT_DATE + INTERVAL '10 days'),
  ('Bogotá', 'evento', '🏍️ Encuentro Nacional de Motociclistas', 'baja', CURRENT_DATE + INTERVAL '15 days')
ON CONFLICT DO NOTHING;
