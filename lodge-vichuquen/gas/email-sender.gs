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
      enviarLodgeSolicitudTransferencia(payload);
    } else if (tipo === 'pre_llegada') {
      enviarHuespedPreLlegada(payload);
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
    '<p>¡Gracias por elegirnos!</p>' +
    '<p>Tu pago fue recibido correctamente.</p>' +
    '<p><strong> Detalles de tu reserva:</strong></p>';
  var footer =
    '<p style="font-size:13px;color:#5A6B78;margin-top:20px;">' +
    'Importante: Si elegiste la opción de pago con abono, recuerda que debes completar el saldo pendiente de <strong>' + fmtClp(p.saldo) + '</strong> a más tardar 5 días antes de tu fecha de llegada.<br>' +
    '<p>Si tienes dudas o necesitas asistencia, contáctanos por <a href="https://wa.me/56954177688" style="color:#273852;">WhatsApp</a> ' +
    'o responde este correo.<br></p>';

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
function enviarHuespedPreLlegada(p) {
  var subject = '¡Ya falta muy poco! Tu llegada a Vichuquén Lodge el ' + fmtFecha(p.check_in);
  var mapsUrl = 'https://www.google.com/maps/place/Vichuquen+Lodge+y+Marina/@-34.7857666,-72.0735737,17z';

  var body =
    '<p>¡Hola, <strong>' + p.nombre + '</strong>!</p>' +
    '<p>Ya queda muy poco para recibirte en Vichuquén Lodge y Marina. Para que disfrutes al máximo tu estadía, te compartimos algunos datos importantes antes de tu llegada.</p>' +

    '<div style="margin:20px 0;">' +
    buildTabla([
      ['Cabaña',   p.cabana],
      ['Llegada',  fmtFecha(p.check_in)],
      ['Salida',   fmtFecha(p.check_out)],
      ['Noches',   String(p.noches)],
      ['Personas', String(p.personas)]
    ]) +
    '</div>' +

    seccion('✔️ Antes de hacer tu maleta', [
      item('Toallas',
        'Tu cabaña incluye sábanas y plumones limpios, pero <strong>no incluye toallas de baño</strong> (solo dejamos una toalla de mano por baño). Recuerda traer tus toallas personales y para el lago o la playa.'),
      item('Agua para consumo',
        'El agua de los grifos proviene de pozo profundo y no es apta para beber. No necesitas traer agua, ya que encontrarás <strong>bidones de agua purificada</strong> en tu cabaña, los cuales reponemos gratuitamente durante tu estadía.'),
      item('Cantidad de huéspedes',
        'Si reservaste con tarifa de ocupación reducida, la cabaña y los insumos iniciales están preparados para la cantidad de personas indicada en tu reserva.<br><br>' +
        'Si deseas agregar pasajeros, debes informarlo antes de tu llegada. El valor es de <strong>$10.000 por persona adicional por noche</strong>. No se permite registrar huéspedes adicionales durante el check-in ni recibir visitas que pernocten.'),
      item('Mascotas',
        'La primera mascota mediana es <strong>gratuita</strong>. Una segunda mascota requiere autorización previa y tiene un valor de <strong>$8.000 por noche</strong>.<br><br>' +
        'Recuerda traer su cama y platos. Las mascotas deben permanecer bajo supervisión, no pueden subir a camas o sillones y sus desechos deben ser recogidos por sus dueños.')
    ]) +

    '<div style="margin:24px 0 8px;">' +
    '<p style="margin:0 0 12px;font-weight:700;color:#273852;font-size:15px;">🚭 Normas importantes de convivencia</p>' +
    '<div style="padding:14px 16px;background:#F4F1EB;border-radius:8px;border-left:3px solid #5AABB8;">' +
    '<ul style="margin:0;padding-left:20px;font-size:13px;color:#18262E;line-height:1.9;">' +
    '<li>Está <strong>prohibido fumar</strong> dentro de las cabañas.</li>' +
    '<li>No está permitido realizar <strong>frituras al interior</strong> de las cabañas para evitar olores persistentes. Si tienes pensado freír alimentos, avísanos y te facilitaremos gratuitamente una cocinilla portátil para utilizar en la terraza.</li>' +
    '<li>Por respeto a todos los huéspedes, te pedimos mantener <strong>niveles moderados de ruido</strong>, especialmente entre las 23:00 y las 10:00 hrs.</li>' +
    '<li>No se permiten <strong>fiestas ni música a alto volumen</strong>.</li>' +
    '<li>Ayúdanos a cuidar el humedal y la naturaleza que rodea el complejo, <strong>evitando dejar basura</strong> o intervenir la flora y fauna local.</li>' +
    '</ul>' +
    '</div>' +
    '</div>' +

    seccion('🕒 Horarios de ingreso y salida', [
      item('Check-in', 'Desde las <strong>15:00 hrs.</strong>'),
      item('Check-out', 'Hasta las <strong>12:00 hrs.</strong>'),
      item('Recepción presencial',
        'Nuestro equipo realizará la recepción presencial hasta las <strong>22:00 hrs.</strong> en la Administración (Cabaña N° 9).<br><br>' +
        'Si estimas llegar <strong>después de las 22:00 hrs.</strong>, avísanos con anticipación para activar tu <strong>Check-in Autónomo</strong> y enviarte las instrucciones de acceso.')
    ]) +

    '<div style="margin:24px 0 8px;">' +
    '<p style="margin:0 0 12px;font-weight:700;color:#273852;font-size:15px;">⏰ Horarios extendidos <span style="font-weight:400;font-size:12px;color:#5A6B78;">(sujetos a disponibilidad)</span></p>' +
    '<div style="padding:14px 16px;background:#F4F1EB;border-radius:8px;border-left:3px solid #5AABB8;">' +
    '<p style="margin:0 0 8px;font-size:13px;color:#18262E;">Si deseas disfrutar más tiempo de tu estadía, puedes solicitar:</p>' +
    '<ul style="margin:0 0 12px;padding-left:20px;font-size:13px;color:#18262E;line-height:1.9;">' +
    '<li><strong>Early Check-in:</strong> ingreso desde las 10:00 hrs. — <strong>$35.000</strong></li>' +
    '<li><strong>Late Check-out:</strong> salida hasta las 17:00 hrs. — <strong>$35.000</strong></li>' +
    '</ul>' +
    '<p style="margin:0;font-size:13px;color:#18262E;">Estos servicios requieren solicitud y confirmación previa por parte de la administración.</p>' +
    '<p style="margin:10px 0 0;font-size:12px;color:#c62828;"><strong>Importante:</strong> Si la cabaña no es desocupada antes de las 12:00 hrs. sin autorización previa, se aplicará un cobro equivalente a media noche de estadía.</p>' +
    '</div>' +
    '</div>' +

    '<div style="background:#F4F1EB;border-radius:10px;padding:18px 20px;margin:20px 0;">' +
    '<p style="margin:0 0 10px;font-weight:700;color:#273852;font-size:15px;">📍 Cómo llegar</p>' +
    '<p style="margin:0 0 12px;font-size:13px;color:#18262E;">Puedes utilizar el siguiente enlace para llegar directamente con tu GPS:</p>' +
    '<a href="' + mapsUrl + '" style="display:inline-block;background:#273852;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;">📍 Abrir en Google Maps</a>' +
    '</div>' +

    '<div style="background:#EAF4F7;border-radius:10px;padding:18px 20px;margin:20px 0;">' +
    '<p style="margin:0 0 8px;font-weight:700;color:#273852;font-size:15px;">📞 Contacto</p>' +
    '<p style="margin:0;font-size:13px;color:#18262E;">Si tienes cualquier consulta o necesitas coordinar tu llegada, puedes responder este correo o escribirnos por WhatsApp al:<br><br>' +
    '<a href="https://wa.me/56954177688" style="color:#273852;font-weight:700;font-size:15px;">+56 9 5417 7688</a></p>' +
    '</div>' +

    '<p style="margin-top:24px;">Te deseamos un excelente viaje y esperamos que disfrutes una maravillosa estadía junto al lago y al humedal.</p>' +
    '<p><strong>¡Nos vemos muy pronto!</strong><br>' +
    '<span style="color:#5A6B78;font-size:13px;">Saludos cordiales,<br>Equipo Vichuquén Lodge y Marina</span></p>';

  MailApp.sendEmail({
    to:        p.email,
    subject:   subject,
    htmlBody:  buildEmailBase('¡Ya falta muy poco!', body, '', ''),
    name:      LODGE_NOMBRE,
    replyTo:   LODGE_EMAIL
  });
}

// Helpers para email pre-llegada
function seccion(titulo, items) {
  return '<div style="margin:24px 0 8px;">' +
    '<p style="margin:0 0 12px;font-weight:700;color:#273852;font-size:15px;">' + titulo + '</p>' +
    items.join('') +
    '</div>';
}
function item(titulo, texto) {
  return '<div style="margin-bottom:14px;padding:14px 16px;background:#F4F1EB;border-radius:8px;border-left:3px solid #5AABB8;">' +
    '<p style="margin:0 0 4px;font-weight:700;font-size:13px;color:#273852;">' + titulo + '</p>' +
    '<p style="margin:0;font-size:13px;color:#18262E;line-height:1.6;">' + texto + '</p>' +
    '</div>';
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
  check_in:   '2026-07-15',
  check_out:  '2026-07-18',
  noches:     3,
  personas:   2,
  total:      297000,
  abono:      149000,
  saldo:      148000,
  mensaje:    'Llegamos tarde, sobre las 20:00'
};
