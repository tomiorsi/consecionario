#!/usr/bin/env python3
"""Dibuja el mapa del barrio como SVG, con datos reales de OpenStreetMap.

POR QUE NO UN GOOGLE MAPS EMBEBIDO:
  · un iframe se traga los clics, y lo que se pidio es que TOCAR el mapa
    abra Google Maps — con un iframe adentro eso no se puede;
  · no se puede pintar oscuro sin la API con clave y facturacion;
  · son cientos de KB y una conexion a Google en cada visita.

Dibujado a mano es un archivo de pocos KB, del color exacto del sitio,
sin clave, sin pedido externo y sin nada que se trague el clic. Y algo
que un mapa comprado no puede hacer: resaltar el Pasaje Lanin sobre el
resto de las calles, que es justamente de lo que habla la seccion.
"""
import json, math, urllib.request, urllib.parse, sys

LAT, LON = -34.639761, -58.379401   # Pasaje Lanin
RADIO_M  = 360                      # medio lado del recuadro, en metros
LADO     = 1000                     # lado del SVG en unidades

M_POR_GRADO_LAT = 111_320
M_POR_GRADO_LON = 111_320 * math.cos(math.radians(LAT))

dlat = RADIO_M / M_POR_GRADO_LAT
dlon = RADIO_M / M_POR_GRADO_LON
S, N = LAT - dlat, LAT + dlat
O, E = LON - dlon, LON + dlon

CONSULTA = f"""
[out:json][timeout:60];
(
  way["highway"]({S},{O},{N},{E});
  way["railway"~"rail|light_rail"]({S},{O},{N},{E});
  way["natural"="water"]({S},{O},{N},{E});
  way["waterway"="riverbank"]({S},{O},{N},{E});
);
out geom;
"""

def traer():
    """Lee el volcado de Overpass ya bajado. Se baja aparte porque el
    servidor publico se cae seguido y no tiene sentido reintentar el
    dibujo entero cada vez."""
    return json.load(open(sys.argv[2], encoding="utf-8"))

def a_svg(lat, lon):
    x = (lon - O) / (E - O) * LADO
    y = (N - lat) / (N - S) * LADO          # y crece hacia abajo
    return x, y

# Grosor y capa segun el tipo de calle. El orden importa: primero las
# chicas, despues las grandes, asi las avenidas quedan por encima.
CAPAS = [
    (("service", "footway", "path", "pedestrian", "steps", "track"), 0.9, "#31363F"),
    (("residential", "unclassified", "living_street", "road"),       1.8, "#4A515D"),
    (("tertiary", "tertiary_link"),                                  2.6, "#5A6270"),
    (("secondary", "secondary_link"),                                3.4, "#69717F"),
    (("primary", "primary_link", "trunk", "trunk_link",
      "motorway", "motorway_link"),                                  4.6, "#7C8492"),
]

def main():
    d = traer()
    calles, vias_tren, agua, lanin = [], [], [], []

    for e in d.get("elements", []):
        g = e.get("geometry")
        if not g: continue
        pts = [a_svg(p["lat"], p["lon"]) for p in g]
        if (max(x for x, _ in pts) < -20 or min(x for x, _ in pts) > LADO + 20 or
            max(y for _, y in pts) < -20 or min(y for _, y in pts) > LADO + 20):
            continue
        t = e.get("tags", {})
        nombre = (t.get("name") or "")
        if t.get("highway"):
            # Nombre EXACTO. Con una coincidencia parcial entraban
            # tambien "Jovellanos" y "Magallanes", y quedaban resaltadas
            # tres calles que no son la que importa.
            if nombre == "Lanín":
                lanin.append(pts)
            calles.append((t["highway"], pts))
        elif t.get("railway"):
            vias_tren.append(pts)
        else:
            agua.append(pts)

    def d_de(pts, cerrar=False):
        s = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        return s + ("Z" if cerrar else "")

    out = []
    out.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LADO} {LADO}" '
               f'width="{LADO}" height="{LADO}" fill="none">')
    out.append('<rect width="100%" height="100%" fill="#101216"/>')

    for pts in agua:
        out.append(f'<path d="{d_de(pts, True)}" fill="#161B22"/>')

    for tipos, ancho, color in CAPAS:
        trozos = [p for h, p in calles if h in tipos]
        if not trozos: continue
        out.append(f'<g stroke="{color}" stroke-width="{ancho}" '
                   f'stroke-linecap="round" stroke-linejoin="round">')
        for pts in trozos:
            out.append(f'<path d="{d_de(pts)}"/>')
        out.append('</g>')

    for pts in vias_tren:
        out.append(f'<path d="{d_de(pts)}" stroke="#363C48" stroke-width="1.6" '
                   f'stroke-dasharray="6 5"/>')

    # EL PASAJE, ENCIMA DE TODO Y EN CLARO. Es de lo que habla la seccion:
    # el resto del barrio esta para dar contexto, no para competir.
    if lanin:
        out.append('<g stroke="#F2F4F8" stroke-width="4.6" stroke-linecap="round">')
        for pts in lanin:
            out.append(f'<path d="{d_de(pts)}"/>')
        out.append('</g>')

    out.append('</svg>')

    svg = "\n".join(out)
    open(sys.argv[1], "w", encoding="utf-8").write(svg)
    print(f"   calles {len(calles)}  ·  tramos del pasaje {len(lanin)}  ·  "
          f"vias {len(vias_tren)}  ·  agua {len(agua)}")
    print(f"   {len(svg)/1024:.1f} KB")

main()
