'use strict';

const supabase = require('./_db');

const DESCUENTO_CABANAS = ['c1-tagua','c2-cisne-coscoroba','c5-huala','c6-run-run','c7-pitio'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { cabana_id, check_in, check_out, nombre, email, telefono, personas, mensaje } = req.body || {};

  if (!cabana_id || !check_in || !check_out || !nombre || !email || !personas) {
    return res.status(400).json({ error: 'Faltan campos requeridos' });
  }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!DATE_RE.test(check_in) || !DATE_RE.test(check_out)) {
    return res.status(400).json({ error: 'Formato de fecha inválido' });
  }
  const today = new Date().toISOString().split('T')[0];
  if (check_in < today)    return res.status(400).json({ error: 'La fecha de llegada no puede ser en el pasado' });
  if (check_out <= check_in) return res.status(400).json({ error: 'La fecha de salida debe ser posterior a la llegada' });

  const noches     = Math.round((new Date(check_out) - new Date(check_in)) / 86400000);
  const numPersonas = parseInt(personas, 10);
  if (isNaN(numPersonas) || numPersonas < 1) return res.status(400).json({ error: 'Número de personas inválido' });

  // Verificar cabaña
  const { data: cabana, error: cabErr } = await supabase
    .from('cabanas')
    .select('id, nombre, capacidad, precio_alta, precio_baja')
    .eq('id', cabana_id)
    .single();

  if (cabErr || !cabana) return res.status(404).json({ error: 'Cabaña no encontrada' });
  if (numPersonas > cabana.capacidad) {
    return res.status(400).json({ error: `La cabaña ${cabana.nombre} tiene capacidad para ${cabana.capacidad} personas` });
  }

  // Calcular precio día a día
  const { data: temporadas } = await supabase
    .from('temporadas_alta')
    .select('fecha_inicio, fecha_fin')
    .lte('fecha_inicio', check_out)
    .gte('fecha_fin', check_in);

  const tempArr = temporadas || [];
  function diaEsAlta(ds) { return tempArr.some(t => ds >= t.fecha_inicio && ds <= t.fecha_fin); }

  let total = 0;
  const cursor  = new Date(check_in  + 'T12:00:00');
  const endDate = new Date(check_out + 'T12:00:00');
  while (cursor < endDate) {
    const ds = cursor.toISOString().split('T')[0];
    total += diaEsAlta(ds) ? cabana.precio_alta : cabana.precio_baja;
    cursor.setDate(cursor.getDate() + 1);
  }

  // Descuento 20% para ≤3 personas en cabañas elegibles
  if (DESCUENTO_CABANAS.includes(cabana_id) && numPersonas <= 3) {
    total = Math.round(total * 0.8);
  }

  const precioNoche = Math.round(total / noches);
  const abono       = Math.ceil(total * 0.5 / 1000) * 1000;

  // Verificar disponibilidad (bloqueo 5 min)
  const cincoMinAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: conflicto } = await supabase
    .from('reservas')
    .select('id')
    .eq('cabana_id', cabana_id)
    .or(`estado.eq.confirmada,and(estado.eq.pendiente,created_at.gte.${cincoMinAtras})`)
    .or(`and(check_in.lt.${check_out},check_out.gt.${check_in})`)
    .limit(1);

  if (conflicto && conflicto.length > 0) {
    return res.status(409).json({ error: 'Las fechas seleccionadas ya no están disponibles. Por favor elige otras fechas.' });
  }

  // Crear reserva pendiente
  const { data: reserva, error: resErr } = await supabase
    .from('reservas')
    .insert({
      cabana_id, check_in, check_out, noches,
      precio_noche: precioNoche, total, abono,
      nombre:   nombre.trim().slice(0, 100),
      email:    email.trim().slice(0, 100),
      telefono: (telefono || '').trim().slice(0, 30) || null,
      personas: numPersonas,
      mensaje:  (mensaje || '').trim().slice(0, 500) || null,
      estado:   'pendiente'
    })
    .select('id')
    .single();

  if (resErr || !reserva) return res.status(500).json({ error: 'Error al crear la reserva' });

  // Notificar al huésped por email (sin await — no bloquea la respuesta)
  const gasUrl = process.env.GAS_URL;
  if (gasUrl) {
    const saldo = total - Math.ceil(total * 0.5 / 1000) * 1000;
    fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret:     process.env.GAS_SECRET || '',
        tipo:       'solicitud_transferencia',
        reserva_id: reserva.id,
        nombre:     nombre.trim(),
        email:      email.trim(),
        telefono:   (telefono || '').trim(),
        cabana:     cabana.nombre,
        check_in,
        check_out,
        noches,
        personas:   numPersonas,
        total,
        abono:      Math.ceil(total * 0.5 / 1000) * 1000,
        saldo:      total - Math.ceil(total * 0.5 / 1000) * 1000,
        mensaje:    (mensaje || '').trim()
      })
    }).catch(e => console.error('GAS email error:', e.message));
  }

  return res.status(200).json({
    reserva_id: reserva.id,
    cabana:     cabana.nombre,
    check_in,
    check_out,
    noches,
    total,
    nombre:    nombre.trim(),
    email:     email.trim(),
    telefono:  (telefono || '').trim(),
    personas:  numPersonas
  });
};
