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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req, res)) return;

  // GET — listar bloqueos
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('bloqueos')
      .select('id, cabana_id, fecha_inicio, fecha_fin, motivo, created_at')
      .gte('fecha_fin', new Date().toISOString().split('T')[0])
      .order('fecha_inicio', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // POST — crear bloqueo
  if (req.method === 'POST') {
    const { cabana_id, fecha_inicio, fecha_fin, motivo } = req.body || {};

    if (!cabana_id || !fecha_inicio || !fecha_fin) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_RE.test(fecha_inicio) || !DATE_RE.test(fecha_fin)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }
    if (fecha_fin <= fecha_inicio) {
      return res.status(400).json({ error: 'fecha_fin debe ser posterior a fecha_inicio' });
    }

    const motivoFinal = ['airbnb', 'booking', 'mantencion', 'manual'].includes(motivo)
      ? motivo
      : 'manual';

    const { data, error } = await supabase
      .from('bloqueos')
      .insert({ cabana_id, fecha_inicio, fecha_fin, motivo: motivoFinal })
      .select('id, cabana_id, fecha_inicio, fecha_fin, motivo')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  // DELETE — eliminar bloqueo
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { error } = await supabase
      .from('bloqueos')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
