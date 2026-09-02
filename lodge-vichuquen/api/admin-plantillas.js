'use strict';

/**
 * Textos de los correos automáticos, editables desde el panel.
 *
 * Mientras una plantilla esté desactivada se sigue usando el correo que ya
 * existe en gas/email-sender.gs. Al activarla, su asunto y su texto reemplazan
 * la parte redactada del correo; el resto (tabla de la reserva, láminas de la
 * pre-llegada, saldo, pie) lo sigue armando el sistema.
 */

const supabase = require('./_db');
const { variablesDeReserva, render } = require('./_emails');

const IDS = ['confirmacion', 'pre_llegada'];

// Reserva de ejemplo para la vista previa del panel.
const EJEMPLO = {
  id:            '00000000-0000-0000-0000-000000000000',
  nombre:        'Juan',
  apellido:      'Pérez',
  email:         'juan.perez@ejemplo.cl',
  telefono:      '+56 9 1234 5678',
  cabana_id:     'c1-tagua',
  check_in:      '2026-07-15',
  check_out:     '2026-07-18',
  noches:        3,
  personas:      4,
  total:         297000,
  abono:         149000,
  canal:         'booking',
  observaciones: 'Llegan cerca de las 20:00'
};

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!checkAuth(req, res)) return;

  // GET — listar las plantillas + las variables disponibles
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('plantillas_email')
      .select('id, nombre, asunto, cuerpo, activa, updated_at')
      .order('id', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      plantillas: data || [],
      variables:  Object.keys(variablesDeReserva(EJEMPLO, 'Tagua')),
      ejemplo:    variablesDeReserva(EJEMPLO, 'Tagua')
    });
  }

  // PUT — guardar una plantilla
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!IDS.includes(id)) return res.status(400).json({ error: 'Plantilla desconocida' });

    const { asunto, cuerpo, activa } = req.body || {};

    const asuntoLimpio = String(asunto == null ? '' : asunto).trim().slice(0, 300);
    const cuerpoLimpio = String(cuerpo == null ? '' : cuerpo).trim().slice(0, 20000);

    if (!asuntoLimpio) return res.status(400).json({ error: 'El asunto no puede quedar vacío.' });
    if (!cuerpoLimpio) return res.status(400).json({ error: 'El texto del correo no puede quedar vacío.' });

    const { data, error } = await supabase
      .from('plantillas_email')
      .update({
        asunto:     asuntoLimpio,
        cuerpo:     cuerpoLimpio,
        activa:     activa === true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, nombre, asunto, cuerpo, activa, updated_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const vars = variablesDeReserva(EJEMPLO, 'Tagua');
    return res.status(200).json({
      plantilla: data,
      vista_previa: {
        asunto: render(data.asunto, vars),
        cuerpo: render(data.cuerpo, vars)
      }
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
