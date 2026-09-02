'use strict';

/**
 * Cron job diario — envía email de pre-llegada a huéspedes con check-in en 3 días.
 * Vercel lo ejecuta automáticamente según el schedule en vercel.json.
 *
 * Entran todas las reservas confirmadas, vengan de la web o cargadas a mano
 * desde el panel (Booking, Airbnb, WhatsApp…). El sello
 * email_pre_llegada_enviado_at impide reenviar la que ya salió.
 *
 * Variable de entorno requerida: CRON_SECRET (misma que Vercel usa para autenticar la llamada)
 */

const supabase = require('./_db');
const { enviarPreLlegada } = require('./_emails');

module.exports = async function handler(req, res) {
  // Vercel envía Authorization: Bearer <CRON_SECRET> al llamar el cron
  const authHeader = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GAS_URL) {
    return res.status(200).json({ ok: true, msg: 'GAS_URL no configurada — sin acción' });
  }

  // Calcular la fecha de check-in objetivo: hoy + 3 días (zona horaria Chile)
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  ahora.setDate(ahora.getDate() + 3);
  const fechaObjetivo = ahora.toISOString().split('T')[0]; // 'YYYY-MM-DD'

  // Reservas confirmadas con check-in en 3 días a las que aún no se les envió.
  const { data: reservas, error } = await supabase
    .from('reservas')
    .select(`
      id, cabana_id, check_in, check_out, noches, personas,
      nombre, apellido, email, telefono, total, abono, canal, observaciones
    `)
    .eq('estado', 'confirmada')
    .eq('check_in', fechaObjetivo)
    .is('email_pre_llegada_enviado_at', null);

  if (error) {
    console.error('cron-pre-llegada: error Supabase', error);
    return res.status(500).json({ error: 'Error consultando reservas' });
  }

  if (!reservas || reservas.length === 0) {
    return res.status(200).json({ ok: true, enviados: 0, fecha: fechaObjetivo });
  }

  let enviados = 0;
  const omitidos = [];
  const errores  = [];

  for (const r of reservas) {
    try {
      const { data: cabana } = await supabase
        .from('cabanas')
        .select('nombre')
        .eq('id', r.cabana_id)
        .single();

      const resultado = await enviarPreLlegada(supabase, r, cabana?.nombre || r.cabana_id);

      if (resultado.enviado)                     enviados++;
      else if (resultado.motivo === 'ya_enviado') omitidos.push(r.id);
      else                                        errores.push(r.id);
    } catch (e) {
      console.error('cron-pre-llegada: error enviando a', r.email, e.message);
      errores.push(r.id);
    }
  }

  return res.status(200).json({
    ok:       true,
    fecha:    fechaObjetivo,
    enviados,
    omitidos: omitidos.length ? omitidos : undefined,
    errores:  errores.length  ? errores  : undefined
  });
};
