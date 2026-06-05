'use strict';

const supabase = require('./_db');

async function llamarGAS(payload) {
  const gasUrl = process.env.GAS_URL;
  if (!gasUrl) return;
  try {
    await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.GAS_SECRET || '', ...payload })
    });
  } catch (e) {
    console.error('GAS error:', e.message);
  }
}

async function notificarEmail(reserva, cabana) {
  await llamarGAS({
    tipo:       'confirmacion_mp',
    reserva_id: reserva.id,
    nombre:     reserva.nombre,
    email:      reserva.email,
    telefono:   reserva.telefono || '',
    cabana,
    check_in:   reserva.check_in,
    check_out:  reserva.check_out,
    noches:     reserva.noches,
    personas:   reserva.personas,
    total:      reserva.total,
    abono:      reserva.abono,
    saldo:      reserva.total - reserva.abono,
    mensaje:    reserva.mensaje || ''
  });
}

async function notificarPreLlegada(reserva, cabana) {
  await llamarGAS({
    tipo:       'pre_llegada',
    reserva_id: reserva.id,
    nombre:     reserva.nombre,
    email:      reserva.email,
    cabana,
    check_in:   reserva.check_in,
    check_out:  reserva.check_out,
    noches:     reserva.noches,
    personas:   reserva.personas,
    total:      reserva.total
  });
}

module.exports = async function handler(req, res) {
  // MercadoPago reintenta si no recibe 200 — siempre respondemos 200
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const { type, data } = req.body || {};

  if (type !== 'payment' || !data?.id) {
    return res.status(200).json({ ok: true });
  }

  try {
    // Re-consultar el pago a la API de MP (nunca confiar solo en el body del webhook)
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });

    if (!mpRes.ok) return res.status(200).json({ ok: true });

    const payment = await mpRes.json();
    const reservaId = payment.external_reference;

    if (!reservaId) return res.status(200).json({ ok: true });

    if (payment.status === 'approved') {
      const { data: updated } = await supabase
        .from('reservas')
        .update({ estado: 'confirmada', mp_payment_id: String(data.id) })
        .eq('id', reservaId)
        .eq('estado', 'pendiente')
        .select('id, nombre, email, telefono, cabana_id, check_in, check_out, noches, personas, total, abono, mensaje')
        .single();

      if (updated) {
        const { data: cabana } = await supabase
          .from('cabanas')
          .select('nombre')
          .eq('id', updated.cabana_id)
          .single();

        const nombreCabana = cabana?.nombre || updated.cabana_id;
        await notificarEmail(updated, nombreCabana);

        // Si el check-in es en 0, 1 o 2 días, enviar pre-llegada de inmediato
        // (el cron cubre check-in en exactamente 3 días)
        const hoyStr   = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // 'YYYY-MM-DD'
        const hoyDate  = new Date(hoyStr + 'T00:00:00Z');
        const checkIn  = new Date(updated.check_in + 'T00:00:00Z');
        const diasHastaCheckIn = Math.floor((checkIn - hoyDate) / 86400000);
        if (diasHastaCheckIn >= 0 && diasHastaCheckIn <= 2) {
          await notificarPreLlegada(updated, nombreCabana);
        }
      }

    } else if (['rejected', 'cancelled'].includes(payment.status)) {
      await supabase
        .from('reservas')
        .update({ estado: 'cancelada' })
        .eq('id', reservaId)
        .eq('estado', 'pendiente');
    }

  } catch (e) {
    console.error('webhook error:', e);
  }

  return res.status(200).json({ ok: true });
};
