// ─────────────────────────────────────────────────────────────────────────────
//  Vichuquén Lodge y Marina — Email Sender
//
//  INSTRUCCIONES DE DESPLIEGUE:
//  1. Ir a https://script.google.com → Nuevo proyecto
//  2. Pegar este código completo (reemplazar el contenido por defecto)
//  3. Guardar (Ctrl+S) con nombre "VichuquenEmailSender"
//  4. Menú: Implementar → Nueva implementación
//     - Tipo: Aplicación web
//     - Ejecutar como: Yo (vichulodge@gmail.com)
//     - Quién tiene acceso: Cualquier usuario
//  5. Hacer clic en "Implementar" → Copiar la URL de la aplicación web
//  6. En Vercel → Settings → Environment Variables:
//     - GAS_URL = <URL copiada>
//     - GAS_SECRET = <una clave secreta que tú elijas>
//  4. En Apps Script: Configuración del proyecto > Propiedades del script,
//     agregar la propiedad GAS_SECRET con esa misma clave.
// ─────────────────────────────────────────────────────────────────────────────

var LODGE_EMAIL  = 'vichulodge@gmail.com';
var LODGE_NOMBRE = 'Vichuquén Lodge y Marina';
// La clave compartida con Vercel NO va escrita aquí: este archivo está en un
// repositorio público. Se guarda en las propiedades del script.
//   Apps Script > Configuración del proyecto > Propiedades del script
//   Propiedad: GAS_SECRET   Valor: la misma que la variable GAS_SECRET en Vercel
function obtenerSecreto() {
  var s = PropertiesService.getScriptProperties().getProperty('GAS_SECRET');
  if (!s) {
    throw new Error('Falta la propiedad GAS_SECRET en Configuración del proyecto de Apps Script');
  }
  return s;
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    if (payload.secret !== obtenerSecreto()) {
      return jsonOut({ ok: false, error: 'unauthorized' });
    }

    var tipo = payload.tipo;

    if (tipo === 'confirmacion_mp') {
      enviarHuespedConfirmacion(payload);
      enviarLodgeNotificacion(payload);
    } else if (tipo === 'confirmacion_externa') {
      // Reserva cargada a mano en el panel (Booking, Airbnb, WhatsApp…).
      // Es el mismo correo de confirmación que recibe quien reserva por la web;
      // no se avisa al lodge porque fue el propio lodge quien la ingresó.
      enviarHuespedConfirmacion(payload);
    } else if (tipo === 'solicitud_transferencia') {
      enviarHuespedTransferencia(payload);
      enviarLodgeSolicitudTransferencia(payload);
    } else if (tipo === 'pre_llegada') {
      enviarHuespedPreLlegada(payload);
    }

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: err.toString() });
  }
}

// ── Email al huésped: reserva confirmada ─────────────────────────────────────
// Sirve tanto para el pago por MercadoPago como para las reservas que el lodge
// carga a mano en el panel. Si el administrador activó su plantilla en el
// panel, llegan aquí como asunto_custom / cuerpo_custom y reemplazan el texto
// de abajo; la tabla de la reserva y el pie los sigue armando el sistema.
function enviarHuespedConfirmacion(p) {
  var subject = p.asunto_custom ||
    '¡Tu reserva está confirmada! — Vichuquén Lodge y Marina';

  var intro = p.cuerpo_custom ||
    ('<p>Hola <strong>' + p.nombre + '</strong>,</p>' +
     '<p>¡Gracias por elegirnos!</p>' +
     '<p>Tu pago fue recibido correctamente.</p>' +
     '<p><strong> Detalles de tu reserva:</strong></p>');

  // El aviso del saldo solo tiene sentido si efectivamente queda saldo.
  var avisoSaldo = Number(p.saldo || 0) > 0
    ? 'Importante: recuerda que debes completar el saldo pendiente de <strong>' +
      fmtClp(p.saldo) + '</strong> a más tardar 5 días antes de tu fecha de llegada.<br>'
    : '';

  var footer =
    '<p style="font-size:13px;color:#5A6B78;margin-top:20px;">' + avisoSaldo +
    'Si tienes dudas o necesitas asistencia, contáctanos por ' +
    '<a href="https://wa.me/56954177688" style="color:#273852;">WhatsApp</a> ' +
    'o responde este correo.</p>';

  MailApp.sendEmail({
    to:        p.email,
    subject:   subject,
    htmlBody:  buildEmailBase('¡Reserva confirmada!', intro, buildTablaResumen(p, true), footer),
    name:      LODGE_NOMBRE,
    replyTo:   LODGE_EMAIL
  });
}

// ── Email al lodge: notificación de nueva reserva (MercadoPago) ──────────────
function enviarLodgeNotificacion(p) {
  var subject = '🏡 Nueva reserva — ' + p.nombre + ' · ' + p.cabana;
  var intro = '<p>Nuevo pago confirmado vía MercadoPago.</p>';
  var tabla = buildTabla([
    ['ID Reserva',  p.reserva_id],
    ['Huésped',     p.nombre],
    ['Email',       p.email],
    ['Teléfono',    p.telefono || '—'],
    ['Canal',       p.canal || 'Página web'],
    ['Cabaña',      p.cabana],
    ['Llegada',     fmtFecha(p.check_in)],
    ['Salida',      fmtFecha(p.check_out)],
    ['Noches',      String(p.noches)],
    ['Personas',    String(p.personas)],
    ['Total',       fmtClp(p.total)],
    ['Abono pagado', fmtClp(p.abono)],
    ['Saldo',       fmtClp(p.saldo)],
    ['Mensaje',     p.mensaje || '—']
  ]);

  MailApp.sendEmail({
    to:       LODGE_EMAIL,
    subject:  subject,
    htmlBody: buildEmailBase('Nueva reserva confirmada', intro, tabla, ''),
    name:     'Sistema de Reservas'
  });
}

// ── Email al lodge: nueva solicitud de transferencia ─────────────────────────
function enviarLodgeSolicitudTransferencia(p) {
  var subject = '💸 Nueva solicitud de transferencia — ' + p.nombre + ' · ' + p.cabana;
  var intro =
    '<p>Nueva solicitud de reserva por transferencia bancaria.<br>' +
    '<strong>El huésped aún no ha confirmado el pago.</strong> Contáctalo para coordinar la transferencia.</p>';
  var tabla = buildTabla([
    ['ID Reserva', p.reserva_id],
    ['Huésped',    p.nombre],
    ['Email',      p.email],
    ['Teléfono',   p.telefono || '—'],
    ['Cabaña',     p.cabana],
    ['Llegada',    fmtFecha(p.check_in)],
    ['Salida',     fmtFecha(p.check_out)],
    ['Noches',     String(p.noches)],
    ['Personas',   String(p.personas)],
    ['Total',      fmtClp(p.total)],
    ['Abono (50%)', fmtClp(p.abono)],
    ['Mensaje',    p.mensaje || '—']
  ]);
  var footer =
    '<p style="font-size:13px;color:#5A6B78;margin-top:20px;">' +
    'Las fechas están bloqueadas por 5 minutos. Si no se confirma la transferencia, ' +
    'quedarán disponibles nuevamente.</p>';

  MailApp.sendEmail({
    to:       LODGE_EMAIL,
    subject:  subject,
    htmlBody: buildEmailBase('Nueva solicitud de transferencia', intro, tabla, footer),
    name:     'Sistema de Reservas'
  });
}

// ── Email al huésped: solicitud de transferencia recibida ─────────────────────
function enviarHuespedTransferencia(p) {
  var subject = 'Solicitud de reserva recibida — Vichuquén Lodge y Marina';
  var intro =
    '<p>Hola <strong>' + p.nombre + '</strong>,</p>' +
    '<p>Hemos recibido tu solicitud de reserva por transferencia bancaria. ' +
    'En breve te contactaremos vía WhatsApp con los datos de la cuenta para realizar el pago.</p>';
  var footer =
    '<p style="font-size:13px;color:#5A6B78;margin-top:20px;">' +
    '<strong>Importante:</strong> La disponibilidad queda bloqueada temporalmente mientras ' +
    'confirmamos tu transferencia.<br>' +
    '¿Consultas? Escríbenos directamente por ' +
    '<a href="https://wa.me/56954177688" style="color:#273852;">WhatsApp al +56 9 5417 7688</a>.</p>';

  MailApp.sendEmail({
    to:        p.email,
    subject:   subject,
    htmlBody:  buildEmailBase('Solicitud recibida', intro, buildTablaResumen(p, false), footer),
    name:      LODGE_NOMBRE,
    replyTo:   LODGE_EMAIL
  });
}

// ── Email al huésped: información pre-llegada ─────────────────────────────────
// El correo lleva las dos láminas que diseñó el lodge, tal cual. La primera se
// pide a /api/bienvenida, que escribe los datos de la reserva sobre la plantilla
// sin alterar el diseño. Debajo, en bloque aparte, el saldo pendiente y los
// enlaces: los QR de la lámina no sirven en un correo que se lee en el mismo
// teléfono con el que habría que escanearlos.

var SITIO    = 'https://www.vichuquenlodgeymarina.cl';
var URL_MAPS = 'https://www.google.com/maps/place/Vichuquen+Lodge+y+Marina/@-34.7857666,-72.0735737,17z';
var URL_IG   = 'https://www.instagram.com/vichuquen_lodgeymarina/';
var URL_FB   = 'https://www.facebook.com/vichuquen_lodgeymarina/';
var URL_WA   = 'https://wa.me/56954177688';

var COLOR_NAVY  = '#263852';
var COLOR_ORO   = '#CEAC87';
var COLOR_CREMA = '#FFF8EE';

function enviarHuespedPreLlegada(p) {
  var subject = p.asunto_custom ||
    ('¡Ya falta muy poco! Tu llegada a Vichuquén Lodge el ' + fmtFecha(p.check_in));

  var imagenes = {};
  var laminas  = '';

  var bienvenida = descargarImagen(urlBienvenida(p), 'bienvenida.jpg');
  if (bienvenida) {
    imagenes.bienvenida = bienvenida;
    laminas += etiquetaLamina('bienvenida', 'Datos de tu reserva — Vichuquén Lodge y Marina');
  }

  var informacion = descargarImagen(SITIO + '/assets/plantillas/informacion-correo.jpg', 'informacion.jpg');
  if (informacion) {
    imagenes.informacion = informacion;
    laminas += etiquetaLamina('informacion', 'Información para tu estadía');
  }

  // Si alguna lámina no se pudo obtener, el correo igual sale con los datos.
  if (!laminas) laminas = respaldoTexto(p);

  MailApp.sendEmail({
    to:           p.email,
    subject:      subject,
    htmlBody:     cuerpoPreLlegada(p, laminas),
    inlineImages: imagenes,
    name:         LODGE_NOMBRE,
    replyTo:      LODGE_EMAIL
  });
}

// ── Obtención de las láminas ─────────────────────────────────────────────────

function urlBienvenida(p) {
  return SITIO + '/api/bienvenida'
    + '?secret='    + encodeURIComponent(obtenerSecreto())
    + '&nombre='    + encodeURIComponent(p.nombre)
    + '&cabana='    + encodeURIComponent(p.cabana)
    + '&check_in='  + encodeURIComponent(p.check_in)
    + '&check_out=' + encodeURIComponent(p.check_out)
    + '&noches='    + encodeURIComponent(p.noches)
    + '&personas='  + encodeURIComponent(p.personas);
}

function descargarImagen(url, nombre) {
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) {
      console.error('pre-llegada: %s respondió %s', nombre, r.getResponseCode());
      return null;
    }
    return r.getBlob().setName(nombre);
  } catch (e) {
    console.error('pre-llegada: no se pudo descargar %s — %s', nombre, e.message);
    return null;
  }
}

function etiquetaLamina(cid, alt) {
  return '<img src="cid:' + cid + '" alt="' + alt + '" width="600" ' +
         'style="width:100%;max-width:600px;height:auto;display:block;border:0;margin:0 0 14px;">';
}

function respaldoTexto(p) {
  return '<p style="margin:0 0 12px;font-size:14px;color:#18262E;">' +
    'No pudimos adjuntar la información gráfica de tu llegada. Estos son tus datos:</p>' +
    buildTabla([
      ['Cabaña',   p.cabana],
      ['Llegada',  fmtFecha(p.check_in)],
      ['Salida',   fmtFecha(p.check_out)],
      ['Noches',   String(p.noches)],
      ['Huéspedes', String(p.personas)]
    ]) +
    '<p style="margin:12px 0 0;font-size:13px;color:#5A6B78;">' +
    'Escríbenos por WhatsApp al <a href="' + URL_WA + '" style="color:' + COLOR_NAVY + ';">+56 9 5417 7688</a> ' +
    'y te la reenviamos.</p>';
}

// ── Cuerpo del correo ────────────────────────────────────────────────────────

function cuerpoPreLlegada(p, laminas) {
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:' + COLOR_CREMA + ';',
      'font-family:Helvetica,Arial,sans-serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">',
    '<tr><td align="center" style="padding:24px 12px;">',
    '<table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;">',

    '<tr><td style="padding:0 0 16px;font-size:14px;color:#18262E;line-height:1.6;">',
      // Texto editable desde el panel; si no hay, el de siempre.
      (p.cuerpo_custom ||
        ('¡Hola, <strong>' + p.nombre + '</strong>! Ya queda muy poco para recibirte. ' +
         'Aquí va todo lo que necesitas saber antes de tu llegada.')),
    '</td></tr>',

    '<tr><td>' + laminas + '</td></tr>',

    '<tr><td>' + bloqueSaldo(p) + '</td></tr>',
    '<tr><td>' + bloqueEnlaces() + '</td></tr>',

    '<tr><td style="padding:18px 0 0;font-size:12px;color:#5A6B78;text-align:center;">',
      'Si tienes cualquier duda, responde este correo o escríbenos por WhatsApp.',
    '</td></tr>',

    '</table></td></tr></table></body></html>'
  ].join('');
}

// ── Bloque aparte: saldo pendiente ───────────────────────────────────────────

function bloqueSaldo(p) {
  var saldo = Number(p.saldo || 0);
  if (!(saldo > 0)) return '';

  return '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" ' +
      'style="background:#fff;border:1px solid ' + COLOR_ORO + ';border-radius:10px;margin:4px 0 14px;">' +
    '<tr><td style="padding:16px 20px;">' +
      '<p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:2px;' +
        'text-transform:uppercase;color:' + COLOR_NAVY + ';">Saldo pendiente</p>' +
      '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" ' +
        'style="font-size:13px;color:#18262E;">' +
        '<tr><td style="padding:3px 0;">Total de la estadía</td>' +
            '<td align="right" style="padding:3px 0;">' + fmtClp(p.total) + '</td></tr>' +
        '<tr><td style="padding:3px 0;">Abono pagado</td>' +
            '<td align="right" style="padding:3px 0;">− ' + fmtClp(p.abono) + '</td></tr>' +
        '<tr><td style="padding:9px 0 0;border-top:1px solid #E2D5C2;font-weight:700;' +
              'color:' + COLOR_NAVY + ';">Saldo al llegar</td>' +
            '<td align="right" style="padding:9px 0 0;border-top:1px solid #E2D5C2;' +
              'font-weight:700;color:' + COLOR_NAVY + ';">' + fmtClp(saldo) + '</td></tr>' +
      '</table>' +
      '<p style="margin:12px 0 0;font-size:12px;color:#5A6B78;line-height:1.5;">' +
        'Puedes pagarlo al momento del check-in. Si prefieres adelantarlo por transferencia, ' +
        'escríbenos por WhatsApp.</p>' +
    '</td></tr></table>';
}

// ── Bloque aparte: enlaces (los QR de la lámina no son tocables) ──────────────

function bloqueEnlaces() {
  return '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" ' +
      'style="background:' + COLOR_NAVY + ';border-radius:10px;">' +
    '<tr><td style="padding:18px 20px;text-align:center;">' +
      '<p style="margin:0 0 12px;color:' + COLOR_ORO + ';font-size:11px;letter-spacing:2px;' +
        'text-transform:uppercase;">Enlaces directos</p>' +
      '<p style="margin:0;font-size:13px;line-height:2;">' +
        '<a href="' + URL_MAPS + '" style="color:#fff;text-decoration:none;">Cómo llegar</a>' +
        '<span style="color:' + COLOR_ORO + ';padding:0 8px;">·</span>' +
        '<a href="' + URL_WA + '" style="color:#fff;text-decoration:none;">WhatsApp</a>' +
        '<span style="color:' + COLOR_ORO + ';padding:0 8px;">·</span>' +
        '<a href="' + URL_IG + '" style="color:#fff;text-decoration:none;">Instagram</a>' +
        '<span style="color:' + COLOR_ORO + ';padding:0 8px;">·</span>' +
        '<a href="' + URL_FB + '" style="color:#fff;text-decoration:none;">Facebook</a>' +
      '</p>' +
    '</td></tr></table>';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildTablaResumen(p, incluirAbono) {
  var filas = [
    ['Cabaña',        p.cabana],
    ['Llegada',       fmtFecha(p.check_in)],
    ['Salida',        fmtFecha(p.check_out)],
    ['Noches',        String(p.noches)],
    ['Personas',      String(p.personas)],
    ['Total estadía', fmtClp(p.total)]
  ];
  if (incluirAbono) {
    filas.push(['Abono pagado',   fmtClp(p.abono)]);
    filas.push(['Saldo al llegar', fmtClp(p.saldo)]);
  } else {
    filas.push(['Abono requerido (50%)', fmtClp(p.abono)]);
  }
  return buildTabla(filas);
}

function buildTabla(filas) {
  var rows = filas.map(function(f) {
    return '<tr>' +
      '<td style="padding:9px 14px;color:#5A6B78;font-size:13px;border-bottom:1px solid #E2D5C2;white-space:nowrap;">' + f[0] + '</td>' +
      '<td style="padding:9px 14px;font-size:13px;font-weight:600;color:#273852;border-bottom:1px solid #E2D5C2;">' + f[1] + '</td>' +
      '</tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse;background:#F4F1EB;border-radius:8px;overflow:hidden;">' +
    rows + '</table>';
}

function buildEmailBase(titulo, intro, tabla, footer) {
  return [
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F1EB;font-family:Arial,Helvetica,sans-serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">',
    '<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(39,56,82,.08);">',

    // Header azul marino
    '<tr><td style="background:#273852;padding:28px 32px;text-align:center;">',
    '<p style="margin:0;color:#9DCCD8;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Vichuquén Lodge y Marina</p>',
    '<h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">' + titulo + '</h1>',
    '</td></tr>',

    // Cuerpo
    '<tr><td style="padding:28px 32px;color:#18262E;font-size:14px;line-height:1.6;">',
    intro,
    '<div style="margin:20px 0;">' + tabla + '</div>',
    footer,
    '</td></tr>',

    // Footer
    '<tr><td style="background:#F4F1EB;padding:20px 32px;text-align:center;border-top:1px solid #E2D5C2;">',
    '<p style="margin:0;font-size:12px;color:#9A8068;">Lago Vichuquén, Región del Maule · Chile</p>',
    '<p style="margin:6px 0 0;font-size:12px;">',
    '<a href="mailto:vichulodge@gmail.com" style="color:#273852;text-decoration:none;">vichulodge@gmail.com</a>',
    ' &nbsp;·&nbsp; ',
    '<a href="https://wa.me/56954177688" style="color:#273852;text-decoration:none;">+56 9 5417 7688</a>',
    '</p>',
    '</td></tr>',

    '</table></td></tr></table>',
    '</body></html>'
  ].join('');
}

function fmtClp(n) {
  return '$' + Number(n).toLocaleString('es-CL');
}

function fmtFecha(s) {
  var d = new Date(s + 'T12:00:00');
  var meses = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Funciones de test (ejecutar desde el editor de GAS) ───────────────────────
function testEmailConfirmacion() {
  enviarHuespedConfirmacion(DATOS_TEST);
}
function testLodgeMP() {
  enviarLodgeNotificacion(DATOS_TEST);
}
function testTransferencia() {
  enviarHuespedTransferencia(DATOS_TEST);
}
function testLodgeTransferencia() {
  enviarLodgeSolicitudTransferencia(DATOS_TEST);
}
function testPreLlegada() {
  enviarHuespedPreLlegada(DATOS_TEST);
}
function testConfirmacionExterna() {
  // Igual que el de la web, pero para una reserva cargada en el panel.
  var p = {};
  for (var k in DATOS_TEST) p[k] = DATOS_TEST[k];
  p.canal = 'Booking';
  enviarHuespedConfirmacion(p);
}
function testTodo() {
  // Prueba los 5 emails de una vez
  enviarHuespedConfirmacion(DATOS_TEST);
  enviarLodgeNotificacion(DATOS_TEST);
  enviarHuespedTransferencia(DATOS_TEST);
  enviarLodgeSolicitudTransferencia(DATOS_TEST);
  enviarHuespedPreLlegada(DATOS_TEST);
}

var DATOS_TEST = {
  reserva_id: 'test-001',
  nombre:     'Juan Pérez',
  email:      'vichulodge@gmail.com', // ← cambia por tu email de prueba
  telefono:   '+56912345678',
  cabana:     'Tagua',
  canal:      'Página web',
  check_in:   '2026-07-15',
  check_out:  '2026-07-18',
  noches:     3,
  personas:   2,
  total:      297000,
  abono:      149000,
  saldo:      148000,
  mensaje:    'Llegamos tarde, sobre las 20:00'
};
