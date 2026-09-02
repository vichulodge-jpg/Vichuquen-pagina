# Reservas externas en el panel de administración

Permite cargar a mano las reservas que no llegan por la web (Booking, Airbnb,
WhatsApp, Instagram, reserva directa) y que reciban **exactamente el mismo
tratamiento** que una reserva hecha desde el sitio: bloquean fechas, salen del
calendario público y disparan los correos automáticos.

---

## Puesta en marcha (dos pasos, una sola vez)

### 1. Base de datos

Supabase → **SQL Editor → New query** → pegar y ejecutar:

```
supabase/migration-reservas-externas.sql
```

Es aditiva: no borra ni modifica nada existente. Agrega columnas a `reservas`,
crea la tabla `plantillas_email` y marca las reservas anteriores como
"correo ya enviado" para que no se reenvíe nada a huéspedes antiguos.

Al terminar, revisa el mensaje de la sección 3 del archivo sobre la
**capacidad de las cabañas**: si la base dice 4 personas donde la web ofrece 5,
el panel rechazará reservas de 5 huéspedes.

### 2. Correos (Google Apps Script)

Copiar de nuevo el contenido completo de `gas/email-sender.gs` en el proyecto
de Apps Script y volver a **implementar** (Implementar → Gestionar
implementaciones → editar → Nueva versión).

> La URL de la implementación no cambia, así que **no hay que tocar `GAS_URL`
> en Vercel**.

Novedades del script: acepta el tipo `confirmacion_externa` (confirmación al
huésped sin avisar al lodge, porque la cargó el lodge) y los textos editables
que llegan desde el panel.

No hacen falta variables de entorno nuevas.

---

## Cómo se usa

### Crear una reserva

Panel → pestaña **Reservas** → **+ Nueva reserva**.

Al guardarla como *Confirmada*, el sistema:

1. la registra en la misma tabla `reservas` que las de la web;
2. bloquea esas fechas para esa cabaña;
3. las quita de la disponibilidad pública del sitio;
4. guarda los datos del huésped;
5. le envía el correo de confirmación;
6. programa la pre-llegada para 3 días antes del check-in.

Si el check-in es en 3 días o menos, la pre-llegada sale de inmediato (el cron
diario ya no alcanzaría a mandarla).

El saldo por pagar se calcula solo: **total − abono**.

La casilla *"Enviar el correo de confirmación"* viene marcada. Se puede
desmarcar para cargar reservas antiguas sin molestar al huésped. Las estadías
ya terminadas nunca generan correos.

### Calendario

Pestaña **Calendario**: una fila por cabaña, una columna por día. Cada barra es
una reserva y **el color indica el canal**:

| Canal | Color |
|---|---|
| Página web | azul marino |
| Booking | azul |
| Airbnb | rojo |
| WhatsApp | verde |
| Instagram | magenta |
| Reserva directa | dorado |
| Otro | gris |

Las reservas pendientes de pago van con borde punteado y los bloqueos
manuales con tramado gris. Al hacer clic en una barra se abre la reserva para
verla o editarla.

### Editar y cancelar

Desde el listado (**Ver / editar**) o desde el calendario. Se puede cambiar
fechas, cabaña, datos del huésped, número de personas, canal, estado, forma de
pago y observaciones. Si se cambian las fechas o la cabaña, el bloqueo de
disponibilidad se mueve con la reserva.

**Cancelar** deja las fechas libres otra vez, pero la reserva **no se borra**:
queda como `cancelada` con la fecha de cancelación, visible con el filtro de
estado.

### Textos de los correos

Pestaña **Correos**. Se edita el asunto y el texto redactado de:

1. correo de confirmación de reserva;
2. correo de pre-llegada.

Cada plantilla tiene un interruptor **"Usar este texto"**:

- **apagado** (por defecto) → se envía el correo de siempre;
- **encendido** → se envía lo que está escrito en el panel.

La tabla con los datos de la reserva, las dos láminas de la pre-llegada, el
bloque de saldo y el pie los sigue armando el sistema: la plantilla solo
reemplaza la parte redactada.

Variables disponibles (se insertan con un clic):

```
{{nombre_huesped}}   {{apellido_huesped}}  {{nombre_completo}}
{{cabana}}           {{fecha_checkin}}     {{fecha_checkout}}
{{noches}}           {{numero_huespedes}}  {{telefono}}
{{email}}            {{canal_reserva}}     {{total}}
{{abono}}            {{saldo}}             {{observaciones}}
{{id_reserva}}
```

---

## Cómo se evita enviar un correo dos veces

Cada reserva tiene dos sellos de tiempo: `email_confirmacion_enviado_at` y
`email_pre_llegada_enviado_at`.

Antes de enviar, el sistema **toma el sello** con una escritura condicional
(«ponlo solo si está vacío»). Si otra ejecución ya lo tomó, esta no envía nada.
Si el envío falla, el sello se libera para poder reintentar.

Da lo mismo quién dispare el correo —la web, el webhook de MercadoPago, el
panel o el cron diario—: sale una sola vez por reserva. En la ficha de cada
reserva se ve la fecha exacta en que salió cada correo.

---

## Bloqueos vs. reservas

Ambos cierran fechas, pero no son lo mismo:

- **Reserva** → tiene huésped, correo y datos de pago. Envía correos.
- **Bloqueo** (pestaña Bloqueos) → solo cierra fechas: mantención, uso propio.
  No tiene huésped ni envía nada.

Para una reserva de Booking o Airbnb con datos del huésped, usa
**+ Nueva reserva**, no un bloqueo.

---

## Seguridad

Todo pasa por `/api/admin-reservas` y `/api/admin-plantillas`, que exigen la
cabecera `X-Admin-Secret` con el valor de la variable de entorno
`ADMIN_SECRET`. Sin ella responden `401` y no tocan la base. La tabla
`plantillas_email` tiene RLS activo sin políticas: solo la API la puede leer o
escribir.
