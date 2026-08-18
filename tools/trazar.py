#!/usr/bin/env python3
"""Convierte a curvas un dibujo blanco sobre negro de un archivo de imagen.

PARA QUE. La letra del logo NO es la tipografia del sitio: la A no lleva
travesano y la N tiene otra construccion. Es una tipografia de display
que no tengo, y de una imagen no se puede identificar con certeza. Asi
que en vez de "rehacerla" con una fuente parecida —que seria otra
letra— se traza la del archivo, y queda exactamente la misma.

COMO. La imagen viene de un JPEG, o sea con basura alrededor de cada
borde. El orden importa:

  1. se agranda con interpolacion suave, para que el borde tenga donde
     acomodarse antes de decidir que es tinta y que no;
  2. se desenfoca apenas, que se come el ruido del JPEG sin mover el
     borde de lugar;
  3. recien ahi se umbraliza;
  4. se sacan los contornos CON JERARQUIA, para saber cual es el
     agujero de una O y cual el borde de afuera;
  5. se simplifican, y los tramos que no son esquina se redondean.

EL PASO 5 ES EL QUE SEPARA UN TRAZADO DE UN CALCADO. Un contorno crudo
tiene un punto por pixel y se ve dentado; simplificado a secas se ve
poligonal en las curvas. Lo que se hace es medir el angulo en cada
vertice: donde hay esquina de verdad se deja el pico, y donde el
contorno esta girando suave se pasa a curva.
"""
import numpy as np, cv2


def _rdp(pts, eps):
    """Ramer-Douglas-Peucker sobre un contorno cerrado."""
    if len(pts) < 3:
        return pts
    ini, fin = 0, len(pts) - 1
    guardar = np.zeros(len(pts), bool)
    guardar[ini] = guardar[fin] = True
    pila = [(ini, fin)]
    while pila:
        a, b = pila.pop()
        if b <= a + 1:
            continue
        p, q = pts[a], pts[b]
        d = q - p
        n = np.hypot(*d)
        if n == 0:
            dist = np.hypot(*(pts[a+1:b] - p).T)
        else:
            dist = np.abs(np.cross(d, pts[a+1:b] - p)) / n
        i = int(np.argmax(dist))
        if dist[i] > eps:
            k = a + 1 + i
            guardar[k] = True
            pila += [(a, k), (k, b)]
    return pts[guardar]


def _a_curvas(pts, esquina_grados=38.0, suavidad=0.32):
    """Polilinea → path SVG, redondeando donde no hay esquina."""
    n = len(pts)
    if n < 3:
        return ""
    ang = np.zeros(n)
    for i in range(n):
        a, b, c = pts[i-1], pts[i], pts[(i+1) % n]
        v1, v2 = a - b, c - b
        n1, n2 = np.hypot(*v1), np.hypot(*v2)
        if n1 == 0 or n2 == 0:
            ang[i] = 180.0
            continue
        cos = np.clip(np.dot(v1, v2) / (n1 * n2), -1, 1)
        ang[i] = np.degrees(np.arccos(cos))
    # 180° = recto; cuanto mas chico, mas cerrada la esquina.
    esquina = ang < (180.0 - esquina_grados)

    d = [f"M{pts[0][0]:.2f},{pts[0][1]:.2f}"]
    for i in range(n):
        act, sig = pts[i], pts[(i+1) % n]
        if esquina[i] or esquina[(i+1) % n]:
            d.append(f"L{sig[0]:.2f},{sig[1]:.2f}")
        else:
            ant = pts[i-1]
            des = pts[(i+2) % n]
            c1 = act + (sig - ant) * suavidad
            c2 = sig - (des - act) * suavidad
            d.append(f"C{c1[0]:.2f},{c1[1]:.2f} {c2[0]:.2f},{c2[1]:.2f} "
                     f"{sig[0]:.2f},{sig[1]:.2f}")
    d.append("Z")
    return "".join(d)


def _nivelar(g):
    """Compensa el degradado vertical de la pieza antes de umbralizar.

    ESTE PASO NO ESTABA Y ROMPIA "SELECTED". Un umbral fijo funciona
    mientras el relleno sea parejo —MANNA es blanco plano de punta a
    punta— pero SELECTED es metalico: arranca en 166, sube a 250 en el
    medio y baja a 147 abajo. Con el umbral en 150, la parte de abajo de
    cada letra caia por debajo y se trazaba mordida.

    En vez de bajar el umbral —que engorda todo lo demas— se normaliza:
    para cada fila se estima cuanto vale "relleno" ahi, y se divide. El
    degradado se va, el umbral vuelve a ser una sola cifra honesta, y el
    color se repone despues con el degradado del SVG.
    """
    g = g.astype(np.float32)
    nivel = np.percentile(g, 99, axis=1)          # el relleno de cada fila
    # Se suaviza para que una fila casi vacia no dispare un nivel raro,
    # y se pone un piso para no amplificar filas que son puro fondo.
    k = max(3, (len(nivel) // 12) | 1)
    nivel = cv2.GaussianBlur(nivel.reshape(-1, 1), (1, k), 0).ravel()
    nivel = np.maximum(nivel, np.percentile(nivel, 60) * 0.55)
    nivel = np.maximum(nivel, 1.0)
    return np.clip(g / nivel[:, None] * 255.0, 0, 255).astype(np.uint8)


def trazar(gris, escala=6, desenfoque=1.0, umbral=150, eps=0.9, minimo=40):
    """`gris` es un recorte en escala de grises, tinta clara sobre negro.

    Devuelve (path, ancho, alto) en las unidades del recorte original.

    LOS VALORES POR OMISION SE BARRIERON contra el original: con
    desenfoque 1.0 y umbral 150 el trazado da 98,5% de coincidencia y el
    mismo peso de trazo (15490 pixeles de tinta contra 15501). Con un
    umbral mas bajo el borde suavizado del JPEG entra como tinta y las
    letras salen mas gordas: con 95 daba 95,6% y 16209 pixeles.
    """
    h, w = gris.shape
    gris = _nivelar(gris)
    grande = cv2.resize(gris, (w * escala, h * escala), interpolation=cv2.INTER_CUBIC)
    if desenfoque:
        k = int(desenfoque * 4) | 1
        grande = cv2.GaussianBlur(grande, (k, k), desenfoque)
    _, bin_ = cv2.threshold(grande, umbral, 255, cv2.THRESH_BINARY)

    contornos, jer = cv2.findContours(bin_, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    partes = []
    for c in contornos:
        if cv2.contourArea(c) < minimo * escala * escala / 8:
            continue
        pts = c[:, 0, :].astype(float)
        pts = _rdp(pts, eps * escala / 3.0)
        if len(pts) < 3:
            continue
        partes.append(_a_curvas(pts / escala))
    return " ".join(partes), w, h
