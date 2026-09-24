'use strict';

const supabase = require('./_db');

// ── CUPONES DE DESCUENTO ─────────────────────────────────────
// tipo: 'porcentaje' → valor = % de descuento sobre el total
// tipo: 'fijo'       → valor = CLP fijos de descuento
// vigenciaHasta (opcional): 'YYYY-MM-DD', último día válido (hora Chile)
// usosMaximos   (opcional): máx. de reservas CONFIRMADAS que pueden usar el cupón
// nochesDesde / nochesHasta (opcional): 'YYYY-MM-DD', primera y última noche con
//   descuento. El cupón rebaja solo esas noches, sea cual sea su temporada (baja
//   incluida), y no vale para una estadía que no toque ninguna.
//   Sin ellas, el cupón rebaja las noches de temporada alta y media.
// cabanas (opcional): ids de las únicas cabañas donde vale el cupón
// Agrega o modifica los cupones aquí.
const CUPONES = {
  'LODGE20000': { tipo: 'fijo', valor: 20000,  descripcion: '$20.000 de descuento' },
  'VIC79200':   { tipo: 'fijo', valor: 79200,  descripcion: '$79.200 de descuento' },
  'VIC99000':   { tipo: 'fijo', valor: 99000,  descripcion: '$99.000 de descuento' },
  'VIC98999':   { tipo: 'fijo', valor: 98999,  descripcion: '$98.999 de descuento' },
  'VIC98500':   { tipo: 'fijo', valor: 98500,  descripcion: '$98.500 de descuento' },
  'VIC98000':   { tipo: 'fijo', valor: 98000,  descripcion: '$98.000 de descuento' },
  'INVIERNO15': { tipo: 'porcentaje', valor: 15, descripcion: '15% de descuento', vigenciaHasta: '2026-08-20', usosMaximos: 6 },
  // Carrera del domingo 4-oct-2026: noches del viernes 2 al domingo 4 (salida el lunes 5)
  'LLICOMTB25': {
    tipo: 'porcentaje', valor: 25, descripcion: '25% de descuento',
    nochesDesde: '2026-10-02', nochesHasta: '2026-10-04', usosMaximos: 8,
    cabanas: ['c1-tagua', 'c2-cisne-coscoroba', 'c3-siete-colores', 'c4-cisne-cuello-negro', 'c5-huala', 'c6-run-run'],
  },
};

function hoyChile() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // 'YYYY-MM-DD'
}

function dentroDeVigencia(cupon) {
  return !cupon.vigenciaHasta || hoyChile() <= cupon.vigenciaHasta;
}

// ¿Vale para esta cabaña y toca alguna noche de su ventana? (el check_out no es noche)
function aplicaAEstadia(cupon, { cabana_id, check_in, check_out }) {
  if (cupon.cabanas && !cupon.cabanas.includes(cabana_id)) return false;
  if (!cupon.nochesDesde) return true;
  return check_in <= cupon.nochesHasta && check_out > cupon.nochesDesde;
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

// El cupón (con su código normalizado) si existe, sigue vigente, vale para la
// estadía { cabana_id, check_in, check_out } y no agotó sus usos; si no, null.
async function cuponDisponible(codigo, estadia) {
  if (!codigo) return null;
  const key = String(codigo).trim().toUpperCase();
  const cupon = CUPONES[key];
  if (!cupon) return null;
  if (!dentroDeVigencia(cupon)) return null;
  if (!aplicaAEstadia(cupon, estadia)) return null;
  if (cupon.usosMaximos && (await usosConfirmados(key)) >= cupon.usosMaximos) return null;
  return { codigo: key, ...cupon };
}

// CLP que descuenta el cupón. noches: [{ fecha, tarifa, precio }] a precio lista
// (el 20% de temporada media no corre cuando hay cupón).
function descuentoCupon(cupon, noches) {
  const rebajadas = noches.filter(n => cupon.nochesDesde
    ? n.fecha >= cupon.nochesDesde && n.fecha <= cupon.nochesHasta
    : n.tarifa !== 'baja');
  const subtotal = rebajadas.reduce((suma, n) => suma + n.precio, 0);
  return cupon.tipo === 'porcentaje'
    ? Math.round(subtotal * cupon.valor / 100)
    : Math.min(cupon.valor, subtotal);
}

module.exports = { cuponDisponible, descuentoCupon };
