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
//     - GAS_SECRET = <una clave secreta que tú elijas, ej: vic2026lodge>
// ─────────────────────────────────────────────────────────────────────────────

var LODGE_EMAIL  = 'vichulodge@gmail.com';
var LODGE_NOMBRE = 'Vichuquén Lodge y Marina';
var GAS_SECRET   = 'vic2026lodge'; // debe coincidir con la variable GAS_SECRET en Vercel

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    if (payload.secret !== GAS_SECRET) {
      return jsonOut({ ok: false, error: 'unauthorized' });
    }

    var tipo = payload.tipo;

    if (tipo === 'confirmacion_mp') {
      enviarHuespedConfirmacion(payload);
      enviarLodgeNotificacion(payload);
    } else if (tipo === 'solicitud_transferencia') {
      enviarHuespedTransferencia(payload);
      // El lodge ya recibe notificación por WhatsApp en este flujo
    }

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: err.toString() });
  }
}

// ── Email al huésped: reserva confirmada (MercadoPago) ───────────────────────
function enviarHuespedConfirmacion(p) {
  var subject = '¡Tu reserva está confirmada! — Vichuquén Lodge y Marina';
  var intro =
    '<p>Hola <strong>' + p.nombre + '</strong>,</p>' +
    '<p>Tu pago fue recibido correctamente. ¡Tu reserva está confirmada y te esperamos en el lago!</p>';
  var footer =
    '<p style="font-size:13px;color:#5A6B78;margin-top:20px;">' +
    'El saldo restante de <strong>' + fmtClp(p.saldo) + '</strong> se paga al llegar al lodge.<br>' +
    '¿Necesitas ayuda? Escríbenos por ' +
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
