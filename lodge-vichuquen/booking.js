(function () {
  'use strict';

  // ── DATOS DE CABAÑAS ─────────────────────────────────────────
  // 20% descuento en tarifa MEDIA para ≤3 personas (vigente antes del 16-nov-2026)
  var DESCUENTO_CABANAS = ['c1-tagua','c2-cisne-coscoroba','c5-huala','c6-run-run','c7-pitio'];
  var DESCUENTO_HASTA   = '2026-11-15'; // último día con descuento (inclusive)

  var CABANAS = [
    { id: 'c1-tagua',              nombre: 'Tagua',              capacidad: 5, alta: 119000, media: 99000,  baja: 79200 },
    { id: 'c2-cisne-coscoroba',    nombre: 'Cisne Coscoroba',    capacidad: 5, alta: 119000, media: 99000,  baja: 79200 },
    { id: 'c3-siete-colores',      nombre: 'Siete Colores',      capacidad: 7, alta: 139000, media: 119000, baja: 95200 },
    { id: 'c4-cisne-cuello-negro', nombre: 'Cisne Cuello Negro', capacidad: 6, alta: 129000, media: 109000, baja: 87200 },
    { id: 'c5-huala',              nombre: 'Huala',              capacidad: 5, alta: 119000, media: 99000,  baja: 79200 },
    { id: 'c6-run-run',            nombre: 'Run Run',            capacidad: 5, alta: 119000, media: 99000,  baja: 79200 },
    { id: 'c7-pitio',              nombre: 'Pitío',              capacidad: 5, alta: 119000, media: 99000,  baja: 79200 },
  ];

  // ── TARIFAS ──────────────────────────────────────────────────
  // Alta: fechas específicas (calendario cierra el 2028-03-15)
  var TEMPORADAS_ALTA = [
    { from: '2026-06-26', to: '2026-06-28' },
    { from: '2026-07-15', to: '2026-07-18' },
    { from: '2026-09-11', to: '2026-09-19' },
    { from: '2026-10-09', to: '2026-10-11' },
    { from: '2026-12-04', to: '2026-12-07' },
    { from: '2026-12-18', to: '2026-12-31' },
    { from: '2027-01-01', to: '2027-03-15' },
    { from: '2027-03-25', to: '2027-03-27' },
    { from: '2027-05-20', to: '2027-05-22' },
    { from: '2027-06-18', to: '2027-06-20' },
    { from: '2027-06-25', to: '2027-06-27' },
    { from: '2027-09-10', to: '2027-09-18' },
    { from: '2027-10-08', to: '2027-10-10' },
    { from: '2027-10-29', to: '2027-10-31' },
    { from: '2028-01-01', to: '2028-03-15' }
  ];

  // Media: Viernes-Sábado + Jun 15-Jul 20 de 2026 y 2027 (excluye alta)
  function esAlta(dateStr) {
    for (var i = 0; i < TEMPORADAS_ALTA.length; i++) {
      if (dateStr >= TEMPORADAS_ALTA[i].from && dateStr <= TEMPORADAS_ALTA[i].to) return true;
    }
    return false;
  }

  function esMedia(dateStr) {
    if (esAlta(dateStr)) return false;
    var d   = new Date(dateStr + 'T12:00:00');
    var dow = d.getDay(); // 0=Dom … 5=Vie, 6=Sáb
    if (dow === 5 || dow === 6) return true;
    var year = d.getFullYear();
    var mmdd = dateStr.slice(5);
    if ((year === 2026 || year === 2027) && mmdd >= '06-15' && mmdd <= '07-20') return true;
    return false;
  }

  function getTarifa(dateStr) {
    if (esAlta(dateStr))  return 'alta';
    if (esMedia(dateStr)) return 'media';
    return 'baja';
  }

  function calcCuponDescuento(subtotal) {
    if (!st.cupon) return 0;
    if (st.cupon.tipo === 'porcentaje') return Math.round(subtotal * st.cupon.valor / 100);
    return Math.min(st.cupon.valor, subtotal);
  }

  function getPrecio(cabana, dateStr) {
    var t = getTarifa(dateStr);
    return t === 'alta' ? cabana.alta : (t === 'media' ? cabana.media : cabana.baja);
  }

  function diffDays(a, b) {
    return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  }

  function fmtCLP(n) {
    return '$' + n.toLocaleString('es-CL');
  }

  function fmtFecha(str) {
    var d = new Date(str + 'T12:00:00');
    var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return d.getDate() + ' ' + meses[d.getMonth()] + ' ' + d.getFullYear();
  }

  function toISODate(d) { return d.toISOString().split('T')[0]; }

  // ── ESTADO ────────────────────────────────────────────────────
  var st = {
    cabana:    null,
    checkIn:   null,
    checkOut:  null,
    noches:    0,
    precio:    0,
    total:     0,
    baseTotal:    0,  // total sin descuento
    baseMedia:      0,  // subtotal de noches en tarifa media
    baseMediaDesc:  0,  // media con descuento vigente (< 16-nov-2026)
    baseMediaFixed: 0,  // media sin descuento (>= 16-nov-2026)
    baseAltaBaja:   0,  // subtotal de noches en alta + baja
    cupon:          null,  // { tipo, valor, descripcion } si hay cupón aplicado
    abono:      0,
    pagoHoy:    0,   // monto que se cobra hoy según opción elegida
    pagoTipo:   'abono',        // 'abono' | 'total'
    metodoPago: 'mp',           // 'mp' | 'transferencia'
    blocked:    [],
    loading:    false
  };

  var fp = null;   // flatpickr instance

  // ── HELPERS DOM ───────────────────────────────────────────────
  function qs(id) { return document.getElementById(id); }
  function show(id) { var el = qs(id); if (el) el.hidden = false; }
  function hide(id) { var el = qs(id); if (el) el.hidden = true; }
  function txt(id, v) { var el = qs(id); if (el) el.textContent = v; }

  // ── INIT ─────────────────────────────────────────────────────
  function initBooking() {
    if (!qs('bookingWidget') || typeof flatpickr === 'undefined') return;

    initFlatpickr();

    var selCab = qs('bwCabana');
    if (selCab) selCab.addEventListener('change', onCabanaChange);

    var persEl = qs('bwPersonas');
    if (persEl) {
      persEl.max = '7';
      persEl.addEventListener('input', aplicarDescuento);
    }

    var btnTransfPagar = qs('bwPagarTransferencia');
    if (btnTransfPagar) btnTransfPagar.addEventListener('click', onPagarTransferencia);

    document.querySelectorAll('input[name="metodoPago"]').forEach(function(radio) {
      radio.addEventListener('change', onMetodoPagoChange);
    });

    var btnCupon = qs('bwCuponBtn');
    if (btnCupon) btnCupon.addEventListener('click', onAplicarCupon);
    var cuponInput = qs('bwCuponInput');
    if (cuponInput) cuponInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') onAplicarCupon();
    });

    var btnCont = qs('bwContinuar');
    if (btnCont) btnCont.addEventListener('click', onContinuar);

    var btnVolver = qs('bwVolver');
    if (btnVolver) btnVolver.addEventListener('click', onVolver);

    var btnPagar = qs('bwPagar');
    if (btnPagar) btnPagar.addEventListener('click', onPagar);

    // Opciones de pago (abono / total)
    document.querySelectorAll('input[name="pagoTipo"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        st.pagoTipo = radio.value;
        actualizarPagoOpciones();
      });
    });
  }

  // ── FLATPICKR ─────────────────────────────────────────────────
  function initFlatpickr() {
    var input = qs('bwDateInput');
    if (!input) return;

    fp = flatpickr(input, {
      mode:      'range',
      inline:    true,
      minDate:   'today',
      maxDate:   '2028-03-15',
      dateFormat:'Y-m-d',
      showMonths: 1,
      locale: {
        firstDayOfWeek: 1,
        weekdays: {
          shorthand: ['Do','Lu','Ma','Mi','Ju','Vi','Sa'],
          longhand:  ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
        },
        months: {
          shorthand: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
          longhand:  ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
                      'Septiembre','Octubre','Noviembre','Diciembre']
        },
        rangeSeparator: ' → '
      },
      disable: [],
      onReady: function(_, __, fpInst) {
        var cal = fpInst.calendarContainer;
        var container = qs('bwCalContainer');
        if (cal && container) container.appendChild(cal);
      },
      onChange: onDatesChange,
      onDayCreate: function(_, __, ___, dayElem) {
        if (dayElem.dateObj) {
          var ds = toISODate(dayElem.dateObj);
          var t  = getTarifa(ds);
          if (t === 'alta')  dayElem.classList.add('bw-alta');
          if (t === 'media') dayElem.classList.add('bw-media');
        }
      }
    });
  }

  function onDatesChange(dates) {
    if (dates.length !== 2) {
      st.checkIn = null; st.checkOut = null;
      hide('bwResumen');
      updateContinuarBtn();
      return;
    }

    var ci = toISODate(dates[0]);
    var co = toISODate(dates[1]);

    // Verificar que ningún día bloqueado quede dentro del rango
    var d = new Date(dates[0]);
    d.setDate(d.getDate() + 1);
    var blocked = false;
    while (d < dates[1]) {
      if (st.blocked.indexOf(toISODate(d)) !== -1) { blocked = true; break; }
      d.setDate(d.getDate() + 1);
    }

    if (blocked) {
      fp.clear();
      showError('bwCalError', 'El rango seleccionado incluye fechas no disponibles.');
      return;
    }

    st.checkIn  = ci;
    st.checkOut = co;
    calcPrecio();
  }

  // ── SELECCIÓN DE CABAÑA ───────────────────────────────────────
  function onCabanaChange() {
    var sel   = qs('bwCabana');
    var cabId = sel ? sel.value : '';

    if (!cabId) {
      st.cabana = null;
      hide('bwCabanaInfo');
      hide('bwResumen');
      hide('bwPagoOpciones');
      hide('bwCalWrapper');
      updateContinuarBtn();
      return;
    }

    st.cabana = CABANAS.filter(function(c) { return c.id === cabId; })[0] || null;
    if (!st.cabana) return;

    // Reset fechas
    if (fp) fp.clear();
    st.checkIn = null; st.checkOut = null;
    hide('bwResumen');

    // Actualizar info de cabaña
    txt('bwCapacidad', 'Hasta ' + st.cabana.capacidad + ' persona' + (st.cabana.capacidad > 1 ? 's' : ''));
    actualizarPrecioDisplay();
    show('bwCabanaInfo');
    show('bwCalWrapper');

    // Actualizar max personas en el step 2
    var persEl = qs('bwPersonas');
    if (persEl) persEl.max = st.cabana.capacidad;

    // Cargar disponibilidad
    loadAvailability(cabId);
    updateContinuarBtn();
  }

  function loadAvailability(cabanaId) {
    st.blocked = [];
    fetch('/api/availability?cabana_id=' + encodeURIComponent(cabanaId))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        st.blocked = data.blocked || [];
        if (fp) fp.set('disable', st.blocked);
      })
      .catch(function() { /* fail silently — backend valida de todas formas */ });
  }

  function actualizarPrecioDisplay() {
    if (!st.cabana) return;
    txt('bwPrecioBase', 'Desde ' + fmtCLP(st.cabana.baja) + ' / noche');
    var hoy = toISODate(new Date());
    var t   = getTarifa(hoy);
    var badge = qs('bwTemporadaBadge');
    if (badge) {
      var labels = { alta: '🌞 Temporada alta', media: '🌤 Temporada media', baja: '🍂 Temporada baja' };
      badge.textContent = labels[t];
      badge.className   = 'bw-badge ' + t;
    }
  }

  // ── CÁLCULO DE PRECIO (día a día, 3 tarifas) ─────────────────
  function calcPrecio() {
    if (!st.cabana || !st.checkIn || !st.checkOut) return;
    var noches = diffDays(st.checkIn, st.checkOut);
    if (noches < 1) { hide('bwResumen'); hide('bwPagoOpciones'); return; }

    var totalAlta = 0, totalMediaDesc = 0, totalMediaFixed = 0, totalBaja = 0;
    var diasAlta = 0, diasMedia = 0, diasBaja = 0;
    var d    = new Date(st.checkIn  + 'T12:00:00');
    var endD = new Date(st.checkOut + 'T12:00:00');
    while (d < endD) {
      var ds = toISODate(d);
      var t  = getTarifa(ds);
      if      (t === 'alta')  { totalAlta  += st.cabana.alta;  diasAlta++;  }
      else if (t === 'media') {
        diasMedia++;
        if (ds <= DESCUENTO_HASTA) totalMediaDesc  += st.cabana.media;
        else                       totalMediaFixed += st.cabana.media;
      }
      else                    { totalBaja  += st.cabana.baja;  diasBaja++;  }
      d.setDate(d.getDate() + 1);
    }

    var totalMedia = totalMediaDesc + totalMediaFixed;
    var total = totalAlta + totalMedia + totalBaja;
    var abono = Math.ceil(total * 0.5 / 1000) * 1000;

    st.noches         = noches;
    st.precio         = Math.round(total / noches);
    st.total          = total;
    st.baseTotal      = total;
    st.baseMedia      = totalMedia;
    st.baseMediaDesc  = totalMediaDesc;
    st.baseMediaFixed = totalMediaFixed;
    st.baseAltaBaja   = totalAlta + totalBaja;
    st.abono     = abono;

    // Badge
    var badge = qs('bwTemporadaBadge');
    if (badge) {
      var tipos = (diasAlta > 0 ? 1 : 0) + (diasMedia > 0 ? 1 : 0) + (diasBaja > 0 ? 1 : 0);
      if (tipos > 1) {
        badge.textContent = '🌗 Temporada mixta'; badge.className = 'bw-badge alta';
      } else if (diasAlta === noches) {
        badge.textContent = '🌞 Temporada alta';  badge.className = 'bw-badge alta';
      } else if (diasMedia === noches) {
        badge.textContent = '🌤 Temporada media'; badge.className = 'bw-badge media';
      } else {
        badge.textContent = '🍂 Temporada baja';  badge.className = 'bw-badge baja';
      }
    }

    // Descripción del precio
    var partes = [];
    if (diasAlta  > 0) partes.push(diasAlta  + ' n. × ' + fmtCLP(st.cabana.alta)  + ' (Alta)');
    if (diasMedia > 0) partes.push(diasMedia + ' n. × ' + fmtCLP(st.cabana.media) + ' (Media)');
    if (diasBaja  > 0) partes.push(diasBaja  + ' n. × ' + fmtCLP(st.cabana.baja)  + ' (Baja)');
    if (partes.length === 1) {
      var pu = diasAlta === noches ? st.cabana.alta : (diasMedia === noches ? st.cabana.media : st.cabana.baja);
      partes = [noches + ' noche' + (noches > 1 ? 's' : '') + ' × ' + fmtCLP(pu)];
    }
    // Aplicar cupón si hay uno guardado
    var cuponDesc = calcCuponDescuento(total);
    var totalFinal = total - cuponDesc;
    var abonoFinal = Math.ceil(totalFinal * 0.5 / 1000) * 1000;
    st.total = totalFinal;
    st.abono = abonoFinal;

    txt('bwPrecioBase', 'Desde ' + fmtCLP(st.cabana.baja) + ' / noche');
    txt('bwCalcDesc',  partes.join(' + '));
    txt('bwCalcTotal', fmtCLP(total));
    actualizarFilaCupon(cuponDesc);
    txt('bwCalcAbono', fmtCLP(abonoFinal));
    txt('bwCalcSaldo', fmtCLP(totalFinal - abonoFinal));

    actualizarPagoOpciones();
    show('bwResumen');
    show('bwCuponWrap');
    if (st.metodoPago === 'mp') show('bwPagoOpciones');
    show('bwMetodoPago');
    updateContinuarBtn();
  }

  function actualizarPagoOpciones() {
    if (!st.total) return;
    txt('bwOptAbonoAmt', fmtCLP(st.abono));
    txt('bwOptTotalAmt', fmtCLP(st.total));

    var esTotalSelected = st.pagoTipo === 'total';
    st.pagoHoy = esTotalSelected ? st.total : st.abono;

    // Actualizar label y fila saldo en resumen
    var labelAbono = qs('bwLabelAbono');
    if (labelAbono) labelAbono.textContent = esTotalSelected ? 'Pago total hoy' : 'Abono hoy (50%)';
    txt('bwCalcAbono', fmtCLP(st.pagoHoy));

    var filaSaldo = qs('bwFilaSaldo');
    if (filaSaldo) filaSaldo.hidden = esTotalSelected;
  }

  function updateContinuarBtn() {
    var btn = qs('bwContinuar');
    if (!btn) return;
    btn.disabled = !(st.cabana && st.checkIn && st.checkOut && st.noches >= 1);
  }

  // ── NAVEGACIÓN ENTRE STEPS ────────────────────────────────────
  function onContinuar() {
    if (!st.cabana || !st.checkIn || !st.checkOut) return;

    // Mini resumen en step 2
    txt('bwMiniCabana', 'CABAÑA ' + st.cabana.nombre.toUpperCase());
    txt('bwMiniFechas', fmtFecha(st.checkIn) + ' → ' + fmtFecha(st.checkOut) +
        ' (' + st.noches + ' noche' + (st.noches > 1 ? 's' : '') + ')');

    var esTrans = st.metodoPago === 'transferencia';

    if (esTrans) {
      txt('bwMiniAbono', 'Total: ' + fmtCLP(st.total) + '  ·  Pago por transferencia');
    } else {
      var esPagoTotal = st.pagoTipo === 'total';
      txt('bwMiniAbono', esPagoTotal
        ? 'Pago total: ' + fmtCLP(st.total)
        : 'Abono hoy: ' + fmtCLP(st.abono) + '  ·  Total: ' + fmtCLP(st.total));

      // Botón de pago dinámico
      var btnTxt = qs('bwBtnPagarTxt');
      if (btnTxt) btnTxt.textContent = (esPagoTotal ? 'Pagar total ' : 'Pagar abono ') +
        fmtCLP(esPagoTotal ? st.total : st.abono) + ' →';
    }

    // Mostrar el botón correcto según método
    var btnPagar = qs('bwPagar');
    var btnTrans = qs('bwPagarTransferencia');
    var disclaimer = document.querySelector('.form-disclaimer');
    if (btnPagar)    btnPagar.hidden    = esTrans;
    if (btnTrans)    btnTrans.hidden    = !esTrans;
    if (disclaimer)  disclaimer.hidden  = esTrans;

    hide('bwPanel1'); show('bwPanel2');
    stepDot(2);

    var top = qs('bookingWidget');
    if (top) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onVolver() {
    hide('bwPanel2'); show('bwPanel1');
    hide('bwPanelError');   // limpiar error al volver
    stepDot(1);
  }

  // ── MÉTODO DE PAGO ─────────────────────────────────────────────
  function onMetodoPagoChange() {
    var el = document.querySelector('input[name="metodoPago"]:checked');
    st.metodoPago = el ? el.value : 'mp';
    var esTrans   = st.metodoPago === 'transferencia';
    var aviso     = qs('bwTransAviso');
    var pagoOpts  = qs('bwPagoOpciones');
    if (aviso)    aviso.hidden    = !esTrans;
    if (pagoOpts) pagoOpts.hidden = esTrans;
  }

  // ── PAGO POR TRANSFERENCIA BANCARIA ──────────────────────────
  function onPagarTransferencia(e) {
    e.preventDefault();
    hide('bwPanelError');

    var nombre    = ((qs('bwNombre')   || {}).value || '').trim();
    var email     = ((qs('bwEmail')    || {}).value || '').trim();
    var telefono  = ((qs('bwTelefono') || {}).value || '').trim();
    var personas  = parseInt(((qs('bwPersonas') || {}).value || ''), 10);
    var mensaje   = ((qs('bwMensaje')  || {}).value || '').trim();
    var aceptaTyC = (qs('bwAceptaTyC') || {}).checked;

    if (!nombre)   { return showError('bwPanelError', 'Por favor ingresa tu nombre.'); }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return showError('bwPanelError', 'Por favor ingresa un correo válido.'); }
    if (!telefono) { return showError('bwPanelError', 'Por favor ingresa tu número de teléfono.'); }
    if (!personas || personas < 1) { return showError('bwPanelError', 'Indica el número de personas.'); }
    if (st.cabana && personas > st.cabana.capacidad) {
      return showError('bwPanelError', 'La cabaña ' + st.cabana.nombre + ' tiene capacidad para ' + st.cabana.capacidad + ' personas.'); }
    if (!aceptaTyC) {
      return showError('bwPanelError', 'Debes aceptar los términos y condiciones para continuar.'); }

    var btn = qs('bwPagarTransferencia');
    if (btn) { btn.disabled = true; btn.classList.add('is-sending'); }

    fetch('/api/reserva-transferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cabana_id:    st.cabana.id,
        check_in:     st.checkIn,
        check_out:    st.checkOut,
        nombre:       nombre,
        email:        email,
        telefono:     telefono || null,
        personas:     personas,
        mensaje:      mensaje || null,
        cupon_codigo: st.cupon ? st.cupon.codigo : null
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.reserva_id) {
        var meses = ['enero','febrero','marzo','abril','mayo','junio',
                     'julio','agosto','septiembre','octubre','noviembre','diciembre'];
        function fechaLong(s) {
          var d = new Date(s + 'T12:00:00');
          return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
        }
        var msg =
          '¡Hola Vichuquén Lodge! 🏡\n\n' +
          'Quiero reservar con transferencia bancaria:\n\n' +
          '🏡 Cabaña: ' + data.cabana + '\n' +
          '📅 Llegada: ' + fechaLong(data.check_in) + '\n' +
          '📅 Salida: ' + fechaLong(data.check_out) + '\n' +
          '🌙 Noches: ' + data.noches + '\n' +
          '👥 Personas: ' + data.personas + '\n' +
          '💰 Total: ' + fmtCLP(data.total) + '\n' +
          '👤 Nombre: ' + data.nombre + '\n' +
          '📱 Teléfono: ' + data.telefono + '\n' +
          '📧 Email: ' + data.email + '\n\n' +
          'Por favor envíame los datos de transferencia.\n' +
          '(ID reserva: ' + data.reserva_id + ')';
        window.location.href = 'https://wa.me/56954177688?text=' + encodeURIComponent(msg);
      } else {
        showError('bwPanelError', data.error || 'Error al procesar la solicitud.');
        if (btn) { btn.disabled = false; btn.classList.remove('is-sending'); }
      }
    })
    .catch(function() {
      showError('bwPanelError', 'Error de conexión. Por favor intenta de nuevo.');
      if (btn) { btn.disabled = false; btn.classList.remove('is-sending'); }
    });
  }

  // ── DESCUENTO 20% EN TARIFA MEDIA PARA ≤3 PERSONAS ──────────
  function aplicarDescuento() {
    if (!st.cabana || !st.baseTotal) return;
    var persEl  = qs('bwPersonas');
    if (!persEl) return;
    var personas = parseInt(persEl.value, 10);
    var elegible = DESCUENTO_CABANAS.indexOf(st.cabana.id) !== -1;
    var conDesc  = elegible && !isNaN(personas) && personas >= 1 && personas <= 3 && st.baseMediaDesc > 0;

    var mediaDescFinal = conDesc ? Math.round(st.baseMediaDesc * 0.8) : st.baseMediaDesc;
    var mediaFinal     = mediaDescFinal + st.baseMediaFixed;
    var subtotal = st.baseAltaBaja + mediaFinal;
    var cuponDesc = calcCuponDescuento(subtotal);
    st.total  = subtotal - cuponDesc;
    st.abono  = Math.ceil(st.total * 0.5 / 1000) * 1000;
    var esPagoTotal = st.pagoTipo === 'total';
    st.pagoHoy = esPagoTotal ? st.total : st.abono;

    var descTag = conDesc ? ' · 🏷️ -20% noches media' : '';
    txt('bwMiniAbono', esPagoTotal
      ? 'Pago total: ' + fmtCLP(st.total) + descTag
      : 'Abono hoy: ' + fmtCLP(st.abono) + '  ·  Total: ' + fmtCLP(st.total) + descTag);

    var btnTxt = qs('bwBtnPagarTxt');
    if (btnTxt) btnTxt.textContent =
      (esPagoTotal ? 'Pagar total ' : 'Pagar abono ') + fmtCLP(st.pagoHoy) + ' →';
  }

  function actualizarFilaCupon(descuento) {
    var fila  = qs('bwFilaCupon');
    var label = qs('bwCuponLabel');
    var valor = qs('bwCalcCupon');
    if (!fila) return;
    if (descuento > 0 && st.cupon) {
      if (label) label.textContent = 'Cupón ' + (st.cupon.codigo || '');
      if (valor) valor.textContent = '−' + fmtCLP(descuento);
      fila.hidden = false;
    } else {
      fila.hidden = true;
    }
  }

  // ── CUPÓN DE DESCUENTO ────────────────────────────────────────
  function onAplicarCupon() {
    var input = qs('bwCuponInput');
    var msg   = qs('bwCuponMsg');
    var btn   = qs('bwCuponBtn');
    if (!input || !msg) return;

    var codigo = input.value.trim().toUpperCase();
    if (!codigo) { msg.textContent = 'Ingresa un código.'; msg.className = 'bw-cupon-msg err'; msg.hidden = false; return; }

    // Validar contra el subtotal antes del cupón
    var subtotalBase = st.baseAltaBaja + st.baseMediaDesc + st.baseMediaFixed;
    if (btn) btn.disabled = true;

    fetch('/api/validar-cupon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: codigo, subtotal: subtotalBase })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (btn) btn.disabled = false;
      if (data.valido) {
        st.cupon = { tipo: data.tipo, valor: data.valor, descripcion: data.descripcion, codigo: codigo };
        // Recalcular total con cupón
        var cuponDesc = calcCuponDescuento(subtotalBase);
        st.total = subtotalBase - cuponDesc;
        st.abono = Math.ceil(st.total * 0.5 / 1000) * 1000;
        actualizarFilaCupon(cuponDesc);
        txt('bwCalcAbono', fmtCLP(st.abono));
        txt('bwCalcSaldo', fmtCLP(st.total - st.abono));
        actualizarPagoOpciones();
        msg.textContent = '✓ ' + data.descripcion + ' aplicado.';
        msg.className = 'bw-cupon-msg ok'; msg.hidden = false;
        if (input) input.disabled = true;
        if (btn)   btn.textContent = 'Aplicado';
      } else {
        st.cupon = null;
        msg.textContent = 'Código no válido o vencido.';
        msg.className = 'bw-cupon-msg err'; msg.hidden = false;
      }
    })
    .catch(function() {
      if (btn) btn.disabled = false;
      msg.textContent = 'Error al validar. Intenta de nuevo.';
      msg.className = 'bw-cupon-msg err'; msg.hidden = false;
    });
  }

  function stepDot(n) {
    [1, 2].forEach(function(i) {
      var dot = qs('bwDot' + i);
      if (!dot) return;
      dot.classList.toggle('active', i === n);
      dot.classList.toggle('done',   i < n);
    });
  }

  // ── PAGO ─────────────────────────────────────────────────────
  function onPagar(e) {
    e.preventDefault();
    hide('bwPanelError');

    var nombre   = ((qs('bwNombre')  || {}).value || '').trim();
    var email    = ((qs('bwEmail')   || {}).value || '').trim();
    var telefono = ((qs('bwTelefono')|| {}).value || '').trim();
    var personas = parseInt(((qs('bwPersonas')|| {}).value || ''), 10);
    var mensaje  = ((qs('bwMensaje') || {}).value || '').trim();
    var aceptaTyC = (qs('bwAceptaTyC') || {}).checked;

    if (!nombre)   { return showError('bwPanelError', 'Por favor ingresa tu nombre.'); }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                     return showError('bwPanelError', 'Por favor ingresa un correo válido.'); }
    if (!telefono) { return showError('bwPanelError', 'Por favor ingresa tu número de teléfono.'); }
    if (!personas || personas < 1) { return showError('bwPanelError', 'Indica el número de personas.'); }
    if (st.cabana && personas > st.cabana.capacidad) {
      return showError('bwPanelError',
        'La cabaña ' + st.cabana.nombre + ' tiene capacidad para ' + st.cabana.capacidad + ' personas.');
    }
    if (!aceptaTyC) {
      return showError('bwPanelError', 'Debes aceptar los términos y condiciones para continuar.');
    }

    var btn = qs('bwPagar');
    if (btn) { btn.disabled = true; btn.classList.add('is-sending'); }

    fetch('/api/create-preference', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cabana_id:    st.cabana.id,
        check_in:     st.checkIn,
        check_out:    st.checkOut,
        nombre:       nombre,
        email:        email,
        telefono:     telefono || null,
        personas:     personas,
        mensaje:      mensaje || null,
        pago_tipo:    st.pagoTipo,
        cupon_codigo: st.cupon ? st.cupon.codigo : null
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        showError('bwPanelError', data.error || 'Error al procesar la reserva. Intenta de nuevo.');
        if (btn) { btn.disabled = false; btn.classList.remove('is-sending'); }
      }
    })
    .catch(function() {
      showError('bwPanelError', 'Error de conexión. Por favor intenta de nuevo.');
      if (btn) { btn.disabled = false; btn.classList.remove('is-sending'); }
    });
  }

  function showError(id, msg) {
    var el = qs(id);
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── ARRANCAR ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBooking);
  } else {
    initBooking();
  }

  // ── BFCache: rehabilitar botones al volver con "atrás" ───────
  // Cuando el browser restaura la página desde caché (back/forward),
  // el DOM queda congelado con los botones deshabilitados.
  // pageshow con persisted=true es el momento exacto para resetearlos.
  window.addEventListener('pageshow', function(e) {
    if (!e.persisted) return;
    var btnMP = qs('bwPagar');
    if (btnMP) { btnMP.disabled = false; btnMP.classList.remove('is-sending'); }
    var btnTrans = qs('bwPagarTransferencia');
    if (btnTrans) { btnTrans.disabled = false; btnTrans.classList.remove('is-sending'); }
  });

})();
