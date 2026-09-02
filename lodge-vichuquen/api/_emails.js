'use strict';

/**
 * Envío de correos al huésped, con dos garantías:
 *
 *  1. NO DUPLICAR. Cada reserva tiene un sello de tiempo por tipo de correo
 *     (email_confirmacion_enviado_at / email_pre_llegada_enviado_at). Antes de
 *     enviar se "reserva" el sello con un UPDATE condicional: si otra ejecución
 *     ya lo tomó, esta no envía nada. Si el envío falla, el sello se libera.
 *     Da igual que el correo lo dispare la web, el panel o el cron: sale una vez.
 *
 *  2. TEXTOS EDITABLES. Si el administrador activó su plantilla en el panel,
 *     se usan su asunto y su texto. Si no, se usa el correo tal como está hoy
 *     en gas/email-sender.gs, sin cambios.
 *
 * El envío en sí lo sigue haciendo Google Apps Script (GAS_URL), que es quien
 * arma las láminas de la pre-llegada.
 */

const { CANAL_LABEL } = require('./_reservas');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fmtFecha(s) {
  if (!s) return '';
  const d = new Date(s + 'T12:00:00');
  return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
}

function fmtClp(n) {
  return '$' + Number(n || 0).toLocaleString('es-CL');
}

/** Variables disponibles en las plantillas del panel. */
function variablesDeReserva(r, cabana) {
  const saldo = Number(r.total || 0) - Number(r.abono || 0);
  return {
    nombre_huesped:   r.nombre || '',
    apellido_huesped: r.apellido || '',
    nombre_completo:  [r.nombre, r.apellido].filter(Boolean).join(' '),
    cabana:           cabana || r.cabana_id || '',
    fecha_checkin:    fmtFecha(r.check_in),
    fecha_checkout:   fmtFecha(r.check_out),
    noches:           String(r.noches || ''),
    numero_huespedes: String(r.personas || ''),
    telefono:         r.telefono || '',
    email:            r.email || '',
    canal_reserva:    CANAL_LABEL[r.canal] || r.canal || '',
    total:            fmtClp(r.total),
    abono:            fmtClp(r.abono),
    saldo:            fmtClp(saldo),
    observaciones:    r.observaciones || '',
    id_reserva:       r.id || ''
  };
}

/** Reemplaza {{variable}} por su valor. Las desconocidas quedan vacías. */
function render(texto, vars) {
  if (!texto) return '';
  return String(texto).replace(/\{\{\s*([a-z_ñáéíóú]+)\s*\}\}/gi, function (_, clave) {
    const v = vars[clave.toLowerCase()];
    return v == null ? '' : String(v);
  });
}

/** Devuelve { asunto, cuerpo } si el administrador activó esa plantilla. */
async function plantillaActiva(supabase, id, vars) {
  const { data, error } = await supabase
    .from('plantillas_email')
    .select('asunto, cuerpo, activa')
    .eq('id', id)
    .maybeSingle();

  if (error || !data || !data.activa) return null;

  return {
    asunto: render(data.asunto, vars),
    cuerpo: render(data.cuerpo, vars)
  };
}

async function llamarGAS(payload) {
  const gasUrl = process.env.GAS_URL;
  if (!gasUrl) {
    console.warn('GAS_URL no configurada — no se envió el correo', payload.tipo);
    return false;
  }
  try {
    const r = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.GAS_SECRET || '', ...payload })
    });
    if (!r.ok) {
      console.error('GAS respondió', r.status, 'para', payload.tipo);
      return false;
    }
    // GAS responde {"ok":true} o {"ok":false,"error":"…"}
    const texto = await r.text();
    if (texto && texto.indexOf('"ok":false') !== -1) {
      console.error('GAS rechazó el envío:', texto.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error('GAS error:', e.message);
    return false;
  }
}

/**
 * Toma el sello del correo. Devuelve true solo si esta ejecución es la que
 * debe enviarlo (nadie lo había enviado antes).
 */
async function tomarSello(supabase, reservaId, columna) {
  const { data, error } = await supabase
    .from('reservas')
    .update({ [columna]: new Date().toISOString() })
    .eq('id', reservaId)
    .is(columna, null)
    .select('id');

  if (error) {
    console.error('No se pudo marcar', columna, error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function liberarSello(supabase, reservaId, columna) {
  await supabase.from('reservas').update({ [columna]: null }).eq('id', reservaId);
}

function datosBase(r, cabana) {
  return {
    reserva_id: r.id,
    nombre:     [r.nombre, r.apellido].filter(Boolean).join(' '),
    email:      r.email,
    telefono:   r.telefono || '',
    cabana:     cabana,
    canal:      CANAL_LABEL[r.canal] || r.canal || '',
    check_in:   r.check_in,
    check_out:  r.check_out,
    noches:     r.noches,
    personas:   r.personas,
    total:      r.total,
    abono:      r.abono,
    saldo:      Number(r.total || 0) - Number(r.abono || 0),
    mensaje:    r.mensaje || r.observaciones || ''
  };
}

/**
 * Correo de confirmación al huésped. Es el mismo que recibe quien reserva
 * por la web; `avisarLodge` añade además la notificación interna al lodge.
 * No hace nada si ya se envió para esta reserva.
 */
async function enviarConfirmacion(supabase, reserva, cabana, opciones) {
  const { avisarLodge = false } = opciones || {};
  const COL = 'email_confirmacion_enviado_at';

  if (!reserva.email) return { enviado: false, motivo: 'sin_email' };
  if (!(await tomarSello(supabase, reserva.id, COL))) {
    return { enviado: false, motivo: 'ya_enviado' };
  }

  const vars      = variablesDeReserva(reserva, cabana);
  const plantilla = await plantillaActiva(supabase, 'confirmacion', vars);

  const ok = await llamarGAS({
    tipo: avisarLodge ? 'confirmacion_mp' : 'confirmacion_externa',
    ...datosBase(reserva, cabana),
    asunto_custom: plantilla ? plantilla.asunto : '',
    cuerpo_custom: plantilla ? plantilla.cuerpo : ''
  });

  if (!ok) {
    await liberarSello(supabase, reserva.id, COL);
    return { enviado: false, motivo: 'error_envio' };
  }
  return { enviado: true };
}

/**
 * Correo de pre-llegada (las dos láminas del lodge + saldo + enlaces).
 * No hace nada si ya se envió para esta reserva.
 */
async function enviarPreLlegada(supabase, reserva, cabana) {
  const COL = 'email_pre_llegada_enviado_at';

  if (!reserva.email) return { enviado: false, motivo: 'sin_email' };
  if (!(await tomarSello(supabase, reserva.id, COL))) {
    return { enviado: false, motivo: 'ya_enviado' };
  }

  const vars      = variablesDeReserva(reserva, cabana);
  const plantilla = await plantillaActiva(supabase, 'pre_llegada', vars);

  const ok = await llamarGAS({
    tipo: 'pre_llegada',
    ...datosBase(reserva, cabana),
    asunto_custom: plantilla ? plantilla.asunto : '',
    cuerpo_custom: plantilla ? plantilla.cuerpo : ''
  });

  if (!ok) {
    await liberarSello(supabase, reserva.id, COL);
    return { enviado: false, motivo: 'error_envio' };
  }
  return { enviado: true };
}

module.exports = {
  enviarConfirmacion,
  enviarPreLlegada,
  variablesDeReserva,
  render,
  fmtFecha,
  fmtClp
};
