#!/usr/bin/env python3
"""
Convierte las fotos crudas de source/ en los recortes que usa la web.

    python3 tools/build-cars.py

Qué hace, y por qué cada paso:

1. RECORTA el auto. Las fotos vienen contra negro absoluto, así que todo
   pixel que levanta por encima del negro es auto. Después RELLENA el
   interior columna por columna — sin eso, un auto negro (el GLC) o los
   vidrios polarizados quedan traslúcidos y se ve el fondo a través.

2. CALIBRA la escala. El generador dibuja a ojo: cada auto sale de un
   tamaño distinto sin relación con la realidad. Acá se mide el largo en
   píxeles, se compara contra el largo real de fábrica (tabla REAL) y se
   escala para que todos compartan la misma relación px/mm. Por eso un
   SUV sigue viéndose más alto que un coupé: porque lo es.

3. ALINEA. Todos los autos quedan apoyando sobre la misma línea de piso
   (GROUND) y centrados en el mismo eje (CENTER). Eso es lo que hace que
   al cambiar de auto se lea como un reemplazo y no como un salto.

4. EXPORTA tres tamaños. El @2x existe para pantallas retina, que piden
   el doble de píxeles de los que mide la ventana.

Sale a public/assets/cars/, que es la carpeta que se publica.

Para sumar un auto: dejá la foto en source/<slug>.png y agregá su largo
real de fábrica —en milímetros— a la tabla REAL.
"""

from PIL import Image, ImageFilter
import numpy as np
import os
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

CANVAS = (1672, 941)   # lienzo de salida, proporción de las fotos
GROUND = 0.740         # dónde apoyan las ruedas
CENTER = 0.500         # eje horizontal del auto

# (ancho, sufijo, calidad). El @2x es para retina.
SIZES = [(3344, "@2x", 88), (1672, "", 94), (1100, "@sm", 88)]


def cutout(path):
    """Devuelve (rgb, alpha) del auto recortado sobre su lienzo original."""
    im = Image.open(path).convert("RGB")
    rgb = np.asarray(im).astype(np.float32)

    # el fondo es negro absoluto: lo que levanta por encima de ~2.5 es auto
    alpha = np.clip((rgb.max(2) - 2.5) / 9.0, 0, 1)

    # Relleno del interior. Un auto es macizo: entre el punto más alto y
    # el más bajo de cada columna no puede haber transparencia. Sin esto
    # se ve el fondo a través de un auto negro.
    solid = alpha > 0.30
    ys, xs = np.where(solid)
    if xs.size == 0:
        raise SystemExit(f"no se encontró ningún auto en {path}")

    # El relleno se corta en la línea de las ruedas. Algunas fotos traen
    # una neblina tenue en el piso —luminancia 14 sobre 255— que igual
    # supera el umbral, y sin este tope el relleno bajaba hasta ella y
    # le colgaba al auto unas patas negras debajo de cada neumático.
    #
    # La línea se busca con un umbral alto (45) porque a esa altura sólo
    # queda chapa y goma: la neblina no llega.
    fuerte = rgb.max(2) > 45
    ground = np.where(fuerte.sum(1) > 3)[0].max()

    for x in range(xs.min(), xs.max() + 1):
        col = np.where(solid[:ground + 1, x])[0]
        if col.size > 3:
            alpha[col.min(): col.max() + 1, x] = 1.0

    return rgb, alpha


def bounds(alpha, thr=0.25):
    cols = np.where(alpha.max(0) > thr)[0]
    rows = np.where(alpha.max(1) > thr)[0]
    return cols.min(), cols.max(), rows.min(), rows.max()


def chassis(rgb, alpha):
    """Caja del auto en sí, ignorando la neblina del piso.

    Medir con el alfa no sirve para alinear: algunas fotos traen un velo
    tenue de suelo que se extiende por debajo de los neumáticos, y si el
    borde inferior del alfa se toma como línea de apoyo, el auto queda
    flotando por encima de la barra de luz. Con umbral alto sólo quedan
    chapa y goma, que es lo que de verdad toca el piso.
    """
    fuerte = (rgb.max(2) > 45) & (alpha > 0.5)
    cols = np.where(fuerte.sum(0) > 2)[0]
    rows = np.where(fuerte.sum(1) > 2)[0]
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
        x0, x1, _, _ = chassis(rgb, alpha)
        # px por mm, normalizado al ancho del lienzo de salida
        cars[s] = (rgb, alpha, (x1 - x0) / rgb.shape[1] * CANVAS[0] / REAL[s])

    target = float(np.mean([c[2] for c in cars.values()]))
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

        sa = np.asarray(scaled).astype(np.float32)
        x0, x1, _, y1 = chassis(sa[..., :3], sa[..., 3] / 255)
        dx = round(CENTER * W - (x0 + x1) / 2)
        dy = round(GROUND * H - y1)          # y1 = donde apoya el neumático

        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(scaled, (dx, dy))

        # un pelo de desenfoque en el alfa: mata el borde dentado sin
        # comerse el contorno
        arr = np.asarray(canvas).astype(np.float32)
        soft = np.asarray(Image.fromarray(arr[..., 3].astype(np.uint8))
                          .filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32)
        final = Image.fromarray(
            np.dstack([arr[..., :3], soft]).clip(0, 255).astype(np.uint8), "RGBA")

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
        im = np.asarray(Image.open(f"{OUT}/{s}.webp").convert("RGBA")).astype(np.float32)
        x0, x1, y0, y1 = chassis(im[..., :3], im[..., 3] / 255)
        dev = ((x1 - x0) / REAL[s] / target - 1) * 100
        print(f"  {s:12} largo {x1-x0:4d}px  alto {y1-y0:4d}px  "
              f"ruedas {y1/H*100:5.1f}%  desvío {dev:+.1f}%")


if __name__ == "__main__":
    sys.exit(main())
