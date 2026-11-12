/**
 * Pestaña "Bloqueos": cierra fechas de una cabaña sin huésped (mantención,
 * uso propio). Un bloqueo no envía correos ni cuenta en los ingresos.
 */
(function () {
  'use strict';

  var A = window.LodgeAdmin;
  var UI = window.LodgeUI;
  if (!A || !UI) return;

  var COLUMNAS_BLOQUEOS = 6;

  var esc = A.esc, apiFetch = A.apiFetch, filaMensaje = A.filaMensaje, anunciarCambio = A.anunciarCambio;
  var cabanaHTML = A.cabanaHTML, cabanaNombre = A.cabanaNombre;
  var fmtDate = A.fmtDate, fmtDatetime = A.fmtDatetime, fmtDiaCorto = A.fmtDiaCorto;

  function qs(id) { return document.getElementById(id); }
  function hide(id) { qs(id).hidden = true; }
  function showMsg(id, msg) { var el = qs(id); el.textContent = msg; el.hidden = false; }

  var bloqueosData = [];

  function loadBloqueos() {
    qs('bloqueosTbody').innerHTML = filaMensaje(COLUMNAS_BLOQUEOS, 'Cargando…');
    apiFetch('/api/admin-bloqueos').then(function (data) {
      bloqueosData = Array.isArray(data) ? data : [];
      renderBloqueos();
    }).catch(function (e) {
      qs('bloqueosTbody').innerHTML = filaMensaje(COLUMNAS_BLOQUEOS,
        '<strong>No se pudieron cargar los bloqueos.</strong>' + esc(e.message), 'vacio');
    });
  }

  function renderBloqueos() {
    if (!bloqueosData.length) {
      qs('bloqueosTbody').innerHTML = filaMensaje(COLUMNAS_BLOQUEOS,
        '<strong>No hay fechas cerradas.</strong>Todas las cabañas se están ofreciendo con normalidad.', 'vacio');
      return;
    }
    qs('bloqueosTbody').innerHTML = bloqueosData.map(function (b) {
      return '<tr>' +
        '<td>' + cabanaHTML(b.cabana_id) + '</td>' +
        '<td>' + fmtDate(b.fecha_inicio) + '</td>' +
        '<td>' + fmtDate(b.fecha_fin)    + '</td>' +
        '<td><span class="motivo-badge">' + esc(A.MOTIVOS[b.motivo] || b.motivo) + '</span></td>' +
        '<td>' + fmtDatetime(b.created_at) + '</td>' +
        '<td><button class="btn-danger btn-mini" data-blid="' + esc(b.id) + '">Eliminar</button></td>' +
        '</tr>';
    }).join('');
  }

  qs('bloqueosTbody').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-blid]');
    if (!btn) return;
    var b = bloqueosData.filter(function (x) { return String(x.id) === btn.dataset.blid; })[0];
    if (!b) return;

    UI.confirmar({
      titulo: '¿Eliminar este bloqueo?',
      texto: cabanaNombre(b.cabana_id) + ' vuelve a ofrecerse en la web del ' +
             fmtDiaCorto(b.fecha_inicio) + ' al ' + fmtDiaCorto(b.fecha_fin) + '.',
      aceptar: 'Sí, eliminar', cancelar: 'No, dejarlo', tipo: 'peligro'
    }).then(function (acepto) {
      if (!acepto) return;
      btn.disabled = true;
      apiFetch('/api/admin-bloqueos?id=' + encodeURIComponent(b.id), { method: 'DELETE' })
        .then(function () {
          UI.toast('Bloqueo eliminado: las fechas vuelven a estar disponibles.', 'ok');
          loadBloqueos();
          anunciarCambio();
        })
        .catch(function (err) { btn.disabled = false; UI.toast(err.message, 'error'); });
    });
  });

  qs('btnRefreshBloqueos').addEventListener('click', loadBloqueos);

  qs('btnAgregarBloqueo').addEventListener('click', function () {
    hide('blError'); hide('blOk');
    var cabanaId = qs('blCabana').value;
    var desde    = qs('blDesde').value;
    var hasta    = qs('blHasta').value;
    var motivo   = qs('blMotivo').value;

    if (!cabanaId)        { showMsg('blError', 'Elige la cabaña que quieres cerrar.'); qs('blCabana').focus(); return; }
    if (!desde || !hasta) { showMsg('blError', 'Indica desde qué día se cierra y hasta cuándo.'); qs(desde ? 'blHasta' : 'blDesde').focus(); return; }
    if (hasta <= desde)   { showMsg('blError', 'La fecha «Hasta» debe ser posterior a «Desde».'); qs('blHasta').focus(); return; }

    var btn = qs('btnAgregarBloqueo');
    btn.disabled = true;
    apiFetch('/api/admin-bloqueos', {
      method: 'POST',
      body: { cabana_id: cabanaId, fecha_inicio: desde, fecha_fin: hasta, motivo: motivo }
    }).then(function () {
      showMsg('blOk', 'Listo: ' + cabanaNombre(cabanaId) + ' quedó cerrada del ' +
              fmtDiaCorto(desde) + ' al ' + fmtDiaCorto(hasta) + '.');
      qs('blCabana').value = '';
      qs('blDesde').value  = '';
      qs('blHasta').value  = '';
      loadBloqueos();
      anunciarCambio();
    }).catch(function (e) {
      showMsg('blError', e.message || 'No se pudo guardar el bloqueo.');
    }).then(function () { btn.disabled = false; });
  });

  document.addEventListener('lodge:panel', loadBloqueos);
  if (!qs('adminPanel').hidden) loadBloqueos();
})();
