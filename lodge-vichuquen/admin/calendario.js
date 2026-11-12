/**
 * Pestaña "Calendario": una fila por cabaña, una columna por día del mes.
 * Cada barra es una reserva (el color indica el canal) o un bloqueo.
 * Clic en una barra abre la reserva; clic en un día libre abre el formulario
 * de reserva nueva con esa cabaña y esa llegada ya puestas.
 */
(function () {
  'use strict';

  var A = window.LodgeAdmin;
  if (!A) return;

  var MS_DIA = 86400000;
  var LETRA_DIA = ['D','L','M','M','J','V','S'];

  var esc = A.esc, apiFetch = A.apiFetch, isoLocal = A.isoLocal, diasEntre = A.diasEntre;
  var canalInfo = A.canalInfo, nombreCompleto = A.nombreCompleto, cabanaHTML = A.cabanaHTML;
  var fmtDiaCorto = A.fmtDiaCorto, fmtRango = A.fmtRango;

  function qs(id) { return document.getElementById(id); }
  function visible() { return !qs('adminPanel').hidden && !qs('tabCalendario').hidden; }

  var calAncla     = new Date();   // cualquier día del mes que se muestra
  var calReservas  = [];
  var calBloqueos  = [];
  var pedidoEnCurso = 0;

  qs('btnMesAnterior').addEventListener('click', function () { moverMes(-1); });
  qs('btnMesSiguiente').addEventListener('click', function () { moverMes(1); });
  qs('btnMesHoy').addEventListener('click', function () { calAncla = new Date(); loadCalendario(); });

  function moverMes(delta) {
    calAncla = new Date(calAncla.getFullYear(), calAncla.getMonth() + delta, 1);
    loadCalendario();
  }

  function loadCalendario() {
    var y = calAncla.getFullYear(), m = calAncla.getMonth();
    var primero = new Date(y, m, 1);
    var siguiente = new Date(y, m + 1, 1);
    var desde = isoLocal(primero), hasta = isoLocal(siguiente);

    qs('calMesLabel').textContent = A.capitalize(A.MESES[m]) + ' ' + y;
    qs('calGrid').innerHTML = '<p class="loading">Cargando…</p>';

    // Dos clics seguidos en las flechas: solo vale la respuesta del último mes pedido.
    var pedido = ++pedidoEnCurso;
    Promise.all([
      apiFetch('/api/admin-reservas?desde=' + desde + '&hasta=' + hasta),
      apiFetch('/api/admin-bloqueos?desde=' + desde + '&hasta=' + hasta)
    ]).then(function (res) {
      if (pedido !== pedidoEnCurso) return;
      calReservas = (Array.isArray(res[0]) ? res[0] : []).filter(function (r) {
        return r.estado !== 'cancelada';
      });
      calBloqueos = Array.isArray(res[1]) ? res[1] : [];
      renderCalendario(primero, siguiente);
    }).catch(function (e) {
      if (pedido !== pedidoEnCurso) return;
      qs('calGrid').innerHTML = '<p class="vacio"><strong>No se pudo cargar el calendario.</strong>' + esc(e.message) + '</p>';
    });
  }

  function renderCalendario(primero, siguiente) {
    var dias = Math.round((siguiente - primero) / MS_DIA);
    var hoy  = isoLocal(new Date());

    // Cabecera de días
    var cabecera = '<div class="cal-corner">Cabaña</div>';
    for (var i = 0; i < dias; i++) {
      var d = new Date(primero.getFullYear(), primero.getMonth(), 1 + i);
      var iso = isoLocal(d);
      var clases = 'cal-dia';
      if (d.getDay() === 0 || d.getDay() === 6) clases += ' cal-finde';
      if (iso === hoy) clases += ' cal-hoy';
      cabecera += '<div class="' + clases + '"' + (iso === hoy ? ' title="Hoy"' : '') + '><b>' + d.getDate() + '</b>' +
                  '<small>' + LETRA_DIA[d.getDay()] + '</small></div>';
    }

    var filas = A.CABANAS.map(function (cab) {
      var barras = barrasDeCabana(cab.id, primero, dias);
      var carriles = repartirEnCarriles(barras);
      var alto = Math.max(1, carriles.length);

      var celdas = '';
      for (var i = 0; i < dias; i++) {
        var d = new Date(primero.getFullYear(), primero.getMonth(), 1 + i);
        var iso = isoLocal(d);
        var cl = 'cal-celda';
        if (d.getDay() === 0 || d.getDay() === 6) cl += ' cal-finde';
        if (iso === hoy) cl += ' cal-hoy';
        celdas += '<div class="' + cl + '" data-celda="' + cab.id + '|' + iso + '"' +
                  ' title="Crear reserva: ' + esc(cab.nombre) + ', ' + fmtDiaCorto(iso) + '"' +
                  ' style="grid-column:' + (i + 1) + ';grid-row:1/span ' + alto + '"></div>';
      }

      var html = '';
      carriles.forEach(function (carril, idx) {
        carril.forEach(function (b) { html += barraHTML(b, idx + 1); });
      });

      return '<div class="cal-cab">' + cabanaHTML(cab.id) + '</div>' +
             '<div class="cal-track" style="grid-template-columns:repeat(' + dias + ',minmax(var(--celda),1fr));' +
               'grid-template-rows:repeat(' + alto + ',30px)">' + celdas + html + '</div>';
    }).join('');

    qs('calGrid').innerHTML =
      '<div class="cal-tabla" style="--dias:' + dias + '">' +
        '<div class="cal-head">' + cabecera + '</div>' +
        '<div class="cal-cuerpo">' + filas + '</div>' +
      '</div>';
  }

  // Un solo listener para todo el calendario: barra → abre la reserva;
  // día libre → formulario nuevo con esa cabaña y esa llegada ya puestas.
  function clicEnCalendario(nodo) {
    var barra = nodo.closest('[data-barra]');
    if (barra) {
      var r = calReservas.filter(function (x) { return x.id === barra.dataset.barra; })[0];
      if (r) A.abrirReserva(r);
      return;
    }
    var celda = nodo.closest('[data-celda]');
    if (celda) {
      var partes = celda.dataset.celda.split('|');
      A.nuevaReserva({ cabana_id: partes[0], check_in: partes[1] });
    }
  }
  qs('calGrid').addEventListener('click', function (e) { clicEnCalendario(e.target); });
  qs('calGrid').addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-barra]')) {
      e.preventDefault();
      clicEnCalendario(e.target);
    }
  });

  /** Convierte reservas y bloqueos de una cabaña en barras {inicio, fin, …}. */
  function barrasDeCabana(cabanaId, primero, dias) {
    var desde = isoLocal(primero);
    var hasta = isoLocal(new Date(primero.getFullYear(), primero.getMonth(), 1 + dias));

    function columna(iso) { return diasEntre(desde, iso); }

    var barras = [];

    calReservas.filter(function (r) { return r.cabana_id === cabanaId; }).forEach(function (r) {
      // La noche de salida no se ocupa: la barra llega hasta el día anterior.
      var ini = Math.max(0, columna(r.check_in));
      var fin = Math.min(dias, columna(r.check_out));
      if (fin <= ini) return;
      barras.push({
        tipo: 'reserva', id: r.id, ini: ini, fin: fin,
        color: canalInfo(r.canal).color,
        pendiente: r.estado === 'pendiente',
        recortadaIzq: r.check_in  < desde,
        recortadaDer: r.check_out > hasta,
        texto: nombreCompleto(r),
        titulo: nombreCompleto(r) + ' · ' + canalInfo(r.canal).label + ' · ' +
                fmtRango(r.check_in, r.check_out) + ' · ' + r.personas + ' pers. · ' +
                (A.ESTADOS[r.estado] || r.estado) + ' — clic para abrir'
      });
    });

    calBloqueos.filter(function (b) { return b.cabana_id === cabanaId; }).forEach(function (b) {
      var ini = Math.max(0, columna(b.fecha_inicio));
      var fin = Math.min(dias, columna(b.fecha_fin));
      if (fin <= ini) return;
      var motivo = A.MOTIVOS[b.motivo] || b.motivo;
      barras.push({
        tipo: 'bloqueo', id: b.id, ini: ini, fin: fin,
        texto: 'Bloqueo · ' + motivo,
        titulo: 'Bloqueo (' + motivo + ') ' + fmtRango(b.fecha_inicio, b.fecha_fin) +
                ' — se quita desde la pestaña Bloqueos'
      });
    });

    return barras.sort(function (a, b) { return a.ini - b.ini; });
  }

  /** Apila las barras que se solapan en filas distintas para que no se tapen. */
  function repartirEnCarriles(barras) {
    var carriles = [];
    barras.forEach(function (b) {
      for (var i = 0; i < carriles.length; i++) {
        var ultima = carriles[i][carriles[i].length - 1];
        if (ultima.fin <= b.ini) { carriles[i].push(b); return; }
      }
      carriles.push([b]);
    });
    return carriles.length ? carriles : [[]];
  }

  function barraHTML(b, fila) {
    var estilo = 'grid-column:' + (b.ini + 1) + '/span ' + (b.fin - b.ini) + ';grid-row:' + fila + ';';
    var clases = 'cal-barra';

    if (b.tipo === 'bloqueo') {
      clases += ' cal-barra-bloqueo';
    } else {
      estilo += 'background:' + b.color + ';';
      if (b.pendiente)    clases += ' cal-barra-pendiente';
      if (b.recortadaIzq) clases += ' cal-barra-izq';
      if (b.recortadaDer) clases += ' cal-barra-der';
    }

    var attr = b.tipo === 'reserva' ? ' data-barra="' + esc(b.id) + '" role="button" tabindex="0"' : '';
    return '<div class="' + clases + '" style="' + estilo + '" title="' + esc(b.titulo) + '"' + attr + '>' +
           '<span>' + esc(b.texto) + '</span></div>';
  }

  // ── EVENTOS ──────────────────────────────────────────────────
  qs('btnNuevaReservaCal').addEventListener('click', function () { A.nuevaReserva(); });
  document.querySelector('.tab[data-tab="calendario"]').addEventListener('click', loadCalendario);

  // Si se creó, editó o canceló algo con el calendario a la vista, se redibuja.
  document.addEventListener('lodge:cambio', function () { if (visible()) loadCalendario(); });
})();
