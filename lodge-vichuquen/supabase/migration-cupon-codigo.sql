-- ============================================================
-- MIGRACIÓN: columna cupon_codigo en reservas
-- Ejecutar en: Supabase → SQL Editor → New query
-- Necesaria para poder limitar cupones a N usos confirmados
-- (ej. INVIERNO15 con máximo 6 arriendos).
-- ============================================================

ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cupon_codigo TEXT;

CREATE INDEX IF NOT EXISTS idx_reservas_cupon
  ON reservas(cupon_codigo, estado);
