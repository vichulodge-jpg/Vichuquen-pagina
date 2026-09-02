'use strict';

const supabase = require('./_db');
const {
  UUID_RE, DATE_RE,
  validarReservaAdmin, buscarConflicto, nombreCabana, diasHastaCheckIn, hoyChile
} = require('./_reservas');
const { enviarConfirmacion, enviarPreLlegada } = require('./_emails');

const CAMPOS = `
  id, cabana_id, check_in, check_out, noches,
  precio_noche, total, abono, nombre, apellido, email,
  telefono, personas, mensaje, observaciones, estado, canal,
  forma_pago, creada_por, cupon_codigo,
  email_confirmacion_enviado_at, email_pre_llegada_enviado_at,
  mp_preference_id, mp_payment_id, created_at, cancelada_at
`;

function checkAuth(req, res) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: 'No autorizado' });
    return false;
  }
  return true;
}

/**
 * Dispara los correos de una reserva recién confirmada.
 * Nunca lanza: si el correo falla, la reserva ya quedó guardada igual.
 * Devuelve un resumen para mostrarlo en el panel.
 */
async function correosDeConfirmacion(reserva, cabana) {
  const resumen = { confirmacion: null, pre_llegada: null };

  try {
    const r = await enviarConfirmacion(supabase, reserva, cabana, { avisarLodge: false });
    resumen.confirmacion = r.enviado ? 'enviado' : r.motivo;
  } catch (e) {
    console.error('correo confirmación:', e.message);
    resumen.confirmacion = 'error_envio';
  }

  // El cron de pre-llegada busca check-in exactamente en 3 días. Si la reserva
  // se carga con menos margen que eso, el cron ya no la va a alcanzar: se envía
  // ahora. El sello anti-duplicado evita que el cron la repita.
  const dias = diasHastaCheckIn(reserva.check_in);
  if (dias >= 0 && dias <= 3) {
    try {
      const r = await enviarPreLlegada(supabase, reserva, cabana);
      resumen.pre_llegada = r.enviado ? 'enviado' : r.motivo;
    } catch (e) {
      console.error('correo pre-llegada:', e.message);
      resumen.pre_llegada = 'error_envio';
    }
  } else {
    resumen.pre_llegada = 'programado';
  }

  return resumen;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req, res)) return;

  // ── GET — listar reservas ──────────────────────────────────
  if (req.method === 'GET') {
    let query = supabase.from('reservas').select(CAMPOS);

    if (req.query.estado) query = query.eq('estado', req.query.estado);
    if (req.query.cabana) query = query.eq('cabana_id', req.query.cabana);
    if (req.query.canal)  query = query.eq('canal', req.query.canal);

    // Modo calendario: todas las reservas que tocan el rango pedido.
    const { desde, hasta } = req.query;
    if (desde && hasta && DATE_RE.test(desde) && DATE_RE.test(hasta)) {
      query = query
        .lt('check_in', hasta)
        .gt('check_out', desde)
        .order('check_in', { ascending: true })
        .limit(1000);
    } else {
      query = query.order('created_at', { ascending: false }).limit(300);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── POST — crear reserva externa desde el panel ────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const { error: invalido, datos } = validarReservaAdmin(body);
    if (invalido) return res.status(400).json({ error: invalido });

    const cabana = await nombreCabana(supabase, datos.cabana_id);
    if (!cabana) return res.status(404).json({ error: 'Cabaña no encontrada.' });
    if (datos.personas > cabana.capacidad) {
      return res.status(400).json({
        error: `La cabaña ${cabana.nombre} tiene capacidad para ${cabana.capacidad} personas.`
      });
    }

    // Solo una reserva confirmada ocupa fechas. Una cancelada no bloquea nada.
    if (datos.estado === 'confirmada') {
      const { error: errDisp, conflicto } = await buscarConflicto(supabase, datos);
      if (errDisp)   return res.status(500).json({ error: errDisp });
      if (conflicto) return res.status(409).json({ error: conflicto });
    }

    const { data: reserva, error } = await supabase
      .from('reservas')
      .insert({
        ...datos,
        creada_por: 'admin',
        cancelada_at: datos.estado === 'cancelada' ? new Date().toISOString() : null
      })
      .select(CAMPOS)
      .single();

    if (error) {
      // La constraint reservas_sin_solape (si está creada) atrapa las carreras.
      if (String(error.message).indexOf('reservas_sin_solape') !== -1) {
        return res.status(409).json({ error: 'Esas fechas acaban de ocuparse. Actualiza y vuelve a intentar.' });
      }
      return res.status(500).json({ error: error.message });
    }

    // Correos: automáticos salvo que el administrador los desmarque, y nunca
    // para una estadía que ya terminó (sirve para cargar reservas antiguas).
    const quiereCorreo = body.enviar_email !== false;
    const yaTermino    = reserva.check_out < hoyChile();
    let correos = { confirmacion: 'omitido', pre_llegada: 'omitido' };

    if (reserva.estado === 'confirmada' && quiereCorreo && !yaTermino) {
      correos = await correosDeConfirmacion(reserva, cabana.nombre);
    }

    return res.status(201).json({ reserva, correos });
  }

  // ── PATCH — editar reserva / cambiar estado ────────────────
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id || !UUID_RE.test(id)) return res.status(400).json({ error: 'ID inválido' });

    const { data: actual, error: errGet } = await supabase
      .from('reservas').select(CAMPOS).eq('id', id).single();

    if (errGet || !actual) return res.status(404).json({ error: 'Reserva no encontrada' });

    const body = req.body || {};

    // Dos caminos distintos:
    //
    //  a) Solo cambia el estado — es lo que hacen los botones Confirmar /
    //     Cancelar del listado. NO se revalida el resto de la reserva: una
    //     reserva antigua de la web puede tener datos que hoy no pasarían la
    //     validación (correo con formato raro, más personas que la capacidad
    //     registrada) y aun así debe poder confirmarse o cancelarse.
    //
    //  b) Edición completa desde el formulario — ahí sí se valida todo.
    const camposEnviados = Object.keys(body).filter(k => k !== 'enviar_email');
    const esSoloEstado = camposEnviados.length === 1 && camposEnviados[0] === 'estado';

    let cambios, estadoFinal, fechasFinales;

    if (esSoloEstado) {
      estadoFinal = body.estado;
      if (!['confirmada', 'cancelada', 'pendiente'].includes(estadoFinal)) {
        return res.status(400).json({ error: 'Estado inválido' });
      }
      cambios = { estado: estadoFinal };
      fechasFinales = {
        cabana_id: actual.cabana_id,
        check_in:  actual.check_in,
        check_out: actual.check_out
      };

    } else {
      // Se parte de lo que ya hay y se pisa solo lo que venga en el cuerpo.
      const mezcla = {
        cabana_id:     body.cabana_id     !== undefined ? body.cabana_id     : actual.cabana_id,
        check_in:      body.check_in      !== undefined ? body.check_in      : actual.check_in,
        check_out:     body.check_out     !== undefined ? body.check_out     : actual.check_out,
        nombre:        body.nombre        !== undefined ? body.nombre        : actual.nombre,
        apellido:      body.apellido      !== undefined ? body.apellido      : actual.apellido,
        email:         body.email         !== undefined ? body.email         : actual.email,
        telefono:      body.telefono      !== undefined ? body.telefono      : actual.telefono,
        personas:      body.personas      !== undefined ? body.personas      : actual.personas,
        estado:        body.estado        !== undefined ? body.estado        : actual.estado,
        canal:         body.canal         !== undefined ? body.canal         : actual.canal,
        forma_pago:    body.forma_pago    !== undefined ? body.forma_pago    : actual.forma_pago,
        total:         body.total         !== undefined ? body.total         : actual.total,
        abono:         body.abono         !== undefined ? body.abono         : actual.abono,
        observaciones: body.observaciones !== undefined ? body.observaciones : actual.observaciones
      };

      const { error: invalido, datos } = validarReservaAdmin(mezcla);
      if (invalido) return res.status(400).json({ error: invalido });

      cambios = { ...datos };
      estadoFinal = datos.estado;
      fechasFinales = {
        cabana_id: datos.cabana_id,
        check_in:  datos.check_in,
        check_out: datos.check_out
      };
    }

    const cabana = await nombreCabana(supabase, fechasFinales.cabana_id);
    if (!cabana) return res.status(404).json({ error: 'Cabaña no encontrada.' });

    // La capacidad solo se exige al editar el formulario: un simple cambio de
    // estado no debe quedar bloqueado por datos antiguos.
    if (!esSoloEstado && cambios.personas > cabana.capacidad) {
      return res.status(400).json({
        error: `La cabaña ${cabana.nombre} tiene capacidad para ${cabana.capacidad} personas.`
      });
    }

    // Cambiar fechas o cabaña mueve el bloqueo de disponibilidad: hay que
    // comprobar que el destino esté libre. Una reserva cancelada no ocupa nada.
    if (estadoFinal === 'confirmada') {
      const { error: errDisp, conflicto } = await buscarConflicto(supabase, {
        ...fechasFinales, excluirId: id
      });
      if (errDisp)   return res.status(500).json({ error: errDisp });
      if (conflicto) return res.status(409).json({ error: conflicto });
    }

    cambios.updated_at   = new Date().toISOString();
    cambios.cancelada_at = estadoFinal === 'cancelada'
      ? (actual.cancelada_at || new Date().toISOString())
      : null;

    const { data: reserva, error } = await supabase
      .from('reservas').update(cambios).eq('id', id).select(CAMPOS).single();

    if (error) {
      if (String(error.message).indexOf('reservas_sin_solape') !== -1) {
        return res.status(409).json({ error: 'Esas fechas acaban de ocuparse. Actualiza y vuelve a intentar.' });
      }
      return res.status(500).json({ error: error.message });
    }

    // Si la reserva quedó confirmada y todavía no se le mandó la confirmación,
    // sale ahora. El sello impide repetir la que ya se envió.
    const quiereCorreo = body.enviar_email !== false;
    const yaTermino    = reserva.check_out < hoyChile();
    let correos = { confirmacion: 'omitido', pre_llegada: 'omitido' };

    if (reserva.estado === 'confirmada' && quiereCorreo && !yaTermino) {
      correos = await correosDeConfirmacion(reserva, cabana.nombre);
    }

    return res.status(200).json({ reserva, correos });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
