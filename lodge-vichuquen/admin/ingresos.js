/**
 * Pestaña "Ingresos" del panel: resumen semanal o mensual de lo que rinde cada
 * cabaña, con descarga en CSV (se abre en Excel) e impresión / PDF.
 *
 * Criterio: solo reservas confirmadas, y el ingreso se reparte por noche. Una
 * estadía que cruza el borde del período aporta únicamente la parte de sus
 * noches que cae dentro, para que sumar dos meses seguidos no cuente nada doble.
 *
 * No necesita API propia: usa el modo "rango" de /api/admin-reservas.
 */
(function () {
  'use strict';

  var A = window.LodgeAdmin;
  if (!A) return;

  var MS_DIA = 86400000;
  var DIAS_SEMANA = 7;
  var SEPARADOR_CSV = ';';   // el Excel en español separa columnas con punto y coma
  var BOM_UTF8 = String.fromCharCode(0xFEFF);   // marca que le dice a Excel "esto es UTF-8"

  var FORMAS_PAGO = {
    transferencia: 'Transferencia',
    efectivo:      'Efectivo',
    mercadopago:   'MercadoPago',
    tarjeta:       'Tarjeta',
    canal_externo: 'Cobrado por el canal',
    otro:          'Otro'
  };

  var modo = 'mes';          // 'mes' | 'semana'
  var ancla = new Date();    // cualquier día del período que se muestra
  var actual = null;         // { periodo, resumen } de lo que está en pantalla
  var pedidoEnCurso = 0;     // descarta respuestas de un período que ya no se mira

  function qs(id) { return document.getElementById(id); }

  // ── FECHAS ───────────────────────────────────────────────────
  function aFecha(iso) { return new Date(iso + 'T12:00:00'); }

  /** Días (o noches) entre dos fechas ISO; negativo si `hasta` es anterior. */
  function diasEntre(desde, hasta) {
    return Math.round((aFecha(hasta) - aFecha(desde)) / MS_DIA);
  }

  function fechaLarga(d, conAnio) {
    return d.getDate() + ' de ' + A.MESES[d.getMonth()] + (conAnio ? ' de ' + d.getFullYear() : '');
  }

  function tituloSemana(lunes, domingo) {
    var mismoAnio = lunes.getFullYear() === domingo.getFullYear();
    var mismoMes  = mismoAnio && lunes.getMonth() === domingo.getMonth();
    var inicio = mismoMes ? String(lunes.getDate()) : fechaLarga(lunes, !mismoAnio);
    return 'Semana del ' + inicio + ' al ' + fechaLarga(domingo, true);
  }

  /**
   * Período que contiene a `dia`. `hasta` es exclusivo: el primer día que ya
   * no pertenece al período. Las semanas van de lunes a domingo.
   */
  function periodoDe(tipo, dia) {
    var y = dia.getFullYear(), m = dia.getMonth();

    if (tipo === 'semana') {
      var diasDesdeLunes = (dia.getDay() + 6) % DIAS_SEMANA;
      var lunes     = new Date(y, m, dia.getDate() - diasDesdeLunes);
      var domingo   = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + DIAS_SEMANA - 1);
      var siguiente = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + DIAS_SEMANA);
      return {
        tipo: 'semana',
        desde: A.isoLocal(lunes),
        hasta: A.isoLocal(siguiente),
        ultimoDia: A.isoLocal(domingo),
        dias: DIAS_SEMANA,
        titulo: tituloSemana(lunes, domingo),
        archivo: 'ingresos-semana-' + A.isoLocal(lunes)
      };
    }

    var primero = new Date(y, m, 1);
    var proximo = new Date(y, m + 1, 1);
    var ultimo  = new Date(y, m + 1, 0);
    return {
      tipo: 'mes',
      desde: A.isoLocal(primero),
      hasta: A.isoLocal(proximo),
      ultimoDia: A.isoLocal(ultimo),
      dias: ultimo.getDate(),
      titulo: A.capitalize(A.MESES[m]) + ' de ' + y,
      archivo: 'ingresos-' + y + '-' + A.pad(m + 1)
    };
  }

  // ── CÁLCULO ──────────────────────────────────────────────────
  /** Una reserva vista desde el período: cuántas noches y cuánto ingreso le tocan. */
  function lineaDeReserva(r, periodo) {
    var nochesReserva = diasEntre(r.check_in, r.check_out);
    var inicio = r.check_in  > periodo.desde ? r.check_in  : periodo.desde;
    var fin    = r.check_out < periodo.hasta ? r.check_out : periodo.hasta;
    var nochesPeriodo = Math.max(0, diasEntre(inicio, fin));
    var total = Number(r.total || 0);
    var abono = Number(r.abono || 0);

    return {
      cabanaId: r.cabana_id,
      canalId: A.canalInfo(r.canal).id,
      huesped: A.nombreCompleto(r),
      checkIn: r.check_in,
      checkOut: r.check_out,
      formaPago: r.forma_pago || '',
      nochesReserva: nochesReserva,
      nochesPeriodo: nochesPeriodo,
      total: total,
      ingreso: nochesReserva > 0 ? Math.round(total * nochesPeriodo / nochesReserva) : 0,
      abono: abono,
      saldo: Math.max(0, total - abono)
    };
  }

  function grupoVacio(id, etiqueta) {
    return { id: id, etiqueta: etiqueta, reservas: 0, noches: 0, ingreso: 0 };
  }

  /** Suma las líneas por la clave indicada, partiendo de los grupos `base`. */
  function agrupar(lineas, clave, etiquetaDe, base) {
    var orden = base.map(function (g) { return g.id; });
    var porId = {};
    base.forEach(function (g) { porId[g.id] = g; });

    lineas.forEach(function (l) {
      var id = l[clave];
      var previo = porId[id];
      if (!previo) { previo = grupoVacio(id, etiquetaDe(id)); orden.push(id); }
      porId[id] = {
        id: id,
        etiqueta: previo.etiqueta,
        reservas: previo.reservas + 1,
        noches: previo.noches + l.nochesPeriodo,
        ingreso: previo.ingreso + l.ingreso
      };
    });

    return orden.map(function (id) { return porId[id]; });
  }

  function sumar(lista, campo) {
    return lista.reduce(function (acum, x) { return acum + x[campo]; }, 0);
  }

  function etiquetaCabana(id) {
    for (var i = 0; i < A.CABANAS.length; i++) {
      if (A.CABANAS[i].id === id) return A.CABANAS[i].num + ' — ' + A.CABANAS[i].nombre;
    }
    return id;
  }

  function calcularResumen(reservas, periodo) {
    var lineas = reservas
      .filter(function (r) { return r.estado === 'confirmada'; })
      .map(function (r) { return lineaDeReserva(r, periodo); })
      .filter(function (l) { return l.nochesPeriodo > 0; })
      .sort(function (a, b) {
        if (a.checkIn !== b.checkIn) return a.checkIn < b.checkIn ? -1 : 1;
        return etiquetaCabana(a.cabanaId).localeCompare(etiquetaCabana(b.cabanaId));
      });

    // Todas las cabañas aparecen, también las que no vendieron nada.
    var cabanasBase = A.CABANAS.map(function (c) { return grupoVacio(c.id, etiquetaCabana(c.id)); });
    var porCabana = agrupar(lineas, 'cabanaId', etiquetaCabana, cabanasBase)
      .map(function (g) {
        return {
          id: g.id, etiqueta: g.etiqueta, reservas: g.reservas, noches: g.noches,
          ingreso: g.ingreso, ocupacion: g.noches / periodo.dias
        };
      });

    var porCanal = agrupar(lineas, 'canalId', function (id) { return A.canalInfo(id).label; }, [])
      .sort(function (a, b) { return b.ingreso - a.ingreso; });

    var noches = sumar(lineas, 'nochesPeriodo');
    return {
      lineas: lineas,
      porCabana: porCabana,
      porCanal: porCanal,
      totales: {
        ingreso: sumar(lineas, 'ingreso'),
        noches: noches,
        reservas: lineas.length,
        saldo: sumar(lineas, 'saldo'),
        // Se mide contra las cabañas del catálogo: una reserva con un id de
        // cabaña desconocido suma su fila, pero no agranda el lodge.
        ocupacion: noches / (A.CABANAS.length * periodo.dias)
      }
    };
  }

  // ── PANTALLA ─────────────────────────────────────────────────
  function fmtPct(x) { return Math.round(x * 100) + '%'; }

  function nochesTexto(l) {
    return l.nochesPeriodo < l.nochesReserva
      ? l.nochesPeriodo + ' de ' + l.nochesReserva
      : String(l.nochesPeriodo);
  }

  function tile(etiqueta, valor, nota) {
    return '<div class="ing-tile"><span>' + A.esc(etiqueta) + '</span>' +
           '<strong>' + A.esc(valor) + '</strong>' +
           (nota ? '<small>' + A.esc(nota) + '</small>' : '') + '</div>';
  }

  function tablaCabanas(resumen) {
    var t = resumen.totales;
    return '<div class="table-wrap"><table>' +
      '<thead><tr><th>Cabaña</th><th class="num">Reservas</th><th class="num">Noches</th>' +
      '<th class="num">Ocupación</th><th class="num">Ingresos</th></tr></thead><tbody>' +
      resumen.porCabana.map(function (c) {
        return '<tr><td>' + A.esc(c.etiqueta) + '</td>' +
          '<td class="num">' + c.reservas + '</td>' +
          '<td class="num">' + c.noches + '</td>' +
          '<td class="num">' + fmtPct(c.ocupacion) + '</td>' +
          '<td class="num">' + A.fmtCLP(c.ingreso) + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td>Total</td>' +
      '<td class="num">' + t.reservas + '</td>' +
      '<td class="num">' + t.noches + '</td>' +
      '<td class="num">' + fmtPct(t.ocupacion) + '</td>' +
      '<td class="num">' + A.fmtCLP(t.ingreso) + '</td></tr></tfoot></table></div>';
  }

  function tablaCanales(resumen) {
    if (!resumen.porCanal.length) return '<p class="ing-vacio">Sin reservas en este período.</p>';
    return '<div class="table-wrap"><table>' +
      '<thead><tr><th>Canal</th><th class="num">Reservas</th><th class="num">Noches</th>' +
      '<th class="num">Ingresos</th></tr></thead><tbody>' +
      resumen.porCanal.map(function (c) {
        return '<tr><td><span class="canal-badge" style="background:' + A.canalInfo(c.id).color + '">' +
          A.esc(c.etiqueta) + '</span></td>' +
          '<td class="num">' + c.reservas + '</td>' +
          '<td class="num">' + c.noches + '</td>' +
          '<td class="num">' + A.fmtCLP(c.ingreso) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function tablaDetalle(resumen) {
    if (!resumen.lineas.length) {
      return '<p class="ing-vacio">No hay reservas confirmadas con noches en este período.</p>';
    }
    var t = resumen.totales;
    return '<div class="table-wrap"><table>' +
      '<thead><tr><th>Cabaña</th><th>Huésped</th><th>Canal</th><th>Check-in</th><th>Check-out</th>' +
      '<th class="num">Noches</th><th class="num">Ingreso del período</th>' +
      '<th class="num">Total reserva</th><th class="num">Abono</th><th class="num">Saldo</th>' +
      '</tr></thead><tbody>' +
      resumen.lineas.map(function (l) {
        return '<tr><td>' + A.esc(etiquetaCabana(l.cabanaId)) + '</td>' +
          '<td>' + A.esc(l.huesped) + '</td>' +
          '<td>' + A.esc(A.canalInfo(l.canalId).label) + '</td>' +
          '<td>' + A.fmtDate(l.checkIn) + '</td>' +
          '<td>' + A.fmtDate(l.checkOut) + '</td>' +
          '<td class="num">' + nochesTexto(l) + '</td>' +
          '<td class="num"><strong>' + A.fmtCLP(l.ingreso) + '</strong></td>' +
          '<td class="num">' + A.fmtCLP(l.total) + '</td>' +
          '<td class="num">' + A.fmtCLP(l.abono) + '</td>' +
          '<td class="num">' + A.fmtCLP(l.saldo) + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><td colspan="5">Total</td>' +
      '<td class="num">' + t.noches + '</td>' +
      '<td class="num">' + A.fmtCLP(t.ingreso) + '</td><td></td><td></td>' +
      '<td class="num">' + A.fmtCLP(t.saldo) + '</td></tr></tfoot></table></div>' +
      '<p class="ing-nota">Total, abono y saldo son de la estadía completa; ' +
      'solo «Ingreso del período» está repartido por noche.</p>';
  }

  function render(periodo, resumen) {
    var t = resumen.totales;
    qs('ingresosWrap').innerHTML =
      '<div class="solo-print ing-print-head">' +
        '<h1>Vichuquén Lodge y Marina</h1>' +
        '<p>Resumen de ingresos · ' + A.esc(periodo.titulo) +
        ' (' + A.fmtDate(periodo.desde) + ' al ' + A.fmtDate(periodo.ultimoDia) + ')</p>' +
      '</div>' +
      '<div class="ing-tiles">' +
        tile('Ingresos del período', A.fmtCLP(t.ingreso)) +
        tile('Noches vendidas', String(t.noches)) +
        tile('Ocupación', fmtPct(t.ocupacion), 'de ' + A.CABANAS.length + ' cabañas × ' + periodo.dias + ' días') +
        tile('Reservas', String(t.reservas)) +
        tile('Saldo por cobrar', A.fmtCLP(t.saldo), 'estadías completas de estas reservas, sin repartir') +
      '</div>' +
      '<div class="ing-dos">' +
        '<div><h3 class="ing-subtitulo">Por cabaña</h3>' + tablaCabanas(resumen) + '</div>' +
        '<div><h3 class="ing-subtitulo">Por canal</h3>' + tablaCanales(resumen) + '</div>' +
      '</div>' +
      '<h3 class="ing-subtitulo">Detalle de reservas</h3>' + tablaDetalle(resumen);
  }

  function habilitarAcciones(si) {
    qs('btnIngDescargar').disabled = !si;
    qs('btnIngImprimir').disabled  = !si;
  }

  function cargar() {
    var periodo = periodoDe(modo, ancla);
    var pedido = ++pedidoEnCurso;

    actual = null;
    habilitarAcciones(false);
    qs('ingPeriodoLabel').textContent = periodo.titulo;
    qs('ingresosWrap').innerHTML = '<p class="loading">Cargando…</p>';

    A.apiFetch('/api/admin-reservas?estado=confirmada&desde=' + periodo.desde + '&hasta=' + periodo.hasta)
      .then(function (data) {
        if (pedido !== pedidoEnCurso) return;
        var resumen = calcularResumen(Array.isArray(data) ? data : [], periodo);
        actual = { periodo: periodo, resumen: resumen };
        render(periodo, resumen);
        habilitarAcciones(true);
      })
      .catch(function (e) {
        if (pedido !== pedidoEnCurso) return;
        qs('ingresosWrap').innerHTML =
          '<p class="loading">No se pudo cargar el resumen: ' + A.esc(e.message) + '</p>';
      });
  }

  // ── CSV ──────────────────────────────────────────────────────
  /**
   * Los nombres de huésped vienen del formulario público: si uno empieza con
   * =, +, - o @, Excel lo ejecutaría como fórmula. Se neutraliza con un apóstrofo.
   */
  function celdaCSV(valor) {
    if (typeof valor === 'number') return String(valor);
    var s = String(valor == null ? '' : valor);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function fechaCSV(iso) {
    var p = String(iso).split('-');
    return p[2] + '-' + p[1] + '-' + p[0];
  }

  function armarCSV(periodo, resumen) {
    var t = resumen.totales;
    var ahora = new Date();
    var generado = fechaCSV(A.isoLocal(ahora)) + ' ' + A.pad(ahora.getHours()) + ':' + A.pad(ahora.getMinutes());

    var filas = [
      ['Vichuquén Lodge y Marina — Resumen de ingresos'],
      ['Período', periodo.titulo],
      ['Desde', fechaCSV(periodo.desde)],
      ['Hasta', fechaCSV(periodo.ultimoDia)],
      ['Generado', generado],
      ['Criterio', 'Solo reservas confirmadas. El ingreso se reparte por noche: de una estadía ' +
                   'que cruza el borde del período entra solo la parte de las noches de adentro.'],
      [],
      ['RESUMEN'],
      ['Ingresos del período', t.ingreso],
      ['Noches vendidas', t.noches],
      ['Ocupación', fmtPct(t.ocupacion)],
      ['Reservas', t.reservas],
      ['Saldo por cobrar (estadías completas, sin repartir)', t.saldo],
      [],
      ['INGRESOS POR CABAÑA'],
      ['Cabaña', 'Reservas', 'Noches', 'Ocupación', 'Ingresos']
    ];

    resumen.porCabana.forEach(function (c) {
      filas.push([c.etiqueta, c.reservas, c.noches, fmtPct(c.ocupacion), c.ingreso]);
    });
    filas.push(['Total', t.reservas, t.noches, fmtPct(t.ocupacion), t.ingreso]);

    filas.push([], ['INGRESOS POR CANAL'], ['Canal', 'Reservas', 'Noches', 'Ingresos']);
    resumen.porCanal.forEach(function (c) {
      filas.push([c.etiqueta, c.reservas, c.noches, c.ingreso]);
    });

    filas.push([], ['DETALLE DE RESERVAS'], [
      'Cabaña', 'Huésped', 'Canal', 'Check-in', 'Check-out',
      'Noches en el período', 'Noches de la reserva', 'Ingreso del período',
      'Total reserva', 'Abono', 'Saldo', 'Forma de pago'
    ]);
    resumen.lineas.forEach(function (l) {
      filas.push([
        etiquetaCabana(l.cabanaId), l.huesped, A.canalInfo(l.canalId).label,
        fechaCSV(l.checkIn), fechaCSV(l.checkOut),
        l.nochesPeriodo, l.nochesReserva, l.ingreso, l.total, l.abono, l.saldo,
        FORMAS_PAGO[l.formaPago] || l.formaPago
      ]);
    });

    return filas.map(function (f) { return f.map(celdaCSV).join(SEPARADOR_CSV); }).join('\r\n') + '\r\n';
  }

  function descargar() {
    if (!actual) return;
    // El BOM le dice a Excel que el archivo es UTF-8; sin él rompe los acentos.
    var blob = new Blob([BOM_UTF8 + armarCSV(actual.periodo, actual.resumen)],
                        { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = actual.periodo.archivo + '.csv';
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ── EVENTOS ──────────────────────────────────────────────────
  function mover(delta) {
    ancla = modo === 'semana'
      ? new Date(ancla.getFullYear(), ancla.getMonth(), ancla.getDate() + delta * DIAS_SEMANA)
      : new Date(ancla.getFullYear(), ancla.getMonth() + delta, 1);
    cargar();
  }

  document.querySelectorAll('[data-ing-modo]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (modo === btn.dataset.ingModo) return;
      modo = btn.dataset.ingModo;
      // Al cambiar de vista se vuelve a hoy: "la semana" de un mes entero no existe.
      ancla = new Date();
      document.querySelectorAll('[data-ing-modo]').forEach(function (b) {
        var activo = b === btn;
        b.classList.toggle('active', activo);
        b.setAttribute('aria-pressed', activo ? 'true' : 'false');
      });
      cargar();
    });
  });

  qs('btnIngAnterior').addEventListener('click', function () { mover(-1); });
  qs('btnIngSiguiente').addEventListener('click', function () { mover(1); });
  qs('btnIngHoy').addEventListener('click', function () { ancla = new Date(); cargar(); });
  qs('btnIngDescargar').addEventListener('click', descargar);
  qs('btnIngImprimir').addEventListener('click', function () { window.print(); });

  document.querySelector('.tab[data-tab="ingresos"]').addEventListener('click', cargar);
})();
