'use strict';

const supabase = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { cabana_id } = req.query;
  if (!cabana_id) return res.status(400).json({ error: 'cabana_id requerido' });

  const today = new Date().toISOString().split('T')[0];
  const twoHoursAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const [confirmadasRes, pendientesRes, bloqueosRes] = await Promise.all([
    supabase
      .from('reservas')
      .select('check_in, check_out')
      .eq('cabana_id', cabana_id)
      .eq('estado', 'confirmada')
      .gte('check_out', today),
    supabase
      .from('reservas')
      .select('check_in, check_out')
      .eq('cabana_id', cabana_id)
      .eq('estado', 'pendiente')
      .gte('check_out', today)
      .gte('created_at', twoHoursAgo),
    supabase
      .from('bloqueos')
      .select('fecha_inicio, fecha_fin')
      .eq('cabana_id', cabana_id)
      .gte('fecha_fin', today)
  ]);

  if (confirmadasRes.error || pendientesRes.error || bloqueosRes.error) {
    return res.status(500).json({ error: 'Error consultando disponibilidad' });
  }

  const blocked = new Set();

  function addRange(start, end) {
    const d = new Date(start + 'T12:00:00');
    const e = new Date(end + 'T12:00:00');
    while (d < e) {
      blocked.add(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
  }

  (confirmadasRes.data || []).forEach(r => addRange(r.check_in, r.check_out));
  (pendientesRes.data || []).forEach(r => addRange(r.check_in, r.check_out));
  (bloqueosRes.data || []).forEach(b => addRange(b.fecha_inicio, b.fecha_fin));

  return res.status(200).json({ blocked: Array.from(blocked).sort() });
};
