-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 5 — Seed Analytics Data
--
-- Insertar datos de ejemplo para análisis de conducción
-- ─────────────────────────────────────────────────────────────────

-- Insertar sesiones de conducción de ejemplo
INSERT INTO rider_sessions (rider_id, fecha_inicio, fecha_fin, duracion_minutos, distancia_km, velocidad_promedio, velocidad_maxima, consumo_combustible_litros, ruta_id, clima, tipo_via, seguridad_score)
SELECT
  riders.id,
  NOW() - INTERVAL '30 days' + (n || ' minutes')::INTERVAL,
  NOW() - INTERVAL '30 days' + ((n + 45) || ' minutes')::INTERVAL,
  45,
  CASE WHEN n % 5 = 0 THEN 38 WHEN n % 5 = 1 THEN 45 WHEN n % 5 = 2 THEN 52 WHEN n % 5 = 3 THEN 28 ELSE 62 END,
  CASE WHEN n % 5 = 0 THEN 42 WHEN n % 5 = 1 THEN 48 WHEN n % 5 = 2 THEN 55 WHEN n % 5 = 3 THEN 32 ELSE 68 END,
  CASE WHEN n % 5 = 0 THEN 78 WHEN n % 5 = 1 THEN 85 WHEN n % 5 = 2 THEN 95 WHEN n % 5 = 3 THEN 60 ELSE 110 END,
  CASE WHEN n % 5 = 0 THEN 1.2 WHEN n % 5 = 1 THEN 1.5 WHEN n % 5 = 2 THEN 1.8 WHEN n % 5 = 3 THEN 0.9 ELSE 2.1 END,
  NULL,
  CASE WHEN n % 4 = 0 THEN 'Despejado' WHEN n % 4 = 1 THEN 'Nublado' WHEN n % 4 = 2 THEN 'Lluvia ligera' ELSE 'Soleado' END,
  CASE WHEN n % 4 = 0 THEN 'carretera' WHEN n % 4 = 1 THEN 'ciudad' WHEN n % 4 = 2 THEN 'autopista' ELSE 'montaña' END,
  CASE WHEN n % 3 = 0 THEN 95 WHEN n % 3 = 1 THEN 88 ELSE 92 END
FROM riders, generate_series(0, 24, 6) n
LIMIT 100;

-- Insertar estadísticas diarias agregadas
INSERT INTO rider_daily_stats (rider_id, fecha, total_sesiones, total_distancia_km, total_duracion_minutos, velocidad_promedio, velocidad_maxima, consumo_total_litros, seguridad_score_promedio)
SELECT DISTINCT
  riders.id,
  (NOW() - INTERVAL '1 day' * n)::DATE,
  CASE WHEN random() > 0.5 THEN 2 ELSE 3 END,
  CASE WHEN random() > 0.5 THEN 95 ELSE 125 END,
  CASE WHEN random() > 0.5 THEN 120 ELSE 150 END,
  CASE WHEN random() > 0.5 THEN 45 ELSE 52 END,
  CASE WHEN random() > 0.5 THEN 85 ELSE 95 END,
  CASE WHEN random() > 0.5 THEN 3.5 ELSE 4.2 END,
  CASE WHEN random() > 0.5 THEN 90 ELSE 88 END
FROM riders, generate_series(0, 29) n
LIMIT 60;

-- Insertar estadísticas mensuales
INSERT INTO rider_monthly_stats (rider_id, mes, total_sesiones, total_distancia_km, total_duracion_horas, velocidad_promedio, velocidad_maxima, consumo_total_litros, seguridad_score_promedio, dias_con_actividad)
SELECT DISTINCT
  riders.id,
  DATE_TRUNC('month', NOW())::DATE,
  CASE WHEN random() > 0.5 THEN 45 ELSE 62 END,
  CASE WHEN random() > 0.5 THEN 2100 ELSE 2850 END,
  CASE WHEN random() > 0.5 THEN 48 ELSE 65 END,
  CASE WHEN random() > 0.5 THEN 48 ELSE 54 END,
  CASE WHEN random() > 0.5 THEN 110 ELSE 125 END,
  CASE WHEN random() > 0.5 THEN 85 ELSE 110 END,
  CASE WHEN random() > 0.5 THEN 89 ELSE 91 END,
  CASE WHEN random() > 0.5 THEN 18 ELSE 24 END
FROM riders
LIMIT 20;

-- Insertar patrones de conducción
INSERT INTO riding_patterns (rider_id, patron_tipo, hora_promedio_inicio, duracion_promedio_minutos, velocidad_tipica, via_preferida, frecuencia_semanal, seguridad_score, consistencia_porcentaje)
SELECT
  riders.id,
  CASE WHEN ROW_NUMBER() OVER (PARTITION BY riders.id ORDER BY random()) = 1 THEN 'madrugador'
       WHEN ROW_NUMBER() OVER (PARTITION BY riders.id ORDER BY random()) = 2 THEN 'fin_de_semana'
       ELSE 'lunes_viernes' END,
  CASE WHEN ROW_NUMBER() OVER (PARTITION BY riders.id ORDER BY random()) = 1 THEN '06:00'
       WHEN ROW_NUMBER() OVER (PARTITION BY riders.id ORDER BY random()) = 2 THEN '08:30'
       ELSE '17:00' END,
  45,
  CASE WHEN ROW_NUMBER() OVER (PARTITION BY riders.id ORDER BY random()) = 1 THEN 48
       WHEN ROW_NUMBER() OVER (PARTITION BY riders.id ORDER BY random()) = 2 THEN 52
       ELSE 45 END,
  CASE WHEN ROW_NUMBER() OVER (PARTITION BY riders.id ORDER BY random()) = 1 THEN 'carretera'
       WHEN ROW_NUMBER() OVER (PARTITION BY riders.id ORDER BY random()) = 2 THEN 'autopista'
       ELSE 'ciudad' END,
  4.5,
  89,
  85.0
FROM riders
WHERE riders.id IN (SELECT DISTINCT rider_id FROM rider_sessions LIMIT 10)
LIMIT 30;

-- Insertar benchmarks de la comunidad
INSERT INTO community_benchmarks (metrica, valor_promedio, valor_percentil_25, valor_percentil_50, valor_percentil_75, valor_percentil_90, total_riders, fecha_calculo)
VALUES
  ('velocidad_promedio', 48.5, 38.0, 45.0, 52.0, 62.0, 150, NOW()::DATE),
  ('seguridad', 89.5, 82.0, 88.0, 92.0, 96.0, 150, NOW()::DATE),
  ('distancia_mensual', 2400.0, 1200.0, 2100.0, 3200.0, 4500.0, 150, NOW()::DATE);

-- Insertar logros y hitos de ejemplo
INSERT INTO rider_milestones (rider_id, tipo_logro, descripcion, valor_alcanzado, valor_requerido, completado, insignia_emoji)
SELECT
  riders.id,
  CASE WHEN n = 1 THEN 'km_totales' WHEN n = 2 THEN 'dias_consecutivos' ELSE 'seguridad_perfecta' END,
  CASE WHEN n = 1 THEN '500km acumulados' WHEN n = 2 THEN '10 días seguidos' ELSE 'Semana sin alertas' END,
  CASE WHEN n = 1 THEN 520 WHEN n = 2 THEN 12 ELSE 7 END,
  CASE WHEN n = 1 THEN 500 WHEN n = 2 THEN 10 ELSE 7 END,
  CASE WHEN n = 1 THEN true WHEN n = 2 THEN true ELSE true END,
  CASE WHEN n = 1 THEN '🏆' WHEN n = 2 THEN '🔥' ELSE '✅' END
FROM riders, generate_series(1, 3) n
LIMIT 60;

-- Insertar alertas de seguridad
INSERT INTO safety_insights (rider_id, tipo_insight, descripcion, recomendacion, nivel_urgencia)
SELECT
  riders.id,
  CASE WHEN n = 1 THEN 'exceso_velocidad_tendencia' WHEN n = 2 THEN 'mejora_seguridad' ELSE 'via_peligrosa' END,
  CASE WHEN n = 1 THEN 'Detectamos que frecuentemente superas 80km/h en vías urbanas'
       WHEN n = 2 THEN 'Tu puntuación de seguridad mejoró 5 puntos en la última semana'
       ELSE 'Esta ruta reporta 3 accidentes en el último mes' END,
  CASE WHEN n = 1 THEN 'Reduce velocidad en zonas residenciales. Tu seguridad es primero.'
       WHEN n = 2 THEN '¡Vas muy bien! Mantén el ritmo'
       ELSE 'Considera rutas alternativas o aumenta tu visibilidad' END,
  CASE WHEN n = 1 THEN 'advertencia' WHEN n = 2 THEN 'info' ELSE 'advertencia' END
FROM riders, generate_series(1, 3) n
LIMIT 60;
