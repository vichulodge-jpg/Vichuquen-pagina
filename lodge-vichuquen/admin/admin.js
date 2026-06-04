(function () {
  'use strict';

  var secret = '';

  // ── AUTH ──────────────────────────────────────────────────────
  function qs(id) { return document.getElementById(id); }

  qs('secretInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') qs('btnLogin').click();
  });

  qs('btnLogin').addEventListener('click', function() {
    var val = (qs('secretInput').value || '').trim();
    if (!val) return;
    secret = val;
    sessionStorage.setItem('admin_secret', val);
    verifyAndLogin();
  });

  qs('btnLogout').addEventListener('click', function() {
    secret = '';
    sessionStorage.removeItem('admin_secret');
    qs('adminPanel').hidden = true;
    qs('loginScreen').hidden = false;
  });

  function verifyAndLogin() {
    apiFetch('/api/admin-reservas?estado=confirmada')
      .then(function(data) {
        if (Array.isArray(data)) {
          showPanel();
        } else {
          showLoginError();
        }
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
    return fetch(url, opts).then(function(r) {
      if (r.status === 401) { showLoginError(); throw new Error('401'); }
      return r.json();
    });
  }

  // ── TABS ─────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.hidden = true; });
      tab.classList.add('active');
      var panel = qs('tab' + capitalize(tab.dataset.tab));
      if (panel) panel.hidden = false;
    });
  });

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ── RESERVAS ─────────────────────────────────────────────────
  var reservasData = [];

  function loadReservas() {
    var estado = qs('filtroEstado').value;
    var cabana = qs('filtroCabana').value;
    var url = '/api/admin-reservas';
    var params = [];
    if (estado) params.push('estado=' + encodeURIComponent(estado));
    if (cabana) params.push('cabana=' + encodeURIComponent(cabana));
    if (params.length) url += '?' + params.join('&');

    qs('reservasTbody').innerHTML = '<tr><td colspan="10" class="loading">Cargando…</td></tr>';

    apiFetch(url).then(function(data) {
      reservasData = Array.isArray(data) ? data : [];
      renderReservas();
    }).catch(function() {
      qs('reservasTbody').innerHTML = '<tr><td colspan="11" class="loading">Error al cargar.</td></tr>';
    });
  }

  function renderReservas() {
    qs('reservasCount').textContent = reservasData.length + ' reserva' + (reservasData.length !== 1 ? 's' : '');
    if (!reservasData.length) {
      qs('reservasTbody').innerHTML = '<tr><td colspan="11" class="loading">Sin resultados.</td></tr>';
      return;
    }
    qs('reservasTbody').innerHTML = reservasData.map(function(r) {
      return '<tr>' +
        '<td>' + cabanaShort(r.cabana_id) + '</td>' +
        '<td><strong>' + esc(r.nombre) + '</strong><br><small>' + esc(r.email) + '</small></td>' +
        '<td>' + waCell(r.telefono) + '</td>' +
        '<td>' + fmtDate(r.check_in)  + '</td>' +
        '<td>' + fmtDate(r.check_out) + '</td>' +
        '<td>' + r.personas + '</td>' +
        '<td>' + fmtCLP(r.total) + '</td>' +
        '<td>' + fmtCLP(r.abono) + '</td>' +
        '<td><span class="badge badge-' + r.estado + '">' + r.estado + '</span></td>' +
        '<td>' + fmtDatetime(r.created_at) + '</td>' +
        '<td>' + accionesReserva(r) + '</td>' +
        '</tr>';
    }).join('');

    // Bind action buttons
    qs('reservasTbody').querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id;
        var estado = btn.dataset.action;
        if (!confirm('¿Cambiar estado a "' + estado + '"?')) return;
        apiFetch('/api/admin-reservas?id=' + encodeURIComponent(id), {
          method: 'PATCH',
          body: { estado: estado }
        }).then(function() { loadReservas(); });
      });
    });
  }

  function accionesReserva(r) {
    var btns = [];
    if (r.estado === 'pendiente')  btns.push(btnAction(r.id, 'confirmada', 'Confirmar', 'btn-secondary'));
    if (r.estado !== 'cancelada')  btns.push(btnAction(r.id, 'cancelada',  'Cancelar',  'btn-danger'));
    return btns.join(' ');
  }

  function btnAction(id, estado, label, cls) {
    return '<button class="' + cls + '" data-action="' + estado + '" data-id="' + id + '">' + label + '</button>';
  }

  qs('btnRefreshReservas').addEventListener('click', loadReservas);
  qs('filtroEstado').addEventListener('change', loadReservas);
  qs('filtroCabana').addEventListener('change', loadReservas);

  // ── BLOQUEOS ─────────────────────────────────────────────────
  function loadBloqueos() {
    qs('bloqueosTbody').innerHTML = '<tr><td colspan="6" class="loading">Cargando…</td></tr>';
    apiFetch('/api/admin-bloqueos').then(function(data) {
      renderBloqueos(Array.isArray(data) ? data : []);
    }).catch(function() {
      qs('bloqueosTbody').innerHTML = '<tr><td colspan="6" class="loading">Error al cargar.</td></tr>';
    });
  }

  function renderBloqueos(data) {
    if (!data.length) {
      qs('bloqueosTbody').innerHTML = '<tr><td colspan="6" class="loading">Sin bloqueos activos.</td></tr>';
      return;
    }
    qs('bloqueosTbody').innerHTML = data.map(function(b) {
      return '<tr>' +
        '<td>' + cabanaShort(b.cabana_id) + '</td>' +
        '<td>' + fmtDate(b.fecha_inicio) + '</td>' +
        '<td>' + fmtDate(b.fecha_fin)    + '</td>' +
        '<td><span class="motivo-badge">' + b.motivo + '</span></td>' +
        '<td>' + fmtDatetime(b.created_at) + '</td>' +
        '<td><button class="btn-danger" data-blid="' + b.id + '">Eliminar</button></td>' +
        '</tr>';
    }).join('');

    qs('bloqueosTbody').querySelectorAll('[data-blid]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (!confirm('¿Eliminar este bloqueo?')) return;
        apiFetch('/api/admin-bloqueos?id=' + encodeURIComponent(btn.dataset.blid), { method: 'DELETE' })
          .then(loadBloqueos);
      });
    });
  }

  qs('btnRefreshBloqueos').addEventListener('click', loadBloqueos);

  qs('btnAgregarBloqueo').addEventListener('click', function() {
    hide('blError'); hide('blOk');
    var cabana  = qs('blCabana').value;
    var desde   = qs('blDesde').value;
    var hasta   = qs('blHasta').value;
    var motivo  = qs('blMotivo').value;

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
    }).then(function() {
      showMsg('blOk', 'Bloqueo agregado correctamente.');
      qs('blCabana').value = '';
      qs('blDesde').value  = '';
      qs('blHasta').value  = '';
      loadBloqueos();
    }).catch(function() {
      showMsg('blError', 'Error al guardar el bloqueo.');
    });
  });

  // ── HELPERS ──────────────────────────────────────────────────
  function fmtCLP(n) { return '$' + Number(n).toLocaleString('es-CL'); }

  function fmtDate(s) {
    if (!s) return '—';
    var d = new Date(s + 'T12:00:00');
    return d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear();
  }

  function fmtDatetime(s) {
    if (!s) return '—';
    var d = new Date(s);
    return d.getDate() + '/' + (d.getMonth()+1) + '/' + d.getFullYear() +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function pad(n) { return n < 10 ? '0' + n : n; }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  var CABANA_NAMES = {
    'c1-tagua': 'Tagua', 'c2-cisne-coscoroba': 'Cisne Coscoroba',
    'c3-siete-colores': 'Siete Colores', 'c4-cisne-cuello-negro': 'Cisne Cuello Negro',
    'c5-huala': 'Huala', 'c6-run-run': 'Run Run', 'c7-pitio': 'Pitío', 'c8-garza-cuca': 'Garza Cuca'
  };
  function cabanaShort(id) { return CABANA_NAMES[id] || id; }

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
