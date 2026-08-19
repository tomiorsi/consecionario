#!/usr/bin/env python3
"""Recorta una foto de auto sobre fondo negro y la deja en el lienzo que
usan las cuatro fotos del garage.

POR QUE HACE FALTA UN RECORTE Y NO ALCANZA CON EL FONDO NEGRO. La pagina
es negro puro, asi que una foto opaca de fondo negro se funde sola y no
se ve ningun borde. Pero en el carrusel los autos se pisan entre si: el
de adelante taparia al de atras con un rectangulo negro. Hace falta alfa.

POR QUE NO SE USA LA LUMINANCIA COMO ALFA. Seria la cuenta obvia —cuanto
mas brillante, mas opaco— y rompe justo donde importa: las gomas, los
vidrios polarizados y la sombra que el auto tira sobre la tarima son tan
negros como el fondo, asi que desaparecerian. El auto quedaria flotando
sin ruedas.

LO QUE SE HACE EN CAMBIO es buscar el FONDO, no el contenido. Se inunda
desde los bordes del lienzo todo lo que sea casi negro; lo que esa
inundacion no alcanza es el auto, con sus agujeros oscuros adentro
—gomas, vidrios, sombra— que quedan opacos porque estan rodeados de
chapa clara y de tarima. Es la diferencia entre "esto es oscuro" y "esto
es de afuera".

EL LIENZO NO ES LIBRE. Las cuatro fotos del garage comparten medidas, y
en un carrusel donde los autos intercambian lugar eso no es cosmetico:
si una trae otra proporcion, al llegar al frente cambia de tamano sola.
Medido sobre las cuatro publicadas, las cuatro coinciden en 1100x468 con
el contenido centrado y la linea de apoyo al 92,2% del alto. Esos son
los numeros de abajo.

Uso:  grupo-foto.py <foto-origen> <nombre-de-salida>
      grupo-foto.py source/mercedes.png alta-gama
"""
import pathlib, sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

RAIZ   = pathlib.Path(__file__).resolve().parent.parent
GRUPOS = RAIZ / "public" / "assets" / "grupos"

# El lienzo de la familia, medido sobre las cuatro fotos publicadas.
LIENZO   = (1100, 468)
BASE     = 0.922    # donde apoya: fraccion del alto del lienzo
ANCHO_C  = 870      # cuanto ocupa el contenido dentro del lienzo
CHICA    = (700, 298)   # la version @sm, para celular

# Por debajo de esto es fondo. Se midio: las cuatro esquinas del origen
# dan 0 y 1, y el borde de la tarima ya arranca bien por encima.
NEGRO = 6


def silueta(gris):
    """Alfa a partir de que NO es fondo. Ver el encabezado."""
    fondo = gris <= NEGRO

    # Se inunda desde el borde: solo el fondo conectado al marco cuenta
    # como afuera. Un negro encerrado por chapa —una goma— no se toca.
    marca = np.zeros_like(fondo)
    marca[0, :] = marca[-1, :] = True
    marca[:, 0] = marca[:, -1] = True
    afuera = ndimage.binary_propagation(marca & fondo, mask=fondo)

    return (~afuera).astype(np.uint8) * 255


def recortar(origen, nombre):
    im = Image.open(origen).convert("RGB")
    gris = np.array(im.convert("L")).astype(int)

    alfa = silueta(gris)
    ys, xs = np.where(alfa > 0)
    caja = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)

    rgba = im.convert("RGBA")
    rgba.putalpha(Image.fromarray(alfa))
    trozo = rgba.crop(caja)

    # El borde duro del umbral se nota solo cuando un auto tapa a otro;
    # medio pixel de difuminado alcanza para que no se lea como recorte.
    a = trozo.getchannel("A").filter(ImageFilter.GaussianBlur(1.2))
    trozo.putalpha(a)

    # A la medida de la familia, apoyado en la misma linea.
    alto_c = round(ANCHO_C * trozo.height / trozo.width)
    trozo = trozo.resize((ANCHO_C, alto_c), Image.LANCZOS)

    lienzo = Image.new("RGBA", LIENZO, (0, 0, 0, 0))
    x = (LIENZO[0] - ANCHO_C) // 2
    y = round(LIENZO[1] * BASE) - alto_c
    lienzo.paste(trozo, (x, y), trozo)

    grande = GRUPOS / f"{nombre}.webp"
    chica  = GRUPOS / f"{nombre}@sm.webp"
    lienzo.save(grande, "WEBP", quality=88, method=6)
    lienzo.resize(CHICA, Image.LANCZOS).save(chica, "WEBP", quality=86, method=6)

    print(f"   origen   {im.size[0]}x{im.size[1]}  contenido {caja[2]-caja[0]}x{caja[3]-caja[1]}")
    print(f"   {grande.name:<22} {LIENZO[0]}x{LIENZO[1]}  {grande.stat().st_size/1024:6.1f} KB")
    print(f"   {chica.name:<22} {CHICA[0]}x{CHICA[1]}   {chica.stat().st_size/1024:6.1f} KB")
    print(f"   apoyo en y={y + alto_c} ({(y + alto_c) / LIENZO[1] * 100:.1f}%)")


if __name__ == "__main__":
    recortar(pathlib.Path(sys.argv[1]), sys.argv[2])
