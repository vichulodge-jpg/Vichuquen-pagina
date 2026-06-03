'use strict';

const supabase = require('./_db');

function checkAuth(req, res) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ error: 'No autorizado' });
    return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req, res)) return;

  // GET — listar reservas
  if (req.method === 'GET') {
    let query = supabase
      .from('reservas')
      .select(`
        id, cabana_id, check_in, check_out, noches,
        precio_noche, total, abono, nombre, email,
        telefono, personas, mensaje, estado,
        mp_preference_id, mp_payment_id, created_at
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (req.query.estado)   query = query.eq('estado', req.query.estado);
    if (req.query.cabana)   query = query.eq('cabana_id', req.query.cabana);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // PATCH — cambiar estado de reserva
  if (req.method === 'PATCH') {
    const { id } = req.query;
    const { estado } = req.body || {};

    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    if (!['confirmada', 'cancelada', 'pendiente'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const { data, error } = await supabase
      .from('reservas')
      .update({ estado })
      .eq('id', id)
      .select('id, estado')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
