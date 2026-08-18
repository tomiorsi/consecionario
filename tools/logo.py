#!/usr/bin/env python3
"""Arma el logo en vectores, en dos formatos, desde el archivo original.

POR QUE SE TRAZA Y NO SE REHACE CON UNA FUENTE.

El primer intento fue rehacer las letras con Montserrat, que es la
tipografia del sitio. Estaba mal, y se vio comparando: la A del logo NO
LLEVA TRAVESANO —es un triangulo limpio— y la N tiene otra
construccion. Medido pixel a pixel contra el original, Montserrat daba
36% de coincidencia; el trazado da 98,5%.

Es una tipografia de display que no tengo, y de un JPEG no se puede
identificar con certeza cual es. Asi que se traza la del archivo: queda
exactamente la misma letra, que es lo que se pidio.

EL EMBLEMA NO SE TRAZA. Ya estaba vectorizado en assets/mark.svg, y un
vector limpio siempre le gana a un calcado del mismo dibujo.

LOS DOS ARMADOS

  apilado     igual al original: emblema, MANNA, MOTORS entre rayas y
              SELECTED entre guiones. Las posiciones son las del archivo,
              medidas, no reinterpretadas.
  horizontal  emblema a la izquierda, MANNA y SELECTED apilados a su
              derecha. SIN "MOTORS", que es lo que se pidio para este.

LOS COLORES TAMBIEN SALEN DE MEDIR. No son blanco pleno: cada pieza
tiene su degradado, muestreado del original cada 11% de su alto.

Uso:  logo.py <ref.png> <carpeta-de-salida>
"""
import pathlib, re, sys
import cv2

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from trazar import trazar

# ── DONDE ESTA CADA COSA EN EL ARCHIVO ORIGINAL (1280x853) ──────────
# Salen de segmentar la imagen por bandas de tinta y medir cada una.
CAJAS = {
    "manna":    (424, 507,  302,  992),
    "motors":   (539, 564,  302,  992),   # lleva las dos rayas al lado
    "selected": (599, 654,  224, 1068),   # lleva los dos guiones
}
EMBLEMA = (150, 394, 519, 761)            # solo para saber su tamano

# El emblema del archivo mide 242x244; el vector limpio es un cuadrado
# de 100, asi que se escala a ese alto.
EMB_LADO = 244.0

# ── LOS DEGRADADOS, MUESTREADOS DEL ORIGINAL ───────────────────────
# De arriba hacia abajo. El de SELECTED es el unico realmente metalico:
# oscuro arriba, brillo al 44%, y vuelve a oscurecer.
DEGRADES = {
    "emblema":  [(0.00, "#FCFCFC"), (0.33, "#F9F9F9"), (0.66, "#E3E3E3"),
                 (1.00, "#C4C4C4")],
    "manna":    [(0.00, "#FCFCFC"), (1.00, "#FAFAFA")],
    "motors":   [(0.00, "#FCFCFC"), (1.00, "#F9F9F9")],
    "selected": [(0.00, "#A6A6A6"), (0.22, "#E1E1E1"), (0.44, "#FAFAFA"),
                 (0.65, "#C4C4C4"), (1.00, "#8A8A8A")],
}


def emblema_path():
    svg = (pathlib.Path(__file__).resolve().parent.parent
           / "public" / "assets" / "mark.svg").read_text(encoding="utf-8")
    return re.search(r'\sd="([^"]+)"', svg).group(1)


def defs(usados):
    """Un degradado por pieza. objectBoundingBox para que cada uno se
    estire sobre su propia caja y no sobre el lienzo entero."""
    out = []
    for n in usados:
        topes = "".join(
            f'<stop offset="{p:.2f}" stop-color="{c}"/>' for p, c in DEGRADES[n])
        out.append(f'<linearGradient id="g-{n}" x1="0" y1="0" x2="0" y2="1">'
                   f'{topes}</linearGradient>')
    return "<defs>" + "".join(out) + "</defs>"


def pieza(d, dx, dy, esc, relleno, regla="evenodd"):
    t = f"translate({dx:.2f},{dy:.2f})"
    if esc != 1.0:
        t += f" scale({esc:.5f})"
    return (f'<path transform="{t}" fill="url(#g-{relleno})" '
            f'fill-rule="{regla}" d="{d}"/>')


if __name__ == "__main__":
    ref, salida = sys.argv[1], pathlib.Path(sys.argv[2])
    salida.mkdir(parents=True, exist_ok=True)
    img = cv2.imread(ref, cv2.IMREAD_GRAYSCALE)

    trazos = {}
    for n, (y0, y1, x0, x1) in CAJAS.items():
        d, w, h = trazar(img[y0:y1, x0:x1])
        trazos[n] = (d, float(w), float(h))
        print(f"   {n:<9} trazado  {w}x{h}")

    mm = emblema_path()
    esc_emb = EMB_LADO / 100.0

    # ── APILADO: las posiciones del original, tal cual ──────────────
    ey0, ey1, ex0, ex1 = EMBLEMA
    izq = min(ex0, *[CAJAS[n][2] for n in CAJAS])
    der = max(ex1, *[CAJAS[n][3] for n in CAJAS])
    arr, aba = ey0, max(CAJAS[n][1] for n in CAJAS)
    an, al = der - izq, aba - arr

    cuerpo = [pieza(mm, ex0 - izq, ey0 - arr, esc_emb, "emblema")]
    for n in ("manna", "motors", "selected"):
        y0, y1, x0, x1 = CAJAS[n]
        cuerpo.append(pieza(trazos[n][0], x0 - izq, y0 - arr, 1.0, n))
    (salida / "logo-apilado.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {an} {al}" '
        f'role="img" aria-label="Manna Motors Selected">'
        + defs(("emblema", "manna", "motors", "selected"))
        + "".join(cuerpo) + "</svg>", encoding="utf-8")

    # ── HORIZONTAL: sin MOTORS ──────────────────────────────────────
    m_d, m_an, m_al = trazos["manna"]
    s_d, s_an, s_al = trazos["selected"]
    SEP, HUECO = 62.0, 34.0
    bloque_an = max(m_an, s_an)
    bloque_al = m_al + HUECO + s_al
    an2 = EMB_LADO + SEP + bloque_an
    al2 = max(EMB_LADO, bloque_al)
    y0b = (al2 - bloque_al) / 2
    x0b = EMB_LADO + SEP
    cuerpo2 = [
        pieza(mm, 0.0, (al2 - EMB_LADO) / 2, esc_emb, "emblema"),
        # Las dos lineas se centran ENTRE SI: SELECTED es mas ancho que
        # MANNA, y alineadas a la izquierda el bloque queda torcido.
        pieza(m_d, x0b + (bloque_an - m_an) / 2, y0b, 1.0, "manna"),
        pieza(s_d, x0b + (bloque_an - s_an) / 2, y0b + m_al + HUECO, 1.0, "selected"),
    ]
    (salida / "logo-horizontal.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {an2:.0f} {al2:.0f}" '
        f'role="img" aria-label="Manna Selected">'
        + defs(("emblema", "manna", "selected"))
        + "".join(cuerpo2) + "</svg>", encoding="utf-8")

    for f in ("logo-apilado.svg", "logo-horizontal.svg"):
        print(f"   {f:<24} {(salida / f).stat().st_size/1024:5.1f} KB")
