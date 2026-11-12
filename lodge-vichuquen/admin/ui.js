/**
 * Piezas de interfaz que usan todas las pestañas del panel:
 *   - burbujas de información (los botones "?"),
 *   - avisos flotantes,
 *   - diálogos de confirmación (reemplazan a confirm() y alert()),
 *   - enlaces "¿Cómo se usa?" que llevan a una sección del manual.
 *
 * Se carga antes que admin.js y no depende de él.
 */
(function () {
  'use strict';

  var MARGEN = 12;            // separación mínima entre la burbuja y el borde de la ventana
  var SEPARACION = 9;         // distancia entre el botón "?" y su burbuja
  var TOAST_MS = 6000;
  var TOAST_LARGO_MS = 10000; // los avisos y errores se dejan más tiempo: hay que leerlos

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── BURBUJAS DE INFORMACIÓN ──────────────────────────────────
  var burbuja = null;
  var botonActivo = null;     // el "?" cuya burbuja está a la vista
  var fijada = false;         // true si se abrió con clic: no se cierra al sacar el mouse

  function crearBurbuja() {
    var el = document.createElement('div');
    el.className = 'ayuda-burbuja';
    el.id = 'ayudaBurbuja';
    el.setAttribute('role', 'tooltip');
    document.body.appendChild(el);
    return el;
  }

  function mostrarBurbuja(boton) {
    if (!boton.dataset.ayuda) return;
    if (!burbuja) burbuja = crearBurbuja();
    if (botonActivo && botonActivo !== boton) soltarBoton(botonActivo);

    botonActivo = boton;
    burbuja.textContent = boton.dataset.ayuda;
    boton.setAttribute('aria-describedby', 'ayudaBurbuja');
    boton.setAttribute('aria-expanded', 'true');
    ubicarBurbuja(boton);
    burbuja.classList.add('visible');
  }

  /** Debajo del botón si cabe; si no, encima. Nunca fuera de la ventana. */
  function ubicarBurbuja(boton) {
    var b = boton.getBoundingClientRect();
    var ancho = burbuja.offsetWidth, alto = burbuja.offsetHeight;
    var centro = b.left + b.width / 2;

    var x = Math.min(Math.max(MARGEN, centro - ancho / 2), window.innerWidth - ancho - MARGEN);
    var cabeAbajo = b.bottom + SEPARACION + alto + MARGEN <= window.innerHeight;
    var y = cabeAbajo ? b.bottom + SEPARACION : Math.max(MARGEN, b.top - SEPARACION - alto);

    burbuja.style.left = x + 'px';
    burbuja.style.top  = y + 'px';
    burbuja.style.setProperty('--flecha-x', (centro - x) + 'px');
    burbuja.classList.toggle('abajo', cabeAbajo);
    burbuja.classList.toggle('arriba', !cabeAbajo);
  }

  function soltarBoton(boton) {
    boton.removeAttribute('aria-describedby');
    boton.setAttribute('aria-expanded', 'false');
  }

  function ocultarBurbuja() {
    if (!botonActivo) return false;
    soltarBoton(botonActivo);
    botonActivo = null;
    fijada = false;
    if (burbuja) burbuja.classList.remove('visible');
    return true;
  }

  function botonAyuda(nodo) {
    return nodo && nodo.closest ? nodo.closest('.ayuda[data-ayuda]') : null;
  }

  // Delegado en el documento: así también funcionan los "?" que se dibujan después.
  document.addEventListener('mouseover', function (e) {
    var boton = botonAyuda(e.target);
    if (boton && !fijada) mostrarBurbuja(boton);
  });
  document.addEventListener('mouseout', function (e) {
    if (botonAyuda(e.target) && !fijada) ocultarBurbuja();
  });
  document.addEventListener('focusin', function (e) {
    var boton = botonAyuda(e.target);
    if (boton && !fijada) mostrarBurbuja(boton);
  });
  document.addEventListener('focusout', function (e) {
    if (botonAyuda(e.target)) ocultarBurbuja();
  });
  document.addEventListener('click', function (e) {
    var boton = botonAyuda(e.target);
    if (!boton) { ocultarBurbuja(); return; }
    e.preventDefault();
    if (fijada && botonActivo === boton) { ocultarBurbuja(); return; }
    mostrarBurbuja(boton);
    fijada = true;
  });
  window.addEventListener('scroll', ocultarBurbuja, true);
  window.addEventListener('resize', ocultarBurbuja);

  /** HTML de un botón "?" para insertarlo en lo que dibujan las pestañas. */
  function ayudaHTML(texto, etiqueta) {
    return '<button type="button" class="ayuda" aria-label="' + esc(etiqueta || 'Más información') +
           '" data-ayuda="' + esc(texto) + '">?</button>';
  }

  // ── AVISO FLOTANTE ───────────────────────────────────────────
  var toastTimer = null;

  /** @param {string} mensaje  @param {'ok'|'aviso'|'error'|''} [tipo] */
  function toast(mensaje, tipo) {
    // La caja ya existe en index.html: un lector de pantalla solo anuncia los
    // cambios de una región que estaba ahí antes de recibir el texto.
    var caja = document.getElementById('adminToast');
    if (!caja) return;
    caja.className = 'admin-toast ' + (tipo || '');
    caja.textContent = mensaje;
    caja.hidden = false;
    clearTimeout(toastTimer);
    var largo = tipo === 'error' || tipo === 'aviso';
    toastTimer = setTimeout(function () { caja.hidden = true; }, largo ? TOAST_LARGO_MS : TOAST_MS);
  }

  // ── DIÁLOGO DE CONFIRMACIÓN ──────────────────────────────────
  var cerrarDialogo = null;   // función que cierra el diálogo abierto, si hay uno

  /**
   * Pregunta antes de una acción con consecuencias. El botón de aceptar va en
   * verde o en rojo según lo que haga, y el foco parte en el botón que no
   * cambia nada: un Enter apurado nunca cancela una reserva.
   *
   * @param {{titulo: string, texto: string, aceptar: string, cancelar?: string, tipo?: 'ok'|'peligro'}} op
   * @returns {Promise<boolean>} true si la persona aceptó
   */
  function confirmar(op) {
    if (cerrarDialogo) cerrarDialogo(false);
    var peligro = op.tipo === 'peligro';
    var anterior = document.activeElement;

    var raiz = document.createElement('div');
    raiz.className = 'dialogo';
    raiz.innerHTML =
      '<div class="dialogo-fondo"></div>' +
      '<div class="dialogo-caja' + (peligro ? ' dialogo-peligro' : '') + '" role="alertdialog" ' +
        'aria-modal="true" aria-labelledby="dlgTitulo" aria-describedby="dlgTexto">' +
        '<div class="dialogo-icono" aria-hidden="true">' + (peligro ? '!' : '✓') + '</div>' +
        '<h2 id="dlgTitulo">' + esc(op.titulo) + '</h2>' +
        '<p id="dlgTexto">' + esc(op.texto) + '</p>' +
        '<div class="dialogo-botones">' +
          '<button type="button" class="btn-ghost" data-dlg="no">' + esc(op.cancelar || 'No, volver') + '</button>' +
          '<button type="button" class="' + (peligro ? 'btn-danger btn-danger-solido' : 'btn-primary') +
            '" data-dlg="si">' + esc(op.aceptar) + '</button>' +
        '</div>' +
      '</div>';

    return new Promise(function (resolver) {
      var botonNo = raiz.querySelector('[data-dlg="no"]');
      var botonSi = raiz.querySelector('[data-dlg="si"]');

      function cerrar(respuesta) {
        cerrarDialogo = null;
        raiz.remove();
        if (anterior && anterior.focus && document.contains(anterior)) anterior.focus();
        resolver(respuesta);
      }
      cerrarDialogo = cerrar;

      botonNo.addEventListener('click', function () { cerrar(false); });
      botonSi.addEventListener('click', function () { cerrar(true); });
      raiz.querySelector('.dialogo-fondo').addEventListener('click', function () { cerrar(false); });

      // El foco no sale del diálogo mientras esté abierto.
      raiz.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        (document.activeElement === botonNo ? botonSi : botonNo).focus();
      });

      document.body.appendChild(raiz);
      botonNo.focus();
    });
  }

  // Escape cierra primero lo que esté más arriba (burbuja, luego diálogo) y no
  // deja que la misma tecla cierre además el formulario de reserva de abajo.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (ocultarBurbuja()) { e.stopImmediatePropagation(); return; }
    if (cerrarDialogo)    { e.stopImmediatePropagation(); cerrarDialogo(false); }
  });

  // ── ENLACES AL MANUAL Y ATAJOS ENTRE PESTAÑAS ────────────────
  function irA(pestana) {
    var boton = document.querySelector('.tab[data-tab="' + pestana + '"]');
    if (boton) boton.click();
  }

  document.addEventListener('click', function (e) {
    var origen = e.target.closest ? e.target.closest('[data-manual], [data-ir]') : null;
    if (!origen) return;

    if (origen.dataset.ir) { irA(origen.dataset.ir); window.scrollTo(0, 0); return; }

    irA('manual');
    var destino = document.getElementById(origen.dataset.manual);
    if (destino) destino.scrollIntoView({ block: 'start' });
  });

  var btnImprimirManual = document.getElementById('btnImprimirManual');
  if (btnImprimirManual) {
    btnImprimirManual.addEventListener('click', function () {
      // Al imprimir, las preguntas frecuentes van todas abiertas.
      document.querySelectorAll('#tabManual details').forEach(function (d) { d.open = true; });
      window.print();
    });
  }

  window.LodgeUI = {
    esc: esc,
    toast: toast,
    confirmar: confirmar,
    /** Cierra el diálogo de confirmación abierto, si hay uno, respondiendo "no". */
    cerrarDialogo: function () { if (cerrarDialogo) cerrarDialogo(false); },
    ayudaHTML: ayudaHTML,
    irA: irA
  };
})();
