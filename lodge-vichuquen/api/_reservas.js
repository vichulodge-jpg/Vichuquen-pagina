'use strict';

/**
 * Reglas comunes de reservas: canales, validación y disponibilidad.
 *
 * Lo usan las reservas creadas a mano desde el panel de administración.
 * La disponibilidad se calcula igual que en /api/availability: una fecha está
 * ocupada si cae dentro de una reserva CONFIRMADA o dentro de un bloqueo.
 * Por eso una reserva externa confirmada deja de estar disponible en la web
 * sin necesidad de crear ningún bloqueo aparte.
 */

const CANALES = ['web', 'booking', 'airbnb', 'whatsapp', 'instagram', 'directa', 'otro'];
const CANAL_LABEL = {
  web:       'Página web',
  booking:   'Booking',
  airbnb:    'Airbnb',
  whatsapp:  'WhatsApp',
  instagram: 'Instagram',
  directa:   'Reserva directa',
  otro:      'Otro'
};

const ESTADOS = ['pendiente', 'confirmada', 'cancelada'];
const FORMAS_PAGO = ['transferencia', 'efectivo', 'mercadopago', 'tarjeta', 'canal_externo', 'otro'];

const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE  = /^[0-9a-f-]{36}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ULTIMO_DIA_CALENDARIO = '2028-03-15';

function noches(check_in, check_out) {
  return Math.round(
    (new Date(check_out + 'T12:00:00') - new Date(check_in + 'T12:00:00')) / 86400000
  );
}

function limpiar(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function entero(v, porDefecto) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : porDefecto;
}

/**
 * Valida el cuerpo de una reserva creada desde el panel.
 * Devuelve { error } o { datos } listos para insertar.
 */
function validarReservaAdmin(body) {
  const b = body || {};

  const cabana_id = limpiar(b.cabana_id, 60);
  const check_in  = limpiar(b.check_in, 10);
  const check_out = limpiar(b.check_out, 10);
  const nombre    = limpiar(b.nombre, 100);
  const email     = limpiar(b.email, 100);

  if (!cabana_id) return { error: 'Selecciona una cabaña.' };
  if (!nombre)    return { error: 'El nombre del huésped es obligatorio.' };
  if (!email)     return { error: 'El correo del huésped es obligatorio.' };
  if (!EMAIL_RE.test(email)) return { error: 'El correo electrónico no es válido.' };

  if (!DATE_RE.test(check_in) || !DATE_RE.test(check_out)) {
    return { error: 'Las fechas deben tener formato AAAA-MM-DD.' };
  }
  if (check_out <= check_in) {
    return { error: 'La fecha de salida debe ser posterior a la de llegada.' };
  }
  if (check_out > ULTIMO_DIA_CALENDARIO) {
    return { error: 'El calendario de reservas llega hasta el 15 de marzo de 2028.' };
  }

  const n = noches(check_in, check_out);
  if (n < 1 || n > 60) return { error: 'La estadía debe ser de entre 1 y 60 noches.' };

  const personas = entero(b.personas, 0);
  if (personas < 1) return { error: 'Indica el número de huéspedes.' };

  const estado = limpiar(b.estado, 20) || 'confirmada';
  if (!['confirmada', 'cancelada', 'pendiente'].includes(estado)) {
    return { error: 'Estado de reserva inválido.' };
  }

  const canal = limpiar(b.canal, 20) || 'directa';
  if (!CANALES.includes(canal)) return { error: 'Canal de reserva inválido.' };

  const forma_pago = limpiar(b.forma_pago, 30);
  if (forma_pago && !FORMAS_PAGO.includes(forma_pago)) {
    return { error: 'Forma de pago inválida.' };
  }

  const total = entero(b.total, 0);
  const abono = entero(b.abono, 0);
  if (total < 0 || abono < 0)  return { error: 'Los montos no pueden ser negativos.' };
  if (abono > total)           return { error: 'El abono no puede superar el total de la estadía.' };

  return {
    datos: {
      cabana_id,
      check_in,
      check_out,
      noches: n,
      // precio_noche es NOT NULL en la tabla; se deriva del total ingresado.
      precio_noche: Math.round(total / n),
      total,
      abono,
      nombre,
      apellido:      limpiar(b.apellido, 100) || null,
      email,
      telefono:      limpiar(b.telefono, 30) || null,
      personas,
      estado,
      canal,
      forma_pago:    forma_pago || null,
      observaciones: limpiar(b.observaciones, 1000) || null
    }
  };
}

/**
 * ¿Las fechas chocan con una reserva confirmada o con un bloqueo?
 * `excluirId` sirve al editar: la propia reserva no cuenta como conflicto.
 * Devuelve null si está libre, o un texto explicando el choque.
 */
async function buscarConflicto(supabase, { cabana_id, check_in, check_out, excluirId }) {
  let reservas = supabase
    .from('reservas')
    .select('id, nombre, apellido, canal, check_in, check_out')
    .eq('cabana_id', cabana_id)
    .eq('estado', 'confirmada')
    .lt('check_in', check_out)
    .gt('check_out', check_in);

  if (excluirId) reservas = reservas.neq('id', excluirId);

  const bloqueos = supabase
    .from('bloqueos')
    .select('id, motivo, fecha_inicio, fecha_fin')
    .eq('cabana_id', cabana_id)
    .lt('fecha_inicio', check_out)
    .gt('fecha_fin', check_in);

  const [resR, resB] = await Promise.all([reservas, bloqueos]);

  if (resR.error || resB.error) {
    return { error: 'No se pudo verificar la disponibilidad. Intenta de nuevo.' };
  }

  const choque = (resR.data || [])[0];
  if (choque) {
    const quien = [choque.nombre, choque.apellido].filter(Boolean).join(' ');
    return {
      conflicto: `Esas fechas ya están ocupadas por la reserva de ${quien} ` +
                 `(${CANAL_LABEL[choque.canal] || choque.canal}, ` +
                 `${choque.check_in} → ${choque.check_out}).`
    };
  }

  const bloqueo = (resB.data || [])[0];
  if (bloqueo) {
    return {
      conflicto: `Esas fechas están bloqueadas (${bloqueo.motivo}, ` +
                 `${bloqueo.fecha_inicio} → ${bloqueo.fecha_fin}). ` +
                 `Elimina el bloqueo desde la pestaña Bloqueos si quieres usarlas.`
    };
  }

  return {};
}

async function nombreCabana(supabase, cabana_id) {
  const { data } = await supabase
    .from('cabanas')
    .select('nombre, capacidad')
    .eq('id', cabana_id)
    .single();
  return data || null;
}

/** Fecha de hoy en Chile, 'YYYY-MM-DD'. */
function hoyChile() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

/** Días que faltan para el check-in (negativo si ya pasó). */
function diasHastaCheckIn(check_in) {
  const hoy = new Date(hoyChile() + 'T00:00:00Z');
  const ci  = new Date(check_in + 'T00:00:00Z');
  return Math.floor((ci - hoy) / 86400000);
}

module.exports = {
  CANALES,
  CANAL_LABEL,
  ESTADOS,
  FORMAS_PAGO,
  DATE_RE,
  UUID_RE,
  noches,
  validarReservaAdmin,
  buscarConflicto,
  nombreCabana,
  hoyChile,
  diasHastaCheckIn
};
