#!/usr/bin/env python3
"""Versiones planas del logo, sin reflejos, a partir de los SVG con
degradado que ya genera logo.py.

POR QUE NO SE VUELVE A TRAZAR NADA. La geometria de las letras y el
emblema ya esta resuelta y verificada contra el original (98,3% y 95,2%
de coincidencia — ver logo.py). Lo unico que cambia acá es el relleno:
se le saca el <defs> con los degradados y cada <path> pasa a un color
solido. Es una operacion de texto sobre el SVG, no una regeneracion.

SEIS ARCHIVOS: los dos formatos (apilado, horizontal) por los tres
colores (gris, blanco, negro).

EL GRIS NO ES EL PROMEDIO DEL DEGRADADO. Se toma el tono medio de la
rampa de SELECTED —la pieza mas metalica, la que mejor representa "gris
Manna"— en vez de mezclar los tres degradados entre si, que daria un
gris sin relacion con ninguna pieza real del logo.

Uso:  logo-plano.py <carpeta-con-los-svg-con-degradado> <carpeta-de-salida>
"""
import pathlib, re, sys

GRIS = "#8A8A8A"   # el tono medio de la rampa de SELECTED, medida en logo.py
COLORES = {"gris": GRIS, "blanco": "#FFFFFF", "negro": "#000000"}


def aplanar(svg, color):
    # Sin <defs>: los degradados no hacen falta si no hay reflejo.
    svg = re.sub(r"<defs>.*?</defs>", "", svg, flags=re.S)
    # Cada path apuntaba a su propio degradado; ahora todos al mismo color.
    svg = re.sub(r'fill="url\(#g-[a-z]+\)"', f'fill="{color}"', svg)
    return svg


if __name__ == "__main__":
    entrada, salida = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    salida.mkdir(parents=True, exist_ok=True)

    for base in ("logo-apilado", "logo-horizontal"):
        svg = (entrada / f"{base}.svg").read_text(encoding="utf-8")
        for nombre, color in COLORES.items():
            plano = aplanar(svg, color)
            out = salida / f"{base}-{nombre}.svg"
            out.write_text(plano, encoding="utf-8")
            print(f"   {out.name:<32} {out.stat().st_size/1024:5.1f} KB")
