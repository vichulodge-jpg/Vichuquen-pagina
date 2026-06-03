-- =============================================================
-- Vichuquén Lodge y Marina — Motor de Reservas
-- Ejecutar en: Supabase → SQL Editor → New query
-- =============================================================

-- ── TABLAS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cabanas (
  id           TEXT PRIMARY KEY,
  nombre       TEXT NOT NULL,
  capacidad    INT  NOT NULL,
  precio_alta  INT  NOT NULL,
  precio_baja  INT  NOT NULL
);

CREATE TABLE IF NOT EXISTS temporadas_alta (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS reservas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabana_id         TEXT REFERENCES cabanas(id),
  check_in          DATE NOT NULL,
  check_out         DATE NOT NULL,
  noches            INT  NOT NULL,
  precio_noche      INT  NOT NULL,
  total             INT  NOT NULL,
  abono             INT  NOT NULL,
  nombre            TEXT NOT NULL,
  email             TEXT NOT NULL,
  telefono          TEXT,
  personas          INT  NOT NULL,
  mensaje           TEXT,
  estado            TEXT NOT NULL DEFAULT 'pendiente',
  mp_preference_id  TEXT,
  mp_payment_id     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT estado_check CHECK (estado IN ('pendiente','confirmada','cancelada'))
);

CREATE TABLE IF NOT EXISTS bloqueos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabana_id    TEXT REFERENCES cabanas(id),
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE NOT NULL,
  motivo       TEXT NOT NULL DEFAULT 'manual',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT motivo_check CHECK (motivo IN ('airbnb','booking','mantencion','manual'))
);

-- ── ÍNDICES ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_reservas_cabana_estado
  ON reservas(cabana_id, estado, check_out);

CREATE INDEX IF NOT EXISTS idx_bloqueos_cabana
  ON bloqueos(cabana_id, fecha_fin);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
-- Las funciones serverless usan service key que bypasea RLS.
-- RLS protege acceso directo con anon key desde el browser.

ALTER TABLE cabanas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporadas_alta  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueos         ENABLE ROW LEVEL SECURITY;

-- Cabañas y temporadas: lectura pública (datos no sensibles)
CREATE POLICY "cabanas_public_read"
  ON cabanas FOR SELECT USING (true);

CREATE POLICY "temporadas_public_read"
  ON temporadas_alta FOR SELECT USING (true);

-- Reservas: sin acceso directo desde el browser (todo pasa por la API)
-- (service key bypasea estas políticas; el frontend nunca accede a reservas directamente)

-- Bloqueos: solo check_in/check_out/cabana_id son públicos (no datos personales)
CREATE POLICY "bloqueos_public_read"
  ON bloqueos FOR SELECT USING (true);

-- ── DATOS: CABAÑAS ───────────────────────────────────────────

INSERT INTO cabanas (id, nombre, capacidad, precio_alta, precio_baja) VALUES
  ('c1-tagua',              'Tagua',              4, 119000,  99000),
  ('c2-cisne-coscoroba',    'Cisne Coscoroba',    4, 119000,  99000),
  ('c3-siete-colores',      'Siete Colores',      6, 139000, 119000),
  ('c4-cisne-cuello-negro', 'Cisne Cuello Negro', 4, 129000, 109000),
  ('c5-huala',              'Huala',              4, 119000,  99000),
  ('c6-run-run',            'Run Run',            4, 119000,  99000),
  ('c7-pitio',              'Pitío',              4, 119000,  99000)
ON CONFLICT (id) DO UPDATE SET
  nombre      = EXCLUDED.nombre,
  capacidad   = EXCLUDED.capacidad,
  precio_alta = EXCLUDED.precio_alta,
  precio_baja = EXCLUDED.precio_baja;

-- ── DATOS: TEMPORADAS ALTA ───────────────────────────────────
-- Ajustar anualmente. Semana Santa cambia cada año.

INSERT INTO temporadas_alta (nombre, fecha_inicio, fecha_fin) VALUES
  ('Verano 2025-2026',   '2025-12-01', '2026-02-28'),
  ('Fiestas Patrias 2026','2026-09-15', '2026-09-22'),
  ('Semana Santa 2026',  '2026-04-02', '2026-04-06'),
  ('Verano 2026-2027',   '2026-12-01', '2027-02-28'),
  ('Fiestas Patrias 2027','2027-09-15', '2027-09-22'),
  ('Semana Santa 2027',  '2027-03-25', '2027-03-29');
