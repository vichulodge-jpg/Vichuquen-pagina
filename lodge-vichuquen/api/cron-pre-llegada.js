'use strict';

/**
 * Cron job diario — envía email de pre-llegada a huéspedes con check-in en 3 días.
 * Vercel lo ejecuta automáticamente según el schedule en vercel.json.
 *
 * Variable de entorno requerida: CRON_SECRET (misma que Vercel usa para autenticar la llamada)
 */

const supabase = require('./_db');

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

  const gasUrl = process.env.GAS_URL;
  if (!gasUrl) {
    return res.status(200).json({ ok: true, msg: 'GAS_URL no configurada — sin acción' });
  }

  // Calcular la fecha de check-in objetivo: hoy + 3 días (zona horaria Chile)
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  ahora.setDate(ahora.getDate() + 3);
  const fechaObjetivo = ahora.toISOString().split('T')[0]; // 'YYYY-MM-DD'

  // Buscar reservas confirmadas con check-in en 3 días
  const { data: reservas, error } = await supabase
    .from('reservas')
    .select('id, cabana_id, check_in, check_out, noches, personas, nombre, email, total')
    .eq('estado', 'confirmada')
    .eq('check_in', fechaObjetivo);

  if (error) {
    console.error('cron-pre-llegada: error Supabase', error);
    return res.status(500).json({ error: 'Error consultando reservas' });
  }

  if (!reservas || reservas.length === 0) {
    return res.status(200).json({ ok: true, enviados: 0, fecha: fechaObjetivo });
  }

  // Para cada reserva, obtener nombre de cabaña y enviar email
  let enviados = 0;
  const errores = [];

  for (const r of reservas) {
    try {
      const { data: cabana } = await supabase
        .from('cabanas')
        .select('nombre')
        .eq('id', r.cabana_id)
        .single();

      await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret:     process.env.GAS_SECRET || '',
          tipo:       'pre_llegada',
          reserva_id: r.id,
          nombre:     r.nombre,
          email:      r.email,
          cabana:     cabana?.nombre || r.cabana_id,
          check_in:   r.check_in,
          check_out:  r.check_out,
          noches:     r.noches,
          personas:   r.personas,
          total:      r.total
        })
      });

      enviados++;
    } catch (e) {
      console.error('cron-pre-llegada: error enviando a', r.email, e.message);
      errores.push(r.id);
    }
  }

  return res.status(200).json({
    ok:      true,
    fecha:   fechaObjetivo,
    enviados,
    errores: errores.length ? errores : undefined
  });
};
