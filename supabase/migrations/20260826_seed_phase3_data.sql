-- ─────────────────────────────────────────────────────────────────
-- Rita Phase 3 — Seed Academic Content & Initial Data
--
-- Contenido educativo: cursos, tutoriales, certificaciones
-- ─────────────────────────────────────────────────────────────────

-- Insertar contenido educativo
INSERT INTO academic_content (titulo, descripcion, contenido, categoria, nivel, duracion_minutos, autor, es_oficial, tags) VALUES
  ('Mantenimiento Básico de tu Moto', 'Todo lo que necesitas saber para mantener tu moto en perfecto estado', 'Cambio de aceite cada 5,000 km, filtro de aire cada 10,000 km, revisión de cadena semanal. Rita te dirá cuando le toca a tu moto.', 'mecanica', 'principiante', 15, 'Rita Academy', true, ARRAY['mantenimiento', 'basico', 'rutina']),
  ('Cómo Actuar en un Retén', 'Derechos y obligaciones cuando te para la policía de tránsito', 'Tienes derecho a NO entregar documentos originales. Mostrar fotocopia o foto en el celular es legal. Pide la orden escrita si piden más.', 'legal', 'principiante', 8, 'Rita Legal', true, ARRAY['reten', 'derechos', 'seguridad']),
  ('Seguridad Vial: 10 Reglas de Oro', 'Principios básicos para rodar seguro en carretera', 'Usa casco siempre, mantén distancia de 3 segundos, evita motos grandes si eres principiante, revisa frenos antes de salir.', 'seguridad', 'principiante', 12, 'Fundación Protección Vial', true, ARRAY['seguridad', 'basico', 'prevencion']),
  ('Reparación de Frenos: Pastillas y Discos', 'Guía paso a paso para cambiar pastillas y discos de freno', 'Levanta la moto, desatornilla la rueda, acceso a los frenos, cambio de pastillas o discos, prueba en baja velocidad.', 'mecanica', 'intermedio', 30, 'MotoTaller Pro', true, ARRAY['frenos', 'reparacion', 'intermedio']),
  ('Técnica de Conducción: Curvas y Frenadas', 'Domina las curvas y mejora tus frenadas', 'Entrada de la curva: ralentiza antes. Vértice: acelera suavemente. Salida: acelera más. Frenada de emergencia: compresión de motor y freno.', 'tecnica', 'intermedio', 20, 'Instructor de Motos', true, ARRAY['conduccion', 'curvas', 'frenada']),
  ('Viajes Largos: Preparación y Ruta', 'Cómo preparar tu moto y a ti para un viaje de 500+ km', 'Revisa: aceite, cadena, llantas, frenos. Lleva: herramientas básicas, botiquín, agua. Planifica paradas cada 150 km.', 'viajes', 'intermedio', 25, 'Riders Aventureros', true, ARRAY['viajes', 'preparacion', 'aventura']),
  ('Electricidad de Moto: Problemas Comunes', 'Diagnóstico y solución de problemas eléctricos', 'No enciende: batería. Luces parpadeantes: carga. Cables quemados: corto. Multímetro es tu mejor amigo.', 'mecanica', 'avanzado', 40, 'MotoElectricista', true, ARRAY['electricidad', 'diagnostico', 'avanzado']),
  ('Comparendo y Defensa Legal', 'Cómo impugnar una multa de tránsito', 'Tienes 30 días. Lee el comparendo. Si fue cámara piden calibración. Escrito de impugnación en Movilidad. Audiencia y defensa.', 'legal', 'intermedio', 18, 'Abogado Tránsito', true, ARRAY['legal', 'comparendo', 'defensa']),
  ('Mecánica de Motor: Cilindrada y Potencia', 'Entender cómo funciona el motor de tu moto', '4 tiempos: admisión, compresión, explosión, escape. Cilindrada = potencia (no siempre). RPM y torque explicados.', 'mecanica', 'avanzado', 35, 'Ingeniero Automotriz', true, ARRAY['motor', 'mecanica', 'tecnica']),
  ('Preparación para Viaje Internacional', 'Permisos, documentos y tips para rodar fuera de Colombia', 'Pasaporte vigente, documento de la moto en RUNT, seguro internacional, Carnet de conducción internacional.', 'viajes', 'avanzado', 30, 'Riders Internacionales', true, ARRAY['viajes', 'internacional', 'documentos']);

-- Insertar puntos de interés (talleres, gasolineras, miradores)
INSERT INTO points_of_interest (nombre, tipo, descripcion, latitud, longitud, ciudad, telefono, especialidades, rating) VALUES
  ('Taller Motos El Paisa', 'taller', 'Especializado en BMW y aventureras. Excelente servicio.', 6.2208, -75.5851, 'Medellín', '(4) 4445-6789', ARRAY['motor', 'mantenimiento', 'electricidad'], 4.8),
  ('Vulcano Llantas Moto', 'taller', 'Cambio de llantas, reparación y balanceo.', 6.2442, -75.5812, 'Medellín', '(4) 4333-2211', ARRAY['llantas', 'balanceo'], 4.5),
  ('Gasolinera Hector López - Sabaneta', 'gasolinera', 'Oferta de gasolina, diésel y servicios 24h.', 6.1667, -75.7333, 'Sabaneta', '(4) 5555-4444', NULL, 4.2),
  ('Mirador El Peñol', 'mirador', 'Vistas espectaculares de la región. Punto favorito de riders.', 6.1394, -75.3056, 'El Peñol de Guatapé', NULL, NULL, 4.9),
  ('Taller Harley-Davidson Medellín', 'taller', 'Concesionario oficial. Servicio authorizado.', 6.1667, -75.5667, 'Medellín', '(4) 4123-4567', ARRAY['motor', 'pintura', 'reparacion'], 4.7),
  ('Hotel Moto Friendly Las Palmas', 'hotel', 'Hotel especial para riders. Estacionamiento vigilado, garage cubierto.', 6.1333, -75.5333, 'Medellín', '(4) 4234-5678', NULL, 4.6),
  ('Restaurante Casa Paisa', 'restaurante', 'Comida típica antioquena. Punto de reunión de motovidistas.', 6.1833, -75.5833, 'Medellín', '(4) 4789-1234', NULL, 4.4),
  ('Parada Segura Entrada Rionegro', 'parada_segura', 'Área de descanso segura con baños y agua. Vigilancia 24h.', 6.0667, -75.3667, 'Rionegro', NULL, NULL, 4.3),
  ('Mecánico Juan Vélez - Especialista Yamaha', 'taller', 'Mecánico certificado. Atención personalizada.', 6.0833, -75.5, 'Envigado', '(4) 5678-9012', ARRAY['motor', 'transmisión', 'reparacion'], 4.9),
  ('Gasolinera Terpel - Autopista Sur', 'gasolinera', 'Ubicada en Autopista Sur. Servicios rápidos.', 6.15, -75.6167, 'Medellín', '(4) 4567-8901', NULL, 4.1);

-- Insertar mecánicos verificados
INSERT INTO mechanic_directory (nombre_mecanico, especialidad, experiencia_años, ciudad, telefono, whatsapp, rating, es_verificado, recomendado_por_riders) VALUES
  ('Juan Pérez', 'motor', 15, 'Medellín', '(4) 4445-6789', '3214567890', 4.9, true, 127),
  ('Carlos Gómez', 'frenos', 12, 'Medellín', '(4) 4333-2211', '3147778888', 4.7, true, 93),
  ('Luis Antonio', 'electricidad', 18, 'Envigado', '(4) 5678-9012', '3209876543', 4.8, true, 156),
  ('Andrés Ruiz', 'transmisión', 10, 'Sabaneta', '(4) 4234-1234', '3101234567', 4.6, true, 72),
  ('David López', 'pintura', 8, 'Medellín', '(4) 4567-9999', '3217654321', 4.4, false, 45);

-- Contexto para riders nuevos: sugerencias de contenido inicial
-- (Los riders tendrán acceso a todo el contenido, pero Rita destacará
--  los cursos "principiante" para nuevos riders)
