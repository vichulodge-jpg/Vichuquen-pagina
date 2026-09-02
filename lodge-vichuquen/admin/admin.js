(function () {
  'use strict';

  var secret = '';

  // ── CATÁLOGOS ────────────────────────────────────────────────
  // Las cabañas son las que existen en la tabla `cabanas` de Supabase.
  var CABANAS = [
    { id: 'c1-tagua',              num: 'C1', nombre: 'Tagua' },
    { id: 'c2-cisne-coscoroba',    num: 'C2', nombre: 'Cisne Coscoroba' },
    { id: 'c3-siete-colores',      num: 'C3', nombre: 'Siete Colores' },
    { id: 'c4-cisne-cuello-negro', num: 'C4', nombre: 'Cisne Cuello Negro' },
    { id: 'c5-huala',              num: 'C5', nombre: 'Huala' },
    { id: 'c6-run-run',            num: 'C6', nombre: 'Run Run' },
    { id: 'c7-pitio',              num: 'C7', nombre: 'Pitío' }
  ];

  // El color es lo que permite reconocer el canal de un vistazo en el calendario.
  var CANALES = [
    { id: 'web',       label: 'Página web',      color: '#263852' },
    { id: 'booking',   label: 'Booking',         color: '#1c5aa8' },
    { id: 'airbnb',    label: 'Airbnb',          color: '#d63f48' },
    { id: 'whatsapp',  label: 'WhatsApp',        color: '#1c9c56' },
    { id: 'instagram', label: 'Instagram',       color: '#b0348a' },
    { id: 'directa',   label: 'Reserva directa', color: '#b8873f' },
    { id: 'otro',      label: 'Otro',            color: '#6b7280' }
  ];

  var MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var LETRA_DIA = ['D','L','M','M','J','V','S'];

  function cabanaNombre(id) {
    for (var i = 0; i < CABANAS.length; i++) if (CABANAS[i].id === id) return CABANAS[i].nombre;
    return id;
  }
  function canalInfo(id) {
    for (var i = 0; i < CANALES.length; i++) if (CANALES[i].id === id) return CANALES[i];
    return { id: id || 'otro', label: id || 'Otro', color: '#6b7280' };
  }

  // ── AUTH ──────────────────────────────────────────────────────
  function qs(id) { return document.getElementById(id); }

  qs('secretInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') qs('btnLogin').click();
  });

  qs('btnLogin').addEventListener('click', function () {
    var val = (qs('secretInput').value || '').trim();
    if (!val) return;
    secret = val;
    sessionStorage.setItem('admin_secret', val);
    verifyAndLogin();
  });

  qs('btnLogout').addEventListener('click', function () {
    secret = '';
    sessionStorage.removeItem('admin_secret');
    qs('adminPanel').hidden = true;
    qs('loginScreen').hidden = false;
  });

  function verifyAndLogin() {
    apiFetch('/api/admin-reservas?estado=confirmada')
      .then(function (data) {
        if (Array.isArray(data)) showPanel();
        else showLoginError();
      })
      .catch(showLoginError);
  }

  function showLoginError() {
    secret = '';
    qs('loginError').hidden = false;
    qs('secretInput').value = '';
    qs('secretInput').focus();
  }

  function showPanel() {
    qs('loginScreen').hidden = true;
    qs('adminPanel').hidden = false;
    poblarSelectores();
    loadReservas();
    loadBloqueos();
  }

  // Auto-login si hay secret guardado
  var savedSecret = sessionStorage.getItem('admin_secret');
  if (savedSecret) {
    secret = savedSecret;
    qs('secretInput').value = savedSecret;
    verifyAndLogin();
  }

  // ── API HELPER ───────────────────────────────────────────────
  function apiFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { 'X-Admin-Secret': secret });
    if (opts.body && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) { showLoginError(); throw new Error('No autorizado'); }
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error((data && data.error) || ('Error ' + r.status));
        return data;
      });
    });
  }

  // ── SELECTORES CONSTRUIDOS DESDE LOS CATÁLOGOS ───────────────
  function opcionesCabanas(incluirTodas) {
    var html = incluirTodas ? '<option value="">Todas las cabañas</option>'
                            : '<option value="">Selecciona cabaña…</option>';
    return html + CABANAS.map(function (c) {
      return '<option value="' + c.id + '">' + c.num + ' — ' + esc(c.nombre) + '</option>';
    }).join('');
  }

  function opcionesCanales(incluirTodos) {
    var html = incluirTodos ? '<option value="">Todos los canales</option>' : '';
    return html + CANALES.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.label) + '</option>';
    }).join('');
  }

  function poblarSelectores() {
    qs('filtroCabana').innerHTML = opcionesCabanas(true);
    qs('filtroCanal').innerHTML  = opcionesCanales(true);
    qs('blCabana').innerHTML     = opcionesCabanas(false);
    qs('rvCabana').innerHTML     = opcionesCabanas(false);
    qs('rvCanal').innerHTML      = opcionesCanales(false);
    qs('rvCanal').value          = 'directa';

    qs('calLeyenda').innerHTML = CANALES.map(function (c) {
      return '<span class="leyenda-item"><i style="background:' + c.color + '"></i>' + esc(c.label) + '</span>';
    }).join('') +
      '<span class="leyenda-item"><i class="leyenda-bloqueo"></i>Bloqueo</span>' +
      '<span class="leyenda-item"><i class="leyenda-pendiente"></i>Pendiente de pago</span>';
  }

  // ── TABS ─────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = true; });
      tab.classList.add('active');
      var panel = qs('tab' + capitalize(tab.dataset.tab));
      if (panel) panel.hidden = false;
      if (tab.dataset.tab === 'calendario') loadCalendario();
      if (tab.dataset.tab === 'correos')    loadPlantillas();
    });
  });

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ── RESERVAS ─────────────────────────────────────────────────
  var reservasData = [];

  function loadReservas() {
    var params = [];
    if (qs('filtroEstado').value) params.push('estado=' + encodeURIComponent(qs('filtroEstado').value));
    if (qs('filtroCabana').value) params.push('cabana=' + encodeURIComponent(qs('filtroCabana').value));
    if (qs('filtroCanal').value)  params.push('canal='  + encodeURIComponent(qs('filtroCanal').value));

    var url = '/api/admin-reservas' + (params.length ? '?' + params.join('&') : '');
    qs('reservasTbody').innerHTML = '<tr><td colspan="13" class="loading">Cargando…</td></tr>';

    apiFetch(url).then(function (data) {
      reservasData = Array.isArray(data) ? data : [];
      renderReservas();
    }).catch(function () {
      qs('reservasTbody').innerHTML = '<tr><td colspan="13" class="loading">Error al cargar.</td></tr>';
    });
  }

  function renderReservas() {
    qs('reservasCount').textContent = reservasData.length + ' reserva' + (reservasData.length !== 1 ? 's' : '');
    if (!reservasData.length) {
      qs('reservasTbody').innerHTML = '<tr><td colspan="13" class="loading">Sin resultados.</td></tr>';
      return;
    }
    qs('reservasTbody').innerHTML = reservasData.map(function (r) {
      var canal = canalInfo(r.canal);
      var saldo = Number(r.total || 0) - Number(r.abono || 0);
      return '<tr>' +
        '<td>' + esc(cabanaNombre(r.cabana_id)) + '</td>' +
        '<td><strong>' + esc(nombreCompleto(r)) + '</strong><br><small>' + esc(r.email) + '</small></td>' +
        '<td><span class="canal-badge" style="background:' + canal.color + '">' + esc(canal.label) + '</span></td>' +
        '<td>' + waCell(r.telefono) + '</td>' +
        '<td>' + fmtDate(r.check_in)  + '</td>' +
        '<td>' + fmtDate(r.check_out) + '</td>' +
        '<td>' + r.personas + '</td>' +
        '<td>' + fmtCLP(r.total) + '</td>' +
        '<td>' + fmtCLP(r.abono) + '</td>' +
        '<td>' + fmtCLP(saldo) + '</td>' +
        '<td><span class="badge badge-' + r.estado + '">' + r.estado + '</span></td>' +
        '<td>' + fmtDatetime(r.created_at) + '</td>' +
        '<td class="col-acciones">' + accionesReserva(r) + '</td>' +
        '</tr>';
    }).join('');

    qs('reservasTbody').querySelectorAll('[data-editar]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var r = buscarReserva(btn.dataset.editar);
        if (r) abrirModalReserva(r);
      });
    });

    qs('reservasTbody').querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var estado = btn.dataset.action;
        if (!confirm('¿Cambiar estado a "' + estado + '"?')) return;
        btn.disabled = true;
        apiFetch('/api/admin-reservas?id=' + encodeURIComponent(btn.dataset.id), {
          method: 'PATCH',
          body: { estado: estado }
        }).then(function (res) {
          avisarCorreos(res && res.correos);
          loadReservas();
        }).catch(function (e) {
          btn.disabled = false;
          alert(e.message);
        });
      });
    });
  }

  function buscarReserva(id) {
    for (var i = 0; i < reservasData.length; i++) if (reservasData[i].id === id) return reservasData[i];
    for (var j = 0; j < calReservas.length; j++)  if (calReservas[j].id === id)  return calReservas[j];
    return null;
  }

  function nombreCompleto(r) {
    return [r.nombre, r.apellido].filter(Boolean).join(' ');
  }

  function accionesReserva(r) {
    var btns = ['<button class="btn-secondary btn-mini" data-editar="' + r.id + '">Ver / editar</button>'];
    if (r.estado === 'pendiente')  btns.push(btnAction(r.id, 'confirmada', 'Confirmar', 'btn-secondary btn-mini'));
    if (r.estado !== 'cancelada')  btns.push(btnAction(r.id, 'cancelada',  'Cancelar',  'btn-danger btn-mini'));
    return btns.join(' ');
  }

  function btnAction(id, estado, label, cls) {
    return '<button class="' + cls + '" data-action="' + estado + '" data-id="' + id + '">' + label + '</button>';
  }

  qs('btnRefreshReservas').addEventListener('click', loadReservas);
  qs('filtroEstado').addEventListener('change', loadReservas);
  qs('filtroCabana').addEventListener('change', loadReservas);
  qs('filtroCanal').addEventListener('change', loadReservas);

  // ── MODAL: NUEVA / EDITAR RESERVA ────────────────────────────
  var reservaEditando = null;

  qs('btnNuevaReserva').addEventListener('click', function () { abrirModalReserva(null); });
  qs('btnNuevaReservaCal').addEventListener('click', function () { abrirModalReserva(null); });

  document.querySelectorAll('[data-cerrar-modal]').forEach(function (el) {
    el.addEventListener('click', cerrarModalReserva);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('reservaModal').hidden) cerrarModalReserva();
  });

  ['rvTotal', 'rvAbono'].forEach(function (id) {
    qs(id).addEventListener('input', actualizarSaldo);
  });

  function actualizarSaldo() {
    var total = Number(qs('rvTotal').value || 0);
    var abono = Number(qs('rvAbono').value || 0);
    qs('rvSaldo').value = fmtCLP(Math.max(0, total - abono));
  }

  function abrirModalReserva(r) {
    reservaEditando = r || null;
    hide('rvError'); hide('rvOk');

    var esNueva = !r;
    qs('rvTitulo').textContent = esNueva ? 'Nueva reserva' : 'Editar reserva';
    qs('btnGuardarReserva').textContent = esNueva ? 'Crear reserva' : 'Guardar cambios';

    // "Pendiente" solo se ofrece si la reserva ya está en ese estado
    // (una reserva pendiente no bloquea fechas: no sirve para cargar una externa).
    var opcionesEstado = '<option value="confirmada">Confirmada</option>' +
                         '<option value="cancelada">Cancelada</option>';
    if (r && r.estado === 'pendiente') {
      opcionesEstado = '<option value="pendiente">Pendiente</option>' + opcionesEstado;
    }
    qs('rvEstado').innerHTML = opcionesEstado;

    qs('rvCabana').value        = r ? r.cabana_id : '';
    qs('rvCanal').value         = r ? (r.canal || 'otro') : 'directa';
    qs('rvEstado').value        = r ? r.estado : 'confirmada';
    qs('rvCheckIn').value       = r ? r.check_in  : '';
    qs('rvCheckOut').value      = r ? r.check_out : '';
    qs('rvPersonas').value      = r ? r.personas : 2;
    qs('rvNombre').value        = r ? (r.nombre || '') : '';
    qs('rvApellido').value      = r ? (r.apellido || '') : '';
    qs('rvEmail').value         = r ? (r.email || '') : '';
    qs('rvTelefono').value      = r ? (r.telefono || '') : '';
    qs('rvFormaPago').value     = r ? (r.forma_pago || '') : '';
    qs('rvTotal').value         = r ? (r.total || 0) : 0;
    qs('rvAbono').value         = r ? (r.abono || 0) : 0;
    qs('rvObservaciones').value = r ? (r.observaciones || '') : '';
    actualizarSaldo();

    // Estado de los correos ya enviados
    var yaConfirmacion = r && r.email_confirmacion_enviado_at;
    qs('rvEnviarEmailWrap').hidden = !!yaConfirmacion;
    qs('rvEnviarEmail').checked = true;

    qs('btnCancelarReserva').hidden = !r || r.estado === 'cancelada';
    qs('rvMeta').hidden = esNueva;
    if (!esNueva) qs('rvMeta').innerHTML = metaReserva(r);

    qs('reservaModal').hidden = false;
    document.body.classList.add('modal-abierto');
    qs('rvCabana').focus();
  }

  function metaReserva(r) {
    var filas = [
      ['ID', r.id],
      ['Creada', fmtDatetime(r.created_at) + (r.creada_por === 'admin' ? ' · desde el panel' : ' · desde la web')],
      ['Correo de confirmación', r.email_confirmacion_enviado_at
        ? 'enviado el ' + fmtDatetime(r.email_confirmacion_enviado_at)
        : 'todavía no enviado'],
      ['Correo de pre-llegada', r.email_pre_llegada_enviado_at
        ? 'enviado el ' + fmtDatetime(r.email_pre_llegada_enviado_at)
        : 'se enviará 3 días antes del check-in']
    ];
    if (r.mensaje)      filas.push(['Mensaje del huésped', r.mensaje]);
    if (r.cancelada_at) filas.push(['Cancelada el', fmtDatetime(r.cancelada_at)]);
    if (r.mp_payment_id) filas.push(['Pago MercadoPago', r.mp_payment_id]);

    return filas.map(function (f) {
      return '<div class="meta-fila"><span>' + esc(f[0]) + '</span><strong>' + esc(f[1]) + '</strong></div>';
    }).join('');
  }

  function cerrarModalReserva() {
    qs('reservaModal').hidden = true;
    document.body.classList.remove('modal-abierto');
    reservaEditando = null;
  }

  function datosDelFormulario() {
    return {
      cabana_id:     qs('rvCabana').value,
      canal:         qs('rvCanal').value,
      estado:        qs('rvEstado').value,
      check_in:      qs('rvCheckIn').value,
      check_out:     qs('rvCheckOut').value,
      personas:      Number(qs('rvPersonas').value || 0),
      nombre:        qs('rvNombre').value.trim(),
      apellido:      qs('rvApellido').value.trim(),
      email:         qs('rvEmail').value.trim(),
      telefono:      qs('rvTelefono').value.trim(),
      forma_pago:    qs('rvFormaPago').value,
      total:         Number(qs('rvTotal').value || 0),
      abono:         Number(qs('rvAbono').value || 0),
      observaciones: qs('rvObservaciones').value.trim(),
      enviar_email:  qs('rvEnviarEmailWrap').hidden ? false : qs('rvEnviarEmail').checked
    };
  }

  function validarFormulario(d) {
    if (!d.cabana_id)               return 'Selecciona una cabaña.';
    if (!d.check_in || !d.check_out) return 'Indica las fechas de check-in y check-out.';
    if (d.check_out <= d.check_in)  return 'La fecha de salida debe ser posterior a la de llegada.';
    if (!d.nombre)                  return 'Escribe el nombre del huésped.';
    if (!d.email)                   return 'Escribe el correo del huésped.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'El correo electrónico no es válido.';
    if (!d.personas || d.personas < 1) return 'Indica el número de huéspedes.';
    if (d.abono > d.total)          return 'El abono no puede superar el total de la estadía.';
    return null;
  }

  qs('btnGuardarReserva').addEventListener('click', function () {
    hide('rvError'); hide('rvOk');
    var datos = datosDelFormulario();
    var error = validarFormulario(datos);
    if (error) { showMsg('rvError', error); return; }

    var btn = qs('btnGuardarReserva');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    var peticion = reservaEditando
      ? apiFetch('/api/admin-reservas?id=' + encodeURIComponent(reservaEditando.id), { method: 'PATCH', body: datos })
      : apiFetch('/api/admin-reservas', { method: 'POST', body: datos });

    peticion.then(function (res) {
      showMsg('rvOk', mensajeGuardado(res));
      setTimeout(function () {
        cerrarModalReserva();
        loadReservas();
        if (!qs('tabCalendario').hidden) loadCalendario();
      }, 1400);
    }).catch(function (e) {
      showMsg('rvError', e.message);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = reservaEditando ? 'Guardar cambios' : 'Crear reserva';
    });
  });

  function mensajeGuardado(res) {
    var partes = ['Reserva guardada.'];
    var c = res && res.correos;
    if (c) {
      if (c.confirmacion === 'enviado')     partes.push('Correo de confirmación enviado.');
      if (c.confirmacion === 'ya_enviado')  partes.push('La confirmación ya se había enviado antes.');
      if (c.confirmacion === 'error_envio') partes.push('⚠ No se pudo enviar la confirmación: revísalo.');
      if (c.confirmacion === 'sin_email')   partes.push('⚠ Sin correo del huésped: no se envió nada.');
      if (c.pre_llegada  === 'enviado')     partes.push('Pre-llegada enviada (el check-in es muy pronto).');
      if (c.pre_llegada  === 'programado')  partes.push('La pre-llegada saldrá 3 días antes del check-in.');
    }
    return partes.join(' ');
  }

  /**
   * El envío de un correo es un efecto que el administrador no ve: si ocurre
   * al confirmar desde el listado, se avisa con un mensaje flotante.
   */
  function avisarCorreos(c) {
    if (!c) return;
    if (c.confirmacion === 'enviado')     toast('Correo de confirmación enviado al huésped.', 'ok');
    if (c.confirmacion === 'error_envio') toast('No se pudo enviar el correo de confirmación.', 'error');
    if (c.pre_llegada  === 'enviado')     toast('Pre-llegada enviada: el check-in es en menos de 3 días.', 'ok');
  }

  var toastTimer = null;
  function toast(mensaje, tipo) {
    var caja = qs('adminToast');
    if (!caja) {
      caja = document.createElement('div');
      caja.id = 'adminToast';
      document.body.appendChild(caja);
    }
    caja.className = 'admin-toast ' + (tipo || '');
    caja.textContent = mensaje;
    caja.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { caja.hidden = true; }, 5000);
  }

  qs('btnCancelarReserva').addEventListener('click', function () {
    if (!reservaEditando) return;
    if (!confirm('¿Cancelar esta reserva?\n\nLas fechas quedarán libres otra vez, ' +
                 'pero la reserva se conserva en el historial.')) return;

    var btn = qs('btnCancelarReserva');
    btn.disabled = true;
    apiFetch('/api/admin-reservas?id=' + encodeURIComponent(reservaEditando.id), {
      method: 'PATCH',
      body: { estado: 'cancelada' }
    }).then(function () {
      cerrarModalReserva();
      loadReservas();
      if (!qs('tabCalendario').hidden) loadCalendario();
    }).catch(function (e) {
      showMsg('rvError', e.message);
    }).then(function () { btn.disabled = false; });
  });

  // ── CALENDARIO ───────────────────────────────────────────────
  var calAncla     = new Date();   // cualquier día del mes que se muestra
  var calReservas  = [];
  var calBloqueos  = [];

  qs('btnMesAnterior').addEventListener('click', function () { moverMes(-1); });
  qs('btnMesSiguiente').addEventListener('click', function () { moverMes(1); });
  qs('btnMesHoy').addEventListener('click', function () { calAncla = new Date(); loadCalendario(); });

  function moverMes(delta) {
    calAncla = new Date(calAncla.getFullYear(), calAncla.getMonth() + delta, 1);
    loadCalendario();
  }

  function isoLocal(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function loadCalendario() {
    var y = calAncla.getFullYear(), m = calAncla.getMonth();
    var primero = new Date(y, m, 1);
    var siguiente = new Date(y, m + 1, 1);
    var desde = isoLocal(primero), hasta = isoLocal(siguiente);

    qs('calMesLabel').textContent = capitalize(MESES[m]) + ' ' + y;
    qs('calGrid').innerHTML = '<p class="loading">Cargando…</p>';

    Promise.all([
      apiFetch('/api/admin-reservas?desde=' + desde + '&hasta=' + hasta),
      apiFetch('/api/admin-bloqueos?desde=' + desde + '&hasta=' + hasta)
    ]).then(function (res) {
      calReservas = (Array.isArray(res[0]) ? res[0] : []).filter(function (r) {
        return r.estado !== 'cancelada';
      });
      calBloqueos = Array.isArray(res[1]) ? res[1] : [];
      renderCalendario(primero, siguiente);
    }).catch(function (e) {
      qs('calGrid').innerHTML = '<p class="loading">Error al cargar: ' + esc(e.message) + '</p>';
    });
  }

  function renderCalendario(primero, siguiente) {
    var dias = Math.round((siguiente - primero) / 86400000);
    var hoy  = isoLocal(new Date());

    // Cabecera de días
    var cabecera = '<div class="cal-corner">Cabaña</div>';
    for (var i = 0; i < dias; i++) {
      var d = new Date(primero.getFullYear(), primero.getMonth(), 1 + i);
      var iso = isoLocal(d);
      var clases = 'cal-dia';
      if (d.getDay() === 0 || d.getDay() === 6) clases += ' cal-finde';
      if (iso === hoy) clases += ' cal-hoy';
      cabecera += '<div class="' + clases + '"><b>' + d.getDate() + '</b>' +
                  '<small>' + LETRA_DIA[d.getDay()] + '</small></div>';
    }

    var filas = CABANAS.map(function (cab) {
      var barras = barrasDeCabana(cab.id, primero, dias);
      var carriles = repartirEnCarriles(barras);
      var alto = Math.max(1, carriles.length);

      var celdas = '';
      for (var i = 0; i < dias; i++) {
        var d = new Date(primero.getFullYear(), primero.getMonth(), 1 + i);
        var cl = 'cal-celda';
        if (d.getDay() === 0 || d.getDay() === 6) cl += ' cal-finde';
        if (isoLocal(d) === hoy) cl += ' cal-hoy';
        celdas += '<div class="' + cl + '" style="grid-column:' + (i + 1) + ';grid-row:1/span ' + alto + '"></div>';
      }

      var html = '';
      carriles.forEach(function (carril, idx) {
        carril.forEach(function (b) { html += barraHTML(b, idx + 1); });
      });

      return '<div class="cal-cab">' +
               '<span class="cal-cab-num">' + cab.num + '</span>' + esc(cab.nombre) +
             '</div>' +
             '<div class="cal-track" style="grid-template-columns:repeat(' + dias + ',var(--celda));' +
               'grid-template-rows:repeat(' + alto + ',26px)">' + celdas + html + '</div>';
    }).join('');

    qs('calGrid').innerHTML =
      '<div class="cal-tabla" style="--dias:' + dias + '">' +
        '<div class="cal-head">' + cabecera + '</div>' +
        '<div class="cal-cuerpo">' + filas + '</div>' +
      '</div>';

    qs('calGrid').querySelectorAll('[data-barra]').forEach(function (el) {
      el.addEventListener('click', function () {
        var r = buscarReserva(el.dataset.barra);
        if (r) abrirModalReserva(r);
      });
    });
  }

  /** Convierte reservas y bloqueos de una cabaña en barras {inicio, fin, …}. */
  function barrasDeCabana(cabanaId, primero, dias) {
    var desde = isoLocal(primero);
    var hasta = isoLocal(new Date(primero.getFullYear(), primero.getMonth(), 1 + dias));

    function columna(iso) {
      var d = new Date(iso + 'T12:00:00');
      return Math.round((d - new Date(desde + 'T12:00:00')) / 86400000);
    }

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
                r.check_in + ' → ' + r.check_out + ' · ' + r.personas + ' pers. · ' + r.estado
      });
    });

    calBloqueos.filter(function (b) { return b.cabana_id === cabanaId; }).forEach(function (b) {
      var ini = Math.max(0, columna(b.fecha_inicio));
      var fin = Math.min(dias, columna(b.fecha_fin));
      if (fin <= ini) return;
      barras.push({
        tipo: 'bloqueo', id: b.id, ini: ini, fin: fin,
        texto: 'Bloqueo · ' + b.motivo,
        titulo: 'Bloqueo (' + b.motivo + ') ' + b.fecha_inicio + ' → ' + b.fecha_fin
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

    var attr = b.tipo === 'reserva' ? ' data-barra="' + b.id + '" role="button" tabindex="0"' : '';
    return '<div class="' + clases + '" style="' + estilo + '" title="' + esc(b.titulo) + '"' + attr + '>' +
           '<span>' + esc(b.texto) + '</span></div>';
  }

  // ── BLOQUEOS ─────────────────────────────────────────────────
  function loadBloqueos() {
    qs('bloqueosTbody').innerHTML = '<tr><td colspan="6" class="loading">Cargando…</td></tr>';
    apiFetch('/api/admin-bloqueos').then(function (data) {
      renderBloqueos(Array.isArray(data) ? data : []);
    }).catch(function () {
      qs('bloqueosTbody').innerHTML = '<tr><td colspan="6" class="loading">Error al cargar.</td></tr>';
    });
  }

  function renderBloqueos(data) {
    if (!data.length) {
      qs('bloqueosTbody').innerHTML = '<tr><td colspan="6" class="loading">Sin bloqueos activos.</td></tr>';
      return;
    }
    qs('bloqueosTbody').innerHTML = data.map(function (b) {
      return '<tr>' +
        '<td>' + esc(cabanaNombre(b.cabana_id)) + '</td>' +
        '<td>' + fmtDate(b.fecha_inicio) + '</td>' +
        '<td>' + fmtDate(b.fecha_fin)    + '</td>' +
        '<td><span class="motivo-badge">' + esc(b.motivo) + '</span></td>' +
        '<td>' + fmtDatetime(b.created_at) + '</td>' +
        '<td><button class="btn-danger" data-blid="' + b.id + '">Eliminar</button></td>' +
        '</tr>';
    }).join('');

    qs('bloqueosTbody').querySelectorAll('[data-blid]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!confirm('¿Eliminar este bloqueo?')) return;
        apiFetch('/api/admin-bloqueos?id=' + encodeURIComponent(btn.dataset.blid), { method: 'DELETE' })
          .then(loadBloqueos)
          .catch(function (e) { alert(e.message); });
      });
    });
  }

  qs('btnRefreshBloqueos').addEventListener('click', loadBloqueos);

  qs('btnAgregarBloqueo').addEventListener('click', function () {
    hide('blError'); hide('blOk');
    var cabana = qs('blCabana').value;
    var desde  = qs('blDesde').value;
    var hasta  = qs('blHasta').value;
    var motivo = qs('blMotivo').value;

    if (!cabana || !desde || !hasta) {
      showMsg('blError', 'Completa todos los campos requeridos.');
      return;
    }
    if (hasta <= desde) {
      showMsg('blError', 'La fecha de fin debe ser posterior a la de inicio.');
      return;
    }

    apiFetch('/api/admin-bloqueos', {
      method: 'POST',
      body: { cabana_id: cabana, fecha_inicio: desde, fecha_fin: hasta, motivo: motivo }
    }).then(function () {
      showMsg('blOk', 'Bloqueo agregado correctamente.');
      qs('blCabana').value = '';
      qs('blDesde').value  = '';
      qs('blHasta').value  = '';
      loadBloqueos();
    }).catch(function (e) {
      showMsg('blError', e.message || 'Error al guardar el bloqueo.');
    });
  });

  // ── PLANTILLAS DE CORREO ─────────────────────────────────────
  var plantillasVars = [];

  qs('btnRefreshPlantillas').addEventListener('click', loadPlantillas);

  function loadPlantillas() {
    qs('plantillasWrap').innerHTML = '<p class="loading">Cargando…</p>';
    apiFetch('/api/admin-plantillas').then(function (data) {
      plantillasVars = data.variables || [];
      renderPlantillas(data.plantillas || []);
    }).catch(function (e) {
      qs('plantillasWrap').innerHTML =
        '<p class="loading">No se pudieron cargar las plantillas: ' + esc(e.message) + '<br>' +
        '<small>Si es la primera vez, ejecuta la migración ' +
        'supabase/migration-reservas-externas.sql en Supabase.</small></p>';
    });
  }

  function renderPlantillas(lista) {
    if (!lista.length) {
      qs('plantillasWrap').innerHTML = '<p class="loading">No hay plantillas configuradas.</p>';
      return;
    }

    var chips = plantillasVars.map(function (v) {
      return '<button type="button" class="var-chip" data-var="{{' + v + '}}">{{' + v + '}}</button>';
    }).join('');

    qs('plantillasWrap').innerHTML = lista.map(function (p) {
      return '<div class="plantilla-card" data-plantilla="' + p.id + '">' +
        '<div class="plantilla-head">' +
          '<h3>' + esc(p.nombre) + '</h3>' +
          '<label class="switch">' +
            '<input type="checkbox" data-activa ' + (p.activa ? 'checked' : '') + ' />' +
            '<span>Usar este texto</span>' +
          '</label>' +
        '</div>' +
        '<p class="hint">' + (p.activa
          ? 'Activa: los correos salen con este texto.'
          : 'Desactivada: se usa el correo de siempre. Actívala para que se use lo que escribas aquí.') +
        '</p>' +
        '<div class="form-group">' +
          '<label>Asunto</label>' +
          '<input type="text" data-asunto value="' + esc(p.asunto) + '" />' +
        '</div>' +
        '<div class="form-group">' +
          '<label>Texto del correo</label>' +
          '<textarea data-cuerpo rows="7">' + esc(p.cuerpo) + '</textarea>' +
          '<small class="campo-nota">Se admite HTML sencillo: &lt;p&gt;, &lt;strong&gt;, &lt;br&gt;, &lt;a href&gt;.</small>' +
        '</div>' +
        '<div class="vars-wrap">' +
          '<span class="vars-titulo">Variables — haz clic para insertarlas donde esté el cursor:</span>' +
          '<div class="vars-chips">' + chips + '</div>' +
        '</div>' +
        '<div class="plantilla-foot">' +
          '<button class="btn-primary btn-auto" data-guardar>Guardar plantilla</button>' +
          '<span class="plantilla-msg" data-msg></span>' +
        '</div>' +
      '</div>';
    }).join('');

    qs('plantillasWrap').querySelectorAll('.plantilla-card').forEach(bindPlantilla);
  }

  function bindPlantilla(card) {
    var id       = card.dataset.plantilla;
    var asunto   = card.querySelector('[data-asunto]');
    var cuerpo   = card.querySelector('[data-cuerpo]');
    var activa   = card.querySelector('[data-activa]');
    var msg      = card.querySelector('[data-msg]');
    var ultimoFoco = cuerpo;

    [asunto, cuerpo].forEach(function (campo) {
      campo.addEventListener('focus', function () { ultimoFoco = campo; });
    });

    card.querySelectorAll('.var-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        insertarEnCursor(ultimoFoco, chip.dataset.var);
      });
    });

    card.querySelector('[data-guardar]').addEventListener('click', function () {
      var btn = card.querySelector('[data-guardar]');
      btn.disabled = true;
      msg.textContent = 'Guardando…';
      msg.className = 'plantilla-msg';

      apiFetch('/api/admin-plantillas?id=' + encodeURIComponent(id), {
        method: 'PUT',
        body: { asunto: asunto.value, cuerpo: cuerpo.value, activa: activa.checked }
      }).then(function () {
        msg.textContent = activa.checked
          ? 'Guardada. Los próximos correos usarán este texto.'
          : 'Guardada. Sigue desactivada: se usa el correo de siempre.';
        msg.className = 'plantilla-msg ok';
      }).catch(function (e) {
        msg.textContent = e.message;
        msg.className = 'plantilla-msg error';
      }).then(function () { btn.disabled = false; });
    });
  }

  function insertarEnCursor(campo, texto) {
    var ini = campo.selectionStart, fin = campo.selectionEnd;
    if (ini == null) { campo.value += texto; return; }
    campo.value = campo.value.slice(0, ini) + texto + campo.value.slice(fin);
    campo.focus();
    campo.selectionStart = campo.selectionEnd = ini + texto.length;
  }

  // ── HELPERS ──────────────────────────────────────────────────
  function fmtCLP(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }

  function fmtDate(s) {
    if (!s) return '—';
    var d = new Date(s + 'T12:00:00');
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function fmtDatetime(s) {
    if (!s) return '—';
    var d = new Date(s);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function waCell(telefono) {
    if (!telefono) return '<span style="color:#bbb">—</span>';
    var n = String(telefono).replace(/\D/g, '');
    if (n.length === 9 && n[0] === '9') n = '56' + n;
    return '<a href="https://wa.me/' + n + '" target="_blank" rel="noopener" class="btn-wa">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="vertical-align:-2px;margin-right:3px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
      'WhatsApp</a><br><small style="color:#888;font-size:.75rem">' + esc(telefono) + '</small>';
  }

  function hide(id) { var el = qs(id); if (el) el.hidden = true; }
  function showMsg(id, msg) { var el = qs(id); if (el) { el.textContent = msg; el.hidden = false; } }

})();
