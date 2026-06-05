'use strict';

const supabase = require('./_db');

async function notificarEmail(reserva, cabana) {
  const gasUrl = process.env.GAS_URL;
  if (!gasUrl) return;

  const saldo = reserva.total - reserva.abono;
  try {
    await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret:     process.env.GAS_SECRET || '',
        tipo:       'confirmacion_mp',
        reserva_id: reserva.id,
        nombre:     reserva.nombre,
        email:      reserva.email,
        telefono:   reserva.telefono || '',
        cabana:     cabana,
        check_in:   reserva.check_in,
        check_out:  reserva.check_out,
        noches:     reserva.noches,
        personas:   reserva.personas,
        total:      reserva.total,
        abono:      reserva.abono,
        saldo:      saldo,
        mensaje:    reserva.mensaje || ''
      })
    });
  } catch (e) {
    console.error('GAS email error:', e.message);
  }
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

        await notificarEmail(updated, cabana?.nombre || updated.cabana_id);
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
