# -*- coding: utf-8 -*-
"""
Genera la lámina de bienvenida de una reserva.

Toma la plantilla que diseñó el lodge (assets/plantillas/bienvenida.jpg, exportada
de Canva con los seis campos vacíos) y escribe encima los datos del huésped. El
diseño no se modifica: solo se dibuja texto.

Todo lo que necesita la función (plantilla y tipografía) vive en
assets/plantillas/, en una sola carpeta, para que Vercel la empaquete con un
único patrón en vercel.json.

Medidas tomadas de la versión original de la diseñadora (coordenadas del PNG 2x):
  · tarjeta blanca         x 124..1459   y 574..971
  · reglas horizontales    y 719 (fila 1) y 893 (fila 2)
  · columnas               x 188..553 · 614..979 · 1040..1405
  · inicio del texto       x 268 · 684 · 1132
  · centro vertical        y 665 (fila 1) y 841 (fila 2)
  · altura de mayúscula    20 px   ·   interlineado 36 px
  · color                  #263852

Lo llama Apps Script al enviar el correo de pre-llegada:
    GET /api/bienvenida?secret=…&nombre=…&cabana=…&check_in=…&check_out=…
                       &noches=…&personas=…
"""

import io
import os
from datetime import date
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from PIL import Image, ImageDraw, ImageFont

RAIZ      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLANTILLA = os.path.join(RAIZ, "assets", "plantillas", "bienvenida.jpg")
FUENTE    = os.path.join(RAIZ, "assets", "plantillas", "Jost-Bold.ttf")

COLOR            = (0x26, 0x38, 0x52)
ALTURA_MAYUSCULA = 20
ALTURA_MINIMA    = 13          # hasta dónde se achica un dato muy largo
INTERLINEADO     = 36
X_TEXTO          = {0: 268, 1: 684, 2: 1132}
LIMITE_DERECHO   = {0: 553, 1: 979, 2: 1405}
Y_CENTRO         = {0: 665, 1: 841}

ANCHO_SALIDA = 1200            # ancho final del JPEG que viaja en el correo
CALIDAD      = 88

NUM_CABANA = {
    "Tagua": 1, "Cisne Coscoroba": 2, "Siete Colores": 3, "Cisne Cuello Negro": 4,
    "Huala": 5, "Run Run": 6, "Pitio": 7, "Garza Cuca": 8,
}

DIAS  = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
         "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

_fuentes = {}


def cargar_fuente(altura_mayuscula):
    """Fuente al tamaño que produce la altura de mayúscula pedida (con caché)."""
    if altura_mayuscula not in _fuentes:
        for tam in range(10, 60):
            f = ImageFont.truetype(FUENTE, tam)
            caja = f.getbbox("H")
            if caja[3] - caja[1] >= altura_mayuscula:
                _fuentes[altura_mayuscula] = f
                break
        else:
            raise RuntimeError("no se alcanzó la altura de mayúscula pedida")
    return _fuentes[altura_mayuscula]


def ancho(draw, texto, fuente):
    return draw.textbbox((0, 0), texto, font=fuente)[2]


def partir(draw, texto, fuente, disponible):
    """Divide en dos líneas por palabras si no cabe en una."""
    if ancho(draw, texto, fuente) <= disponible:
        return [texto]
    linea, lineas = "", []
    for p in texto.split():
        prueba = (linea + " " + p).strip()
        if ancho(draw, prueba, fuente) <= disponible or not linea:
            linea = prueba
        else:
            lineas.append(linea)
            linea = p
    lineas.append(linea)
    return lineas[:2]


def fecha_larga(iso):
    y, m, d = (int(v) for v in iso.split("-"))
    f = date(y, m, d)
    return "%s %d de %s, %d" % (DIAS[f.weekday()], f.day, MESES[f.month - 1], f.year)


def campos(reserva):
    """Los seis valores, en el orden y formato del diseño original."""
    # El diseño parte el nombre en dos líneas; se reparten las palabras por mitad
    # para que ninguna quede desbalanceada ("David Roco" -> "DAVID" / "ROCO").
    nombre = reserva["nombre"].split()
    corte = (len(nombre) + 1) // 2
    lineas_nombre = [" ".join(nombre[:corte])]
    if len(nombre) > 1:
        lineas_nombre.append(" ".join(nombre[corte:]))

    num = NUM_CABANA.get(reserva["cabana"])
    cabana = ["Cabaña %d -" % num, reserva["cabana"]] if num else [reserva["cabana"]]

    noches, personas = reserva["noches"], reserva["personas"]
    return [
        (0, 0, lineas_nombre, None),
        (0, 1, cabana,        None),
        (0, 2, None, fecha_larga(reserva["check_in"])),
        (1, 0, None, fecha_larga(reserva["check_out"])),
        (1, 1, None, "%d %s" % (noches,   "noche"   if noches   == 1 else "noches")),
        (1, 2, None, "%d %s" % (personas, "huésped" if personas == 1 else "huéspedes")),
    ]


def ajustar(draw, campo, disponible):
    """Mayor tamaño con el que el dato cabe en su columna.

    Un nombre largo, dibujado al tamaño del diseño, se sale de la columna y pisa
    el icono de al lado; se achica solo lo necesario, hasta ALTURA_MINIMA.
    """
    for altura in range(ALTURA_MAYUSCULA, ALTURA_MINIMA - 1, -1):
        fuente = cargar_fuente(altura)
        lineas = ([t.upper() for t in campo[2]] if campo[2] is not None
                  else [t.upper() for t in partir(draw, campo[3].upper(), fuente, disponible)])
        if all(ancho(draw, l, fuente) <= disponible for l in lineas):
            return fuente, lineas, altura
    return fuente, lineas, ALTURA_MINIMA


def generar(reserva):
    """Devuelve la lámina como JPEG en memoria."""
    im = Image.open(PLANTILLA).convert("RGB")
    draw = ImageDraw.Draw(im)

    for campo in campos(reserva):
        fila, col = campo[0], campo[1]
        x = X_TEXTO[col]
        fuente, lineas, altura = ajustar(draw, campo, LIMITE_DERECHO[col] - x)

        alto = altura + INTERLINEADO * (len(lineas) - 1)
        y = Y_CENTRO[fila] - alto / 2.0
        for i, linea in enumerate(lineas):
            caja = draw.textbbox((0, 0), linea, font=fuente)
            draw.text((x - caja[0], y + INTERLINEADO * i - caja[1]),
                      linea, font=fuente, fill=COLOR)

    if im.width != ANCHO_SALIDA:
        alto = round(im.height * ANCHO_SALIDA / im.width)
        im = im.resize((ANCHO_SALIDA, alto), Image.LANCZOS)

    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=CALIDAD, optimize=True, progressive=True)
    return buf.getvalue()


def leer_parametros(query):
    """Valida y normaliza los parámetros de la petición."""
    q = {k: v[0] for k, v in parse_qs(query).items()}

    esperado = os.environ.get("GAS_SECRET", "")
    if not esperado or q.get("secret") != esperado:
        raise PermissionError("secreto inválido")

    faltan = [c for c in ("nombre", "cabana", "check_in", "check_out", "noches", "personas")
              if not q.get(c)]
    if faltan:
        raise ValueError("faltan parámetros: " + ", ".join(faltan))

    return {
        "nombre":    q["nombre"].strip()[:60],
        "cabana":    q["cabana"].strip()[:40],
        "check_in":  q["check_in"],
        "check_out": q["check_out"],
        "noches":    int(q["noches"]),
        "personas":  int(q["personas"]),
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            reserva = leer_parametros(urlparse(self.path).query)
            imagen = generar(reserva)
        except PermissionError:
            return self._error(403, "no autorizado")
        except (ValueError, KeyError) as e:
            return self._error(400, str(e))
        except Exception as e:                      # plantilla o fuente ausentes
            return self._error(500, "no se pudo generar la lámina: %s" % e)

        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(imagen)))
        self.send_header("Cache-Control", "private, no-store")
        self.end_headers()
        self.wfile.write(imagen)

    def _error(self, codigo, mensaje):
        cuerpo = mensaje.encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)
