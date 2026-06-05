-- ============================================================
-- MIGRACIÓN: 3 tarifas (baja / media / alta) + nuevas fechas
-- Ejecutar en: Supabase → SQL Editor → New query
-- ============================================================

-- 1. Agregar columna precio_media (si no existe)
ALTER TABLE cabanas ADD COLUMN IF NOT EXISTS precio_media INTEGER;

-- 2. Actualizar precios de todas las cabañas
UPDATE cabanas SET precio_baja =  79200, precio_media =  99000, precio_alta = 119000
  WHERE id IN ('c1-tagua','c2-cisne-coscoroba','c5-huala','c6-run-run','c7-pitio','c8-garza-cuca');

UPDATE cabanas SET precio_baja =  95200, precio_media = 119000, precio_alta = 139000
  WHERE id = 'c3-siete-colores';

UPDATE cabanas SET precio_baja =  87200, precio_media = 109000, precio_alta = 129000
  WHERE id = 'c4-cisne-cuello-negro';

-- 3. Reemplazar fechas de temporada alta
DELETE FROM temporadas_alta;

INSERT INTO temporadas_alta (nombre, fecha_inicio, fecha_fin) VALUES
  -- 2026
  ('Fiestas Patrias Jun 2026',   '2026-06-26', '2026-06-28'),
  ('Vacaciones Jul 2026',        '2026-07-15', '2026-07-18'),
  ('Fiestas Patrias Sep 2026',   '2026-09-11', '2026-09-19'),
  ('Puente Oct 2026',            '2026-10-09', '2026-10-11'),
  ('Puente Dic 2026',            '2026-12-04', '2026-12-07'),
  ('Verano 2026-2027',           '2026-12-18', '2026-12-31'),
  -- 2027
  ('Verano 2026-2027 cont.',     '2027-01-01', '2027-03-15'),
  ('Semana Santa 2027',          '2027-03-25', '2027-03-27'),
  ('Puente May 2027',            '2027-05-20', '2027-05-22'),
  ('Corpus Christi 2027',        '2027-06-18', '2027-06-20'),
  ('Fiestas Patrias Jun 2027',   '2027-06-25', '2027-06-27'),
  ('Fiestas Patrias Sep 2027',   '2027-09-10', '2027-09-18'),
  ('Puente Oct 2027',            '2027-10-08', '2027-10-10'),
  ('Halloween/Puente Oct 2027',  '2027-10-29', '2027-10-31'),
  -- 2028
  ('Verano 2027-2028',           '2028-01-01', '2028-03-15');
