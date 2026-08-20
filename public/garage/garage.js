/* EL CATÁLOGO.
   ══════════════════════════════════════════════════════════════════

   La página llega vacía y se llena con lo que devuelve /api/autos. Eso
   tiene una ventaja concreta —publicar un auto desde el panel lo hace
   aparecer acá sin desplegar nada— y un costo que conviene dejar dicho:
   un buscador que no ejecute el script ve la página sin autos. Para un
   catálogo que recién arranca alcanza; si el SEO empieza a importar, lo
   que corresponde es armar el HTML en el Worker.

   El grupo elegido viaja en la dirección (?grupo=deportivos), no en una
   variable: así el botón "Ver esta línea" del carrusel de la home puede
   entrar directo al filtro, y el enlace se puede compartir. */

const GRUPOS = {
  'alta-gama':  'Alta Gama',
  evolution:    'Línea Evolution',
  deportivos:   'Deportivos',
  urbanos:      'Urbanos',
};

const $ = (s) => document.querySelector(s);
let autos = [];
let filtro = new URLSearchParams(location.search).get('grupo') || 'todos';
if (filtro !== 'todos' && !GRUPOS[filtro]) filtro = 'todos';

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const conPuntos = (n) => (n === null || n === undefined ? '' : n.toLocaleString('es-AR'));

const precioDe = (a) =>
  a.precio === null || a.precio === undefined ? 'Consultar' : a.moneda + ' ' + conPuntos(a.precio);

/* ── filtros ─────────────────────────────────────────────────────
   Sólo se muestran los grupos que TIENEN autos. Un filtro que devuelve
   una lista vacía es una promesa incumplida. */
function pintarFiltros() {
  const conAutos = Object.keys(GRUPOS).filter((g) => autos.some((a) => a.grupo === g));
  const items = [['todos', 'Todos']].concat(conAutos.map((g) => [g, GRUPOS[g]]));

  $('#filtros').innerHTML = items.map(([v, t]) =>
    '<button class="chip" type="button" data-grupo="' + v + '" aria-pressed="' +
    (filtro === v) + '">' + t + '</button>').join('');

  $('#filtros').querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => {
      filtro = c.dataset.grupo;
      const u = new URL(location);
      if (filtro === 'todos') u.searchParams.delete('grupo');
      else u.searchParams.set('grupo', filtro);
      history.replaceState(null, '', u);
      pintarFiltros();
      pintarGrilla();
    }));
}

function pintarGrilla() {
  const lista = filtro === 'todos' ? autos : autos.filter((a) => a.grupo === filtro);

  if (!lista.length) {
    $('#grilla').innerHTML = '<p class="vacio">Todavía no hay unidades publicadas en esta línea.</p>';
    return;
  }

  $('#grilla').innerHTML = lista.map((a) => {
    const foto = a.fotos[0]
      ? '<img src="/fotos/' + a.fotos[0].clave + '-640.webp" alt="' +
        escapar(a.marca + ' ' + a.modelo) + '" loading="lazy" decoding="async">'
      : '<span class="sinfoto">Sin fotos</span>';
    const ficha = [a.anio, a.km !== null ? conPuntos(a.km) + ' km' : null, a.motor]
      .filter(Boolean).join(' · ');

    return '<article class="auto" data-id="' + a.id + '" role="button" tabindex="0">' +
      '<div class="lente">' + foto + '</div>' +
      '<div class="cuerpo">' +
        '<h2>' + escapar(a.marca) + ' ' + escapar(a.modelo) + '</h2>' +
        (ficha ? '<span class="ficha">' + escapar(ficha) + '</span>' : '') +
        '<span class="precio">' + precioDe(a) + '</span>' +
      '</div></article>';
  }).join('');

  $('#grilla').querySelectorAll('.auto').forEach((el) => {
    const abrirlo = () => abrir(autos.find((a) => a.id === Number(el.dataset.id)));
    el.addEventListener('click', abrirlo);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirlo(); }
    });
  });
}

/* ── el detalle ──────────────────────────────────────────────────
   Se abre encima y no en otra página: son pocos datos y así no se pierde
   el lugar en la grilla al volver. */
function abrir(a) {
  if (!a) return;
  const d = $('#detalle');

  const datos = [
    ['Año', a.anio], ['Kilómetros', a.km !== null ? conPuntos(a.km) + ' km' : null],
    ['Motor', a.motor], ['Transmisión', a.transmision],
    ['Combustible', a.combustible], ['Color', a.color],
    ['Línea', GRUPOS[a.grupo]], ['Precio', precioDe(a)],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  /* VOLVER: UNA FLECHA PARA ATRÁS, ARRIBA A LA IZQUIERDA DE LA FOTO.

     Empezó suelto arriba del todo, ocupando una banda entera de pantalla
     para algo del tamaño de una moneda. Después fue una cruz sobre la
     foto, que ahorra el lugar pero dice otra cosa: una cruz es "cerrar",
     y de una ficha abierta adentro del listado uno vuelve, no cierra.

     La flecha lleva cola —`M19 12H5` es el palito— para no confundirse
     con las de pasar fotos, que son cabezas de flecha solas. */
  const volver = '<button class="cerrar" type="button" id="cerrar" aria-label="Volver al listado">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg></button>';

  const flechas = a.fotos.length > 1
    ? '<button class="paso paso--antes" type="button" data-paso="-1" aria-label="Foto anterior">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>' +
      '<button class="paso paso--luego" type="button" data-paso="1" aria-label="Foto siguiente">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>'
    : '';

  const galeria = a.fotos.length
    ? '<div class="lado-foto">' +
        '<div class="grande">' +
          '<img id="fotoGrande" src="/fotos/' + a.fotos[0].clave +
            '-1600.webp" alt="' + escapar(a.marca + ' ' + a.modelo) + '">' +
          flechas + volver +
        '</div>' +
        (a.fotos.length > 1
          ? '<div class="tiras">' + a.fotos.map((f, i) =>
              '<img src="/fotos/' + f.clave + '-640.webp" alt="" data-i="' + i +
              '" aria-current="' + (i === 0) + '">').join('') + '</div>'
          : '') +
      '</div>'
    : '<div class="lado-foto"><div class="grande">' + volver + '</div></div>';

  d.innerHTML = '<div class="caja">' +
    galeria +
    '<div class="lado-datos">' +
      '<h2>' + escapar(a.marca) + ' ' + escapar(a.modelo) + '</h2>' +
      '<div class="datos">' + datos.map(([r, v]) =>
        '<div><span class="rotulo">' + r + '</span><span class="valor">' + escapar(v) + '</span></div>'
      ).join('') + '</div>' +
      /* La descripción lleva su rótulo: sin él es un párrafo suelto
         debajo de una grilla de datos y no se sabe qué es. */
      (a.descripcion
        ? '<div class="bloque-desc"><span class="rotulo">Descripción</span>' +
          '<p class="desc">' + escapar(a.descripcion) + '</p></div>'
        : '') +
      '<a class="consultar" href="/#concierge">Consultar por esta unidad</a>' +
    '</div>' +
    '</div>';

  d.hidden = false;
  document.body.style.overflow = 'hidden';

  $('#cerrar').addEventListener('click', cerrar);

  /* TODAS LAS FOTOS SE PIDEN AL ABRIR, no al tocarlas.

     Antes cada foto se pedía recién cuando alguien la elegía: se cambiaba
     el `src` y hasta que el archivo llegaba seguía viéndose la anterior.
     Con una foto grande eso son varios segundos en los que parece que el
     clic no hizo nada, y el reflejo es volver a tocar.

     Pedirlas todas de una las deja en la cache del navegador, y el cambio
     pasa a ser instantáneo. Son unas pocas por auto y ya se está viendo
     la ficha: el momento de gastar esa red es justo este.

     `decoding="async"` para que la decodificación no trabe el hilo
     mientras alguien está mirando la primera. */
  a.fotos.forEach((f) => {
    const previa = new Image();
    previa.decoding = 'async';
    previa.src = '/fotos/' + f.clave + '-1600.webp';
  });

  let cual = 0;
  const tiras = [].slice.call(d.querySelectorAll('.tiras img'));

  function mostrar(i) {
    if (!a.fotos.length) return;
    /* Da la vuelta en los dos sentidos: con tres fotos, seguir para la
       derecha desde la última tiene que traer la primera y no morir. */
    cual = (i + a.fotos.length) % a.fotos.length;
    $('#fotoGrande').src = '/fotos/' + a.fotos[cual].clave + '-1600.webp';
    tiras.forEach((o, k) => o.setAttribute('aria-current', String(k === cual)));
  }

  $('#fotoGrande')?.addEventListener('click', () => abrirZoom(a.fotos[cual].clave));

  tiras.forEach((t) => t.addEventListener('click', () => mostrar(Number(t.dataset.i))));
  d.querySelectorAll('.paso').forEach((b) => b.addEventListener('click', () =>
    mostrar(cual + Number(b.dataset.paso))));

  pasoTeclado = (e) => {
    if (e.key === 'ArrowRight') mostrar(cual + 1);
    else if (e.key === 'ArrowLeft') mostrar(cual - 1);
  };
  addEventListener('keydown', pasoTeclado);
}

/* Se guarda para poder sacarlo al cerrar: si no, cada apertura deja otro
   oyente colgado sobre un detalle que ya no existe. */
let pasoTeclado = null;

/* ══════════════════════════════════════════════════════════════════
   LA FOTO EN GRANDE, CON ZOOM
   ══════════════════════════════════════════════════════════════════

   En la ficha la foto entra recortada a la forma de su hueco. Para mirar
   un detalle —una llanta, el tapizado, una marca en la chapa— hace falta
   verla entera y poder acercarse.

   POR QUÉ NO ALCANZA EL ZOOM DEL NAVEGADOR. En el teléfono, abrir dos
   dedos sobre la página agranda TODA la página: la barra, el texto y la
   foto por igual, y después hay que volver a acomodar todo. Acá los dos
   dedos mueven solamente la foto.

   `touch-action:none` en la capa es lo que hace que el sistema no se
   quede con el gesto: sin eso el navegador interpreta los dos dedos como
   zoom de página antes de que llegue un solo evento a este código.

   EL ACERCAMIENTO SE ANCLA EN EL PUNTO DEL MEDIO DE LOS DOS DEDOS. Es la
   diferencia entre que la imagen crezca hacia donde uno está mirando o
   que se escape hacia el centro. La cuenta: con el origen en el centro,
   un punto `p` de la pantalla corresponde al punto `(p - centro - d)/s`
   de la foto; para que ese punto no se mueva al pasar de `s` a `s2`, el
   desplazamiento nuevo tiene que ser `p - centro - c*s2`. */

let zoomFuera = null;

function abrirZoom(clave) {
  const capa = $('#zoom');
  const img = capa.querySelector('img');
  img.src = '/fotos/' + clave + '-1600.webp';
  capa.hidden = false;

  let esc = 1, dx = 0, dy = 0;
  let base = null;
  const dedos = new Map();
  let pellizco = null;
  let ultimoToque = 0;
  /* EL DOBLE TOQUE SE DECIDE AL LEVANTAR EL DEDO, NO AL APOYARLO, y sólo
     si el gesto terminó siendo un toque de verdad.

     Contándolo al apoyar, el PRIMER dedo de un pellizco ya contaba como
     toque; apoyar un dedo enseguida después —para arrastrar la foto ya
     acercada— caía dentro de los 300 ms y se leía como doble toque, así
     que la foto se alejaba sola justo cuando uno quería moverla.

     `candidato` se anula apenas entra un segundo dedo o apenas el dedo
     se corre más de unos píxeles: entonces fue un pellizco o un
     arrastre, y ninguno de los dos es un toque. */
  let candidato = null;

  const aplicar = () => {
    img.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + esc + ')';
    capa.classList.toggle('cerca', esc > 1.02);
  };

  /* La foto no puede alejarse más allá de sus propios bordes: si a esta
     escala no sobra nada para correr, se queda centrada. */
  const encajar = () => {
    if (!base) return;
    const c = capa.getBoundingClientRect();
    const sobraX = Math.max(0, (base.width * esc - c.width) / 2);
    const sobraY = Math.max(0, (base.height * esc - c.height) / 2);
    dx = Math.min(sobraX, Math.max(-sobraX, dx));
    dy = Math.min(sobraY, Math.max(-sobraY, dy));
  };

  const medir = () => {
    const previo = img.style.transform;
    img.style.transform = 'none';
    base = img.getBoundingClientRect();
    img.style.transform = previo;
  };

  img.complete ? medir() : img.addEventListener('load', medir, { once: true });

  const escalarEn = (px, py, s2) => {
    const c = capa.getBoundingClientRect();
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    /* Dónde cae ese punto dentro de la foto, antes de cambiar la escala. */
    const fx = (px - cx - dx) / esc, fy = (py - cy - dy) / esc;
    esc = Math.min(4, Math.max(1, s2));
    dx = px - cx - fx * esc;
    dy = py - cy - fy * esc;
    encajar();
    aplicar();
  };

  const abajo = (e) => {
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    capa.setPointerCapture(e.pointerId);

    if (dedos.size === 2) {
      candidato = null;
      const [a, b] = [...dedos.values()];
      pellizco = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        esc,
        px: (a.x + b.x) / 2, py: (a.y + b.y) / 2,
      };
      return;
    }

    candidato = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };

  const mover = (e) => {
    const antes = dedos.get(e.pointerId);
    if (!antes) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (dedos.size >= 2 && pellizco) {
      const [a, b] = [...dedos.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      escalarEn(pellizco.px, pellizco.py, pellizco.esc * (dist / pellizco.dist));
      return;
    }

    if (candidato &&
        Math.hypot(e.clientX - candidato.x, e.clientY - candidato.y) > 10) {
      candidato = null;
    }

    /* Un dedo solo arrastra cuando hay algo para arrastrar. */
    if (esc > 1.02) {
      dx += e.clientX - antes.x;
      dy += e.clientY - antes.y;
      encajar();
      aplicar();
    }
  };

  const arriba = (e) => {
    dedos.delete(e.pointerId);
    if (dedos.size < 2) pellizco = null;

    if (!candidato) return;
    /* Dos toques seguidos: acercar o volver, en el punto tocado. */
    if (e.timeStamp - ultimoToque < 300) {
      escalarEn(candidato.x, candidato.y, esc > 1.02 ? 1 : 2.5);
      ultimoToque = 0;
    } else {
      ultimoToque = e.timeStamp;
    }
    candidato = null;
  };

  capa.addEventListener('pointerdown', abajo);
  capa.addEventListener('pointermove', mover);
  capa.addEventListener('pointerup', arriba);
  capa.addEventListener('pointercancel', arriba);

  const salir = () => cerrarZoom();
  capa.querySelector('.zoom-salir').addEventListener('click', salir);

  zoomFuera = () => {
    capa.removeEventListener('pointerdown', abajo);
    capa.removeEventListener('pointermove', mover);
    capa.removeEventListener('pointerup', arriba);
    capa.removeEventListener('pointercancel', arriba);
    capa.querySelector('.zoom-salir').removeEventListener('click', salir);
    img.style.transform = '';
    img.removeAttribute('src');
    capa.classList.remove('cerca');
    capa.hidden = true;
  };
}

function cerrarZoom() {
  if (zoomFuera) { zoomFuera(); zoomFuera = null; }
}

function cerrar() {
  /* Si estaba mirando una foto de cerca, el primer volver la cierra a
     ella y no toda la ficha: cerrar dos cosas de un toque siempre se
     siente como que se perdió un paso. */
  if (zoomFuera) { cerrarZoom(); return; }
  $('#detalle').hidden = true;
  document.body.style.overflow = '';
  if (pasoTeclado) { removeEventListener('keydown', pasoTeclado); pasoTeclado = null; }
}

addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
$('#detalle').addEventListener('click', (e) => { if (e.target === $('#detalle')) cerrar(); });

/* EL ALTO DE LA BARRA, MEDIDO Y NO SUPUESTO.

   La barra es fija, así que el resto de la página tiene que dejarle el
   lugar. Ese alto depende del logo, del relleno y del corte de pantalla
   —o sea que cambia— y puesto a mano deja el contenido tapado o
   flotando. Se mide y se escribe en --barra-h. */
function medirBarra() {
  const b = document.querySelector('.barra');
  if (b) document.documentElement.style.setProperty('--barra-h', b.offsetHeight + 'px');
}
addEventListener('resize', medirBarra);
addEventListener('load', medirBarra);
medirBarra();

/* EL VIDRIO APARECE AL BAJAR. Mismo umbral que la home (24 px) para que
   las dos páginas se sientan la misma. Sólo se escribe cuando el estado
   CAMBIA, así el listener no toca el DOM en cada píxel de scroll. */
(() => {
  const barra = document.querySelector('.barra');
  if (!barra) return;
  let puesto = null;
  const mirar = () => {
    const si = scrollY > 24;
    if (si === puesto) return;
    puesto = si;
    barra.classList.toggle('con-vidrio', si);
  };
  addEventListener('scroll', mirar, { passive: true });
  mirar();
})();

/* ── arranque ────────────────────────────────────────────────────── */

(async () => {
  try {
    const r = await fetch('/api/autos');
    autos = (await r.json()).autos || [];
  } catch {
    $('#grilla').innerHTML = '<p class="vacio">No pudimos cargar el catálogo. Probá de nuevo en un momento.</p>';
    return;
  }

  /* SI LA LINEA QUE PIDIERON ESTA VACIA, SE MUESTRAN TODOS.

     El botón "Ver esta línea" de la home existe siempre, para las cuatro
     líneas, pero el catálogo puede no tener autos cargados en alguna. Sin
     esto se llegaba a una página que dice "todavía no hay unidades" — un
     camino sin salida, y encima el visitante no ve que sí hay autos en
     las otras líneas.

     Se cae al listado completo y se limpia la dirección, así lo que se
     ve y lo que dice la barra coinciden. */
  if (filtro !== 'todos' && !autos.some((a) => a.grupo === filtro)) {
    filtro = 'todos';
    const u = new URL(location);
    u.searchParams.delete('grupo');
    history.replaceState(null, '', u);
  }

  pintarFiltros();
  pintarGrilla();
})();
