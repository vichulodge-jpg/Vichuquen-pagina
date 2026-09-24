'use strict';

const { cuponDisponible } = require('./_cupones');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { codigo, cabana_id, check_in, check_out } = req.body || {};
  if (!codigo) return res.status(400).json({ error: 'Faltan campos' });

  const cupon = await cuponDisponible(codigo, { cabana_id, check_in, check_out });
  if (!cupon) return res.status(200).json({ valido: false });

  // El widget calcula el monto noche a noche; con la ventana y las cabañas lo
  // recalcula (o quita el cupón) si el huésped cambia fechas o cabaña.
  const { tipo, valor, descripcion, nochesDesde = null, nochesHasta = null, cabanas = null } = cupon;
  return res.status(200).json({ valido: true, tipo, valor, descripcion, nochesDesde, nochesHasta, cabanas });
};
