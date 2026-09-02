'use strict';

const supabase = require('./_db');
const { enviarConfirmacion, enviarPreLlegada } = require('./_emails');
const { diasHastaCheckIn } = require('./_reservas');

const CAMPOS = `
  id, nombre, apellido, email, telefono, cabana_id,
  check_in, check_out, noches, personas, total, abono,
  mensaje, observaciones, canal
`;

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
        .select(CAMPOS)
        .single();

      if (updated) {
        const { data: cabana } = await supabase
          .from('cabanas')
          .select('nombre')
          .eq('id', updated.cabana_id)
          .single();

        const nombreCabana = cabana?.nombre || updated.cabana_id;

        // Confirmación al huésped + aviso al lodge.
        // El sello de la reserva garantiza que salga una sola vez, aunque
        // MercadoPago reintente el webhook.
        await enviarConfirmacion(supabase, updated, nombreCabana, { avisarLodge: true });

        // Si el check-in es en 0, 1 o 2 días, enviar pre-llegada de inmediato
        // (el cron cubre check-in en exactamente 3 días)
        const dias = diasHastaCheckIn(updated.check_in);
        if (dias >= 0 && dias <= 2) {
          await enviarPreLlegada(supabase, updated, nombreCabana);
        }
      }

    } else if (['rejected', 'cancelled'].includes(payment.status)) {
      await supabase
        .from('reservas')
        .update({ estado: 'cancelada', cancelada_at: new Date().toISOString() })
        .eq('id', reservaId)
        .eq('estado', 'pendiente');
    }

  } catch (e) {
    console.error('webhook error:', e);
  }

  return res.status(200).json({ ok: true });
};
