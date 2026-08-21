/* EL PANEL, DEL LADO DEL NAVEGADOR.
   ══════════════════════════════════════════════════════════════════

   Sin framework: son tres pantallas y un formulario. Lo único que tiene
   miga es `achicar()`, que está comentado donde vive.

   Este archivo NO tiene secretos y por eso sale del disco como
   cualquier otro estático. La puerta la cuida la cookie de sesión, que
   se verifica en el Worker: sin ella, todo /api/admin/* contesta 401
   aunque alguien lea este código entero. */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const GRUPOS = {
  'alta-gama':  'Alta Gama',
  evolution:    'Línea Evolution',
  deportivos:   'Deportivos',
  urbanos:      'Urbanos',
};

let autos = [];
let actual = null;          /* el auto abierto en la ficha */
let filtro = 'todos';

/* MODO ORDENAR. Mientras está prendido la grilla no abre fichas: se
   arrastra. Se guarda aparte el orden con el que se entró para poder
   cancelar sin recargar. */
let ordenando = false;
let ordenAntes = null;

/* LAS FOTOS DE UN AUTO QUE TODAVIA NO EXISTE.

   Una foto se guarda contra el id de su auto, asi que hasta que el auto
   no esta en la base no hay a que colgarla. Antes eso se resolvia
   pidiendo guardar primero, y era un paso de mas: uno elige las fotos
   cuando las tiene a mano, no cuando el formulario lo permite.

   Ahora se quedan aca, ya achicadas y con una vista previa, y suben
   TODAS JUNTAS apenas el auto se crea — en el orden en que estan, que es
   lo que hace que la primera sea la portada. */
let enEspera = [];
let trabajando = false;

/* ── avisos ─────────────────────────────────────────────────────── */

let relojAviso;
function avisar(texto, mal = false) {
  const a = $('#aviso');
  a.textContent = texto;
  a.classList.toggle('mal', mal);
  a.classList.add('se-ve');
  clearTimeout(relojAviso);
  relojAviso = setTimeout(() => a.classList.remove('se-ve'), 2600);
}

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    headers: opciones.body instanceof FormData ? {} : { 'content-type': 'application/json' },
    ...opciones,
  });
  if (r.status === 401) { mostrarEntrar(); throw new Error('Sin sesión'); }
  const dato = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dato.error || 'Algo falló');
  return dato;
}

/* ── entrar y salir ─────────────────────────────────────────────── */

function mostrarEntrar() {
  $('#pantallaEntrar').classList.remove('oculto');
  $('#pantallaPanel').classList.add('oculto');
}

function mostrarPanel() {
  $('#pantallaEntrar').classList.add('oculto');
  $('#pantallaPanel').classList.remove('oculto');
}

$('#formEntrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = e.target.querySelector('button');
  boton.disabled = true;
  try {
    await api('/api/entrar', { method: 'POST', body: JSON.stringify({ clave: $('#clave').value }) });
    $('#clave').value = '';
    mostrarPanel();
    await cargar();
  } catch (err) {
    avisar(err.message, true);
  } finally {
    boton.disabled = false;
  }
});

$('#salir').addEventListener('click', async () => {
  await fetch('/api/salir', { method: 'POST' });
  mostrarEntrar();
});

$('#verSitio').addEventListener('click', () => window.open('/garage', '_blank'));

/* ── la lista ───────────────────────────────────────────────────── */

async function cargar() {
  const { autos: lista } = await api('/api/admin/autos');
  autos = lista;
  pintarFiltros();
  pintarLista();
}

function pintarFiltros() {
  const cuenta = (g) => autos.filter((a) => a.grupo === g).length;
  const items = [['todos', 'Todos (' + autos.length + ')']]
    .concat(Object.entries(GRUPOS).map(([g, n]) => [g, n + ' (' + cuenta(g) + ')']));

  $('#filtros').innerHTML = items.map(([valor, texto]) =>
    '<button class="chip" type="button" data-grupo="' + valor + '" aria-pressed="' +
    (filtro === valor) + '">' + texto + '</button>').join('');

  $$('#filtros .chip').forEach((c) => c.addEventListener('click', () => {
    filtro = c.dataset.grupo;
    pintarFiltros();
    pintarLista();
  }));
}

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const conPuntos = (n) => (n === null || n === undefined ? '' : n.toLocaleString('es-AR'));

function pintarLista() {
  const lista = filtro === 'todos' ? autos : autos.filter((a) => a.grupo === filtro);
  $('#sinAutos').classList.toggle('oculto', lista.length > 0);

  $('#grilla').innerHTML = lista.map((a) => {
    const foto = a.fotos[0]
      ? '<img src="/fotos/' + a.fotos[0].clave + '-640.webp" alt="" loading="lazy">'
      : '<span class="vacia">Sin fotos</span>';
    const precio = a.precio === null ? 'A consultar' : a.moneda + ' ' + conPuntos(a.precio);
    return '<article class="ficha" data-id="' + a.id + '">' +
      '<div class="foto">' + foto + '</div>' +
      '<div class="cuerpo">' +
        '<h3>' + escapar(a.marca) + ' ' + escapar(a.modelo) + '</h3>' +
        '<span class="dato">' + [a.anio, a.km !== null ? conPuntos(a.km) + ' km' : null]
          .filter(Boolean).join(' · ') + '</span>' +
        '<span class="dato">' + precio + '</span>' +
        '<div class="pie">' +
          '<span class="estado estado--' + a.estado + '">' + a.estado + '</span>' +
          '<span class="rotulo">' + GRUPOS[a.grupo] + '</span>' +
        '</div>' +
      '</div></article>';
  }).join('');

  $('#grilla').classList.toggle('ordenando', ordenando);

  $$('#grilla .ficha').forEach((f, i) => {
    if (!ordenando) {
      f.addEventListener('click', () => abrir(autos.find((a) => a.id === Number(f.dataset.id))));
      return;
    }
    /* EL TEMBLOR SE DESFASA POR TARJETA. Con todas en el mismo momento
       de la animación se ve una sola cosa moviéndose en bloque, que es
       justo lo contrario de lo que el temblor quiere decir. */
    f.style.animationDelay = (-(i % 4) * 0.13).toFixed(2) + 's';
    f.draggable = true;
    arrastrarFicha(f, i);
  });
}

/* ── ORDENAR ARRASTRANDO ────────────────────────────────────────────

   Igual que las fotos de una ficha, pero sobre la lista de autos y con
   un modo aparte: la grilla de autos ya usa el clic para abrir, así que
   si fuera siempre arrastrable no habría forma de distinguir un clic de
   un arrastre corto.

   SE REORDENA `autos` COMPLETO, aunque en pantalla haya un filtro.
   `lista` son los autos visibles; moverlos entre sí es permutar los
   lugares que ocupan dentro del arreglo grande, y los que no se ven no
   se mueven. Así reordenar "Alta gama" no le cambia el lugar a nada del
   resto — es la misma regla que aplica el Worker al guardar. */
function visibles() {
  return filtro === 'todos' ? autos : autos.filter((a) => a.grupo === filtro);
}

let fichaDesde = null;

function arrastrarFicha(el, i) {
  el.addEventListener('dragstart', (e) => {
    fichaDesde = i;
    el.classList.add('viajando');
    e.dataTransfer.effectAllowed = 'move';
    /* Firefox no arranca el arrastre si no se escribe algo acá. */
    e.dataTransfer.setData('text/plain', String(i));
  });
  el.addEventListener('dragend', () => {
    fichaDesde = null;
    $$('#grilla .ficha').forEach((o) => o.classList.remove('viajando', 'destino'));
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (fichaDesde !== null && fichaDesde !== i) el.classList.add('destino');
  });
  el.addEventListener('dragleave', () => el.classList.remove('destino'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('destino');
    if (fichaDesde === null || fichaDesde === i) return;

    const lista = visibles();
    /* Los lugares que este subconjunto ocupa dentro de `autos`. */
    const puestos = lista.map((a) => autos.indexOf(a));
    const movido = lista.splice(fichaDesde, 1)[0];
    lista.splice(i, 0, movido);
    puestos.forEach((puesto, k) => { autos[puesto] = lista[k]; });

    pintarLista();
  });
}

function verOrdenando(prende) {
  ordenando = prende;
  if (prende) ordenAntes = autos.slice();
  $('#ordenar').classList.toggle('oculto', prende);
  $('#guardarOrden').classList.toggle('oculto', !prende);
  $('#cancelarOrden').classList.toggle('oculto', !prende);
  $('#nuevo').classList.toggle('oculto', prende);
  pintarLista();
}

$('#ordenar').addEventListener('click', () => verOrdenando(true));

$('#cancelarOrden').addEventListener('click', () => {
  if (ordenAntes) autos = ordenAntes;
  ordenAntes = null;
  verOrdenando(false);
});

$('#guardarOrden').addEventListener('click', async () => {
  /* SE MANDAN SÓLO LOS VISIBLES. Si hay un filtro puesto, el orden que
     alguien acaba de armar es el de ese grupo; mandar la lista entera
     haría que el Worker reescriba también los que no se tocaron. */
  const ids = visibles().map((a) => a.id);
  try {
    await api('/api/admin/autos/orden', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    });
    ordenAntes = null;
    verOrdenando(false);
    avisar('Orden guardado');
    await cargar();
  } catch (err) { avisar(err.message, true); }
});

/* ── la ficha ───────────────────────────────────────────────────── */

function abrir(auto) {
  actual = auto || null;
  enEspera.forEach((x) => URL.revokeObjectURL(x.vista));
  enEspera = [];
  const f = $('#formAuto');
  f.reset();

  if (auto) {
    for (const [campo, valor] of Object.entries(auto)) {
      const control = f.elements[campo];
      if (!control) continue;
      if (control.type === 'checkbox') control.checked = !!valor;
      else control.value = valor ?? '';
    }
    $('#tituloFicha').textContent = auto.marca + ' ' + auto.modelo;
  } else {
    $('#tituloFicha').textContent = 'Auto nuevo';
  }

  $('#borrar').classList.toggle('oculto', !auto);
  pintarFotos();

  $('#vistaLista').classList.add('oculto');
  $('#vistaFicha').classList.remove('oculto');
  scrollTo(0, 0);
}

function cerrarFicha() {
  $('#vistaFicha').classList.add('oculto');
  $('#vistaLista').classList.remove('oculto');
  actual = null;
}

$('#nuevo').addEventListener('click', () => abrir(null));
$('#volver').addEventListener('click', cerrarFicha);

$('#guardar').addEventListener('click', async () => {
  const f = $('#formAuto');
  if (!f.reportValidity()) return;

  const datos = Object.fromEntries(new FormData(f));
  /* Un precio vacío no es cero: es "a consultar". El campo vacío llega
     como cadena vacía y el servidor lo pasa a NULL; `sinPrecio` le avisa
     que eso es a propósito y no un olvido. */
  datos.sinPrecio = datos.precio === '';

  const boton = $('#guardar');
  boton.disabled = true;
  try {
    if (actual) {
      await api('/api/admin/autos/' + actual.id, { method: 'PUT', body: JSON.stringify(datos) });
      await cargar();
      avisar('Guardado');
    } else {
      const { id } = await api('/api/admin/autos', { method: 'POST', body: JSON.stringify(datos) });
      /* El auto ya existe: recién ahora las fotos tienen a qué colgarse.
         Se apunta `actual` a mano y no con abrir(), que limpiaría la
         lista de espera justo antes de usarla. */
      actual = { id, fotos: [] };
      await subirLoQueEsperaba();
      await cargar();
      avisar('Creado');
    }
    /* SE VUELVE AL LISTADO. Quedarse en la ficha después de guardar deja
       la duda de si guardó o no; volver a la lista y ver el auto ahí es
       la confirmación. Y es lo que uno quiere hacer después: cargar el
       siguiente. */
    cerrarFicha();
  } catch (err) {
    avisar(err.message, true);
  } finally {
    boton.disabled = false;
  }
});

$('#borrar').addEventListener('click', async () => {
  if (!actual) return;
  if (!confirm('¿Borrar ' + actual.marca + ' ' + actual.modelo + ' y todas sus fotos?')) return;
  try {
    await api('/api/admin/autos/' + actual.id, { method: 'DELETE' });
    avisar('Borrado');
    cerrarFicha();
    await cargar();
  } catch (err) {
    avisar(err.message, true);
  }
});

/* ── LAS FOTOS ──────────────────────────────────────────────────── */

/* La lista que se ve es la del auto si ya existe, y la de espera si no.
   Nunca las dos: cuando el auto se crea, las de espera suben y pasan a
   ser las del auto. */
const listaFotos = () => (actual ? actual.fotos : enEspera);

function pintarFotos() {
  const cont = $('#fotos');
  const lista = listaFotos();

  cont.innerHTML = lista.map((f, i) => {
    /* Todavia procesando: hueco con el giro y el nombre del archivo. No
       se puede arrastrar ni quitar porque todavia no es nada. */
    if (f.cargando) {
      return '<div class="miniatura cargando" data-i="' + i + '">' +
        '<span class="giro"></span>' +
        '<span class="archivo">' + escapar(f.nombre) + '</span></div>';
    }
    return '<div class="miniatura" draggable="true" data-i="' + i + '">' +
      '<img src="' + (f.enEspera ? f.vista : '/fotos/' + f.clave + '-640.webp') + '" alt="">' +
      (i === 0 ? '<span class="portada">Portada</span>' : '') +
      '<div class="mandos"><button class="mini-btn" data-quitar title="Quitar">&#215;</button></div>' +
    '</div>';
  }).join('') +
    '<button class="mas" type="button" id="mas"' + (trabajando ? ' disabled' : '') +
    '><span>+</span>Agregar fotos</button>';

  $('#mas').addEventListener('click', () => $('#archivo').click());
  ['dragenter', 'dragover'].forEach((n) => $('#mas').addEventListener(n, (e) => {
    e.preventDefault(); $('#mas').classList.add('encima');
  }));
  ['dragleave', 'drop'].forEach((n) => $('#mas').addEventListener(n, () =>
    $('#mas').classList.remove('encima')));

  $$('#fotos .miniatura:not(.cargando)').forEach((m) => {
    const i = Number(m.dataset.i);
    m.querySelector('[data-quitar]').addEventListener('click', (e) => {
      e.stopPropagation();
      quitarFoto(i);
    });
    arrastrable(m, i);
  });
}

/* REORDENAR ARRASTRANDO.

   La posicion se guarda como INDICE y no como id porque la lista mezcla
   fotos ya subidas —que tienen id— con fotos en espera, que no tienen
   ninguno todavia. El indice sirve para las dos.

   `dragover` tiene que llamar a preventDefault o el navegador no admite
   la soltada: por omision ningun elemento es un destino valido. */
let vieneDe = null;

function arrastrable(nodo, i) {
  nodo.addEventListener('dragstart', (e) => {
    vieneDe = i;
    nodo.classList.add('viajando');
    e.dataTransfer.effectAllowed = 'move';
    /* Firefox no arranca el arrastre si no se escribe algo. */
    e.dataTransfer.setData('text/plain', String(i));
  });
  nodo.addEventListener('dragend', () => {
    vieneDe = null;
    $$('#fotos .miniatura').forEach((m) => m.classList.remove('viajando', 'destino'));
  });
  nodo.addEventListener('dragover', (e) => {
    if (vieneDe === null || vieneDe === i) return;
    e.preventDefault();
    nodo.classList.add('destino');
  });
  nodo.addEventListener('dragleave', () => nodo.classList.remove('destino'));
  nodo.addEventListener('drop', (e) => {
    e.preventDefault();
    if (vieneDe === null || vieneDe === i) return;
    reordenar(vieneDe, i);
  });
}

async function reordenar(desde, hasta) {
  const lista = listaFotos();
  const [movida] = lista.splice(desde, 1);
  lista.splice(hasta, 0, movida);
  pintarFotos();

  /* Las que todavia no subieron no tienen orden que guardar: su orden es
     el de esta lista, y se aplica cuando suban. */
  if (!actual) return;
  try {
    await api('/api/admin/autos/' + actual.id + '/fotos/orden',
      { method: 'PUT', body: JSON.stringify({ ids: actual.fotos.map((f) => f.id) }) });
    await cargar();
  } catch (err) { avisar(err.message, true); }
}

async function quitarFoto(i) {
  const foto = listaFotos()[i];
  if (!foto) return;

  /* La que nunca subio se saca de la lista y listo; hay que soltarle la
     direccion de la vista previa o el navegador se queda con el archivo
     en memoria toda la sesion. */
  if (foto.enEspera) {
    URL.revokeObjectURL(foto.vista);
    enEspera.splice(i, 1);
    pintarFotos();
    return;
  }

  try {
    await api('/api/admin/fotos/' + foto.id, { method: 'DELETE' });
    actual.fotos.splice(i, 1);
    pintarFotos();
    await cargar();
  } catch (err) { avisar(err.message, true); }
}

/* ACHICAR LA FOTO ACÁ Y NO EN EL SERVIDOR.

   Un Worker no trae con qué redimensionar una imagen: hay que sumar un
   servicio pago o cargar un WASM de varios cientos de KB en cada
   arranque. El navegador ya tiene un canvas y lo hace gratis.

   Y no es solo ahorrarse el trabajo: una foto de teléfono son 4 o 5 MB,
   y subir eso por una conexión de datos tarda. Achicada antes de salir
   son unos 200 KB. Sube diez veces más rápido y nunca toca el límite de
   tamaño de pedido.

   SE GUARDAN DOS TAMAÑOS. 1600 px para la ficha del auto y 640 para la
   grilla del catálogo. Sin el chico, la grilla bajaría diez imágenes de
   1600 px para mostrarlas del tamaño de una estampilla. */
function achicar(archivo, lado) {
  return new Promise((listo, fallo) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala);
      lienzo.height = Math.round(img.height * escala);
      const pincel = lienzo.getContext('2d');
      pincel.imageSmoothingQuality = 'high';
      pincel.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(img.src);
      lienzo.toBlob((b) => (b ? listo(b) : fallo(new Error('No se pudo convertir'))),
        'image/webp', 0.82);
    };
    img.onerror = () => fallo(new Error('Ese archivo no es una imagen'));
    img.src = URL.createObjectURL(archivo);
  });
}

/* Achicar las dos versiones de una foto. Se hace siempre acá, exista el
   auto o no: lo que cambia después es si se manda o si se guarda. */
async function preparar(archivo) {
  return {
    g: await achicar(archivo, 1600),
    ch: await achicar(archivo, 640),
  };
}

async function mandar(par) {
  const cuerpo = new FormData();
  cuerpo.append('1600', par.g, '1600.webp');
  cuerpo.append('640', par.ch, '640.webp');
  return api('/api/admin/autos/' + actual.id + '/fotos', { method: 'POST', body: cuerpo });
}

/* PRIMERO LOS HUECOS, DESPUES EL TRABAJO.

   Achicar y subir una foto tarda: entre el canvas y la red pueden ser
   varios segundos, y si la pantalla no cambia hasta que la primera
   termina, parece que el clic no agarro y uno vuelve a elegirlas.

   Asi que se dibuja una baldosa por archivo ANTES de tocar ninguno, con
   su nombre y su giro. Despues se procesan de a una y cada baldosa se
   reemplaza por su foto cuando le toca. Se ve avanzar. */
async function elegir(archivos) {
  const imagenes = [...archivos].filter((a) => a.type.startsWith('image/'));
  if (!imagenes.length) return;

  const lista = listaFotos();
  const huecos = imagenes.map((a) => ({ cargando: true, nombre: a.name }));
  huecos.forEach((h) => lista.push(h));
  trabajando = true;
  pintarFotos();

  let hechas = 0;
  for (let k = 0; k < imagenes.length; k++) {
    const hueco = huecos[k];
    avisar('Procesando ' + (k + 1) + ' de ' + imagenes.length + '…');
    try {
      const par = await preparar(imagenes[k]);

      /* Si el auto ya existe, sube ahora. Si no, la foto se queda con una
         vista previa hecha del MISMO blob que se va a subir — así lo que
         se ve es exactamente lo que va a quedar. */
      if (actual) {
        const { id, clave } = await mandar(par);
        delete hueco.cargando; delete hueco.nombre;
        Object.assign(hueco, { id, clave });
      } else {
        delete hueco.cargando; delete hueco.nombre;
        Object.assign(hueco, { enEspera: true, par, vista: URL.createObjectURL(par.ch) });
      }
      hechas++;
    } catch (err) {
      /* La que fallo se saca de la lista: dejar un hueco girando para
         siempre es peor que no mostrarla. */
      const j = lista.indexOf(hueco);
      if (j >= 0) lista.splice(j, 1);
      avisar(imagenes[k].name + ': ' + err.message, true);
    }
    pintarFotos();
  }

  trabajando = false;
  pintarFotos();

  if (!hechas) return;
  if (actual) { avisar(hechas + ' foto(s) subidas'); await cargar(); }
  else avisar(hechas + ' foto(s) listas — suben al guardar');
}

/* Cuando el auto recién se crea, sube todo lo que estaba esperando. En
   ORDEN y de a una: el servidor le da a cada foto el lugar siguiente al
   de la última, así el orden de la pantalla es el que queda guardado. */
async function subirLoQueEsperaba() {
  if (!enEspera.length) return;
  const total = enEspera.length;
  trabajando = true;
  for (let k = 0; k < total; k++) {
    const foto = enEspera[k];
    avisar('Subiendo ' + (k + 1) + ' de ' + total + '…');
    try {
      const { id, clave } = await mandar(foto.par);
      actual.fotos.push({ id, clave });
      URL.revokeObjectURL(foto.vista);
    } catch (err) {
      avisar(foto.par ? err.message : 'No se pudo subir una foto', true);
    }
  }
  enEspera = [];
  trabajando = false;
  pintarFotos();
}

$('#archivo').addEventListener('change', (e) => { elegir(e.target.files); e.target.value = ''; });

/* Soltar sobre cualquier parte de la sección de fotos, no sólo sobre el
   más: el gesto natural es tirarlas donde están las otras. */
const zona = $('#zonaFotos');
['dragenter', 'dragover'].forEach((n) => zona.addEventListener(n, (e) => {
  if (vieneDe !== null) return;          /* es un reordenamiento, no un alta */
  if (!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
}));
zona.addEventListener('drop', (e) => {
  if (vieneDe !== null) return;
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  elegir(e.dataTransfer.files);
});

/* ══════════════════════════════════════════════════════════════════
   LAS IMÁGENES FIJAS DE LA HOME
   ══════════════════════════════════════════════════════════════════

   Lugares que siempre existen. No se crean ni se borran: se reemplaza lo
   que hay adentro, y "quitar" es volver a la foto original que trae el
   HTML.

   VAN AGRUPADAS POR SECCIÓN Y EN EL ORDEN DE LA PÁGINA. Antes eran una
   grilla sola de doce y no había manera de saber cuál era cuál: la foto
   grande de la nota y el fondo del collage son la misma imagen de
   ejemplo, así que la lista plana mostraba la misma miniatura repetida
   sin ninguna pista de a qué sección iba cada una.

   NO SE RECORTA AL SUBIR — ver el comentario de SLOTS en el Worker, que
   tiene las medidas reales de cada lugar. Resumen: ningún lugar tiene
   una sola forma, así que se guarda la foto entera y el recorte lo hace
   el CSS en cada pantalla. */

let secciones = [];

/* QUÉ PANTALLA SE ESTÁ EDITANDO. Los lugares que cambian de forma entre
   la compu y el celular llevan un archivo por cada una, y cambiar uno no
   toca el otro. Los que se ven igual en las dos —la tira de tres de la
   nota— llevan uno solo y aparecen en las dos listas, avisando que es
   compartido. */
let pantalla = 'compu';

async function cargarMedios() {
  const r = await api('/api/admin/medios');
  secciones = r.secciones;
  pintarMedios();
}

/* La pantalla que corresponde mostrar de un lugar: la propia si la
   tiene, y si no la única que hay, que es la compartida. */
const deLaPantalla = (s) =>
  s.pantallas.find((p) => p.variante === pantalla) ||
  s.pantallas.find((p) => p.variante === 'todo');

/* LAS COMPARTIDAS SE MUESTRAN SÓLO EN COMPUTADORA.

   Un lugar que usa la misma foto en las dos pantallas aparecía en las
   dos listas, con un cartel explicando que era una sola. Pero eso es
   pedirle a alguien que lea una advertencia para entender que dos
   tarjetas que se ven distintas son en realidad la misma: el cartel
   tapaba un problema que se arregla no mostrándola dos veces.

   Se muestra donde se prepara la foto —la computadora— y listo. Lo que
   se cambie ahí vale también para el celular, que es lo que la nota de
   abajo de la tarjeta sigue diciendo. */
const vaEnEstaPantalla = (s) =>
  pantalla === 'compu' || s.pantallas.some((p) => p.variante === pantalla);

/* Todos los lugares en una lista plana, para poder referirse a uno por
   número desde el `data-i` del HTML sin llevar dos índices. */
const planos = () => secciones.flatMap((s) => s.slots);

function pintarMedios() {
  $$('#pantallas .pastilla').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.pantalla === pantalla)));

  $('#medios').innerHTML = secciones.map((sec) => {
    const previas = secciones.slice(0, secciones.indexOf(sec))
      .reduce((a, s) => a + s.slots.length, 0);

    /* Se conserva el número que le toca a cada lugar dentro de la lista
       plana —el `data-i`— aunque acá se muestren sólo algunos: es lo que
       usa el resto del panel para saber de cuál se habla. */
    const visibles = sec.slots
      .map((s, i) => ({ s, i: previas + i }))
      .filter(({ s }) => vaEnEstaPantalla(s));

    /* Una sección donde ninguno de sus lugares cambia entre pantallas
       queda vacía en el celular. No se dibuja el título de una lista sin
       nada adentro. */
    if (!visibles.length) return '';

    const piezas = visibles.map(({ s, i: iFijo }) => {
      const i = iFijo;
      const v = deLaPantalla(s);
      const compartida = v.variante === 'todo';
      const propia = !!v.clave;
      const src = propia ? '/fotos/' + v.clave : rutaOriginal(s.slot, pantalla);
      /* Un video se muestra como video —muteado y en bucle, como se va a
         ver en la página— y no como un cuadro fijo: lo que hay que poder
         revisar acá es si el bucle cierra bien. */
      const vista = propia && v.clase === 'video'
        ? '<video src="' + src + '" muted loop autoplay playsinline></video>'
        : '<img src="' + src + '" alt="" loading="lazy">';

      return '<article class="medio" data-i="' + i + '">' +
        '<div class="marco">' +
          (propia ? '<span class="propia">' + (v.clase === 'video' ? 'Video tuyo' : 'Tuya') + '</span>' : '') +
          vista +
        '</div>' +
        '<div class="pieza">' +
          '<h3>' + escapar(s.donde) + '</h3>' +
          '<p class="formato">' + escapar(v.guia) +
            (s.extra ? ' ' + escapar(s.extra) : '') + '</p>' +
          (compartida
            ? '<p class="compartida">Se ve igual en la compu y en el celular, ' +
              'así que es una sola foto para las dos.</p>'
            : '') +
          '<div class="mandos">' +
            '<button class="btn" data-cambiar type="button">Cambiar</button>' +
            (propia ? '<button class="btn btn--peligro" data-volver type="button">Volver a la original</button>' : '') +
          '</div>' +
        '</div></article>';
    }).join('');

    return '<section class="grupo">' +
      '<h2 class="grupo-titulo">' + escapar(sec.titulo) + '</h2>' +
      '<p class="grupo-nota">' + escapar(sec.nota) + '</p>' +
      '<div class="grupo-fotos">' + piezas + '</div>' +
    '</section>';
  }).join('');

  $$('#medios .medio').forEach((m) => {
    const i = Number(m.dataset.i);
    m.querySelector('[data-cambiar]').addEventListener('click', () => pedirImagen(i));
    m.querySelector('[data-volver]')?.addEventListener('click', () => volverOriginal(i));
  });
}

$$('#pantallas .pastilla').forEach((b) => b.addEventListener('click', () => {
  pantalla = b.dataset.pantalla;
  pintarMedios();
}));

/* Las fotos que trae el HTML. Están acá para poder mostrar en el panel
   cómo se ve el lugar cuando NO tiene reemplazo. Si alguna vez cambian
   en el HTML, hay que cambiarlas acá — es el único lugar donde esta
   lista se repite, y por eso conviene que sea corta.

   Varias tienen su versión de celular, que es justamente el motivo de
   que este lugar lleve un archivo por pantalla. */
function rutaOriginal(slot, cual) {
  const chico = cual === 'celular';
  /* El fondo del collage es un video, así que su "original" es el
     póster: alcanza para reconocer de qué pieza se trata y no arranca
     una descarga de video por una miniatura. */
  if (slot === 'collage-fondo')
    return '/assets/collage/drive' + (chico ? '-mobile' : '') + '-poster.jpg';
  if (slot === 'collage-interior')
    return '/assets/collage/interior' + (chico ? '-mobile' : '') + '.webp';
  if (slot === 'collage-ciudad' || slot === 'editorial-principal')
    return '/assets/collage/ciudad' + (chico ? '-mobile' : '') + '.webp';
  const ed = slot.match(/^editorial-(\d)$/);
  if (ed) return '/assets/social/ig-' + [null, 2, 5, 6][Number(ed[1])] + '.webp';
  return '';
}

let slotEnCurso = null;

function pedirImagen(i) {
  slotEnCurso = i;
  const s = planos()[i];
  /* El selector de archivos filtra por lo que el lugar admite, así no
     hay que rechazar después de que alguien ya eligió. */
  $('#archivoMedio').accept = s.admite.includes('video') ? 'image/*,video/mp4' : 'image/*';
  $('#archivoMedio').click();
}

$('#archivoMedio').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo || slotEnCurso === null) return;

  const s = planos()[slotEnCurso];
  const v = deLaPantalla(s);
  const esVideo = archivo.type.startsWith('video/');

  if (esVideo && !s.admite.includes('video')) {
    avisar('Ese lugar es sólo para fotos', true);
    return;
  }
  if (esVideo && archivo.type !== 'video/mp4') {
    avisar('El video tiene que ser .mp4 — es el único que reproducen todos los navegadores', true);
    return;
  }

  avisar(esVideo ? 'Subiendo el video…' : 'Preparando la imagen…');
  try {
    const cuerpo = new FormData();
    /* EL VIDEO VA TAL CUAL. Achicarlo sería recodificarlo, y eso es
       ffmpeg: acá sólo hay un lienzo, que sabe de imágenes. Por eso el
       tope de tamaño lo marca el Worker y la guía del lugar avisa que
       tiene que ser corto. */
    if (esVideo) cuerpo.append('imagen', archivo, 'medio.mp4');
    else cuerpo.append('imagen', await achicar(archivo, v.lado), 'medio.webp');
    await api('/api/admin/medios/' + s.slot + '/' + v.variante, { method: 'POST', body: cuerpo });
    avisar('Listo — ya se ve en la página');
    await cargarMedios();
  } catch (err) {
    avisar(err.message, true);
  }
});

async function volverOriginal(i) {
  const s = planos()[i];
  const v = deLaPantalla(s);
  if (!confirm('¿Volver a la original de "' + s.donde + '"?')) return;
  try {
    await api('/api/admin/medios/' + s.slot + '/' + v.variante, { method: 'DELETE' });
    avisar('Volvió a la original');
    await cargarMedios();
  } catch (err) { avisar(err.message, true); }
}

/* ── LOS TEXTOS EDITABLES ───────────────────────────────────────

   Dos campos: el titular y la bajada de la nota. Mismo trato que las
   imágenes — dejar el campo vacío y guardar es volver al original, no
   dejar el lugar en blanco.

   EL TEXTO ORIGINAL SE LEE DE LA PROPIA PÁGINA y no viene del Worker.
   Es una sola copia: si mañana alguien reescribe el titular en el HTML,
   el panel muestra ese, sin que haya que acordarse de tocar una segunda
   lista en el servidor. Se pide la home una vez y se buscan los
   `data-texto` ahí adentro. */

let textos = [];
let originales = {};

async function cargarTextos() {
  const [r, home] = await Promise.all([
    api('/api/admin/textos'),
    fetch('/').then((x) => x.text()).catch(() => ''),
  ]);
  textos = r.textos;

  if (home) {
    const doc = new DOMParser().parseFromString(home, 'text/html');
    doc.querySelectorAll('[data-texto]').forEach((el) => {
      /* El HTML trae el párrafo cortado en varios renglones con sangría;
         eso en un campo se ve como espacios de más. */
      originales[el.dataset.texto] = el.textContent.replace(/\s+/g, ' ').trim();
    });
  }
  pintarTextos();
}

function pintarTextos() {
  $('#textos').innerHTML = textos.map((t, i) => {
    const valor = t.valor ?? originales[t.slot] ?? '';
    return '<article class="texto" data-i="' + i + '">' +
      '<h3>' + escapar(t.donde) + '</h3>' +
      '<p class="pista">' + escapar(t.pista) + '</p>' +
      '<textarea maxlength="' + t.tope + '">' + escapar(valor) + '</textarea>' +
      '<div class="pie">' +
        '<span class="cuenta"></span>' +
        (t.valor ? '<button class="btn" data-volver type="button">Volver al original</button>' : '') +
        '<button class="btn btn--fuerte" data-guardar type="button">Guardar</button>' +
      '</div>' +
    '</article>';
  }).join('');

  $$('#textos .texto').forEach((c) => {
    const i = Number(c.dataset.i);
    const campo = c.querySelector('textarea');
    const cuenta = c.querySelector('.cuenta');
    const tope = textos[i].tope;

    const contar = () => {
      cuenta.textContent = campo.value.trim().length + ' / ' + tope;
      cuenta.dataset.pasado = campo.value.trim().length > tope ? 'si' : 'no';
    };
    contar();
    campo.addEventListener('input', contar);

    c.querySelector('[data-guardar]').addEventListener('click', () => guardarTexto(i, campo.value));
    c.querySelector('[data-volver]')?.addEventListener('click', () => {
      if (confirm('¿Volver al texto original?')) guardarTexto(i, '');
    });
  });
}

async function guardarTexto(i, valor) {
  const t = textos[i];
  try {
    await api('/api/admin/textos/' + t.slot, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ valor }),
    });
    avisar(valor.trim() ? 'Guardado — ya se ve en la página' : 'Volvió al original');
    await cargarTextos();
  } catch (err) { avisar(err.message, true); }
}

/* ── las pestañas ───────────────────────────────────────────── */

function verPestania(cual) {
  const autos = cual === 'autos';
  [['autos', '#pesAutos'], ['medios', '#pesMedios'], ['textos', '#pesTextos']]
    .forEach(([c, sel]) => $(sel).setAttribute('aria-pressed', String(cual === c)));

  $('#filtros').classList.toggle('oculto', !autos);
  $('#grilla').classList.toggle('oculto', !autos);
  $('#nuevo').classList.toggle('oculto', !autos || ordenando);
  $('#ordenar').classList.toggle('oculto', !autos || ordenando);
  $('#guardarOrden').classList.toggle('oculto', !autos || !ordenando);
  $('#cancelarOrden').classList.toggle('oculto', !autos || !ordenando);
  $('#zonaMedios').classList.toggle('oculto', cual !== 'medios');
  $('#zonaTextos').classList.toggle('oculto', cual !== 'textos');
  $('#sinAutos').classList.add('oculto');

  if (autos) pintarLista();
  else if (cual === 'medios') cargarMedios();
  else cargarTextos();
}

$('#pesAutos').addEventListener('click', () => verPestania('autos'));
$('#pesMedios').addEventListener('click', () => verPestania('medios'));
$('#pesTextos').addEventListener('click', () => verPestania('textos'));

/* ── arranque ───────────────────────────────────────────────────── */

(async () => {
  const { activa } = await fetch('/api/sesion').then((r) => r.json()).catch(() => ({}));
  if (activa) { mostrarPanel(); await cargar(); } else { mostrarEntrar(); }
})();
