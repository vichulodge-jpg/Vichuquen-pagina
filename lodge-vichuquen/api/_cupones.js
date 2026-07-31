'use strict';

const supabase = require('./_db');

// ── CUPONES DE DESCUENTO ─────────────────────────────────────
// tipo: 'porcentaje' → valor = % de descuento sobre el total
// tipo: 'fijo'       → valor = CLP fijos de descuento
// vigenciaHasta (opcional): 'YYYY-MM-DD', último día válido (hora Chile)
// usosMaximos   (opcional): máx. de reservas CONFIRMADAS que pueden usar el cupón
// Agrega o modifica los cupones aquí.
const CUPONES = {
  'LODGE20000': { tipo: 'fijo', valor: 20000,  descripcion: '$20.000 de descuento' },
  'VIC79200':   { tipo: 'fijo', valor: 79200,  descripcion: '$79.200 de descuento' },
  'VIC99000':   { tipo: 'fijo', valor: 99000,  descripcion: '$99.000 de descuento' },
  'VIC98999':   { tipo: 'fijo', valor: 98999,  descripcion: '$98.999 de descuento' },
  'VIC98500':   { tipo: 'fijo', valor: 98500,  descripcion: '$98.500 de descuento' },
  'VIC98000':   { tipo: 'fijo', valor: 98000,  descripcion: '$98.000 de descuento' },
  'INVIERNO15': { tipo: 'porcentaje', valor: 15, descripcion: '15% de descuento', vigenciaHasta: '2026-08-20', usosMaximos: 6 },
};

function hoyChile() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // 'YYYY-MM-DD'
}

function dentroDeVigencia(cupon) {
  return !cupon.vigenciaHasta || hoyChile() <= cupon.vigenciaHasta;
}

// Cuenta cuántas reservas CONFIRMADAS ya usaron este código.
async function usosConfirmados(codigo) {
  const { count, error } = await supabase
    .from('reservas')
    .select('id', { count: 'exact', head: true })
    .eq('cupon_codigo', codigo)
    .eq('estado', 'confirmada');
  if (error) return Infinity; // fail-closed: si no se puede verificar, no se aplica el cupón
  return count;
}

// ¿Este código existe, sigue vigente y no superó su cupo de usos?
async function cuponDisponible(codigo) {
  if (!codigo) return false;
  const key = String(codigo).trim().toUpperCase();
  const cupon = CUPONES[key];
  if (!cupon) return false;
  if (!dentroDeVigencia(cupon)) return false;
  if (!cupon.usosMaximos) return true;
  return (await usosConfirmados(key)) < cupon.usosMaximos;
}

async function validarCupon(codigo, subtotal) {
  if (!(await cuponDisponible(codigo))) return null;
  const cupon = CUPONES[String(codigo).trim().toUpperCase()];
  const descuento = cupon.tipo === 'porcentaje'
    ? Math.round(subtotal * cupon.valor / 100)
    : Math.min(cupon.valor, subtotal);
  return { tipo: cupon.tipo, valor: cupon.valor, descuento, descripcion: cupon.descripcion };
}

module.exports = { validarCupon, esCuponValido: cuponDisponible };
