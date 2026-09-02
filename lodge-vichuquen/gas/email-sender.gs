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
// Presentación basada en la plantilla gráfica del lodge (sep-2026). Los textos
// son los mismos que ya se enviaban; cambia el diseño y se suman la tarjeta con
// los datos de la reserva y el recordatorio de saldo pendiente.

var COL_NAVY  = '#273852';
var COL_ORO   = '#CEAC87';
var COL_ARENA = '#E1C3A1';
var COL_CREMA = '#FFF8EE';
var COL_TEXTO = '#18262E';
var COL_GRIS  = '#5A6B78';
var COL_LINEA = '#E2D5C2';

var URL_MAPS = 'https://www.google.com/maps/place/Vichuquen+Lodge+y+Marina/@-34.7857666,-72.0735737,17z';
var URL_IG   = 'https://www.instagram.com/vichuquen_lodgeymarina/';
var URL_FB   = 'https://www.facebook.com/vichuquen_lodgeymarina/';
var URL_WA   = 'https://wa.me/56954177688';

// Para mostrar la cabaña como "Cabaña 2 · Cisne Coscoroba"
var NUM_CABANA = {
  'Tagua': 1, 'Cisne Coscoroba': 2, 'Siete Colores': 3, 'Cisne Cuello Negro': 4,
  'Huala': 5, 'Run Run': 6, 'Pitio': 7, 'Garza Cuca': 8
};

function enviarHuespedPreLlegada(p) {
  var subject = '¡Ya falta muy poco! Tu llegada a Vichuquén Lodge el ' + fmtFecha(p.check_in);

  var body =
    '<p style="margin:0 0 18px;font-size:14px;color:' + COL_TEXTO + ';line-height:1.6;">' +
      '¡Hola, <strong>' + p.nombre + '</strong>! Ya queda muy poco para recibirte. ' +
      'Aquí tienes todo lo que necesitas saber antes de llegar.' +
    '</p>' +
    preTarjetaDatos(p) +
    preBloqueMaleta() +
    preBloqueNormas() +
    preBloqueHorarios() +
    preBloqueLlegada() +
    preBloquePago(p) +
    '<p style="margin:26px 0 0;font-size:14px;color:' + COL_TEXTO + ';line-height:1.6;">' +
      'Te deseamos un excelente viaje y una maravillosa estadía junto al lago y al humedal.' +
    '</p>' +
    '<p style="margin:10px 0 0;font-size:14px;color:' + COL_TEXTO + ';">' +
      '<strong>¡Nos vemos muy pronto!</strong><br>' +
      '<span style="color:' + COL_GRIS + ';font-size:13px;">Equipo Vichuquén Lodge y Marina</span>' +
    '</p>';

  MailApp.sendEmail({
    to:      p.email,
    subject: subject,
    htmlBody: preShell(body),
    name:    LODGE_NOMBRE,
    replyTo: LODGE_EMAIL
  });
}

// ── Estructura del correo ────────────────────────────────────────────────────

function preShell(contenido) {
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:' + COL_CREMA + ';font-family:Georgia,\'Times New Roman\',serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">',
    '<tr><td align="center" style="padding:28px 14px;">',
    '<table width="560" cellpadding="0" cellspacing="0" role="presentation" ',
      'style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(39,56,82,.10);">',

    // Cabecera
    '<tr><td style="background:' + COL_NAVY + ';padding:30px 32px 26px;text-align:center;">',
      '<p style="margin:0;color:' + COL_ORO + ';font-size:11px;letter-spacing:3px;text-transform:uppercase;">',
        'Vichuquén Lodge y Marina</p>',
      '<h1 style="margin:10px 0 0;color:#fff;font-size:30px;font-weight:400;letter-spacing:.5px;">¡Bienvenido!</h1>',
      '<div style="width:120px;height:1px;background:' + COL_ORO + ';margin:14px auto;"></div>',
      '<p style="margin:0;color:#DCE6F0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">',
        'Tu estadía empieza aquí</p>',
    '</td></tr>',

    '<tr><td style="padding:26px 30px 30px;">' + contenido + '</td></tr>',

    // Pie
    preFooter(),

    '</table></td></tr></table></body></html>'
  ].join('');
}

function preFooter() {
  return '<tr><td style="background:' + COL_NAVY + ';padding:24px 30px;text-align:center;">' +
    '<p style="margin:0 0 14px;color:' + COL_ORO + ';font-size:11px;letter-spacing:2px;text-transform:uppercase;">' +
      'Síguenos y comparte tu estadía</p>' +
    '<p style="margin:0 0 16px;font-size:13px;">' +
      '<a href="' + URL_IG + '" style="color:#fff;text-decoration:none;">Instagram</a>' +
      '<span style="color:' + COL_ORO + ';padding:0 10px;">·</span>' +
      '<a href="' + URL_FB + '" style="color:#fff;text-decoration:none;">Facebook</a>' +
    '</p>' +
    '<div style="height:1px;background:rgba(206,172,135,.35);margin:0 0 16px;"></div>' +
    '<p style="margin:0;color:#DCE6F0;font-size:13px;line-height:1.8;">' +
      '<a href="' + URL_WA + '" style="color:#fff;text-decoration:none;">+56 9 5417 7688</a><br>' +
      '<a href="mailto:' + LODGE_EMAIL + '" style="color:#fff;text-decoration:none;">' + LODGE_EMAIL + '</a><br>' +
      '<a href="https://www.vichuquenlodgeymarina.cl" style="color:' + COL_ORO + ';text-decoration:none;font-size:11px;letter-spacing:1px;">' +
        'WWW.VICHUQUENLODGEYMARINA.CL</a>' +
    '</p></td></tr>';
}

// ── Tarjeta con los datos de la reserva ──────────────────────────────────────

function preTarjetaDatos(p) {
  var celdas = [
    [p.nombre,                        'nombre'],
    [cabanaCompleta(p.cabana),        'cabaña'],
    [fmtFechaLarga(p.check_in),       'entrada'],
    [fmtFechaLarga(p.check_out),      'salida'],
    [p.noches + (p.noches == 1 ? ' noche' : ' noches'),        'noches'],
    [p.personas + (p.personas == 1 ? ' huésped' : ' huéspedes'), 'huéspedes']
  ];

  var filas = '';
  for (var i = 0; i < celdas.length; i += 2) {
    filas += '<tr>' + preCelda(celdas[i]) + preCelda(celdas[i + 1]) + '</tr>';
  }

  return '<div style="text-align:center;margin:0 0 18px;">' +
      '<span style="display:inline-block;background:' + COL_ORO + ';color:#fff;font-size:12px;' +
        'letter-spacing:2px;text-transform:uppercase;padding:10px 26px;border-radius:4px;">' +
        'Datos de tu reserva</span>' +
    '</div>' +
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" ' +
      'style="background:' + COL_CREMA + ';border-radius:10px;border:1px solid ' + COL_LINEA + ';">' +
      filas +
    '</table>';
}

function preCelda(c) {
  return '<td width="50%" style="padding:16px 18px;vertical-align:top;">' +
    '<p style="margin:0 0 6px;font-size:14px;font-weight:700;color:' + COL_NAVY + ';line-height:1.35;">' +
      c[0] + '</p>' +
    '<div style="height:1px;background:' + COL_LINEA + ';margin:0 0 5px;"></div>' +
    '<p style="margin:0;font-size:11px;color:' + COL_GRIS + ';font-style:italic;">' + c[1] + '</p>' +
    '</td>';
}

// ── Antes de hacer tu maleta ─────────────────────────────────────────────────

function preBloqueMaleta() {
  var t = [
    ['#E0A870', 'Toallas',
      'Tu cabaña incluye sábanas y plumones limpios, pero <strong>no incluye toallas de baño</strong> ' +
      '(solo dejamos una toalla de mano por baño). Recuerda traer tus toallas personales y para el lago o la playa.'],
    ['#7FB6D4', 'Agua',
      'El agua de los grifos proviene de pozo profundo y no es apta para beber. No necesitas traer agua: ' +
      'encontrarás <strong>bidones de agua purificada</strong> en tu cabaña, que reponemos gratuitamente durante tu estadía.'],
    ['#C98BAA', 'Huéspedes',
      'La cabaña y los insumos iniciales están preparados para la cantidad de personas indicada en tu reserva. ' +
      'Si deseas agregar pasajeros, debes informarlo antes de tu llegada; el valor es de ' +
      '<strong>$10.000 por persona adicional por noche</strong>. No se permite registrar huéspedes adicionales ' +
      'durante el check-in ni recibir visitas que pernocten.'],
    ['#5AABB8', 'Mascotas',
      'La primera mascota mediana <strong>no tiene costo</strong>. Una segunda mascota requiere autorización previa ' +
      'y tiene un valor de <strong>$8.000 por noche</strong>. Recuerda traer su cama y platos. Deben permanecer bajo ' +
      'supervisión, no pueden subir a camas o sillones y sus desechos deben ser recogidos por sus dueños.']
  ];

  var filas = '';
  for (var i = 0; i < t.length; i += 2) {
    filas += '<tr>' + preTarjetaInfo(t[i]) + preTarjetaInfo(t[i + 1]) + '</tr>';
  }

  return preTitulo('Antes de hacer tu maleta', 'Lo que debes saber para tu llegada') +
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">' + filas + '</table>';
}

function preTarjetaInfo(c) {
  return '<td width="50%" style="padding:0 5px 10px;vertical-align:top;">' +
    '<div style="background:' + COL_CREMA + ';border-top:3px solid ' + c[0] + ';border-radius:8px;padding:14px 15px;">' +
      '<p style="margin:0 0 7px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:' + COL_NAVY + ';">' +
        c[1] + '</p>' +
      '<p style="margin:0;font-size:12px;color:' + COL_TEXTO + ';line-height:1.65;">' + c[2] + '</p>' +
    '</div></td>';
}

// ── Normas de convivencia ────────────────────────────────────────────────────

function preBloqueNormas() {
  var normas = [
    'Por seguridad de todos y prevención de incendios, está <strong>prohibido fumar</strong> al interior de las cabañas. ' +
      'Si fuma, hágalo solo en espacios exteriores, asegurándose de apagar completamente colillas y residuos.',
    'Para resguardar la tranquilidad de nuestros huéspedes, el ingreso de personas que no formen parte de la reserva ' +
      'debe ser <strong>informado y autorizado previamente</strong> por la administración.',
    'No está permitido realizar <strong>frituras al interior</strong> de las cabañas para evitar olores persistentes. ' +
      'Si tienes pensado freír alimentos, avísanos y te facilitaremos gratuitamente una cocinilla portátil para la terraza.',
    'Este recinto se encuentra junto a un <strong>humedal protegido</strong>, declarado Reserva Natural desde 2024. ' +
      'Ayúdanos a cuidarlo evitando dejar basura o intervenir la flora y fauna local.',
    'Por respeto a todos, te pedimos mantener <strong>niveles moderados de ruido</strong>, especialmente entre las ' +
      '23:00 y las 10:00 hrs. No se permiten fiestas ni música a alto volumen.',
    'En cada cabaña encontrarás nuestro <strong>Reglamento</strong>, con las normas que nos ayudan a mantener un ' +
      'ambiente seguro y agradable para todos. Te invitamos a leerlo al llegar.'
  ];

  return preTitulo('Información para tu estadía', '') +
    '<div style="background:' + COL_CREMA + ';border-radius:10px;padding:16px 20px;">' +
      '<ul style="margin:0;padding-left:18px;font-size:12px;color:' + COL_TEXTO + ';line-height:1.8;">' +
        '<li style="margin-bottom:9px;">' + normas.join('</li><li style="margin-bottom:9px;">') + '</li>' +
      '</ul>' +
    '</div>';
}

// ── Horarios ─────────────────────────────────────────────────────────────────

function preBloqueHorarios() {
  return preTitulo('Horarios', '') +
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">' +
    '<tr>' +
      preHorario('Check-in',  'Desde las <strong>15:00 hrs.</strong>', 'Recepción presencial hasta las 22:00 hrs. en la Administración (Cabaña N° 9).') +
      preHorario('Check-out', 'Hasta las <strong>12:00 hrs.</strong>', 'Si llegas después de las 22:00 hrs., avísanos para activar tu Check-in Autónomo.') +
    '</tr></table>' +

    '<div style="background:' + COL_ARENA + ';border-radius:8px;padding:15px 18px;margin-top:10px;">' +
      '<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + COL_NAVY + ';">' +
        'Opcionales <span style="font-weight:400;letter-spacing:0;text-transform:none;font-style:italic;">(sujetos a disponibilidad)</span></p>' +
      '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:12px;color:' + COL_TEXTO + ';">' +
        '<tr><td style="padding:3px 0;"><strong>Early check-in</strong> · desde 10:00 hrs.</td>' +
            '<td align="right" style="padding:3px 0;font-weight:700;color:' + COL_NAVY + ';">$35.000</td></tr>' +
        '<tr><td style="padding:3px 0;"><strong>Late check-out</strong> · hasta 17:00 hrs.</td>' +
            '<td align="right" style="padding:3px 0;font-weight:700;color:' + COL_NAVY + ';">$35.000</td></tr>' +
      '</table>' +
      '<p style="margin:10px 0 0;font-size:11px;color:#8A3A2E;">' +
        '<strong>Importante:</strong> si la cabaña no se desocupa antes de las 12:00 hrs. sin autorización previa, ' +
        'se aplicará un cobro equivalente a media noche de estadía.</p>' +
    '</div>';
}

function preHorario(titulo, hora, nota) {
  return '<td width="50%" style="padding:0 5px;vertical-align:top;">' +
    '<div style="background:' + COL_CREMA + ';border:1px solid ' + COL_LINEA + ';border-radius:8px;padding:14px 15px;text-align:center;">' +
      '<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:' + COL_NAVY + ';">' +
        titulo + '</p>' +
      '<p style="margin:0 0 8px;font-size:13px;color:' + COL_TEXTO + ';">' + hora + '</p>' +
      '<p style="margin:0;font-size:11px;color:' + COL_GRIS + ';line-height:1.5;">' + nota + '</p>' +
    '</div></td>';
}

// ── Cómo llegar ──────────────────────────────────────────────────────────────

function preBloqueLlegada() {
  return preTitulo('Cómo llegar', '') +
    '<div style="background:' + COL_CREMA + ';border-radius:10px;padding:18px 20px;text-align:center;">' +
      '<p style="margin:0 0 14px;font-size:12px;color:' + COL_TEXTO + ';line-height:1.6;">' +
        'Encuéntranos en aplicaciones de navegación como Google Maps o Waze como ' +
        '<strong>Vichuquén Lodge y Marina</strong>.</p>' +
      '<a href="' + URL_MAPS + '" style="display:inline-block;background:' + COL_NAVY + ';color:#fff;' +
        'text-decoration:none;padding:11px 24px;border-radius:6px;font-size:12px;font-weight:700;letter-spacing:1px;">' +
        'ABRIR EN GOOGLE MAPS</a>' +
    '</div>';
}

// ── Recordatorio de pago (solo si queda saldo) ───────────────────────────────

function preBloquePago(p) {
  var saldo = Number(p.saldo || 0);
  if (!(saldo > 0)) return '';

  return '<div style="border:1px solid ' + COL_ORO + ';border-radius:10px;padding:16px 20px;margin-top:22px;">' +
    '<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + COL_NAVY + ';">' +
      'Saldo pendiente</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:12px;color:' + COL_TEXTO + ';">' +
      '<tr><td style="padding:3px 0;">Total de la estadía</td>' +
          '<td align="right" style="padding:3px 0;">' + fmtClp(p.total) + '</td></tr>' +
      '<tr><td style="padding:3px 0;">Abono pagado</td>' +
          '<td align="right" style="padding:3px 0;">− ' + fmtClp(p.abono) + '</td></tr>' +
      '<tr><td style="padding:8px 0 0;border-top:1px solid ' + COL_LINEA + ';font-weight:700;color:' + COL_NAVY + ';">Saldo al llegar</td>' +
          '<td align="right" style="padding:8px 0 0;border-top:1px solid ' + COL_LINEA + ';font-weight:700;color:' + COL_NAVY + ';">' +
          fmtClp(saldo) + '</td></tr>' +
    '</table>' +
    '<p style="margin:10px 0 0;font-size:11px;color:' + COL_GRIS + ';line-height:1.5;">' +
      'Puedes pagarlo al momento del check-in. Si prefieres adelantarlo por transferencia, escríbenos por WhatsApp.</p>' +
    '</div>';
}

// ── Helpers de presentación ──────────────────────────────────────────────────

function preTitulo(titulo, bajada) {
  return '<div style="text-align:center;margin:28px 0 16px;">' +
    '<p style="margin:0;font-size:18px;color:' + COL_NAVY + ';letter-spacing:.5px;">' + titulo + '</p>' +
    (bajada ? '<p style="margin:4px 0 0;font-size:12px;color:' + COL_GRIS + ';font-style:italic;">' + bajada + '</p>' : '') +
    '<div style="width:60px;height:1px;background:' + COL_ORO + ';margin:10px auto 0;"></div>' +
    '</div>';
}

function cabanaCompleta(nombre) {
  var n = NUM_CABANA[nombre];
  return n ? ('Cabaña ' + n + ' · ' + nombre) : nombre;
}

function fmtFechaLarga(s) {
  var d = new Date(s + 'T12:00:00');
  var dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  var meses = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return dias[d.getDay()] + ' ' + d.getDate() + ' de ' + meses[d.getMonth()] + ', ' + d.getFullYear();
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
