#!/usr/bin/env python3
"""Dibuja el mapa del barrio como SVG, con datos reales de OpenStreetMap.

POR QUE NO UN GOOGLE MAPS EMBEBIDO:
  · un iframe se traga los clics, y lo que se pidio es que TOCAR el mapa
    abra Google Maps — con un iframe adentro eso no se puede;
  · no se puede pintar oscuro sin la API con clave y facturacion;
  · son cientos de KB y una conexion a Google en cada visita.

Dibujado a mano son unos 20 KB del color exacto del sitio, sin clave,
sin pedido externo y sin nada que se trague el clic. Y algo que un mapa
comprado no puede hacer: resaltar el Pasaje Lanin sobre el resto.

EL CENTRO SALE DE LOS NUMEROS DE PUERTA, NO DEL EJE DE LA CALLE.
La primera version centraba en el medio geometrico del Pasaje Lanin y
quedaba 128 m del lugar. OSM tiene las puertas cargadas (149, 150, 151,
152, 199, 200...), asi que el 154 se interpola entre las reales.

SE GENERAN DOS ARCHIVOS. El mismo SVG se ve a 1440 px de ancho en
computadora y a unos 560 en telefono: con un solo archivo, o los
nombres de calle son enormes en uno o ilegibles en el otro. El de
telefono ademas abarca menos cuadras, porque en una pantalla angosta
entra menos.

Uso:  mapa-barracas.py <salida.svg> <volcado-overpass.json> [radio_m] [tam_texto]
"""
import json, math, sys, unicodedata

LAT, LON = -34.640808, -58.378815    # Pasaje Lanin 154
LADO     = 1000                      # lado del SVG en unidades

RADIO_M  = float(sys.argv[3]) if len(sys.argv) > 3 else 340
TXT      = float(sys.argv[4]) if len(sys.argv) > 4 else 15

M_POR_GRADO_LAT = 111_320
M_POR_GRADO_LON = 111_320 * math.cos(math.radians(LAT))

dlat = RADIO_M / M_POR_GRADO_LAT
dlon = RADIO_M / M_POR_GRADO_LON
S, N = LAT - dlat, LAT + dlat
O, E = LON - dlon, LON + dlon


def a_svg(lat, lon):
    return ((lon - O) / (E - O) * LADO,
            (N - lat) / (N - S) * LADO)        # y crece hacia abajo


# Grosor y capa segun el tipo de calle. El orden importa: primero las
# chicas, despues las grandes, asi las avenidas quedan por encima.
#
# LOS GRISES SON NEUTROS Y ESO ES A PROPOSITO. Antes eran azul-grises
# (#31363F, #4A515D, #5A6270...), copiados del estilo nocturno de Google.
# Sobre una pagina que es negra de punta a punta ese azulado se leia como
# una mancha fria, y era lo unico de color en toda la pantalla.
#
# Los neutros de ahora NO se eligieron a ojo: cada uno tiene exactamente
# la misma luminancia que el azul-gris que reemplazo, calculada en sRGB
# lineal. Por eso la jerarquia —calle fina y oscura, avenida gruesa y
# clara— quedo intacta: lo unico que se fue es el tinte.
CAPAS = [
    (("service", "footway", "path", "pedestrian", "steps", "track"), 0.9, "#363636"),
    (("residential", "unclassified", "living_street", "road"),       1.8, "#515151"),
    (("tertiary", "tertiary_link"),                                  2.6, "#616161"),
    (("secondary", "secondary_link"),                                3.4, "#707070"),
    (("primary", "primary_link", "trunk", "trunk_link",
      "motorway", "motorway_link"),                                  4.6, "#838383"),
]

# Como los escribe Google en el mapa, que es con lo que se compara.
COMO_SE_LLAMAN = {
    "Lanín": "Pje. Lanín",
    "Icalma": "Pje. Icalma",
    "Copahue": "Pje. Copahue",
    "Avenida Suárez": "Av. Suárez",
    "Coronel Rico": "Cnel. Rico",
    "Hipólito Vieytes": "Vieytes",
    "José Aarón Salmún Feijoo": "Salmún Feijóo",
    "Gregorio Aráoz de Lamadrid": "Lamadrid",
    "Benito Quinquela Martín": "Quinquela Martín",
    "Doctor Ramón Carrillo": "Dr. Ramón Carrillo",
    "Autopista Presidente Arturo Frondizi": "Au. Frondizi",
    "Avenida Pinedo": "Av. Pinedo",
}

# Nada de esto es una calle por la que alguien llegue: no se rotula.
NO_ROTULAR = ("Ciclovía", "FC ", "Extensión")


def traer(ruta):
    """Lee el volcado de Overpass ya bajado. Se baja aparte porque el
    servidor publico se cae seguido y no tiene sentido reintentar el
    dibujo entero cada vez."""
    return json.load(open(ruta, encoding="utf-8"))


def fuera(pts, margen=20):
    return (max(x for x, _ in pts) < -margen or min(x for x, _ in pts) > LADO + margen or
            max(y for _, y in pts) < -margen or min(y for _, y in pts) > LADO + margen)


def d_de(pts):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)


def recortar(p, q, lo=30, hi=LADO-30):
    """Corta el tramo p→q contra el recuadro visible (Liang-Barsky).

    Hace falta para los rotulos. Sin esto se elegia el tramo mas largo
    de TODA la calle, y si ese tramo entraba y salia del recuadro su
    punto medio podia caer afuera: Avenida Suarez daba centro en x=-248
    y se quedaba sin nombre aunque cruza el mapa entero. Recortando
    primero, el medio siempre cae adentro.

    El margen de 30 evita ademas que un nombre quede pegado al borde.
    """
    x1, y1 = p
    x2, y2 = q
    dx, dy = x2 - x1, y2 - y1
    t0, t1 = 0.0, 1.0
    for num, den in ((-dx, x1 - lo), (dx, hi - x1), (-dy, y1 - lo), (dy, hi - y1)):
        if num == 0:
            if den < 0:
                return None
        else:
            r = den / num
            if num < 0:
                if r > t1: return None
                if r > t0: t0 = r
            else:
                if r < t0: return None
                if r < t1: t1 = r
    return ((x1 + t0*dx, y1 + t0*dy), (x1 + t1*dx, y1 + t1*dy))


def main():
    d = traer(sys.argv[2])
    calles, vias_tren, lanin = [], [], []
    tramos_por_nombre = {}
    clase_por_nombre = {}

    for e in d.get("elements", []):
        g = e.get("geometry")
        if not g:
            continue
        pts = [a_svg(p["lat"], p["lon"]) for p in g]
        if fuera(pts):
            continue
        t = e.get("tags", {})
        nombre = t.get("name") or ""

        if t.get("highway"):
            # Nombre EXACTO. Con coincidencia parcial entraban tambien
            # "Jovellanos" y "Magallanes", y quedaban resaltadas tres
            # calles que no son la que importa.
            if nombre == "Lanín":
                lanin.append(pts)
            calles.append((t["highway"], pts))
            if nombre and not nombre.startswith(NO_ROTULAR):
                tramos_por_nombre.setdefault(nombre, []).extend(
                    zip(pts, pts[1:]))
                clase_por_nombre[nombre] = t["highway"]
        elif t.get("railway"):
            vias_tren.append(pts)

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LADO} {LADO}" '
           f'width="{LADO}" height="{LADO}" fill="none">',
           '<rect width="100%" height="100%" fill="#0B0C10"/>']

    for tipos, ancho, color in CAPAS:
        trozos = [p for h, p in calles if h in tipos]
        if not trozos:
            continue
        out.append(f'<g stroke="{color}" stroke-width="{ancho}" '
                   f'stroke-linecap="round" stroke-linejoin="round">')
        out += [f'<path d="{d_de(p)}"/>' for p in trozos]
        out.append('</g>')

    for pts in vias_tren:
        out.append(f'<path d="{d_de(pts)}" stroke="#3C3C3C" stroke-width="1.6" '
                   f'stroke-dasharray="6 5"/>')

    # EL PASAJE, ENCIMA DE TODO Y EN CLARO. Es de lo que habla la
    # seccion: el resto del barrio esta para dar contexto, no para
    # competir.
    if lanin:
        out.append('<g stroke="#FFFFFF" stroke-width="4.6" stroke-linecap="round">')
        out += [f'<path d="{d_de(p)}"/>' for p in lanin]
        out.append('</g>')

    # ── LOS NOMBRES ────────────────────────────────────────────────
    # Uno por calle, sobre su tramo mas largo dentro del recuadro y
    # girado con el. Un rotulo horizontal sobre una calle diagonal se
    # lee como una etiqueta pegada encima; girado se lee como un mapa.
    out.append(f'<g font-family="system-ui,-apple-system,Helvetica,Arial,sans-serif" '
               f'font-size="{TXT}" letter-spacing="{TXT*0.06:.2f}" '
               f'fill="#919191" stroke="#000000" stroke-width="{TXT*0.30:.2f}" '
               f'paint-order="stroke" stroke-linejoin="round" '
               f'text-anchor="middle">')

    # Se resuelven por orden de importancia y no alfabetico: si dos
    # nombres se pelean el mismo lugar, tiene que ganar la avenida y no
    # el pasaje que salia primero en la lista.
    RANGO = {"motorway": 5, "trunk": 5, "primary": 4, "secondary": 3,
             "tertiary": 2, "residential": 1, "living_street": 1}

    def peso(item):
        nombre, tramos = item
        largo = sum(math.hypot(b[0]-a[0], b[1]-a[1]) for a, b in tramos)
        return (-RANGO.get(clase_por_nombre.get(nombre, ""), 0), -largo)

    puestos = []
    for nombre, tramos in sorted(tramos_por_nombre.items(), key=peso):
        # El tramo recto mas largo YA RECORTADO al recuadro: es donde el
        # nombre entra sin cruzar una esquina y sin irse del mapa.
        mejor, largo = None, 0
        for a, b in tramos:
            c = recortar(a, b)
            if not c:
                continue
            L = math.hypot(c[1][0]-c[0][0], c[1][1]-c[0][1])
            if L > largo:
                largo, mejor = L, c
        if not mejor:
            continue

        texto = COMO_SE_LLAMAN.get(nombre, nombre)
        # Si el nombre no entra en el tramo, no se rotula: mejor sin
        # nombre que un nombre montado sobre una esquina.
        if largo < len(texto) * TXT * 0.52:
            continue

        (x1, y1), (x2, y2) = mejor
        cx, cy = (x1+x2)/2, (y1+y2)/2
        # Sin encimarse con otro rotulo ya puesto.
        if any(math.hypot(cx-px, cy-py) < TXT*3.2 for px, py in puestos):
            continue
        puestos.append((cx, cy))

        ang = math.degrees(math.atan2(y2-y1, x2-x1))
        if ang > 90:   ang -= 180        # que nunca quede cabeza abajo
        if ang < -90:  ang += 180

        esc = unicodedata.normalize("NFC", texto).replace("&", "&amp;")
        out.append(f'<text transform="translate({cx:.1f},{cy:.1f}) rotate({ang:.1f})" '
                   f'dy="-{TXT*0.42:.1f}">{esc}</text>')

    out.append('</g>')
    out.append('</svg>')

    svg = "\n".join(out)
    open(sys.argv[1], "w", encoding="utf-8").write(svg)
    print(f"   radio {RADIO_M:.0f} m · texto {TXT:.0f} · calles {len(calles)} · "
          f"pasaje {len(lanin)} · rotulos {len(puestos)} · {len(svg)/1024:.1f} KB")


main()
