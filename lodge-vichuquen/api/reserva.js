'use strict';

const supabase = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const { data, error } = await supabase
    .from('reservas')
    .select('id, cabana_id, check_in, check_out, noches, total, abono, nombre, estado, created_at')
    .eq('id', id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Reserva no encontrada' });

  // Obtener nombre de la cabaña
  const { data: cabana } = await supabase
    .from('cabanas')
    .select('nombre, capacidad')
    .eq('id', data.cabana_id)
    .single();

  return res.status(200).json({
    id:         data.id,
    estado:     data.estado,
    cabana:     cabana?.nombre || data.cabana_id,
    check_in:   data.check_in,
    check_out:  data.check_out,
    noches:     data.noches,
    total:      data.total,
    abono:      data.abono,
    saldo:      data.total - data.abono,
    nombre:     data.nombre,
    created_at: data.created_at
  });
};
