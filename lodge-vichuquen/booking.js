(function () {
  'use strict';

  // ── DATOS DE CABAÑAS ─────────────────────────────────────────
  // Cabañas con 20% descuento para ≤3 personas en temporada baja
  var DESCUENTO_CABANAS = ['c1-tagua','c2-cisne-coscoroba','c5-huala','c6-run-run','c7-pitio'];

  var CABANAS = [
    { id: 'c1-tagua',              nombre: 'Tagua',              capacidad: 5, alta: 119000, baja: 99000 },
    { id: 'c2-cisne-coscoroba',    nombre: 'Cisne Coscoroba',    capacidad: 5, alta: 119000, baja: 99000 },
    { id: 'c3-siete-colores',      nombre: 'Siete Colores',      capacidad: 7, alta: 139000, baja: 119000 },
    { id: 'c4-cisne-cuello-negro', nombre: 'Cisne Cuello Negro', capacidad: 6, alta: 129000, baja: 109000 },
    { id: 'c5-huala',              nombre: 'Huala',              capacidad: 5, alta: 119000, baja: 99000 },
    { id: 'c6-run-run',            nombre: 'Run Run',            capacidad: 5, alta: 119000, baja: 99000 },
    { id: 'c7-pitio',              nombre: 'Pitío',              capacidad: 5, alta: 119000, baja: 99000 },
  ];

  // ── TEMPORADAS ALTA (sincronizar con supabase/setup.sql) ──────
  var TEMPORADAS = [
    { from: '2025-12-01', to: '2026-02-28' },
    { from: '2026-04-02', to: '2026-04-06' },
    { from: '2026-09-15', to: '2026-09-22' },
    { from: '2026-12-01', to: '2027-02-28' },
    { from: '2027-03-25', to: '2027-03-29' },
    { from: '2027-09-15', to: '2027-09-22' }
  ];

  function esTemporadaAlta(dateStr) {
    for (var i = 0; i < TEMPORADAS.length; i++) {
      if (dateStr >= TEMPORADAS[i].from && dateStr <= TEMPORADAS[i].to) return true;
    }
    return false;
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
    baseTotal:  0,   // total antes de aplicar descuento
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
    if (persEl) persEl.addEventListener('input', aplicarDescuento);

    var btnTransfPagar = qs('bwPagarTransferencia');
    if (btnTransfPagar) btnTransfPagar.addEventListener('click', onPagarTransferencia);

    document.querySelectorAll('input[name="metodoPago"]').forEach(function(radio) {
      radio.addEventListener('change', onMetodoPagoChange);
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
        // Colorear días de temporada alta
        if (dayElem.dateObj) {
          var ds = toISODate(dayElem.dateObj);
          if (esTemporadaAlta(ds)) dayElem.classList.add('bw-alta');
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
    var hoy = toISODate(new Date());
    var esAlta = esTemporadaAlta(hoy);
    var precio = esAlta ? st.cabana.alta : st.cabana.baja;
    txt('bwPrecioBase', 'Desde ' + fmtCLP(st.cabana.baja) + ' / noche');
    var badge = qs('bwTemporadaBadge');
    if (badge) {
      badge.textContent = esAlta ? '🌞 Temporada alta' : '🍂 Temporada baja';
      badge.className = 'bw-badge ' + (esAlta ? 'alta' : 'baja');
    }
  }

  // ── CÁLCULO DE PRECIO (día a día, soporta temporadas mixtas) ──
  function calcPrecio() {
    if (!st.cabana || !st.checkIn || !st.checkOut) return;
    var noches = diffDays(st.checkIn, st.checkOut);
    if (noches < 1) { hide('bwResumen'); hide('bwPagoOpciones'); return; }

    // Iterar cada noche para sumar el precio correcto según temporada
    var total = 0;
    var diasAlta = 0;
    var d = new Date(st.checkIn + 'T12:00:00');
    var endD = new Date(st.checkOut + 'T12:00:00');
    while (d < endD) {
      if (esTemporadaAlta(toISODate(d))) { total += st.cabana.alta; diasAlta++; }
      else                               { total += st.cabana.baja; }
      d.setDate(d.getDate() + 1);
    }

    var abono = Math.ceil(total * 0.5 / 1000) * 1000;

    st.noches     = noches;
    st.precio     = Math.round(total / noches);
    st.total      = total;
    st.baseTotal  = total;  // guardar antes de posible descuento
    st.abono      = abono;

    // Descripción: precio mixto o uniforme
    var desc;
    if (diasAlta > 0 && diasAlta < noches) {
      desc = diasAlta + ' noche' + (diasAlta > 1 ? 's' : '') + ' T.Alta + ' +
             (noches - diasAlta) + ' T.Baja';
      var badge = qs('bwTemporadaBadge');
      if (badge) { badge.textContent = '🌗 Temporada mixta'; badge.className = 'bw-badge alta'; }
      txt('bwPrecioBase', 'Desde ' + fmtCLP(st.cabana.baja) + ' / noche');
    } else {
      var esAlta = diasAlta === noches;
      var precioUnit = esAlta ? st.cabana.alta : st.cabana.baja;
      desc = noches + ' noche' + (noches > 1 ? 's' : '') + ' × ' + fmtCLP(precioUnit);
      var badge = qs('bwTemporadaBadge');
      if (badge) {
        badge.textContent = esAlta ? '🌞 Temporada alta' : '🍂 Temporada baja';
        badge.className = 'bw-badge ' + (esAlta ? 'alta' : 'baja');
      }
      txt('bwPrecioBase', fmtCLP(precioUnit) + ' / noche');
    }

    txt('bwCalcDesc',  desc);
    txt('bwCalcTotal', fmtCLP(total));
    txt('bwCalcAbono', fmtCLP(abono));
    txt('bwCalcSaldo', fmtCLP(total - abono));

    actualizarPagoOpciones();

    show('bwResumen');
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
        cabana_id: st.cabana.id,
        check_in:  st.checkIn,
        check_out: st.checkOut,
        nombre: nombre,
        email: email,
        telefono: telefono || null,
        personas: personas,
        mensaje: mensaje || null
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

  // ── DESCUENTO 20% PARA ≤3 PERSONAS ───────────────────────────
  function aplicarDescuento() {
    if (!st.cabana || !st.baseTotal) return;
    var persEl = qs('bwPersonas');
    if (!persEl) return;
    var personas = parseInt(persEl.value, 10);
    var elegible = DESCUENTO_CABANAS.indexOf(st.cabana.id) !== -1;
    var conDesc   = elegible && !isNaN(personas) && personas >= 1 && personas <= 3;

    st.total  = conDesc ? Math.round(st.baseTotal * 0.8) : st.baseTotal;
    st.abono  = Math.ceil(st.total * 0.5 / 1000) * 1000;
    var esPagoTotal = st.pagoTipo === 'total';
    st.pagoHoy = esPagoTotal ? st.total : st.abono;

    var descTag = conDesc ? ' · 🏷️ -20% (≤3 pax)' : '';
    txt('bwMiniAbono', esPagoTotal
      ? 'Total: ' + fmtCLP(st.total) + descTag
      : 'Abono hoy: ' + fmtCLP(st.abono) + '  ·  Total: ' + fmtCLP(st.total) + descTag);

    var btnTxt = qs('bwBtnPagarTxt');
    if (btnTxt) btnTxt.textContent =
      (esPagoTotal ? 'Pagar total ' : 'Pagar abono ') + fmtCLP(st.pagoHoy) + ' →';
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
        cabana_id:  st.cabana.id,
        check_in:   st.checkIn,
        check_out:  st.checkOut,
        nombre:     nombre,
        email:      email,
        telefono:   telefono || null,
        personas:   personas,
        mensaje:    mensaje || null,
        pago_tipo:  st.pagoTipo
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

})();
