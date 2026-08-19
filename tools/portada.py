#!/usr/bin/env python3
"""Rehace los videos de la portada: los tres codecs y el poster.

DOS DECISIONES QUE NO SON OBVIAS
─────────────────────────────────────────────────────────────────────

1) EL VIDEO VA DE IDA Y DE VUELTA, Y POR ESO DURA EL DOBLE.

   La portada es un <video loop>: al llegar al final vuelve al principio
   de un salto. Eso solo se ve bien si el ultimo cuadro se parece al
   primero, y el clip nuevo no cierra —termina con la luz en otro lado—
   asi que en el salto se veia un tiron.

   La solucion no es cortar ni buscar un punto de corte: es armar el
   archivo con el clip entero y despues el mismo clip al reves. Asi el
   final ES el principio y el bucle no tiene costura por construccion.

   LOS DOS CUADROS DE LA JUNTA SE TIRAN. Pegar 193 + 193 deja el ultimo
   cuadro repetido en el medio y el primero repetido en el salto: dos
   micro-congelamientos por vuelta. La vuelta va del anteultimo al
   segundo —191 cuadros— y el ciclo queda parejo.

2) EL BANDEADO VIENE EN EL ORIGINAL, ASI QUE HAY QUE RECONSTRUIRLO.

   El fondo del clip es un degradado gris muy oscuro y Kling lo entrega
   ya escalonado. Medido sobre la esquina de arriba a la izquierda, que
   es fondo puro: TODO el degradado usa 27 tonos distintos, con mesetas
   planas de 22 pixeles de alto. Eso es lo que en pantalla se ve como
   manchones y como "pixelado".

   NINGUN AJUSTE DE COMPRESION ARREGLA ESO. Se comprobo: el HEVC de 10
   bits reproduce 27 tonos y mesetas de 24 — o sea, copia fiel de lo que
   habia. Los bits de mas conservan, no inventan.

   `gradfun` si: interpola DENTRO de cada meseta y le agrega un dither
   fino, que es exactamente reconstruir el degradado que se perdio al
   cuantizar. Cuesta menos que nada — medido, 146 KB/s contra los 147
   del original — porque un degradado liso se comprime mejor que uno
   escalonado.

   SE PROBO GRANO SOLO Y NO ALCANZA: a nivel 3 las mesetas se siguen
   viendo y a nivel 6 se ve el grano. Y `deband` empeora: aplana dentro
   de la banda y deja los bordes MAS marcados.

3) LOS DOS CODECS BUENOS VAN EN 10 BITS, Y NO ES POR "MAS CALIDAD".

   Es por el BANDEADO. El fondo del clip es un degradado gris muy
   oscuro, y en 8 bits los tonos disponibles ahi abajo se cuentan con
   los dedos: un degradado largo entre el 8 y el 20 de 255 tiene que
   repartirse en doce escalones, y se ven como anillos. Diez bits dan
   dieciseis veces mas tonos en el mismo tramo y el degradado queda
   liso. No agranda el archivo —a veces lo achica, porque el codec deja
   de gastar bits peleando contra su propio escalonado—.

   EL H264 SE QUEDA EN 8 BITS A PROPOSITO: ningun navegador decodifica
   H264 de 10 bits. Es el respaldo de Firefox, y ahi se compensa con un
   CRF mas bajo. HEVC lo toma Safari y AV1 lo toma Chrome, que entre los
   dos son casi todo el trafico del sitio, y los dos leen 10 bits.

Uso:  portada.py
"""
import pathlib, subprocess

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DST  = RAIZ / "public" / "assets" / "video"

PIEZAS = {
    "portada-desktop": "kling_20260820_VIDEO__Static_ca_702_0.mp4",
    "portada-mobile":  "kling_20260820_VIDEO__like_a_ca_733_0.mp4",
}

CRF_HEVC = 20
CRF_AV1  = 26
CRF_H264 = 19


def corre(orden):
    r = subprocess.run(orden, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"falló: {' '.join(orden[:8])}…\n{r.stderr[-900:]}")


def cuadros(v):
    return int(subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
         "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(v)],
        capture_output=True, text=True).stdout.strip())


# Reconstruye el degradado que el original trae escalonado. Ver el punto
# 2 del encabezado. El radio es el maximo que acepta el filtro.
DESBANDE = "gradfun=strength=1.2:radius=32"


def vaiven(n):
    """El clip entero y despues al reves, sin repetir los cuadros de la
    junta, y el desbandeo al final — una sola vez, sobre el resultado ya
    armado, para no pagarlo dos veces. Ver los puntos 1 y 2."""
    return (f"[0:v]split[a][b];"
            f"[b]reverse,trim=start_frame=1:end_frame={n - 1},"
            f"setpts=PTS-STARTPTS[r];"
            f"[a][r]concat=n=2:v=1:a=0,format=yuv420p10le,{DESBANDE}[v]")


def mb(p):
    return pathlib.Path(p).stat().st_size / 1048576


def hacer(clave, fuente):
    src = RAIZ / "source" / fuente
    n = cuadros(src)
    filtro = vaiven(n)
    print(f"── {clave}   {n} cuadros → {n + n - 2} de ida y vuelta")

    base = ["ffmpeg", "-v", "error", "-y", "-i", str(src),
            "-filter_complex", filtro, "-map", "[v]", "-an"]

    corre(base + ["-c:v", "libx265", "-crf", str(CRF_HEVC), "-preset", "slow",
                  "-pix_fmt", "yuv420p10le", "-x265-params", "log-level=none",
                  "-tag:v", "hvc1", "-movflags", "+faststart",
                  str(DST / f"{clave}-hevc.mp4")])

    corre(base + ["-c:v", "libsvtav1", "-crf", str(CRF_AV1), "-preset", "4",
                  "-pix_fmt", "yuv420p10le", "-movflags", "+faststart",
                  str(DST / f"{clave}-av1.mp4")])

    # 8 bits obligado: no hay H264 de 10 bits que un navegador lea.
    corre(base + ["-c:v", "libx264", "-crf", str(CRF_H264), "-preset", "slow",
                  "-pix_fmt", "yuv420p", "-profile:v", "high",
                  "-movflags", "+faststart", str(DST / f"{clave}.mp4")])

    corre(["ffmpeg", "-v", "error", "-y", "-ss", "0", "-i", str(src),
           "-frames:v", "1", "-q:v", "3", str(DST / f"{clave}-poster.jpg")])

    for suf in ("-hevc.mp4", "-av1.mp4", ".mp4", "-poster.jpg"):
        f = DST / f"{clave}{suf}"
        print(f"   {f.name:<30} {mb(f):5.2f} MB")


if __name__ == "__main__":
    for clave, fuente in PIEZAS.items():
        hacer(clave, fuente)
    print("\n   LISTO")
