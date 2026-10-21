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
  /* AL SALIR SE VACÍA LA BANDEJA. Si la sesión se corta con un chat
     abierto, los mensajes de esa persona quedarían escritos en la
     página de quien ya no tiene sesión: esconderlos no es borrarlos.
     Se van del documento y hay que volver a pedirlos. */
  clearInterval(relojBandeja);
  vaciarBandeja();
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
  /* El link existe desde que el auto está publicado. En un borrador el
     botón no aparece: la dirección todavía no contesta. */
  $('#copiarLink').classList.toggle('oculto',
    !auto || !auto.enlace || auto.estado === 'borrador');
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

/* COPIAR EL LINK DE ESTE AUTO.

   `navigator.clipboard` necesita HTTPS y, en algunos navegadores, que el
   permiso esté dado: si falla, se muestra la dirección para copiarla a
   mano en vez de dejar un botón que no hace nada. */
$('#copiarLink').addEventListener('click', async () => {
  if (!actual?.enlace) return;
  const direccion = location.origin + actual.enlace;
  try {
    await navigator.clipboard.writeText(direccion);
    avisar('Link copiado');
  } catch {
    prompt('Copiá el link:', direccion);
  }
});

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

/* ── la bandeja ──────────────────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   Los mensajes de WhatsApp, Instagram y Messenger.

   TODO LO QUE SE DIBUJA ACÁ VIENE DE AFUERA: el nombre, el texto, el
   usuario, los puso alguien que nos escribió. Pasa entero por
   `escapar()`, sin excepciones.

   NINGUNA DIRECCIÓN LLEVA UN TELÉFONO NI UN USUARIO. Se abre un chat
   por su id interno; el dato de contacto llega en la respuesta y se
   muestra en pantalla, pero no viaja en la URL ni queda en el historial
   del navegador. Lo mismo del otro lado, en src/index.js. */

const CANALES = {
  whatsapp:   'WhatsApp',
  instagram:  'Instagram',
  messenger:  'Messenger',
};

/* UN MENSAJE QUE NO ES TEXTO. No guardamos el archivo —bajarlo sería
   guardar más de lo necesario para atender una consulta— así que acá
   dice qué llegó y dónde se abre, y nada más. */
const ADJUNTOS = {
  imagen:    'Una foto',
  audio:     'Un audio',
  video:     'Un video',
  documento: 'Un archivo',
  ubicacion: 'Una ubicación',
  otro:      'Algo que no es texto',
};

let chats = [];
let canal = 'todos';
let chatActual = null;      /* el chat abierto, con sus mensajes */

/* LAS FECHAS VIENEN DE SQLITE: "2026-10-05 18:22:11", en UTC y sin la T
   ni la Z. Así como están, cada navegador las interpreta a su manera
   —algunos como hora local, que las corre tres horas— así que se
   arreglan antes de parsearlas. */
const aFecha = (s) => new Date(String(s ?? '').replace(' ', 'T') + 'Z');

/* SIEMPRE EN 24 HORAS. Sin `hour12:false`, es-AR devuelve "01:41 p. m.",
   que acá nadie escribe y encima ocupa el doble en una lista angosta. */
const RELOJ = { hour: '2-digit', minute: '2-digit', hour12: false };

/* En la lista alcanza la hora si fue hoy y el día si fue antes: lo que
   importa ahí es si está fresco. */
function cuandoCorto(s) {
  const d = aFecha(s);
  if (isNaN(d)) return '';
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('es-AR', RELOJ)
    : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

const cuandoLargo = (s) => {
  const d = aFecha(s);
  return isNaN(d) ? '' : d.toLocaleString('es-AR',
    { day: '2-digit', month: '2-digit', ...RELOJ });
};

async function cargarChats() {
  const { chats: lista } = await api('/api/admin/chats');
  chats = lista;
  pintarChats();
}

function pintarChats() {
  const lista = canal === 'todos' ? chats : chats.filter((c) => c.canal === canal);
  $('#sinChats').classList.toggle('oculto', lista.length > 0);

  $('#chats').innerHTML = lista.map((c) => {
    /* Sin nombre se muestra el canal y no el teléfono: el teléfono ya
       está en la línea de abajo y repetirlo arriba no agrega nada. */
    const quien = c.nombre || CANALES[c.canal] || c.canal;
    const adelanto = c.adelanto
      ? escapar(c.adelanto)
      : '<em>' + (c.cantidad ? 'Mandó algo que no es texto' : 'Sin mensajes') + '</em>';

    return '<button class="chat" type="button" data-id="' + c.id + '">' +
      '<span class="arriba">' +
        '<span class="nombre">' + escapar(quien) + '</span>' +
        (c.humano ? '<span class="espera">Espera a una persona</span>' : '') +
        (c.etapa ? '<span class="etapa-marca' + (c.perdido ? ' etapa-marca--perdido' : '') + '">' +
          escapar(ETAPAS[c.etapa] || c.etapa) + '</span>' : '') +
        (c.clase === 'comentario'
          ? '<span class="clase clase--comentario">Comentario</span>'
          : '<span class="clase">Privado</span>') +
        '<span class="canal">' + escapar(CANALES[c.canal] || c.canal) + '</span>' +
        '<span class="cuando">' + cuandoCorto(c.ultimo) + '</span>' +
      '</span>' +
      '<span class="adelanto">' + adelanto + '</span>' +
    '</button>';
  }).join('');

  $$('#chats .chat').forEach((f) =>
    f.addEventListener('click', () => abrirChat(Number(f.dataset.id))));
}

function pintarCanales() {
  $$('#canales .pastilla').forEach((p) =>
    p.setAttribute('aria-pressed', String(p.dataset.canal === canal)));
}

$$('#canales .pastilla').forEach((p) => p.addEventListener('click', () => {
  canal = p.dataset.canal;
  pintarCanales();
  pintarChats();
}));

/* ── un chat abierto ────────────────────────────────────────────── */

async function abrirChat(id) {
  try {
    chatActual = await api('/api/admin/chats/' + id);
  } catch (err) { avisar(err.message, true); return; }

  const { chat, mensajes } = chatActual;

  $('#tituloChat').textContent = chat.nombre || CANALES[chat.canal] || chat.canal;
  $('#quienChat').textContent =
    (CANALES[chat.canal] || chat.canal) + ' · ' + chat.externo_id;

  /* El botón dice en qué estado está, y además se llena cuando está
     prendido: en este panel lo relleno es lo activo. El aria-pressed va
     igual, que es lo que lo anuncia como un interruptor y no como una
     acción más. */
  $('#aHumano').textContent = chat.humano
    ? 'Ya la sigue una persona'
    : 'Que siga una persona';
  $('#aHumano').setAttribute('aria-pressed', String(!!chat.humano));
  $('#aHumano').classList.toggle('btn--fuerte', !!chat.humano);

  $('#notaChat').classList.toggle('oculto', !chat.nota);
  if (chat.nota) $('#notaChat').textContent = chat.nota;

  $('#tipoChat').value = chat.tipo || '';
  $('#etapaChat').value = chat.etapa || '';
  $('#perdidoChat').checked = !!chat.perdido;

  pintarHilo(chat, mensajes);
  prepararRespuesta(chat, mensajes);

  $('#vistaLista').classList.add('oculto');
  $('#vistaChat').classList.remove('oculto');
  scrollTo(0, 0);
}

/* EL CUADRO PARA CONTESTAR, Y EL RELOJ DE LAS 24 HORAS.

   Instagram deja escribir libre sólo dentro de las 24 horas desde el
   último mensaje de la persona. Pasado ese plazo el envío falla, así
   que conviene decirlo ANTES de que escriba —no después— y por eso el
   aviso se calcula acá y no cuando Meta devuelve el error.

   El cuadro sólo aparece en Instagram: es el único canal con el envío
   programado. Mostrarlo en los otros sería ofrecer un botón que falla. */
function prepararRespuesta(chat, mensajes) {
  const form = $('#responder');
  const puede = chat.canal === 'instagram';
  form.classList.toggle('oculto', !puede);
  $('#respuesta').value = '';
  if (!puede) return;

  const ultimoDeEl = [...mensajes].reverse().find((m) => m.direccion === 'entrante');
  const horas = ultimoDeEl
    ? (Date.now() - aFecha(ultimoDeEl.creado)) / 3600000
    : Infinity;

  const plazo = $('#plazo');
  if (!isFinite(horas)) {
    plazo.textContent = 'Esta persona todavía no escribió, así que Instagram no deja escribirle primero.';
  } else if (horas >= 24) {
    plazo.textContent = 'Pasaron más de 24 horas desde su último mensaje. Instagram va a rechazar el envío.';
  } else {
    plazo.textContent = 'Quedan ' + Math.max(0, Math.floor(24 - horas)) + ' h para contestar libremente.';
  }
  $('#enviar').disabled = !isFinite(horas) || horas >= 24;
}

$('#responder').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!chatActual) return;
  const mensaje = $('#respuesta').value.trim();
  if (!mensaje) return;

  const boton = $('#enviar');
  boton.disabled = true;
  try {
    await api('/api/admin/chats/' + chatActual.chat.id + '/responder', {
      method: 'POST',
      body: JSON.stringify({ texto: mensaje }),
    });
    avisar('Enviado');
    await abrirChat(chatActual.chat.id);
    await cargarChats();
  } catch (err) {
    /* El error viene de Meta con todas las letras —ventana vencida,
       permiso que falta, token muerto— y se muestra tal cual. */
    avisar(err.message, true);
    boton.disabled = false;
  }
});

/* ── LOS NÚMEROS DE INSTAGRAM ────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   SE DIBUJA LO QUE VINO, NO UN JUEGO FIJO DE NÚMEROS. Instagram no da
   las mismas métricas para un reel que para una foto, y los nombres
   cambiaron entre versiones. Esperar una lista fija hace que falte
   media tabla el día que cambie algo; así, lo que no vino se marca
   como ausente y lo demás se muestra igual. */

let numeros = null;

const CORTES = { age: 'Edad', gender: 'Género', country: 'País' };
const GENEROS = { M: 'Hombres', F: 'Mujeres', U: 'Sin declarar' };

/* Un número que no vino NO es un cero: es que Instagram no lo da para
   ese tipo de publicación. Mostrarlo como 0 sería decir una mentira
   —"este reel no se compartió"— en vez de "esto no se sabe". */
const cifra = (n) => (n === null || n === undefined
  ? '<span class="nada">—</span>'
  : conPuntos(n));

async function cargarNumeros() {
  const tabla = $('#tablaMedia');
  tabla.innerHTML = '<tbody><tr><td>Leyendo Instagram…</td></tr></tbody>';
  $('#sinNumeros').classList.add('oculto');

  try {
    numeros = await api('/api/admin/instagram/numeros');
  } catch (err) {
    tabla.innerHTML = '';
    $('#sinNumeros').textContent = err.message;
    $('#sinNumeros').classList.remove('oculto');
    return;
  }
  pintarNumeros();
}

function pintarNumeros() {
  const { perfil = {}, cuenta = {}, publico = {}, publicaciones = [] } = numeros ?? {};

  /* Arriba, lo poco que se mira de reojo. */
  const tarjetas = [
    ['Seguidores', perfil.followers_count],
    ['Publicaciones', perfil.media_count],
    ['Alcance (hoy)', cuenta.reach],
    ['Visitas al perfil', cuenta.profile_views],
    ['Cuentas que interactuaron', cuenta.accounts_engaged],
    ['Interacciones', cuenta.total_interactions],
  ].filter(([, v]) => v !== null && v !== undefined);

  $('#cifras').innerHTML = tarjetas.map(([q, n]) =>
    '<div class="cifra"><span class="n">' + conPuntos(n) + '</span>' +
    '<span class="q">' + q + '</span></div>').join('');

  /* El público, en barras relativas al tramo más grande: lo que se
     compara es el peso de un tramo contra otro, no el porcentaje
     exacto sobre el total. */
  $('#publico').innerHTML = Object.entries(publico).map(([corte, filas]) => {
    const tope = Math.max(...filas.map((f) => f.cuantos), 1);
    return '<div><h3>' + (CORTES[corte] || corte) + '</h3>' +
      filas.slice(0, 8).map((f) => {
        const nombre = corte === 'gender' ? (GENEROS[f.valor] || f.valor) : f.valor;
        return '<div class="barra-fila">' +
          '<span class="arriba"><span>' + escapar(nombre) + '</span>' +
            '<b>' + conPuntos(f.cuantos) + '</b></span>' +
          '<span class="barra-riel"><span class="barra-fill" style="width:' +
            Math.round((f.cuantos / tope) * 100) + '%"></span></span>' +
        '</div>';
      }).join('') + '</div>';
  }).join('') || '<p class="seccion-nota">Instagram todavía no devuelve datos del público.</p>';

  /* Y la tabla. Lo más nuevo arriba, que es como uno la lee. */
  $('#tablaMedia').innerHTML =
    '<thead><tr>' +
      '<th>Publicación</th><th>Alcance</th><th>Repr.</th>' +
      '<th class="envios">Envíos</th><th>Guardados</th>' +
      '<th>Me gusta</th><th>Coment.</th>' +
    '</tr></thead><tbody>' +
    publicaciones.map((p) => {
      const foto = p.imagen
        ? '<img src="' + escapar(p.imagen) + '" alt="" loading="lazy">'
        : '<img alt="">';
      const titulo = (p.texto || '(sin texto)').split('\n')[0];
      const enlace = p.enlace
        ? '<a href="' + escapar(p.enlace) + '" target="_blank" rel="noopener">' +
          escapar(titulo) + '</a>'
        : escapar(titulo);

      return '<tr>' +
        '<td><span class="pieza">' + foto + '<span class="texto">' + enlace +
          '<small>' + cuandoLargo(p.cuando) + ' · ' + escapar(p.tipo || '') + '</small>' +
        '</span></span></td>' +
        '<td>' + cifra(p.alcance) + '</td>' +
        '<td>' + cifra(p.reproducciones) + '</td>' +
        '<td class="envios">' + cifra(p.envios) + '</td>' +
        '<td>' + cifra(p.guardados) + '</td>' +
        '<td>' + cifra(p.likes) + '</td>' +
        '<td>' + cifra(p.comentarios) + '</td>' +
      '</tr>';
    }).join('') + '</tbody>';
}

/* ── QUE SE ACTUALICE SOLO ───────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   SE LE PREGUNTA A NUESTRA BASE, NO A INSTAGRAM. El webhook ya trae
   todo al instante y lo guarda; lo único que faltaba era que la
   pantalla releyera. Preguntarle a Meta cada cinco minutos sería
   gastar llamadas para enterarse de algo que ya tenemos.

   NO CORRE SI LA PESTAÑA NO SE VE. Un panel abierto de fondo tres días
   son mil pedidos para nadie. Y al volver a la pestaña refresca en el
   acto, que es justo cuando a uno le importa estar al día.

   LO QUE ESTÁS ESCRIBIENDO NO SE PIERDE. Si hay un chat abierto con
   media respuesta tipeada, el refresco la devuelve a su lugar: que la
   pantalla se actualice sola no puede costarte lo que ibas a mandar. */

const CADA = 5 * 60 * 1000;
let relojBandeja = null;

async function refrescarBandeja() {
  if (document.hidden) return;
  if ($('#pantallaPanel').classList.contains('oculto')) return;
  if ($('#zonaBandeja').classList.contains('oculto')) return;

  try {
    if (chatActual && !$('#vistaChat').classList.contains('oculto')) {
      const borrador = $('#respuesta').value;
      await abrirChat(chatActual.chat.id);
      $('#respuesta').value = borrador;
    }
    await cargarChats();
  } catch { /* si falla, se reintenta en el próximo tic */ }
}

function arrancarRefresco() {
  clearInterval(relojBandeja);
  relojBandeja = setInterval(refrescarBandeja, CADA);
}

/* Al volver a la pestaña, al instante. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refrescarBandeja();
});

/* TRAER DE INSTAGRAM. Puente hasta que la app esté publicada: mientras
   Meta no avise, se le pregunta. */
$('#traerIG').addEventListener('click', async () => {
  const boton = $('#traerIG');
  const antes = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Trayendo…';
  try {
    const { vistas, leidos, guardados } = await api('/api/admin/instagram/traer', { method: 'POST' });
    /* Cada caso dice algo distinto y por eso no comparten mensaje:
       sin conversaciones el problema está en Instagram, y con
       conversaciones pero sin nada nuevo, no hay problema. */
    avisar(
      guardados ? 'Entraron ' + guardados + ' mensajes'
      : !vistas  ? 'Instagram no devolvió ninguna conversación'
      :            vistas + ' conversaciones, ' + leidos + ' mensajes, nada nuevo'
    );
    await cargarChats();
  } catch (err) {
    avisar(err.message, true);
  } finally {
    boton.disabled = false;
    boton.textContent = antes;
  }
});

function pintarHilo(chat, mensajes) {
  if (!mensajes.length) {
    $('#hilo').innerHTML = '<div class="vacio">Esta conversación no tiene mensajes.</div>';
    return;
  }

  $('#hilo').innerHTML = mensajes.map((m) => {
    const mio = m.direccion === 'saliente';

    /* QUIÉN ESCRIBIÓ CADA COSA. Que diga IA cuando contestó la IA es
       parte de lo que declaramos: tiene que poder verse después. */
    const firma = mio
      ? (m.autor === 'ia' ? 'IA' : 'Manna')
      : escapar(chat.nombre || CANALES[chat.canal] || chat.canal);

    const cuerpo = m.tipo === 'texto'
      ? '<p>' + escapar(m.texto) + '</p>'
      : '<span class="adjunto">' + (ADJUNTOS[m.tipo] || ADJUNTOS.otro) +
        ' · se abre en ' + escapar(CANALES[chat.canal] || chat.canal) + '</span>';

    return '<article class="globo' + (mio ? ' globo--saliente' : '') + '">' +
      cuerpo +
      '<span class="firma"><span>' + firma + '</span>' +
        '<span>' + cuandoLargo(m.creado) + '</span></span>' +
    '</article>';
  }).join('');
}

function cerrarChat() {
  $('#vistaChat').classList.add('oculto');
  $('#vistaLista').classList.remove('oculto');
  $('#hilo').innerHTML = '';
  chatActual = null;
}

/* Deja la bandeja como recién cargada: sin chat abierto, sin lista y
   sin nada de nadie en memoria ni en el documento. */
function vaciarBandeja() {
  chats = [];
  chatActual = null;
  $('#vistaChat').classList.add('oculto');
  $('#vistaLista').classList.remove('oculto');
  $('#hilo').innerHTML = '';
  $('#chats').innerHTML = '';
  $('#notaChat').classList.add('oculto');
  $('#notaChat').textContent = '';
  $('#quienChat').textContent = '';
  $('#tablaEmbudo').innerHTML = '';
}

$('#volverChat').addEventListener('click', cerrarChat);

/* ── el embudo ──────────────────────────────────────────────────────
   Qué vino a hacer cada uno y hasta dónde llegó. Los nombres de acá
   son solo para mostrar: lo que viaja y se guarda son las claves, que
   tienen que coincidir con las listas de src/index.js y los CHECK de
   esquema/009-embudo.sql. Las etapas van en orden. */
const ETAPAS = {
  consulta: 'Consultó',
  charla:   'Charla real',
  precio:   'Tiene el número',
  visita:   'Visita agendada',
  vino:     'Vino',
  cerrado:  'Cerró',
};
const TIPOS = { comprador: 'Compran', vendedor: 'Venden su auto', permuta: 'Cambian el suyo' };

/* Se guarda apenas cambia cualquiera de los tres: no hay botón de
   guardar porque es una marca rápida mientras se lee el chat. */
async function guardarEmbudo() {
  if (!chatActual) return;
  const { chat } = chatActual;
  const cuerpo = {
    tipo: $('#tipoChat').value || null,
    etapa: $('#etapaChat').value || null,
    perdido: $('#perdidoChat').checked,
  };
  try {
    await api('/api/admin/chats/' + chat.id + '/embudo', {
      method: 'POST', body: JSON.stringify(cuerpo),
    });
    Object.assign(chat, cuerpo, { perdido: cuerpo.perdido ? 1 : 0 });
    const enLista = chats.find((c) => c.id === chat.id);
    if (enLista) Object.assign(enLista, chat);
    avisar('Marcado');
  } catch (err) { avisar(err.message, true); }
}
['#tipoChat', '#etapaChat', '#perdidoChat'].forEach((s) =>
  $(s).addEventListener('change', guardarEmbudo));

/* El mes en curso, en hora local: "2026-10". */
const mesDeHoy = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

/* UNA FILA POR TIPO Y UNA COLUMNA POR ETAPA, ACUMULADA: la columna
   "Vino" cuenta a todos los que llegaron por lo menos a venir, aunque
   después hayan cerrado. Así cada número se lee como "llegaron hasta
   acá", y el porcentaje de abajo es contra la columna anterior, que es
   donde se ve en qué paso se escapa la gente. */
async function cargarEmbudo() {
  const mes = $('#mesEmbudo').value || mesDeHoy();
  $('#mesEmbudo').value = mes;
  let datos;
  try {
    datos = await api('/api/admin/embudo?mes=' + encodeURIComponent(mes));
  } catch (err) { avisar(err.message, true); return; }

  const orden = datos.etapas;
  const conteo = (tipo, i) => datos.filas
    .filter((f) => f.tipo === tipo && f.etapa && orden.indexOf(f.etapa) >= i)
    .reduce((s, f) => s + f.cantidad, 0);
  const perdidos = (tipo) => datos.filas
    .filter((f) => f.tipo === tipo && f.perdido)
    .reduce((s, f) => s + f.cantidad, 0);
  const suelto = (cond) => datos.filas.filter(cond).reduce((s, f) => s + f.cantidad, 0);

  const cabeza = '<tr><th></th>' +
    orden.map((e) => '<th>' + escapar(ETAPAS[e] || e) + '</th>').join('') +
    '<th>Se perdieron</th></tr>';

  const filas = Object.entries(TIPOS).map(([tipo, nombre]) => {
    let anterior = null;
    const celdas = orden.map((e, i) => {
      const n = conteo(tipo, i);
      const pct = anterior ? Math.round((n / anterior) * 100) + '%' : '';
      anterior = n;
      return '<td>' + n + (pct ? '<span class="pct">' + pct + '</span>' : '') + '</td>';
    }).join('');
    return '<tr><td>' + nombre + '</td>' + celdas + '<td>' + perdidos(tipo) + '</td></tr>';
  }).join('');

  const ruido = suelto((f) => f.tipo === 'ruido');
  const sinMarcar = suelto((f) => !f.tipo);

  $('#tablaEmbudo').innerHTML =
    '<table><thead>' + cabeza + '</thead><tbody>' + filas + '</tbody></table>' +
    '<p class="aclara" style="margin:.8rem 0 0">' +
      'Ruido: ' + ruido + ' · Sin marcar: ' + sinMarcar +
      '. Cuenta las conversaciones que empezaron en el mes.' +
    '</p>';
}

$('#mesEmbudo').addEventListener('change', cargarEmbudo);

/* QUE LA SIGA UNA PERSONA.
   Cubre los dos casos que nos comprometimos a atender: alguien que pide
   hablar con una persona, y alguien que pide que borremos sus datos.
   Mientras está prendido, la IA no contesta en ese chat.

   La nota se vuelve a mandar siempre, incluso al apagar: el endpoint
   escribe `nota` sin preguntar, así que no mandarla la borraría. */
$('#aHumano').addEventListener('click', async () => {
  if (!chatActual) return;
  const { chat } = chatActual;
  const prendiendo = !chat.humano;

  let nota = chat.nota ?? null;
  if (prendiendo) {
    const escrita = prompt('¿Por qué la sigue una persona? (opcional)', nota || '');
    if (escrita === null) return;
    nota = escrita.trim() || null;
  }

  try {
    await api('/api/admin/chats/' + chat.id + '/humano', {
      method: 'POST',
      body: JSON.stringify({ humano: prendiendo, nota }),
    });
    avisar(prendiendo ? 'La sigue una persona' : 'Vuelve a contestar la IA');
    await abrirChat(chat.id);
    await cargarChats();
  } catch (err) { avisar(err.message, true); }
});

/* ── el borrado a pedido ─────────────────────────────────────────
   Diez días hábiles es el plazo que declaramos, y lo que se borra es
   todo: la conversación y los mensajes, en los tres canales, buscando
   por teléfono o usuario porque así llega el pedido.

   NO SE PUEDE DESHACER y por eso pregunta dos veces: una vez por qué
   dato se borra y otra para confirmarlo escrito. El dato viaja en el
   cuerpo del pedido, nunca en la dirección. */

async function olvidar(externo) {
  if (!externo) return;
  if (!confirm(
    'Se va a borrar TODO lo que tengamos de "' + externo + '" en WhatsApp, ' +
    'Instagram y Messenger: la conversación y todos los mensajes.\n\n' +
    'No se puede deshacer. ¿Seguimos?'
  )) return;

  try {
    const { borradas } = await api('/api/admin/olvidar', {
      method: 'POST',
      body: JSON.stringify({ externo }),
    });
    avisar(borradas
      ? 'Borrado: ' + borradas + (borradas === 1 ? ' conversación' : ' conversaciones')
      : 'No había nada guardado de esa persona');
    if (!$('#vistaChat').classList.contains('oculto')) cerrarChat();
    await cargarChats();
  } catch (err) { avisar(err.message, true); }
}

$('#olvidar').addEventListener('click', () => {
  const externo = prompt(
    'Teléfono o usuario de quien pidió que borremos sus datos.\n' +
    'El teléfono va como lo manda WhatsApp, sin + ni espacios: 5491122334455'
  );
  olvidar(String(externo ?? '').trim());
});

$('#borrarChat').addEventListener('click', () => {
  if (chatActual) olvidar(chatActual.chat.externo_id);
});

/* ── las pestañas ───────────────────────────────────────────── */

function verPestania(cual) {
  const autos = cual === 'autos';
  [['autos', '#pesAutos'], ['medios', '#pesMedios'],
   ['bandeja', '#pesBandeja'], ['numeros', '#pesNumeros']]
    .forEach(([c, sel]) => $(sel).setAttribute('aria-pressed', String(cual === c)));

  $('#filtros').classList.toggle('oculto', !autos);
  $('#grilla').classList.toggle('oculto', !autos);
  $('#nuevo').classList.toggle('oculto', !autos || ordenando);
  $('#ordenar').classList.toggle('oculto', !autos || ordenando);
  $('#guardarOrden').classList.toggle('oculto', !autos || !ordenando);
  $('#cancelarOrden').classList.toggle('oculto', !autos || !ordenando);
  $('#zonaMedios').classList.toggle('oculto', cual !== 'medios');
  $('#zonaBandeja').classList.toggle('oculto', cual !== 'bandeja');
  $('#zonaNumeros').classList.toggle('oculto', cual !== 'numeros');
  $('#sinAutos').classList.add('oculto');
  $('#sinChats').classList.add('oculto');

  if (autos) pintarLista();
  else if (cual === 'medios') cargarMedios();
  else if (cual === 'numeros') cargarNumeros();
  else {
    cargarChats().catch((err) => avisar(err.message, true));
    cargarEmbudo();
    arrancarRefresco();
  }
}

$('#pesAutos').addEventListener('click', () => verPestania('autos'));
$('#pesMedios').addEventListener('click', () => verPestania('medios'));
$('#pesBandeja').addEventListener('click', () => verPestania('bandeja'));
$('#pesNumeros').addEventListener('click', () => verPestania('numeros'));

/* ── arranque ───────────────────────────────────────────────────── */

(async () => {
  const { activa } = await fetch('/api/sesion').then((r) => r.json()).catch(() => ({}));
  if (activa) { mostrarPanel(); await cargar(); } else { mostrarEntrar(); }
})();
