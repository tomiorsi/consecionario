#!/usr/bin/env python3
"""Genera los videos del sitio en un peso que un teléfono pueda bajar.

EL PROBLEMA QUE ORIGINÓ ESTO. En celular la página no cargaba: los
cuatro videos sumaban 14,9 MB y el reel solo se llevaba 9,2 de esos.
Con 3 Mbit/s —4G común con la celda ocupada— eso es cuarenta segundos de
descarga. El visitante scrolleaba, llegaba a una sección y encontraba el
póster fijo, porque el video de esa sección todavía estaba haciendo cola
detrás de los otros.

El otro lado del arreglo vive en index.html —el turnero, que baja de a
uno y en orden— pero ningún turnero salva a un archivo de 9 MB. Había
que bajar el peso, y este script es la receta con la que se bajó.

LAS DOS FAMILIAS SE TRATAN DISTINTO, Y NO ES CAPRICHO
─────────────────────────────────────────────────────────────────────

  · EL REEL no se reproduce nunca: se le mueve el currentTime con el
    scroll. Por eso va all-intra, con TODOS los cuadros clave: buscar
    sobre un GOP largo obliga a decodificar el grupo entero, y con el
    dedo encima eso se siente.

    Y como cada cuadro se guarda completo, el precio no lo pone el
    bitrate sino LA CANTIDAD DE CUADROS. De ahí el cambio que más
    ahorró: 24 → 16 cuadros por segundo. En un video que se reproduce
    eso sería una pérdida evidente; en uno que se navega con el scroll,
    no. El reel de celular recorre unos 7.800 px de scroll, así que a 24
    fps cambiaba de cuadro cada 20 px y a 16 fps cada 31 px — y encima
    la persecución del scroll (ver PERSECUCION en index.html) hace que
    el video se deslice hasta su objetivo en vez de saltar, o sea que
    entre cuadro y cuadro ya había interpolación de movimiento, no un
    salto.

    Medido: 9,18 MB → 3,24 MB, VMAF 93,2 contra el original sin
    comprimir.

  · EL COLLAGE Y LA RUTA sí se reproducen, en bucle y a pantalla
    completa. Ahí no se toca ni un cuadro ni un píxel: sólo baja la
    calidad, de un VMAF ~99 que nadie puede ver en un teléfono a ~97.

LA REFERENCIA NO ES LA MISMA PARA TODOS, Y ES A PROPÓSITO
─────────────────────────────────────────────────────────────────────
El reel se rehace desde los originales, que están identificados abajo.
El collage y la ruta se rehacen SOBRE EL ARCHIVO PUBLICADO: sus
originales pasaron por recortes y cortes cuya receta no quedó escrita
—los tres clips de la ruta son 1916x1080 y terminaron en un 1916x564 de
4,5 s— así que rehacerlos desde la fuente sería adivinar el encuadre.
Reencodear lo publicado además mide lo que importa: no "cuánto se parece
al original" sino "se nota el cambio contra lo que se ve hoy".

Uso:  videos.py [pieza ...]      (sin argumentos hace todas)
"""
import json, os, pathlib, subprocess, sys, tempfile

RAIZ   = pathlib.Path(__file__).resolve().parent.parent
FUENTE = RAIZ / "source"
SALIDA = RAIZ / "public" / "assets"

# ── EL REEL ────────────────────────────────────────────────────────
# Los dos clips de cada versión se identificaron comparando el cuadro 0
# y el cuadro 8 s del archivo publicado contra el cuadro 0 de cada
# original: los que coinciden dan diferencia media 0,04 y 0,29 sobre
# 255, o sea son el mismo cuadro. El resto da 113.
REEL = {
    "video/reel-mobile": [
        "kling_20260814_VIDEO_The_camera_908_0.mp4",
        "kling_20260814_VIDEO_The_camera_978_0.mp4",
    ],
    "video/reel-desktop": [
        "kling_20260814_VIDEO_The_camera_894_0.mp4",
        "kling_20260814_VIDEO_The_car_sl_785_0.mp4",
    ],
}
REEL_FPS  = 16
REEL_CRF  = 32     # 3,24 MB y VMAF 93,2 en celular; ver el barrido
REEL_CRF_H264 = 25

# ── LOS BUCLES ─────────────────────────────────────────────────────
# Se reencodean sobre lo publicado. crf 29 da VMAF ~97 contra ese mismo
# archivo, que en un teléfono es indistinguible, y recorta un tercio.
BUCLES = ["collage/drive-mobile", "collage/drive",
          "ruta/ruta-mobile", "ruta/ruta-desktop"]
BUCLE_CRF = 29
BUCLE_CRF_H264 = 24


def corre(orden):
    r = subprocess.run(orden, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"falló: {' '.join(orden[:6])}…\n{r.stderr[-800:]}")


def vmaf(prueba, refe, filtro_ref=""):
    """VMAF de `prueba` contra `refe`, escalando la prueba al tamaño de
    la referencia. Devuelve (media, mínimo)."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        log = f.name
    an, al = tam(refe)
    cadena = (f"[0:v]scale={an}:{al}:flags=lanczos,setpts=PTS-STARTPTS[d];"
              f"[1:v]{filtro_ref}setpts=PTS-STARTPTS[r];"
              f"[d][r]libvmaf=log_fmt=json:log_path={log}")
    corre(["ffmpeg", "-v", "error", "-i", str(prueba), "-i", str(refe),
           "-lavfi", cadena, "-f", "null", "-"])
    d = json.load(open(log))["pooled_metrics"]["vmaf"]
    os.unlink(log)
    return d["mean"], d["min"]


def tam(v):
    s = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                        "-show_entries", "stream=width,height",
                        "-of", "csv=p=0:nk=1", str(v)],
                       capture_output=True, text=True).stdout.strip()
    an, al = s.split("\n")[0].split(",")
    return int(an), int(al)


def hevc(entrada, salida, crf, intra, fps=None):
    par = "log-level=none"
    if intra:
        par = "keyint=1:min-keyint=1:scenecut=0:" + par
    orden = ["ffmpeg", "-v", "error", "-y", "-i", str(entrada), "-an"]
    if fps:
        orden += ["-vf", f"fps={fps}"]
    orden += ["-c:v", "libx265", "-crf", str(crf), "-preset", "slow",
              "-x265-params", par, "-tag:v", "hvc1",
              "-movflags", "+faststart", str(salida)]
    corre(orden)


def h264(entrada, salida, crf, intra, fps=None):
    """El respaldo universal. Lo recibe quien no puede decodificar HEVC
    —Firefox, y Android viejo— así que también tiene que pesar poco: era
    justamente el archivo más grande de todos, 16,8 MB el del reel."""
    orden = ["ffmpeg", "-v", "error", "-y", "-i", str(entrada), "-an"]
    if fps:
        orden += ["-vf", f"fps={fps}"]
    orden += ["-c:v", "libx264", "-crf", str(crf), "-preset", "slow"]
    if intra:
        orden += ["-x264-params", "keyint=1:min-keyint=1:scenecut=0"]
    orden += ["-pix_fmt", "yuv420p", "-profile:v", "high",
              "-movflags", "+faststart", str(salida)]
    corre(orden)


def mb(p):
    return pathlib.Path(p).stat().st_size / 1048576


def linea(nombre, ruta, antes, vm=None):
    v = f"  VMAF {vm[0]:5.2f} / {vm[1]:5.2f}" if vm else ""
    print(f"   {nombre:<28} {mb(ruta):6.2f} MB  (antes {antes:5.2f}){v}")


def hacer_reel(clave, clips, tmp):
    print(f"── {clave}")
    lista = tmp / "lista.txt"
    lista.write_text("".join(f"file '{FUENTE / c}'\n" for c in clips), encoding="utf-8")

    # Referencia sin pérdida, para poder medir contra algo que no sea ya
    # una compresión.
    ref = tmp / "ref.mp4"
    corre(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0",
           "-i", str(lista), "-an", "-c:v", "libx265",
           "-x265-params", "keyint=1:lossless=1:log-level=none",
           "-tag:v", "hvc1", str(ref)])

    dst_h = SALIDA / f"{clave}-hevc.mp4"
    dst_4 = SALIDA / f"{clave}.mp4"
    antes_h, antes_4 = mb(dst_h), mb(dst_4)

    hevc(ref, dst_h, REEL_CRF, intra=True, fps=REEL_FPS)
    h264(ref, dst_4, REEL_CRF_H264, intra=True, fps=REEL_FPS)

    linea("hevc", dst_h, antes_h, vmaf(dst_h, ref, f"fps={REEL_FPS},"))
    linea("h264", dst_4, antes_4, vmaf(dst_4, ref, f"fps={REEL_FPS},"))


def hacer_bucle(clave, tmp):
    print(f"── {clave}")
    dst_h = SALIDA / f"{clave}-hevc.mp4"
    dst_4 = SALIDA / f"{clave}.mp4"

    # La referencia es lo publicado, así que hay que guardarlo antes de
    # pisarlo.
    ref = tmp / "ref.mp4"
    ref.write_bytes(dst_h.read_bytes())
    antes_h, antes_4 = mb(dst_h), mb(dst_4)

    hevc(ref, dst_h, BUCLE_CRF, intra=False)
    h264(ref, dst_4, BUCLE_CRF_H264, intra=False)

    linea("hevc", dst_h, antes_h, vmaf(dst_h, ref))
    linea("h264", dst_4, antes_4, vmaf(dst_4, ref))


if __name__ == "__main__":
    pedidas = sys.argv[1:]
    total_antes = total_ahora = 0.0

    for clave, clips in REEL.items():
        if pedidas and clave not in pedidas:
            continue
        with tempfile.TemporaryDirectory() as d:
            a = mb(SALIDA / f"{clave}-hevc.mp4") + mb(SALIDA / f"{clave}.mp4")
            hacer_reel(clave, clips, pathlib.Path(d))
            total_antes += a
            total_ahora += mb(SALIDA / f"{clave}-hevc.mp4") + mb(SALIDA / f"{clave}.mp4")

    for clave in BUCLES:
        if pedidas and clave not in pedidas:
            continue
        with tempfile.TemporaryDirectory() as d:
            a = mb(SALIDA / f"{clave}-hevc.mp4") + mb(SALIDA / f"{clave}.mp4")
            hacer_bucle(clave, pathlib.Path(d))
            total_antes += a
            total_ahora += mb(SALIDA / f"{clave}-hevc.mp4") + mb(SALIDA / f"{clave}.mp4")

    print(f"\n   TOTAL {total_ahora:6.2f} MB   (antes {total_antes:6.2f} MB)")
