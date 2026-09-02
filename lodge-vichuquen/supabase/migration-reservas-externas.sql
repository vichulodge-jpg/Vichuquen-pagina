-- ============================================================
-- MIGRACIÓN: reservas externas (Booking, Airbnb, WhatsApp, …)
--            + plantillas de correo editables desde el panel
-- Ejecutar en: Supabase → SQL Editor → New query
--
-- Es aditiva: no borra ni cambia nada de lo que ya funciona.
-- Las reservas que ya existen quedan con canal = 'web'.
-- ============================================================

-- ── 1. NUEVAS COLUMNAS EN reservas ──────────────────────────
-- canal          : de dónde viene la reserva
-- apellido       : la web guarda el nombre completo en "nombre";
--                  el panel separa nombre y apellido
-- observaciones  : notas internas del administrador
--                  (distinto de "mensaje", que es lo que escribe el huésped)
-- forma_pago     : cómo pagó (transferencia, efectivo, Booking, …)
-- creada_por     : 'web' | 'admin'  — para saber quién la generó
-- email_*_enviado_at : sello de tiempo del correo ya enviado.
--                  Es lo que impide enviar dos veces el mismo correo.

ALTER TABLE reservas
  ADD COLUMN IF NOT EXISTS canal                          TEXT        NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS apellido                       TEXT,
  ADD COLUMN IF NOT EXISTS observaciones                  TEXT,
  ADD COLUMN IF NOT EXISTS forma_pago                     TEXT,
  ADD COLUMN IF NOT EXISTS creada_por                     TEXT        NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS email_confirmacion_enviado_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_pre_llegada_enviado_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelada_at                   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now();

-- Canales permitidos. Para agregar uno nuevo: borrar la constraint y recrearla.
DO $$
BEGIN
  ALTER TABLE reservas ADD CONSTRAINT canal_check
    CHECK (canal IN ('web','booking','airbnb','whatsapp','instagram','directa','otro'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE reservas ADD CONSTRAINT creada_por_check
    CHECK (creada_por IN ('web','admin'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. RESERVAS ANTERIORES A ESTA MIGRACIÓN ─────────────────
-- A las reservas que ya estaban confirmadas se les marca la confirmación como
-- enviada: el correo ya salió en su momento y no debe repetirse si alguien
-- edita la reserva hoy. Lo mismo con la pre-llegada de estadías ya pasadas.

UPDATE reservas
   SET email_confirmacion_enviado_at = created_at
 WHERE estado = 'confirmada'
   AND email_confirmacion_enviado_at IS NULL;

UPDATE reservas
   SET email_pre_llegada_enviado_at = created_at
 WHERE check_in < (now() AT TIME ZONE 'America/Santiago')::date
   AND email_pre_llegada_enviado_at IS NULL;

-- ── 3. COMPROBACIÓN: CAPACIDAD DE LAS CABAÑAS ───────────────
-- La API rechaza una reserva si el número de huéspedes supera la capacidad
-- guardada en la tabla `cabanas`. El sitio ofrece hasta 5 personas en las
-- cabañas chicas, 7 en Siete Colores y 6 en Cisne Cuello Negro; el setup.sql
-- original registraba 4 y 6. Revisa qué dice tu base:
--
--   SELECT id, nombre, capacidad FROM cabanas ORDER BY id;
--
-- Si no coincide con lo que ofrece la web, descomenta y ejecuta esto
-- (si ya coincide, no hace falta tocar nada):
--
-- UPDATE cabanas SET capacidad = 5 WHERE id IN
--   ('c1-tagua','c2-cisne-coscoroba','c5-huala','c6-run-run','c7-pitio');
-- UPDATE cabanas SET capacidad = 7 WHERE id = 'c3-siete-colores';
-- UPDATE cabanas SET capacidad = 6 WHERE id = 'c4-cisne-cuello-negro';

-- ── 4. ÍNDICES ──────────────────────────────────────────────

-- El calendario del panel pide un rango de fechas de todas las cabañas.
CREATE INDEX IF NOT EXISTS idx_reservas_rango
  ON reservas(check_in, check_out);

-- El cron de pre-llegada busca por estado + check_in.
CREATE INDEX IF NOT EXISTS idx_reservas_prellegada
  ON reservas(estado, check_in);

-- ── 5. PLANTILLAS DE CORREO EDITABLES ───────────────────────
-- El administrador edita asunto y texto desde el panel, sin tocar código.
-- Mientras "activa" sea false se sigue usando el correo actual del sistema
-- (el que está escrito en gas/email-sender.gs). Así nada cambia hasta que
-- el administrador decida activar su versión.

CREATE TABLE IF NOT EXISTS plantillas_email (
  id         TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  asunto     TEXT NOT NULL,
  cuerpo     TEXT NOT NULL,
  activa     BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plantilla_id_check CHECK (id IN ('confirmacion','pre_llegada'))
);

ALTER TABLE plantillas_email ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo la API (service key) puede leerlas o escribirlas.

INSERT INTO plantillas_email (id, nombre, asunto, cuerpo, activa) VALUES
  (
    'confirmacion',
    'Correo de confirmación de reserva',
    '¡Tu reserva está confirmada! — Vichuquén Lodge y Marina',
    '<p>Hola <strong>{{nombre_huesped}}</strong>,</p>
<p>¡Gracias por elegirnos! Tu reserva en la cabaña <strong>{{cabana}}</strong> quedó confirmada.</p>
<p>Te esperamos el {{fecha_checkin}}. El check-in es desde las 16:00 y el check-out hasta las 12:00.</p>
<p><strong>Detalles de tu reserva:</strong></p>',
    false
  ),
  (
    'pre_llegada',
    'Correo de pre-llegada (3 días antes)',
    '¡Ya falta muy poco! Tu llegada a Vichuquén Lodge el {{fecha_checkin}}',
    '¡Hola, <strong>{{nombre_huesped}}</strong>! Ya queda muy poco para recibirte en la cabaña <strong>{{cabana}}</strong>. Aquí va todo lo que necesitas saber antes de tu llegada del {{fecha_checkin}}.',
    false
  )
ON CONFLICT (id) DO NOTHING;

-- ── 6. (OPCIONAL) GARANTÍA ANTI-SOLAPE EN LA BASE DE DATOS ──
-- La API ya valida que no se crucen las fechas, pero esta constraint lo
-- garantiza también a nivel de base de datos (incluso si dos personas graban
-- al mismo tiempo). Si ya existen reservas confirmadas superpuestas no se
-- puede crear: el bloque avisa y la migración continúa igual.
--
-- Para ver si hay solapes antes de nada:
--   SELECT a.id, b.id, a.cabana_id, a.check_in, a.check_out
--   FROM reservas a JOIN reservas b
--     ON a.cabana_id = b.cabana_id AND a.id < b.id
--    AND a.estado = 'confirmada' AND b.estado = 'confirmada'
--    AND daterange(a.check_in, a.check_out, '[)') && daterange(b.check_in, b.check_out, '[)');

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  ALTER TABLE reservas ADD CONSTRAINT reservas_sin_solape
    EXCLUDE USING gist (
      cabana_id WITH =,
      daterange(check_in, check_out, '[)') WITH &&
    ) WHERE (estado = 'confirmada');
  RAISE NOTICE 'Constraint reservas_sin_solape creada.';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'La constraint reservas_sin_solape ya existía.';
  WHEN others THEN
    RAISE NOTICE 'No se pudo crear reservas_sin_solape (%). Probablemente ya hay reservas confirmadas superpuestas: revísalas y vuelve a ejecutar solo este bloque.', SQLERRM;
END $$;
