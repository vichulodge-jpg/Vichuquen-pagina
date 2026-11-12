/**
 * Núcleo del panel: ingreso, navegación, listado de reservas y formulario de
 * reserva. Las demás pestañas viven en su archivo (inicio.js, calendario.js,
 * bloqueos.js, ingresos.js, correos.js) y usan lo que se exporta en LodgeAdmin.
 */
(function () {
  'use strict';

  var UI = window.LodgeUI;
  var esc = UI.esc;
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

  var ESTADOS = { pendiente: 'Pendiente', confirmada: 'Confirmada', cancelada: 'Cancelada' };
  var MOTIVOS = { mantencion: 'Mantención', manual: 'Uso propio u otro', airbnb: 'Airbnb', booking: 'Booking' };

  var MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var MS_DIA = 86400000;
  var COLUMNAS_RESERVAS = 7;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function cabana(id) {
    for (var i = 0; i < CABANAS.length; i++) if (CABANAS[i].id === id) return CABANAS[i];
    return null;
  }
  function cabanaNombre(id) { var c = cabana(id); return c ? c.nombre : id; }
  function cabanaHTML(id) {
    var c = cabana(id);
    return c ? '<span class="cab-num">' + c.num + '</span>' + esc(c.nombre) : esc(id);
  }
  function canalInfo(id) {
    for (var i = 0; i < CANALES.length; i++) if (CANALES[i].id === id) return CANALES[i];
    return { id: id || 'otro', label: id || 'Otro', color: '#6b7280' };
  }

  function qs(id) { return document.getElementById(id); }
  function anunciarCambio() { document.dispatchEvent(new CustomEvent('lodge:cambio')); }

  // ── INGRESO ──────────────────────────────────────────────────
  qs('secretInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') qs('btnLogin').click();
  });

  qs('btnLogin').addEventListener('click', function () {
    var val = (qs('secretInput').value || '').trim();
    if (!val) { qs('secretInput').focus(); return; }
    secret = val;
    sessionStorage.setItem('admin_secret', val);
    verifyAndLogin();
  });

  qs('btnLogout').addEventListener('click', function () {
    secret = '';
    sessionStorage.removeItem('admin_secret');
    qs('secretInput').value = '';
    hide('loginError');
    qs('adminPanel').hidden = true;
    qs('loginScreen').hidden = false;
  });

  function verifyAndLogin() {
    var btn = qs('btnLogin');
    btn.disabled = true;
    btn.textContent = 'Ingresando…';
    hide('loginError');

    apiFetch('/api/admin-reservas?estado=confirmada')
      .then(function (data) {
        if (Array.isArray(data)) showPanel();
        else showLoginError('Clave incorrecta.');
      })
      .catch(function (e) {
        // El 401 ya mostró su mensaje desde apiFetch; lo demás es un problema de conexión.
        if (e.message !== 'No autorizado') {
          showLoginError('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
        }
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Ingresar';
      });
  }

  function showLoginError(mensaje) {
    secret = '';
    sessionStorage.removeItem('admin_secret');
    // Si la clave dejó de valer a mitad de una tarea, nada debe quedar tapando el ingreso.
    UI.cerrarDialogo();
    cerrarModalReserva();
    qs('adminPanel').hidden = true;
    qs('loginScreen').hidden = false;
    showMsg('loginError', mensaje || 'Clave incorrecta.');
    qs('secretInput').value = '';
    qs('secretInput').focus();
  }

  function showPanel() {
    qs('loginScreen').hidden = true;
    qs('adminPanel').hidden = false;
    poblarSelectores();
    loadReservas();
    document.dispatchEvent(new CustomEvent('lodge:panel'));
  }

  // ── API ──────────────────────────────────────────────────────
  function apiFetch(url, opts) {
    opts = Object.assign({}, opts);
    opts.headers = Object.assign({}, opts.headers, { 'X-Admin-Secret': secret });
    if (opts.body && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) { showLoginError('Clave incorrecta.'); throw new Error('No autorizado'); }
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error((data && data.error) || ('Error ' + r.status));
        return data;
      });
    });
  }

  // ── SELECTORES CONSTRUIDOS DESDE LOS CATÁLOGOS ───────────────
  function opcionesCabanas(incluirTodas) {
    var html = incluirTodas ? '<option value="">Todas las cabañas</option>'
                            : '<option value="">Elige una cabaña…</option>';
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

  // ── NAVEGACIÓN ───────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) {
        t.classList.remove('active');
        t.removeAttribute('aria-current');
      });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = true; });
      tab.classList.add('active');
      tab.setAttribute('aria-current', 'page');
      var panel = qs('tab' + capitalize(tab.dataset.tab));
      if (panel) panel.hidden = false;
      // Cada sección empieza arriba, no donde quedó el scroll de la anterior.
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  });

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ── RESERVAS: LISTADO ────────────────────────────────────────
  var reservasData = [];
  var estadoFiltro = '';

  function elegirEstado(estado) {
    estadoFiltro = estado || '';
    qs('chipsEstado').querySelectorAll('.chip').forEach(function (chip) {
      var activo = chip.dataset.estado === estadoFiltro;
      chip.classList.toggle('active', activo);
      chip.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
    loadReservas();
  }

  function hayFiltros() {
    return !!(estadoFiltro || qs('filtroCabana').value || qs('filtroCanal').value || qs('filtroTexto').value.trim());
  }

  function quitarFiltros() {
    qs('filtroCabana').value = '';
    qs('filtroCanal').value  = '';
    qs('filtroTexto').value  = '';
    elegirEstado('');
  }

  function filaMensaje(columnas, html, clase) {
    return '<tr><td colspan="' + columnas + '" class="' + (clase || 'loading') + '">' + html + '</td></tr>';
  }

  var pedidoReservas = 0;

  function loadReservas() {
    var params = [];
    if (estadoFiltro)             params.push('estado=' + encodeURIComponent(estadoFiltro));
    if (qs('filtroCabana').value) params.push('cabana=' + encodeURIComponent(qs('filtroCabana').value));
    if (qs('filtroCanal').value)  params.push('canal='  + encodeURIComponent(qs('filtroCanal').value));

    var url = '/api/admin-reservas' + (params.length ? '?' + params.join('&') : '');
    qs('reservasTbody').innerHTML = filaMensaje(COLUMNAS_RESERVAS, 'Cargando…');

    // Dos clics seguidos en los filtros: solo vale la respuesta del último pedido.
    var pedido = ++pedidoReservas;
    apiFetch(url).then(function (data) {
      if (pedido !== pedidoReservas) return;
      reservasData = Array.isArray(data) ? data : [];
      renderReservas();
    }).catch(function (e) {
      if (pedido !== pedidoReservas) return;
      qs('reservasCount').textContent = '';
      qs('reservasTbody').innerHTML = filaMensaje(COLUMNAS_RESERVAS,
        '<strong>No se pudieron cargar las reservas.</strong>' + esc(e.message) +
        '<br><button class="btn-secondary" data-reintentar>Volver a intentar</button>', 'vacio');
    });
  }

  /** El buscador filtra sobre lo ya cargado: no hace falta ir al servidor por cada letra. */
  function reservasVisibles() {
    var texto = qs('filtroTexto').value.trim().toLowerCase();
    if (!texto) return reservasData;
    return reservasData.filter(function (r) {
      return (nombreCompleto(r) + ' ' + (r.email || '') + ' ' + (r.telefono || '')).toLowerCase().indexOf(texto) !== -1;
    });
  }

  function renderReservas() {
    var lista = reservasVisibles();
    qs('reservasCount').textContent = lista.length + ' reserva' + (lista.length !== 1 ? 's' : '') +
      (lista.length !== reservasData.length ? ' de ' + reservasData.length : '');

    if (!lista.length) {
      qs('reservasTbody').innerHTML = filaMensaje(COLUMNAS_RESERVAS, hayFiltros()
        ? '<strong>Ninguna reserva coincide con estos filtros.</strong>Prueba con otro estado o borra el texto del buscador.' +
          '<br><button class="btn-secondary" data-quitar-filtros>Quitar filtros</button>'
        : '<strong>Todavía no hay reservas.</strong>Cuando alguien reserve en la web, o cargues una con «+ Nueva reserva», aparecerá aquí.',
        'vacio');
      return;
    }
    qs('reservasTbody').innerHTML = lista.map(filaReserva).join('');
  }

  function filaReserva(r) {
    var canal  = canalInfo(r.canal);
    var estado = ESTADOS[r.estado] ? r.estado : 'otro';
    var noches = nochesDe(r);
    return '<tr class="fila-' + estado + '">' +
      '<td><strong>' + esc(nombreCompleto(r) || 'Sin nombre') + '</strong><small>' + esc(r.email) + '</small></td>' +
      '<td class="nowrap">' + cabanaHTML(r.cabana_id) +
        '<span class="canal-badge canal-bajo" style="background:' + canal.color + '">' + esc(canal.label) + '</span></td>' +
      '<td class="nowrap">' + esc(fmtRango(r.check_in, r.check_out)) +
        '<small>' + noches + (noches === 1 ? ' noche' : ' noches') + ' · ' + esc(r.personas) + ' pers.</small></td>' +
      '<td>' + waCell(r.telefono) + '</td>' +
      '<td>' + pagoCell(r) + '</td>' +
      '<td><span class="badge badge-' + estado + '">' + esc(ESTADOS[r.estado] || r.estado) + '</span></td>' +
      '<td><div class="acciones">' + accionesReserva(r) + '</div></td>' +
      '</tr>';
  }

  /** Verde si no debe nada, ámbar si queda saldo: el color dice si hay algo que cobrar. */
  function pagoCell(r) {
    var total = Number(r.total || 0), abono = Number(r.abono || 0);
    var saldo = Math.max(0, total - abono);
    if (!total) return '<span class="pago-pill pago-nada">Sin monto</span>';
    var pill = saldo > 0
      ? '<span class="pago-pill pago-debe">Debe ' + fmtCLP(saldo) + '</span>'
      : '<span class="pago-pill pago-ok">Pagado</span>';
    return pill + '<small>' + (saldo > 0 ? 'de ' : 'Total ') + fmtCLP(total) + '</small>';
  }

  function accionesReserva(r) {
    var id = esc(r.id);
    var btns = ['<button class="btn-secondary btn-mini" data-editar="' + id + '">Ver / editar</button>'];
    if (r.estado === 'pendiente') {
      btns.push('<button class="btn-confirmar btn-mini" data-action="confirmada" data-id="' + id + '">Confirmar</button>');
    }
    if (r.estado !== 'cancelada') {
      btns.push('<button class="btn-danger btn-mini" data-action="cancelada" data-id="' + id + '">Cancelar</button>');
    }
    return btns.join('');
  }

  function preguntaDeEstado(r, estado) {
    var quien = nombreCompleto(r) || 'este huésped';
    if (estado === 'confirmada') {
      return {
        titulo: '¿Confirmar la reserva de ' + quien + '?',
        texto: 'Las fechas quedan ocupadas en ' + cabanaNombre(r.cabana_id) +
               ' y se le envía el correo de confirmación. Hazlo cuando ya hayas comprobado el pago.',
        aceptar: 'Sí, confirmar', tipo: 'ok'
      };
    }
    return {
      titulo: '¿Cancelar la reserva de ' + quien + '?',
      texto: 'Las fechas quedan libres otra vez. La reserva no se borra: se conserva en el historial como cancelada.',
      aceptar: 'Sí, cancelar reserva', cancelar: 'No, mantenerla', tipo: 'peligro'
    };
  }

  function cambiarEstado(r, estado, btn) {
    UI.confirmar(preguntaDeEstado(r, estado)).then(function (acepto) {
      if (!acepto) return;
      if (btn) btn.disabled = true;
      apiFetch('/api/admin-reservas?id=' + encodeURIComponent(r.id), {
        method: 'PATCH',
        body: { estado: estado }
      }).then(function (res) {
        var avisoCorreo = avisarCorreos(res && res.correos);
        if (!avisoCorreo) UI.toast(estado === 'confirmada' ? 'Reserva confirmada.' : 'Reserva cancelada: las fechas quedaron libres.', 'ok');
        despuesDeGuardar();
      }).catch(function (e) {
        if (btn) btn.disabled = false;
        UI.toast(e.message, 'error');
      });
    });
  }

  /** Recarga el listado y avisa a las demás pestañas (calendario, inicio) que algo cambió. */
  function despuesDeGuardar() {
    loadReservas();
    anunciarCambio();
  }

  qs('reservasTbody').addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    if (btn.hasAttribute('data-reintentar'))     { loadReservas(); return; }
    if (btn.hasAttribute('data-quitar-filtros')) { quitarFiltros(); return; }

    var r = buscarReserva(btn.dataset.editar || btn.dataset.id);
    if (!r) return;
    if (btn.dataset.editar) abrirModalReserva(r);
    else if (btn.dataset.action) cambiarEstado(r, btn.dataset.action, btn);
  });

  function buscarReserva(id) {
    if (!id) return null;
    for (var i = 0; i < reservasData.length; i++) if (reservasData[i].id === id) return reservasData[i];
    return null;
  }

  function nombreCompleto(r) {
    return [r.nombre, r.apellido].filter(Boolean).join(' ');
  }

  qs('chipsEstado').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (chip) elegirEstado(chip.dataset.estado);
  });
  qs('btnRefreshReservas').addEventListener('click', loadReservas);
  qs('filtroCabana').addEventListener('change', loadReservas);
  qs('filtroCanal').addEventListener('change', loadReservas);
  qs('filtroTexto').addEventListener('input', renderReservas);

  // ── FORMULARIO DE RESERVA ────────────────────────────────────
  var reservaEditando = null;
  var focoAntesDelModal = null;   // a dónde vuelve el foco al cerrar el formulario

  qs('btnNuevaReserva').addEventListener('click', function () { abrirModalReserva(null); });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-nueva-reserva]')) abrirModalReserva(null);
  });

  document.querySelectorAll('[data-cerrar-modal]').forEach(function (el) {
    el.addEventListener('click', cerrarModalReserva);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !qs('reservaModal').hidden) cerrarModalReserva();
  });

  // Con el formulario abierto, Tab da la vuelta dentro de él en vez de irse a lo de atrás.
  qs('reservaModal').addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var enfocables = [].filter.call(
      qs('reservaModal').querySelectorAll('button, input, select, textarea, a[href]'),
      function (el) { return !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null; });
    if (!enfocables.length) return;
    var primero = enfocables[0], ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  });

  // Cualquier cambio en el formulario recalcula el saldo y el avance de los pasos.
  ['input', 'change'].forEach(function (evento) {
    qs('reservaModal').addEventListener(evento, function (e) {
      if (e.target.classList) e.target.classList.remove('campo-error');
      actualizarSaldo();
      actualizarPasos();
    });
  });

  function actualizarSaldo() {
    var total = Number(qs('rvTotal').value || 0);
    var abono = Number(qs('rvAbono').value || 0);
    qs('rvSaldo').value = fmtCLP(Math.max(0, total - abono));
  }

  /**
   * Pinta de verde los pasos completos y resume la estadía en palabras, para
   * que un error de fechas se note antes de guardar.
   */
  function actualizarPasos() {
    var d = datosDelFormulario();
    var fechasOk = !!d.check_in && !!d.check_out && d.check_out > d.check_in;
    var estadiaOk = !!d.cabana_id && fechasOk && d.personas >= 1;
    var huespedOk = !!d.nombre && EMAIL_RE.test(d.email);
    var listo = {
      1: estadiaOk,
      2: huespedOk,
      3: d.total > 0 && d.abono <= d.total,
      // El paso 4 viene con valores por defecto: se da por listo cuando lo
      // obligatorio de arriba ya está, para que el verde avance en orden.
      4: estadiaOk && huespedOk && !!d.canal && !!d.estado
    };
    qs('reservaModal').querySelectorAll('.paso').forEach(function (paso) {
      paso.classList.toggle('paso-listo', !!listo[paso.dataset.paso]);
    });

    // La salida no puede ser anterior al día siguiente de la llegada.
    qs('rvCheckOut').min = d.check_in ? isoLocal(new Date(aFecha(d.check_in).getTime() + MS_DIA)) : '';

    var resumen = qs('rvResumenEstadia');
    resumen.hidden = !fechasOk;
    if (fechasOk) {
      var noches = diasEntre(d.check_in, d.check_out);
      resumen.textContent = noches + (noches === 1 ? ' noche' : ' noches') + ': llega el ' +
        fmtDiaCorto(d.check_in) + ' y se va el ' + fmtDiaCorto(d.check_out) + '.';
    }
  }

  /**
   * @param {object|null} r        reserva a editar, o null para una nueva
   * @param {object} [prefill]     valores iniciales de una nueva (cabana_id, check_in)
   */
  function abrirModalReserva(r, prefill) {
    reservaEditando = r || null;
    prefill = prefill || {};
    hide('rvError'); hide('rvOk');
    qs('reservaModal').querySelectorAll('.campo-error').forEach(function (c) { c.classList.remove('campo-error'); });

    var esNueva = !r;
    qs('rvTitulo').textContent = esNueva ? 'Nueva reserva' : 'Reserva de ' + (nombreCompleto(r) || 'huésped');
    qs('rvIntro').textContent = esNueva
      ? 'Completa los pasos en orden. Los campos con * son obligatorios.'
      : 'Cambia lo que necesites y pulsa «Guardar cambios». Si solo quieres mirar, cierra sin guardar.';
    qs('btnGuardarReserva').textContent = esNueva ? 'Crear reserva' : 'Guardar cambios';

    // "Pendiente" solo se ofrece si la reserva ya está en ese estado
    // (una reserva pendiente no bloquea fechas: no sirve para cargar una externa).
    var opcionesEstado = '<option value="confirmada">Confirmada</option>' +
                         '<option value="cancelada">Cancelada</option>';
    if (r && r.estado === 'pendiente') {
      opcionesEstado = '<option value="pendiente">Pendiente</option>' + opcionesEstado;
    }
    qs('rvEstado').innerHTML = opcionesEstado;

    qs('rvCabana').value        = r ? r.cabana_id : (prefill.cabana_id || '');
    qs('rvCanal').value         = r ? (r.canal || 'otro') : 'directa';
    qs('rvEstado').value        = r ? r.estado : 'confirmada';
    qs('rvCheckIn').value       = r ? r.check_in  : (prefill.check_in || '');
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
    actualizarPasos();

    // Estado de los correos ya enviados
    var yaConfirmacion = r && r.email_confirmacion_enviado_at;
    qs('rvEnviarEmailWrap').hidden = !!yaConfirmacion;
    qs('rvEnviarEmail').checked = true;

    qs('btnCancelarReserva').hidden = !r || r.estado === 'cancelada';
    qs('rvMeta').hidden = esNueva;
    if (!esNueva) qs('rvMeta').innerHTML = metaReserva(r);

    if (qs('reservaModal').hidden) focoAntesDelModal = document.activeElement;
    qs('reservaModal').hidden = false;
    document.body.classList.add('modal-abierto');
    qs('reservaModal').querySelector('.modal-body').scrollTop = 0;
    // Con cabaña y llegada ya puestas (clic en el calendario) lo que falta es la salida.
    (prefill.check_in ? qs('rvCheckOut') : qs('rvCabana')).focus();
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
    if (r.cupon_codigo)  filas.push(['Cupón usado', r.cupon_codigo]);
    if (r.mensaje)       filas.push(['Mensaje del huésped', r.mensaje]);
    if (r.cancelada_at)  filas.push(['Cancelada el', fmtDatetime(r.cancelada_at)]);
    if (r.mp_payment_id) filas.push(['Pago MercadoPago', r.mp_payment_id]);

    return filas.map(function (f) {
      return '<div class="meta-fila"><span>' + esc(f[0]) + '</span><strong>' + esc(f[1]) + '</strong></div>';
    }).join('');
  }

  function cerrarModalReserva() {
    if (qs('reservaModal').hidden) return;
    qs('reservaModal').hidden = true;
    document.body.classList.remove('modal-abierto');
    reservaEditando = null;
    // El foco vuelve a donde estaba (si ese botón sigue existiendo y a la vista).
    var volver = focoAntesDelModal;
    focoAntesDelModal = null;
    if (volver && volver.focus && document.contains(volver) && volver.offsetParent !== null) volver.focus();
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

  /** @returns {{campo: string, mensaje: string}|null} el primer problema, con el campo donde está */
  function validarFormulario(d) {
    function falta(campo, mensaje) { return { campo: campo, mensaje: mensaje }; }
    if (!d.cabana_id)              return falta('rvCabana',   'Paso 1: elige una cabaña.');
    if (!d.check_in)               return falta('rvCheckIn',  'Paso 1: indica la fecha de llegada.');
    if (!d.check_out)              return falta('rvCheckOut', 'Paso 1: indica la fecha de salida.');
    if (d.check_out <= d.check_in) return falta('rvCheckOut', 'Paso 1: la salida debe ser posterior a la llegada.');
    if (!d.personas || d.personas < 1) return falta('rvPersonas', 'Paso 1: indica cuántos huéspedes son.');
    if (!d.nombre)                 return falta('rvNombre',   'Paso 2: escribe el nombre del huésped.');
    if (!d.email)                  return falta('rvEmail',    'Paso 2: escribe el correo del huésped.');
    if (!EMAIL_RE.test(d.email))   return falta('rvEmail',    'Paso 2: el correo no parece válido. Revisa que tenga @ y un dominio.');
    if (d.abono > d.total)         return falta('rvAbono',    'Paso 3: el abono no puede ser mayor que el total de la estadía.');
    return null;
  }

  qs('btnGuardarReserva').addEventListener('click', function () {
    hide('rvError'); hide('rvOk');
    var datos = datosDelFormulario();
    var problema = validarFormulario(datos);
    if (problema) {
      showMsg('rvError', problema.mensaje);
      qs(problema.campo).classList.add('campo-error');
      qs(problema.campo).focus();
      return;
    }

    var btn = qs('btnGuardarReserva');
    var editando = reservaEditando;
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    var peticion = editando
      ? apiFetch('/api/admin-reservas?id=' + encodeURIComponent(editando.id), { method: 'PATCH', body: datos })
      : apiFetch('/api/admin-reservas', { method: 'POST', body: datos });

    peticion.then(function (res) {
      var aviso = mensajeGuardado(res, !editando);
      cerrarModalReserva();
      UI.toast(aviso.texto, aviso.tipo);
      despuesDeGuardar();
    }).catch(function (e) {
      showMsg('rvError', e.message);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = editando ? 'Guardar cambios' : 'Crear reserva';
    });
  });

  /** Resume en una frase qué se guardó y qué pasó con los correos. */
  function mensajeGuardado(res, esNueva) {
    var partes = [esNueva ? 'Reserva creada.' : 'Cambios guardados.'];
    var tipo = 'ok';
    var c = res && res.correos;
    if (c) {
      if (c.confirmacion === 'enviado')     partes.push('Correo de confirmación enviado.');
      if (c.confirmacion === 'error_envio') { partes.push('No se pudo enviar la confirmación: avísale tú al huésped.'); tipo = 'aviso'; }
      if (c.confirmacion === 'sin_email')   { partes.push('Sin correo del huésped: no se envió nada.'); tipo = 'aviso'; }
      if (c.pre_llegada  === 'enviado')     partes.push('Pre-llegada enviada, porque el check-in es muy pronto.');
      if (c.pre_llegada  === 'programado')  partes.push('La pre-llegada saldrá 3 días antes del check-in.');
    }
    return { texto: partes.join(' '), tipo: tipo };
  }

  /**
   * El envío de un correo es un efecto que el administrador no ve: si ocurre
   * al confirmar desde el listado, se avisa con un mensaje flotante.
   * @returns {boolean} true si mostró algún aviso
   */
  function avisarCorreos(c) {
    if (!c) return false;
    if (c.confirmacion === 'error_envio') { UI.toast('Reserva confirmada, pero no se pudo enviar el correo: avísale tú al huésped.', 'aviso'); return true; }
    if (c.pre_llegada  === 'enviado')     { UI.toast('Reserva confirmada. Se enviaron la confirmación y la pre-llegada (el check-in es en menos de 3 días).', 'ok'); return true; }
    if (c.confirmacion === 'enviado')     { UI.toast('Reserva confirmada. Correo de confirmación enviado al huésped.', 'ok'); return true; }
    return false;
  }

  qs('btnCancelarReserva').addEventListener('click', function () {
    var r = reservaEditando;
    if (!r) return;
    UI.confirmar(preguntaDeEstado(r, 'cancelada')).then(function (acepto) {
      if (!acepto) return;
      var btn = qs('btnCancelarReserva');
      btn.disabled = true;
      apiFetch('/api/admin-reservas?id=' + encodeURIComponent(r.id), {
        method: 'PATCH',
        body: { estado: 'cancelada' }
      }).then(function () {
        cerrarModalReserva();
        UI.toast('Reserva cancelada: las fechas quedaron libres.', 'ok');
        despuesDeGuardar();
      }).catch(function (e) {
        showMsg('rvError', e.message);
      }).then(function () { btn.disabled = false; });
    });
  });

  // ── FECHAS Y FORMATOS ────────────────────────────────────────
  function aFecha(iso) { return new Date(iso + 'T12:00:00'); }

  function isoLocal(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Días (o noches) entre dos fechas ISO. */
  function diasEntre(desde, hasta) {
    return Math.round((aFecha(hasta) - aFecha(desde)) / MS_DIA);
  }

  function nochesDe(r) {
    return Number(r.noches) || Math.max(0, diasEntre(r.check_in, r.check_out));
  }

  function fmtCLP(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }

  function fmtDate(s) {
    if (!s) return '—';
    var d = aFecha(s);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }

  /** "13 nov" — para leer de un vistazo. */
  function fmtDiaCorto(s) {
    if (!s) return '—';
    var d = aFecha(s);
    return d.getDate() + ' ' + MESES_CORTOS[d.getMonth()];
  }

  /** "13 → 16 nov 2026", o "28 nov → 2 dic 2026" si cruza de mes. */
  function fmtRango(desde, hasta) {
    if (!desde || !hasta) return '—';
    var a = aFecha(desde), b = aFecha(hasta);
    var mismoMes = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    return (mismoMes ? a.getDate() : fmtDiaCorto(desde)) + ' → ' + fmtDiaCorto(hasta) + ' ' + b.getFullYear();
  }

  function fmtDatetime(s) {
    if (!s) return '—';
    var d = new Date(s);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function waCell(telefono) {
    if (!telefono) return '<span class="sin-dato">—</span>';
    var n = String(telefono).replace(/\D/g, '');
    if (n.length === 9 && n[0] === '9') n = '56' + n;
    return '<a href="https://wa.me/' + n + '" target="_blank" rel="noopener" class="btn-wa" title="Abrir chat de WhatsApp">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
      'WhatsApp</a><span class="wa-num">' + esc(telefono) + '</span>';
  }

  function hide(id) { var el = qs(id); if (el) el.hidden = true; }
  function showMsg(id, msg) { var el = qs(id); if (el) { el.textContent = msg; el.hidden = false; } }

  // Lo que comparten las pestañas que viven en su propio archivo.
  window.LodgeAdmin = {
    apiFetch: apiFetch,
    CABANAS: CABANAS,
    ESTADOS: ESTADOS,
    MOTIVOS: MOTIVOS,
    MESES: MESES,
    canalInfo: canalInfo,
    cabanaNombre: cabanaNombre,
    cabanaHTML: cabanaHTML,
    nombreCompleto: nombreCompleto,
    isoLocal: isoLocal,
    diasEntre: diasEntre,
    capitalize: capitalize,
    fmtCLP: fmtCLP,
    fmtDate: fmtDate,
    fmtDiaCorto: fmtDiaCorto,
    fmtRango: fmtRango,
    fmtDatetime: fmtDatetime,
    pad: pad,
    esc: esc,
    filaMensaje: filaMensaje,
    anunciarCambio: anunciarCambio,
    abrirReserva: function (r) { abrirModalReserva(r); },
    /** Abre el formulario vacío; `prefill` puede traer cabana_id y check_in. */
    nuevaReserva: function (prefill) { abrirModalReserva(null, prefill); },
    /** Lleva a Reservas con el filtro de estado ya puesto. */
    verReservasPorEstado: function (estado) { UI.irA('reservas'); elegirEstado(estado); }
  };

  // Entrar directo si la clave quedó guardada en esta pestaña. Va al final:
  // para entonces ya existe todo lo que showPanel necesita.
  var savedSecret = sessionStorage.getItem('admin_secret');
  if (savedSecret) {
    secret = savedSecret;
    verifyAndLogin();
  }

})();
