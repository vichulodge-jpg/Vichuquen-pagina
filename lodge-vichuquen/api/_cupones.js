'use strict';

// ── CUPONES DE DESCUENTO ─────────────────────────────────────
// tipo: 'porcentaje' → valor = % de descuento sobre el total
// tipo: 'fijo'       → valor = CLP fijos de descuento
// Agrega o modifica los cupones aquí.
const CUPONES = {
  'LODGE20000': { tipo: 'fijo', valor: 20000, descripcion: '$20.000 de descuento' },
};

function validarCupon(codigo, subtotal) {
  if (!codigo) return null;
  const cupon = CUPONES[String(codigo).trim().toUpperCase()];
  if (!cupon) return null;
  const descuento = cupon.tipo === 'porcentaje'
    ? Math.round(subtotal * cupon.valor / 100)
    : Math.min(cupon.valor, subtotal);
  return { tipo: cupon.tipo, valor: cupon.valor, descuento, descripcion: cupon.descripcion };
}

function esCuponValido(codigo) {
  if (!codigo) return false;
  return !!CUPONES[String(codigo).trim().toUpperCase()];
}

module.exports = { validarCupon, esCuponValido };
