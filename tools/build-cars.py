#!/usr/bin/env python3
"""
Convierte las fotos crudas de source/ en los recortes que usa la web.

    python3 tools/build-cars.py

Qué hace, y por qué cada paso:

1. RECORTA el auto. Las fotos vienen contra negro, así que lo que levanta
   por encima del fondo es auto. Antes de nada LIMPIA el piso: algunas
   fotos traen bajo el auto una neblina de estudio, y hay que sacarla
   porque el paso siguiente la convierte en patas negras. Después RELLENA
   el interior columna por columna — sin eso, un auto negro (el GLC) o
   los vidrios polarizados quedan traslúcidos y se ve el fondo a través.

2. CALIBRA la escala. El generador dibuja a ojo: cada auto sale de un
   tamaño distinto sin relación con la realidad. Acá se mide el largo en
   píxeles, se compara contra el largo real de fábrica (tabla REAL) y se
   escala para que todos compartan la misma relación px/mm. Por eso un
   SUV sigue viéndose más alto que un coupé: porque lo es.

3. ALINEA. Todos los autos rematan la goma unos píxeles POR ENCIMA de
   la línea de luz (GROUND - APOYO) y centrados en el mismo eje
   (CENTER). La línea va exactamente debajo de la goma, nunca encima:
   si el último píxel del neumático cae sobre la línea, el brillo se lo
   come y la rueda se ve amputada.

4. EXPORTA tres tamaños. El @2x existe para pantallas retina, que piden
   el doble de píxeles de los que mide la ventana.

Sale a public/assets/cars/, que es la carpeta que se publica.

Para sumar un auto: dejá la foto en source/<slug>.png y agregá su largo
real de fábrica —en milímetros— a la tabla REAL. No hay nada más que
tocar: no hay ajustes por foto, y una foto nueva no altera a las que ya
estaban.
"""

from PIL import Image, ImageFilter
from scipy import ndimage
import numpy as np
import hashlib
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "source")
OUT = os.path.join(BASE, "public", "assets", "cars")

# Largo real de fábrica, en mm. Es la referencia contra la que se calibra
# el tamaño en pantalla — sin esto no hay forma de saber si un auto está
# dibujado grande o si simplemente ES grande.
REAL = {
    "bmw-serie2": 4537,   # BMW Serie 2 Coupé (G42)
    "camaro-ss":  4784,   # Chevrolet Camaro SS
    "glc-coupe":  4763,   # Mercedes-Benz GLC Coupé
    "golf-gti":   4287,   # Volkswagen Golf GTI (Mk8)
    "audi-q5":    4689,   # Audi Q5 Sportback
    "audi-rs3":   4389,   # Audi RS 3 Sportback (8Y)
}

# Los dos umbrales del recorte, en luminancia sobre 255.
#
# SEMILLA es "esto es auto sin ninguna duda": chapa, vidrio, llanta. El
# fondo de estudio nunca llega a ese nivel.
#
# PISO es el borde de lo visible. Entre PISO y SEMILLA cae tanto la goma
# en sombra como la neblina que algunas fotos traen bajo el auto, y por
# nivel de gris son indistinguibles: un neumático oscuro y un manchón de
# piso miden lo mismo. Cualquier umbral que borre una, borra la otra.
SEMILLA = 45.0
PISO = 2.5

# La zona de contacto y cómo remata el auto contra la línea de luz.
#
# BANDA: las últimas filas de la foto donde conviven goma oscura y
# neblina. FADE: cuántas filas tarda en morir lo que sigue debajo del
# material indudable. APOYO: la goma termina este margen POR ENCIMA de
# la línea de luz de la página — la línea va exactamente debajo de la
# goma, nunca encima. La medida sale de la GLC, que es la referencia
# aprobada de cómo tiene que verse el apoyo.
BANDA = 40
FADE = 10
APOYO = 4

# Fotos que no se vuelven a generar: manda el archivo ya publicado.
#
# La Mercedes está acá por pedido explícito. Vale saber qué se congela:
# arrastra un pixel de basura bajo el auto que le corre la alineación, y
# por eso apoya en la fila 692 mientras las otras cinco apoyan en la 696
# — está levantada 4 px. La limpieza del piso lo corrige sola; sacarla de
# esta lista y correr el script es todo lo que hace falta.
CONGELADAS = {"glc-coupe"}

CANVAS = (1672, 941)   # lienzo de salida, proporción de las fotos
GROUND = 0.740         # dónde apoyan las ruedas
CENTER = 0.500         # eje horizontal del auto

# Escala común, en px/mm sobre el lienzo de salida. Es la constante que
# convierte milímetros de fábrica en píxeles de pantalla.
#
# Salió del promedio de las seis fotos, pero está fija a propósito: si
# se recalculara en cada corrida, agregar un auto —o retocar el recorte
# de uno— correría el promedio y reescalaría a todos los demás. Un auto
# nuevo tiene que entrar a la escala que ya existe, no redefinirla.
ESCALA = 0.3054270976

# (ancho, sufijo, calidad). El @2x es para retina.
SIZES = [(3344, "@2x", 88), (1672, "", 94), (1100, "@sm", 88)]


def cutout(path):
    """Devuelve (rgb, alpha) del auto recortado sobre su lienzo original."""
    im = Image.open(path).convert("RGB")
    rgb = np.asarray(im).astype(np.float32)
    lum = rgb.max(2)

    alpha = np.clip((lum - PISO) / 9.0, 0, 1)

    strong = lum > SEMILLA
    if not strong.any():
        raise SystemExit(f"no se encontró ningún auto en {path}")
    piso = np.where(strong.sum(1) > 3)[0].max()

    # Lo que no está pegado al auto no existe: motas y manchones sueltos
    # se van, por claros que sean.
    piezas, _ = ndimage.label(lum > PISO)
    ids = np.unique(piezas[strong])
    auto = np.isin(piezas, ids[ids > 0])
    alpha *= auto

    estricta = (np.clip((lum - PISO) / 9.0, 0, 1) > 0.30) & auto
    y = np.arange(lum.shape[0])[:, None]
    banda = y > piso - BANDA

    # Rescate de la goma oscura. En algunas fotos el neumático de abajo
    # mide luminancia 3-8 —casi negro— y el ramp normal lo deja
    # traslúcido: sobre la luz de la página desaparece y la rueda se ve
    # amputada. La goma y la neblina miden lo mismo en gris; lo que las
    # separa es dónde están. La goma abraza la rueda, así que el refuerzo
    # crece POR CERCANÍA desde el material indudable de la zona de
    # contacto; la neblina, que se extiende por el piso lejos de todo,
    # queda afuera.
    cerca = ndimage.binary_dilation(estricta & banda, iterations=18)
    boost = np.clip((lum - 2.0) / 4.0, 0, 1)
    alpha = np.where(banda & cerca & auto, np.maximum(alpha, boost), alpha)

    # Relleno del interior. Un auto es macizo: entre el punto más alto y
    # el más bajo de cada columna no puede haber transparencia. Sin esto
    # se ve el fondo a través de un auto negro. La columna tiene que
    # tener material del auto POR ENCIMA de la banda de contacto: una
    # columna cuyo único contenido vive pegado al piso es neblina, y
    # rellenarla la convierte en un manchón macizo sobre la barra.
    ys, xs = np.where(estricta)
    for x in range(xs.min(), xs.max() + 1):
        col = np.where(estricta[:, x])[0]
        if col.size > 3 and col.min() <= piso - BANDA:
            alpha[col.min(): col.max() + 1, x] = 1.0

    # Debajo del material indudable, todo remata en pocas filas: el
    # apoyo cierra y la neblina no llega a la línea de luz.
    fade = np.clip((piso + FADE - y) / float(FADE), 0, 1)
    alpha = np.where(y > piso, alpha * fade, alpha)

    return rgb, alpha


def bounds(alpha, thr=0.25):
    cols = np.where(alpha.max(0) > thr)[0]
    rows = np.where(alpha.max(1) > thr)[0]
    return cols.min(), cols.max(), rows.min(), rows.max()


def main():
    slugs = sorted(REAL)
    missing = [s for s in slugs if not os.path.exists(f"{SRC}/{s}.png")]
    if missing:
        raise SystemExit("faltan fotos en source/: " + ", ".join(missing))

    os.makedirs(OUT, exist_ok=True)

    # --- pasada 1: medir, para saber a qué escala llevar a todos ---
    cars = {}
    for s in slugs:
        rgb, alpha = cutout(f"{SRC}/{s}.png")
        x0, x1, _, _ = bounds(alpha)
        # px por mm, normalizado al ancho del lienzo de salida
        cars[s] = (rgb, alpha, (x1 - x0) / rgb.shape[1] * CANVAS[0] / REAL[s])

    target = ESCALA
    print(f"escala común: {target:.4f} px/mm\n")

    # --- pasada 2: escalar, alinear y exportar ---
    W, H = CANVAS
    for s in slugs:
        rgb, alpha, pxmm = cars[s]
        factor = target / pxmm

        rgba = Image.fromarray(
            np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8), "RGBA")
        sw = round(W * factor)
        scaled = rgba.resize((sw, round(rgba.height * sw / rgba.width)),
                             Image.LANCZOS)

        a = np.asarray(scaled)[..., 3].astype(np.float32) / 255
        x0, x1, _, _ = bounds(a, 0.235)
        # La vertical se alinea contra el remate SÓLIDO de la goma, no
        # contra la cola tenue del alfa, y queda APOYO px por encima de
        # la línea: la línea va exactamente debajo de la goma, nunca
        # encima de ella.
        _, _, _, y1 = bounds(a, 0.55)
        dx = round(CENTER * W - (x0 + x1) / 2)
        dy = round(GROUND * H - y1) - APOYO

        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(scaled, (dx, dy))

        # un pelo de desenfoque en el alfa: mata el borde dentado sin
        # comerse el contorno
        arr = np.asarray(canvas).astype(np.float32)
        soft = np.asarray(Image.fromarray(arr[..., 3].astype(np.uint8))
                          .filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)
        final = Image.fromarray(
            np.dstack([arr[..., :3], soft]).clip(0, 255).astype(np.uint8), "RGBA")

        if s in CONGELADAS:
            print(f"{s:12} congelada — se deja el archivo publicado")
            continue

        line = f"{s:12} ×{factor:.3f}  "
        for w, suffix, q in SIZES:
            p = f"{OUT}/{s}{suffix}.webp"
            final.resize((w, round(H * w / W)), Image.LANCZOS).save(
                p, "WEBP", quality=q, method=6)
            line += f"{w}:{os.path.getsize(p)//1024}KB "
        print(line)

    # --- comprobación: todos a escala real y sobre la misma línea ---
    print()
    for s in slugs:
        a = np.asarray(Image.open(f"{OUT}/{s}.webp").convert("RGBA"))[..., 3]
        x0, x1, y0, y1 = bounds(a.astype(np.float32) / 255)
        dev = ((x1 - x0) / REAL[s] / target - 1) * 100
        print(f"  {s:12} largo {x1-x0:4d}px  alto {y1-y0:4d}px  "
              f"ruedas {y1/H*100:5.1f}%  desvío {dev:+.1f}%")

    sellar()


def sellar():
    """Escribe en la página la huella de las fotos recién generadas.

    El navegador guarda cada imagen bajo su dirección y, si la dirección
    no cambia, muestra la que ya tenía sin volver a preguntar. Por eso una
    foto corregida puede seguir viéndose vieja durante días —y en el sitio
    publicado es peor, porque además hay un CDN cacheando en el medio.

    La huella resume el contenido de todos los webp, así que cambia sola
    cuando cambia una foto y sólo entonces.
    """
    fotos = sorted(f for f in os.listdir(OUT) if f.endswith(".webp"))
    h = hashlib.md5()
    for f in fotos:
        with open(f"{OUT}/{f}", "rb") as fh:
            h.update(fh.read())
    huella = h.hexdigest()[:8]

    page = os.path.join(BASE, "public", "index.html")
    with open(page, encoding="utf-8") as fh:
        html = fh.read()

    nuevo, n = re.subn(r"const FOTOS = '[0-9a-f]*';",
                       f"const FOTOS = '{huella}';", html)
    if n != 1:
        raise SystemExit(f"no encontré dónde escribir la huella en {page}")

    if nuevo != html:
        with open(page, "w", encoding="utf-8") as fh:
            fh.write(nuevo)
    print(f"\nhuella de las fotos: {huella}  ({len(fotos)} archivos)")


if __name__ == "__main__":
    sys.exit(main())
