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
      '<div class="lente">' + (a.destacado ? '<span class="cinta">Destacado</span>' : '') + foto + '</div>' +
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

  const galeria = a.fotos.length
    ? '<div class="lado-foto">' +
        '<div class="grande"><img id="fotoGrande" src="/fotos/' + a.fotos[0].clave +
          '-1600.webp" alt="' + escapar(a.marca + ' ' + a.modelo) + '"></div>' +
        (a.fotos.length > 1
          ? '<div class="tiras">' + a.fotos.map((f, i) =>
              '<img src="/fotos/' + f.clave + '-640.webp" alt="" data-i="' + i +
              '" aria-current="' + (i === 0) + '">').join('') + '</div>'
          : '') +
      '</div>'
    : '<div class="lado-foto"><div class="grande"></div></div>';

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
    '</div>' +
    '<button class="cerrar" type="button" id="cerrar">Cerrar</button>';

  d.hidden = false;
  document.body.style.overflow = 'hidden';

  $('#cerrar').addEventListener('click', cerrar);
  d.querySelectorAll('.tiras img').forEach((t) => t.addEventListener('click', () => {
    $('#fotoGrande').src = '/fotos/' + a.fotos[t.dataset.i].clave + '-1600.webp';
    d.querySelectorAll('.tiras img').forEach((o) => o.setAttribute('aria-current', o === t));
  }));
}

function cerrar() {
  $('#detalle').hidden = true;
  document.body.style.overflow = '';
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
