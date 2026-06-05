'use strict';

const { validarCupon } = require('./_cupones');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { codigo, subtotal } = req.body || {};
  if (!codigo || !subtotal) return res.status(400).json({ error: 'Faltan campos' });

  const result = validarCupon(codigo, Number(subtotal));
  if (!result) return res.status(200).json({ valido: false });

  return res.status(200).json({ valido: true, ...result });
};
