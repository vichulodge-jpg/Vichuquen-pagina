'use strict';

// ── CUPONES DE DESCUENTO ─────────────────────────────────────
// tipo: 'porcentaje' → valor = % de descuento sobre el total
// tipo: 'fijo'       → valor = CLP fijos de descuento
// Agrega o modifica los cupones aquí.
const CUPONES = {
  // Ejemplo — reemplaza con tus códigos reales:
  // 'PROMO20':  { tipo: 'porcentaje', valor: 20, descripcion: '20% de descuento' },
  // 'LODGE5000':{ tipo: 'fijo',       valor: 5000, descripcion: '$5.000 de descuento' },
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

module.exports = { validarCupon };
