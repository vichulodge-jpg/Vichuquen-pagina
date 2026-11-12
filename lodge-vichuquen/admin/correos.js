/**
 * Pestaña "Correos": edita el texto redactado de los correos automáticos
 * (confirmación y pre-llegada). Cada plantilla tiene un interruptor: apagado,
 * se envía el correo de siempre; encendido, lo que está escrito aquí.
 */
(function () {
  'use strict';

  var A = window.LodgeAdmin;
  var UI = window.LodgeUI;
  if (!A || !UI) return;

  var AYUDA_VARIABLES = 'Una variable es un espacio que el sistema rellena con el dato real de cada reserva. ' +
    'Si escribes «Hola {{nombre_huesped}}», a María le llega «Hola María».';
  var AYUDA_INTERRUPTOR = 'Encendido (verde): los correos salen con el texto de esta tarjeta. ' +
    'Apagado: se envía el correo de siempre y lo que escribas aquí queda guardado sin usarse.';

  var variables = [];
  var cargado = false;   // al volver a la pestaña no se recarga: se perdería lo escrito sin guardar

  function qs(id) { return document.getElementById(id); }

  function cargar() {
    qs('plantillasWrap').innerHTML = '<p class="loading">Cargando…</p>';
    A.apiFetch('/api/admin-plantillas').then(function (data) {
      variables = data.variables || [];
      cargado = true;
      render(data.plantillas || []);
    }).catch(function (e) {
      qs('plantillasWrap').innerHTML =
        '<p class="vacio"><strong>No se pudieron cargar las plantillas.</strong>' + A.esc(e.message) + '<br>' +
        '<small>Si es la primera vez, falta ejecutar la migración ' +
        'supabase/migration-reservas-externas.sql en Supabase.</small></p>';
    });
  }

  function textoEstado(activa) {
    return activa
      ? 'En uso: los correos salen con este texto.'
      : 'Sin usar: por ahora se envía el correo de siempre.';
  }

  function tarjetaHTML(p, chips) {
    var id = A.esc(p.id);
    return '<div class="plantilla-card" data-plantilla="' + id + '">' +
      '<div class="plantilla-head">' +
        '<div>' +
          '<h3>' + A.esc(p.nombre) + '</h3>' +
          '<p class="plantilla-estado" data-estado>' + textoEstado(p.activa) + '</p>' +
        '</div>' +
        '<div class="label-fila">' +
          '<label class="switch">' +
            '<input type="checkbox" data-activa ' + (p.activa ? 'checked' : '') + ' />' +
            '<span class="switch-pista"></span>' +
            '<span>Usar este texto</span>' +
          '</label>' +
          UI.ayudaHTML(AYUDA_INTERRUPTOR, 'Qué hace el interruptor') +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="asunto-' + id + '">Asunto</label>' +
        '<input type="text" id="asunto-' + id + '" data-asunto value="' + A.esc(p.asunto) + '" />' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="cuerpo-' + id + '">Texto del correo</label>' +
        '<textarea id="cuerpo-' + id + '" data-cuerpo rows="8">' + A.esc(p.cuerpo) + '</textarea>' +
        '<small class="campo-nota">Se admite HTML sencillo: &lt;p&gt;, &lt;strong&gt;, &lt;br&gt;, &lt;a href&gt;.</small>' +
      '</div>' +
      '<div class="vars-wrap">' +
        '<span class="vars-titulo">Variables: haz clic en una para insertarla donde esté el cursor ' +
          UI.ayudaHTML(AYUDA_VARIABLES, 'Qué es una variable') + '</span>' +
        '<div class="vars-chips">' + chips + '</div>' +
      '</div>' +
      '<div class="plantilla-foot">' +
        '<button class="btn-primary btn-auto" data-guardar>Guardar plantilla</button>' +
        '<span class="plantilla-msg" data-msg role="status"></span>' +
      '</div>' +
    '</div>';
  }

  function render(lista) {
    if (!lista.length) {
      qs('plantillasWrap').innerHTML = '<p class="vacio"><strong>No hay plantillas configuradas.</strong></p>';
      return;
    }
    var chips = variables.map(function (v) {
      var texto = A.esc('{{' + v + '}}');
      return '<button type="button" class="var-chip" data-var="' + texto + '">' + texto + '</button>';
    }).join('');

    qs('plantillasWrap').innerHTML = lista.map(function (p) { return tarjetaHTML(p, chips); }).join('');
    qs('plantillasWrap').querySelectorAll('.plantilla-card').forEach(enlazar);
  }

  function enlazar(card) {
    var id     = card.dataset.plantilla;
    var asunto = card.querySelector('[data-asunto]');
    var cuerpo = card.querySelector('[data-cuerpo]');
    var activa = card.querySelector('[data-activa]');
    var msg    = card.querySelector('[data-msg]');
    var boton  = card.querySelector('[data-guardar]');
    var ultimoFoco = cuerpo;

    function avisarSinGuardar() {
      msg.textContent = 'Hay cambios sin guardar.';
      msg.className = 'plantilla-msg';
    }

    [asunto, cuerpo].forEach(function (campo) {
      campo.addEventListener('focus', function () { ultimoFoco = campo; });
      campo.addEventListener('input', avisarSinGuardar);
    });
    activa.addEventListener('change', avisarSinGuardar);

    card.querySelectorAll('.var-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        insertarEnCursor(ultimoFoco, chip.dataset.var);
        avisarSinGuardar();
      });
    });

    boton.addEventListener('click', function () {
      boton.disabled = true;
      msg.textContent = 'Guardando…';
      msg.className = 'plantilla-msg';

      A.apiFetch('/api/admin-plantillas?id=' + encodeURIComponent(id), {
        method: 'PUT',
        body: { asunto: asunto.value, cuerpo: cuerpo.value, activa: activa.checked }
      }).then(function () {
        card.querySelector('[data-estado]').textContent = textoEstado(activa.checked);
        msg.textContent = activa.checked
          ? '✓ Guardada. Los próximos correos usarán este texto.'
          : '✓ Guardada, pero el interruptor está apagado: se sigue enviando el correo de siempre.';
        msg.className = 'plantilla-msg ok';
      }).catch(function (e) {
        msg.textContent = 'No se pudo guardar: ' + e.message;
        msg.className = 'plantilla-msg error';
      }).then(function () { boton.disabled = false; });
    });
  }

  function insertarEnCursor(campo, texto) {
    var ini = campo.selectionStart, fin = campo.selectionEnd;
    if (ini == null) { campo.value += texto; return; }
    campo.value = campo.value.slice(0, ini) + texto + campo.value.slice(fin);
    campo.focus();
    campo.selectionStart = campo.selectionEnd = ini + texto.length;
  }

  qs('btnRefreshPlantillas').addEventListener('click', cargar);
  document.querySelector('.tab[data-tab="correos"]').addEventListener('click', function () {
    if (!cargado) cargar();
  });
})();
