'use strict';

const supabase = require('./_db');

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
      await supabase
        .from('reservas')
        .update({ estado: 'confirmada', mp_payment_id: String(data.id) })
        .eq('id', reservaId)
        .eq('estado', 'pendiente');

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
