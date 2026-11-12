/**
 * Pestaña "Inicio": lo que pide atención hoy, antes de entrar a ninguna lista.
 *
 *   - reservas pendientes de confirmar (ámbar: esperan una acción),
 *   - quién llega y quién se va hoy, y cuántas cabañas duermen ocupadas,
 *   - las llegadas de los próximos 7 días, con lo que cada una debe.
 *
 * No necesita API propia: combina el listado por estado y el modo "rango"
 * de /api/admin-reservas.
 */
(function () {
  'use strict';

  var A = window.LodgeAdmin;
  var UI = window.LodgeUI;
  if (!A || !UI) return;

  var DIAS_VISTA = 7;                       // ventana de "próximas llegadas"
  var DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var DIAS_SEMANA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var CLAVE_BIENVENIDA = 'lodge_admin_bienvenida_vista';

  var llegadas = [];        // las reservas que se listan, para abrirlas con un clic
  var pedidoEnCurso = 0;    // descarta respuestas viejas si se actualiza dos veces seguidas
  var desactualizado = true;

  function qs(id) { return document.getElementById(id); }

  function sumarDias(fecha, dias) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
  }

  function saludo(hora) {
    if (hora < 12) return 'Buenos días';
    return hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  }

  function plural(n, uno, varios) { return n === 1 ? uno : varios; }

  // ── CÁLCULO ──────────────────────────────────────────────────
  /** Separa las reservas confirmadas del rango en lo que importa hoy. */
  function resumir(confirmadas, pendientes, hoy, limite) {
    return {
      // Una pendiente cuya estadía ya pasó no tiene nada que confirmar.
      pendientes: pendientes.filter(function (r) { return r.check_out >= hoy; }),
      lleganHoy:  confirmadas.filter(function (r) { return r.check_in === hoy; }),
      salenHoy:   confirmadas.filter(function (r) { return r.check_out === hoy; }),
      duermenHoy: confirmadas.filter(function (r) { return r.check_in <= hoy && r.check_out > hoy; }),
      proximas:   confirmadas
        .filter(function (r) { return r.check_in >= hoy && r.check_in < limite; })
        .sort(function (a, b) { return a.check_in < b.check_in ? -1 : a.check_in > b.check_in ? 1 : 0; })
    };
  }

  function saldoDe(r) { return Math.max(0, Number(r.total || 0) - Number(r.abono || 0)); }

  // ── PANTALLA ─────────────────────────────────────────────────
  function nombres(lista) {
    return lista.map(function (r) { return A.nombreCompleto(r) || 'Sin nombre'; }).join(', ');
  }

  function tarjeta(clase, rotulo, ayuda, numero, detalle, boton) {
    return '<div class="hoy ' + clase + '">' +
      '<span class="hoy-rotulo">' + A.esc(rotulo) + UI.ayudaHTML(ayuda, 'Qué significa «' + rotulo + '»') + '</span>' +
      '<span class="hoy-numero">' + numero + '</span>' +
      '<span class="hoy-detalle">' + A.esc(detalle) + '</span>' +
      (boton || '') + '</div>';
  }

  function tarjetaPendientes(pendientes) {
    var n = pendientes.length;
    if (!n) {
      return tarjeta('hoy-calma', 'Por confirmar',
        'Reservas hechas en la web cuyo pago aún no está comprobado. Cuando haya alguna, esta tarjeta se pone ámbar.',
        '0', 'Nada pendiente: todo al día.');
    }
    return tarjeta('hoy-ambar', 'Por confirmar',
      'Reservas hechas en la web cuyo pago aún no está comprobado. Revisa si la transferencia llegó y confírmalas; mientras tanto, las fechas no están aseguradas.',
      String(n), plural(n, 'Espera', 'Esperan') + ' que compruebes el pago: ' + nombres(pendientes) + '.',
      '<button class="btn-confirmar btn-mini" data-ver-pendientes>Revisar ahora</button>');
  }

  function renderTarjetas(res) {
    qs('inicioTarjetas').innerHTML =
      tarjetaPendientes(res.pendientes) +
      tarjeta('hoy-verde', 'Llegan hoy',
        'Reservas confirmadas con check-in hoy.',
        String(res.lleganHoy.length),
        res.lleganHoy.length ? nombres(res.lleganHoy) + '.' : 'Nadie llega hoy.') +
      tarjeta('', 'Se van hoy',
        'Reservas confirmadas con check-out hoy: esas cabañas quedan libres para la noche.',
        String(res.salenHoy.length),
        res.salenHoy.length ? nombres(res.salenHoy) + '.' : 'Nadie se va hoy.') +
      tarjeta('hoy-azul', 'Ocupadas esta noche',
        'Cabañas con una reserva confirmada que duerme hoy. No cuenta los bloqueos.',
        res.duermenHoy.length + ' <small>de ' + A.CABANAS.length + '</small>',
        res.duermenHoy.length
          ? res.duermenHoy.map(function (r) { return A.cabanaNombre(r.cabana_id); }).join(', ') + '.'
          : 'Todas las cabañas están libres.');
  }

  function filaLlegada(r, indice, hoy) {
    var fecha = new Date(r.check_in + 'T12:00:00');
    var noches = Number(r.noches) || A.diasEntre(r.check_in, r.check_out);
    var saldo = saldoDe(r);
    var pago = !Number(r.total) ? ''
      : saldo > 0 ? '<span class="pago-pill pago-debe">Debe ' + A.fmtCLP(saldo) + '</span>'
                  : '<span class="pago-pill pago-ok">Pagado</span>';

    return '<button class="llegada' + (r.check_in === hoy ? ' llegada-hoy' : '') + '" data-llegada="' + indice + '">' +
      '<span class="llegada-fecha">' + (r.check_in === hoy ? 'hoy' : DIAS_SEMANA[fecha.getDay()]) +
        '<b>' + fecha.getDate() + '</b></span>' +
      '<span class="llegada-datos"><strong>' + A.esc(A.nombreCompleto(r) || 'Sin nombre') + '</strong>' +
        '<small>' + A.esc(A.cabanaNombre(r.cabana_id)) + ' · ' + noches + plural(noches, ' noche', ' noches') +
        ' · ' + A.esc(r.personas) + ' pers. · ' + A.esc(A.canalInfo(r.canal).label) + '</small></span>' +
      pago + '</button>';
  }

  function renderLlegadas(proximas, hoy) {
    llegadas = proximas;
    qs('inicioLlegadas').innerHTML = proximas.length
      ? proximas.map(function (r, i) { return filaLlegada(r, i, hoy); }).join('')
      : '<p class="inicio-vacio">No hay llegadas confirmadas en los próximos ' + DIAS_VISTA + ' días.</p>';
  }

  function avisoPendientesEnMenu(n) {
    var aviso = qs('navPendientes');
    aviso.hidden = !n;
    aviso.textContent = n;
    aviso.title = n + plural(n, ' reserva pendiente de confirmar', ' reservas pendientes de confirmar');
  }

  function mostrarError(mensaje) {
    qs('inicioTarjetas').innerHTML =
      '<p class="vacio"><strong>No se pudo cargar el resumen de hoy.</strong>' + A.esc(mensaje) + '</p>';
    qs('inicioLlegadas').innerHTML = '';
  }

  // ── CARGA ────────────────────────────────────────────────────
  function cargar() {
    var ahora = new Date();
    var hoy = A.isoLocal(ahora);
    // El rango parte ayer: la API trae las reservas con salida *posterior* a
    // «desde», y las que se van hoy tienen que entrar.
    var desde = A.isoLocal(sumarDias(ahora, -1));
    var limite = A.isoLocal(sumarDias(ahora, DIAS_VISTA + 1));
    var pedido = ++pedidoEnCurso;
    desactualizado = false;

    qs('inicioSaludo').textContent = saludo(ahora.getHours());
    qs('inicioFecha').textContent = 'Hoy es ' + DIAS_SEMANA_LARGO[ahora.getDay()] + ' ' + ahora.getDate() +
      ' de ' + A.MESES[ahora.getMonth()] + '. Esto es lo que pasa en el lodge.';

    Promise.all([
      A.apiFetch('/api/admin-reservas?estado=confirmada&desde=' + desde + '&hasta=' + limite),
      A.apiFetch('/api/admin-reservas?estado=pendiente')
    ]).then(function (datos) {
      if (pedido !== pedidoEnCurso) return;
      var res = resumir(Array.isArray(datos[0]) ? datos[0] : [], Array.isArray(datos[1]) ? datos[1] : [], hoy, limite);
      renderTarjetas(res);
      renderLlegadas(res.proximas, hoy);
      avisoPendientesEnMenu(res.pendientes.length);
    }).catch(function (e) {
      if (pedido !== pedidoEnCurso) return;
      desactualizado = true;
      mostrarError(e.message);
    });
  }

  // ── BIENVENIDA (solo la primera vez en este navegador) ───────
  function leerBienvenidaVista() {
    try { return localStorage.getItem(CLAVE_BIENVENIDA) === '1'; }
    catch (e) { return false; }   // navegación privada: se muestra y listo
  }

  function guardarBienvenidaVista() {
    try { localStorage.setItem(CLAVE_BIENVENIDA, '1'); }
    catch (e) { /* sin almacenamiento, el aviso vuelve a salir la próxima vez */ }
  }

  qs('avisoBienvenida').hidden = leerBienvenidaVista();
  qs('avisoBienvenida').addEventListener('click', function (e) {
    if (!e.target.closest('button')) return;
    qs('avisoBienvenida').hidden = true;
    guardarBienvenidaVista();
  });

  // ── EVENTOS ──────────────────────────────────────────────────
  qs('btnRefreshInicio').addEventListener('click', cargar);

  qs('inicioTarjetas').addEventListener('click', function (e) {
    if (e.target.closest('[data-ver-pendientes]')) A.verReservasPorEstado('pendiente');
  });

  qs('inicioLlegadas').addEventListener('click', function (e) {
    var fila = e.target.closest('[data-llegada]');
    var r = fila ? llegadas[Number(fila.dataset.llegada)] : null;
    if (r) A.abrirReserva(r);
  });

  document.querySelector('.tab[data-tab="inicio"]').addEventListener('click', function () {
    if (desactualizado) cargar();
  });

  // Tras crear, editar o cancelar algo en otra pestaña se recarga siempre: el
  // aviso de pendientes del menú se ve desde cualquier sección.
  document.addEventListener('lodge:cambio', cargar);

  document.addEventListener('lodge:panel', cargar);
  if (!qs('adminPanel').hidden) cargar();
})();
