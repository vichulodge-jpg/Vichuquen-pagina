'use strict';

const supabase = require('./_db');

const TEMPORADAS_ALTA = [
  { from: '2026-06-26', to: '2026-06-28' }, { from: '2026-07-15', to: '2026-07-18' },
  { from: '2026-09-11', to: '2026-09-19' }, { from: '2026-10-09', to: '2026-10-11' },
  { from: '2026-12-04', to: '2026-12-07' }, { from: '2026-12-18', to: '2026-12-31' },
  { from: '2027-01-01', to: '2027-03-15' }, { from: '2027-03-25', to: '2027-03-27' },
  { from: '2027-05-20', to: '2027-05-22' }, { from: '2027-06-18', to: '2027-06-20' },
  { from: '2027-06-25', to: '2027-06-27' }, { from: '2027-09-10', to: '2027-09-18' },
  { from: '2027-10-08', to: '2027-10-10' }, { from: '2027-10-29', to: '2027-10-31' },
  { from: '2028-01-01', to: '2028-03-15' }
];

function diaEsAlta(ds) { return TEMPORADAS_ALTA.some(t => ds >= t.from && ds <= t.to); }
function diaEsMedia(ds) {
  if (diaEsAlta(ds)) return false;
  const d = new Date(ds + 'T12:00:00');
  const dow = d.getDay();
  if (dow === 5 || dow === 6) return true;
  const year = d.getFullYear();
  const mmdd = ds.slice(5);
  if ((year === 2026 || year === 2027) && mmdd >= '06-15' && mmdd <= '07-20') return true;
  return false;
}

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

  // Calendario cierra el 2028-03-15
  if (check_in > '2028-03-15' || check_out > '2028-03-15') {
    return res.status(400).json({ error: 'Las reservas solo están disponibles hasta el 15 de marzo de 2028.' });
  }

  // Verificar cabaña
  const { data: cabana, error: cabErr } = await supabase
    .from('cabanas')
    .select('id, nombre, capacidad, precio_alta, precio_media, precio_baja')
    .eq('id', cabana_id)
    .single();

  if (cabErr || !cabana) return res.status(404).json({ error: 'Cabaña no encontrada' });
  if (numPersonas > cabana.capacidad) {
    return res.status(400).json({ error: `La cabaña ${cabana.nombre} tiene capacidad para ${cabana.capacidad} personas` });
  }

  // Calcular precio día a día (Alta / Media / Baja)
  const DESCUENTO_CABANAS = ['c1-tagua','c2-cisne-coscoroba','c5-huala','c6-run-run','c7-pitio'];
  const DESCUENTO_HASTA   = '2026-11-15';

  let totalAlta = 0, totalMediaDesc = 0, totalMediaFixed = 0, totalBaja = 0;
  const cursor  = new Date(check_in  + 'T12:00:00');
  const endDate = new Date(check_out + 'T12:00:00');
  while (cursor < endDate) {
    const ds = cursor.toISOString().split('T')[0];
    if      (diaEsAlta(ds))   totalAlta += cabana.precio_alta;
    else if (diaEsMedia(ds))  { ds <= DESCUENTO_HASTA ? totalMediaDesc += cabana.precio_media : totalMediaFixed += cabana.precio_media; }
    else                       totalBaja += cabana.precio_baja;
    cursor.setDate(cursor.getDate() + 1);
  }

  // Descuento 20% en noches media vigentes (< 16-nov-2026) para ≤3 personas
  if (DESCUENTO_CABANAS.includes(cabana_id) && numPersonas <= 3 && totalMediaDesc > 0) {
    totalMediaDesc = Math.round(totalMediaDesc * 0.8);
  }

  let total = totalAlta + totalMediaDesc + totalMediaFixed + totalBaja;

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
