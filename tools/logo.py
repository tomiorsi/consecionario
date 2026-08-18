#!/usr/bin/env python3
"""Arma el logo completo en vectores: emblema + letras, en dos formatos.

POR QUE NO SE TRAZA LA IMAGEN. Vectorizar de verdad no es calcar el PNG
—eso deja bordes temblorosos y cientos de nodos de mas— sino rehacer el
dibujo con las piezas que ya son vectores:

  · el emblema MM ya estaba trazado y vive en assets/mark.svg, un solo
    path de 100x100;
  · las letras se sacan de la fuente y se convierten a curvas.

El resultado es un archivo que escala a cualquier tamano sin perder un
pelo, y que no necesita que la fuente este instalada en ningun lado.

LA LETRA ES LA DE LA PAGINA. El encabezado del sitio escribe MANNA en
Montserrat, asi que el logo usa esa misma: si fuera otra, el logo y la
pagina se verian como de dos marcas distintas. Montserrat es SIL OFL, o
sea que convertirla a curvas y usarla en una marca esta permitido.

SIN "MOTORS". Queda el emblema, MANNA y SELECTED.

Los .ttf de Montserrat no se guardan en el repo; se bajan cuando hagan
falta con:

  curl -s -A Mozilla "https://fonts.googleapis.com/css2?family=Montserrat\
:wght@300;400;500;600;700" | grep -oE "https://[^)]+\.ttf"

y se guardan como mont-300.ttf, mont-400.ttf, etc. en la carpeta que se
le pasa como primer argumento.

Uso:  logo.py <carpeta-con-los-ttf> <carpeta-de-salida>
"""
import pathlib, re, sys

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

# ── LAS PROPORCIONES ────────────────────────────────────────────────
# Todo se mide contra el emblema, que vale 100 de lado. Los numeros
# salen de medir el logo original: MANNA ocupa 2,8 anchos de emblema y
# SELECTED 3,28, con alturas de mayuscula de 0,32 y 0,24.
EMBLEMA   = 100.0
MANNA_ALT = 32.0     # altura de mayuscula
MANNA_AN  = 280.0    # ancho final, del que sale el espaciado
SEL_ALT   = 24.0
SEL_AN    = 328.0

PESO_MANNA = 500     # el mismo que usa el encabezado del sitio
PESO_SEL   = 600     # SELECTED va mas firme, como en el original

RAYA = "–"      # el guion corto que flanquea a SELECTED


def cargar(carpeta, peso):
    f = TTFont(pathlib.Path(carpeta) / f"mont-{peso}.ttf")
    return {
        "glifos": f.getGlyphSet(),
        "cmap":   f.getBestCmap(),
        "upem":   f["head"].unitsPerEm,
        "cap":    getattr(f["OS/2"], "sCapHeight", None) or f["head"].unitsPerEm * 0.7,
    }


def escribir(fuente, texto, alto_may, ancho_final):
    """Devuelve (path, ancho, alto) del texto ya convertido a curvas.

    El espaciado entre letras NO se elige a ojo: se despeja para que el
    conjunto mida exactamente `ancho_final`. Asi las dos lineas del logo
    quedan alineadas por los costados sin tener que tantear.
    """
    esc = alto_may / fuente["cap"]          # de unidades de fuente a las nuestras
    avances, nombres = [], []
    for ch in texto:
        n = fuente["cmap"][ord(ch)]
        nombres.append(n)
        avances.append(fuente["glifos"][n].width * esc)

    natural = sum(avances)
    huecos  = len(texto) - 1
    entre   = (ancho_final - natural) / huecos if huecos else 0

    partes, x = [], 0.0
    for n, av in zip(nombres, avances):
        pluma = SVGPathPen(fuente["glifos"])
        # La fuente tiene la Y para arriba y el SVG para abajo: el -esc
        # da vuelta el eje. El +alto_may deja la linea de base abajo.
        t = Transform(esc, 0, 0, -esc, x, alto_may)
        fuente["glifos"][n].draw(TransformPen(pluma, t))
        d = pluma.getCommands()
        if d:
            partes.append(d)
        x += av + entre

    return " ".join(partes), ancho_final, alto_may


def emblema_path():
    svg = (pathlib.Path(__file__).resolve().parent.parent
           / "public" / "assets" / "mark.svg").read_text(encoding="utf-8")
    return re.search(r'\sd="([^"]+)"', svg).group(1)


def armar(fmt, mm, manna, selected):
    """Compone el SVG. `fmt` es 'apilado' u 'horizontal'.

    DOS REGLAS DE RELLENO DISTINTAS, Y NO ES UN DETALLE. El emblema esta
    dibujado para `evenodd` —asi vino trazado, y con esa regla los
    huecos del monograma quedan calados—, pero los glifos de una fuente
    TrueType se rellenan con `nonzero`. Poniendole evenodd a las letras,
    los contornos que se superponen se cancelan y las letras salen
    huecas, como de contorno. Por eso cada grupo lleva la suya.
    """
    _, m_an, m_alt = manna
    _, s_an, s_alt = selected

    if fmt == "apilado":
        # El emblema arriba, centrado sobre el bloque de texto.
        ancho = max(m_an, s_an)
        hueco1, hueco2 = 26.0, 30.0
        alto = EMBLEMA + hueco1 + m_alt + hueco2 + s_alt
        piezas = [
            (mm,         (ancho - EMBLEMA) / 2, 0.0,                              "evenodd"),
            (manna[0],   (ancho - m_an) / 2,    EMBLEMA + hueco1,                 "nonzero"),
            (selected[0],(ancho - s_an) / 2,    EMBLEMA + hueco1 + m_alt + hueco2,"nonzero"),
        ]
    else:
        # El emblema a la izquierda; MANNA y SELECTED apilados a su
        # derecha, y el conjunto centrado contra el alto del emblema.
        sep = 34.0
        hueco = 14.0
        bloque = m_alt + hueco + s_alt
        alto = max(EMBLEMA, bloque)
        ancho = EMBLEMA + sep + max(m_an, s_an)
        y0 = (alto - bloque) / 2
        # LAS DOS LINEAS SE CENTRAN ENTRE SI, no se alinean a la
        # izquierda. SELECTED es mas ancho que MANNA, asi que alineados
        # por el borde izquierdo sobresalia solo hacia la derecha y el
        # bloque quedaba torcido. Centrados, lo que sobra se reparte a
        # los dos lados y se lee como una sola pieza.
        texto_an = max(m_an, s_an)
        piezas = [
            (mm,          0.0, (alto - EMBLEMA) / 2, "evenodd"),
            (manna[0],    EMBLEMA + sep + (texto_an - m_an) / 2, y0,                 "nonzero"),
            (selected[0], EMBLEMA + sep + (texto_an - s_an) / 2, y0 + m_alt + hueco, "nonzero"),
        ]

    cuerpo = []
    for d, dx, dy, regla in piezas:
        cuerpo.append(f'<path transform="translate({dx:.2f},{dy:.2f})" '
                      f'fill-rule="{regla}" d="{d}"/>')

    return (f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {ancho:.2f} {alto:.2f}" '
            f'fill="currentColor" '
            f'role="img" aria-label="Manna Selected">'
            + "".join(cuerpo) + "</svg>")


if __name__ == "__main__":
    fuentes, salida = sys.argv[1], pathlib.Path(sys.argv[2])
    salida.mkdir(parents=True, exist_ok=True)

    f_manna = cargar(fuentes, PESO_MANNA)
    f_sel   = cargar(fuentes, PESO_SEL)

    mm = emblema_path()
    manna = escribir(f_manna, "MANNA", MANNA_ALT, MANNA_AN)
    sel   = escribir(f_sel, f"{RAYA} SELECTED {RAYA}", SEL_ALT, SEL_AN)

    for fmt, nombre in (("apilado", "logo-apilado.svg"),
                        ("horizontal", "logo-horizontal.svg")):
        svg = armar(fmt, mm, manna, sel)
        (salida / nombre).write_text(svg, encoding="utf-8")
        print(f"   {nombre:<24} {len(svg)/1024:5.1f} KB")
