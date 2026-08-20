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

  $$('#grilla .ficha').forEach((f) => f.addEventListener('click', () =>
    abrir(autos.find((a) => a.id === Number(f.dataset.id)))));
}

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
  datos.destacado = f.elements.destacado.checked;
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
    return '<div class="miniatura' + (f.enEspera ? ' enEspera' : '') +
        '" draggable="true" data-i="' + i + '">' +
      '<img src="' + (f.enEspera ? f.vista : '/fotos/' + f.clave + '-640.webp') + '" alt="">' +
      (i === 0 ? '<span class="portada">Portada</span>' : '') +
      (f.enEspera ? '<span class="esperando">Sin subir</span>' : '') +
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

   Doce lugares que siempre existen. No se crean ni se borran: se
   reemplaza lo que hay adentro, y "quitar" es volver a la foto original
   que trae el HTML.

   CADA UNA SE RECORTA A LA PROPORCIÓN DE SU LUGAR, y por eso el panel no
   pide subir la foto ya preparada. Si el CSS de la nota usa 3:2 y entra
   una vertical, `object-fit` la recortaría igual pero mostrando lo que el
   navegador decida; recortándola acá, con `cover` centrado, el resultado
   es el mismo siempre y además no se suben píxeles que nadie va a ver. */

let slots = [];

async function cargarMedios() {
  const { slots: lista } = await api('/api/admin/medios');
  slots = lista;
  pintarMedios();
}

const comoProporcion = (p) =>
  Math.abs(p - 1) < 0.01 ? 'cuadrada 1:1'
  : Math.abs(p - 3 / 2) < 0.01 ? 'apaisada 3:2'
  : Math.abs(p - 4 / 3) < 0.01 ? 'apaisada 4:3'
  : p.toFixed(2) + ':1';

function pintarMedios() {
  $('#medios').innerHTML = slots.map((s, i) => {
    const propia = !!s.clave;
    const src = propia ? '/fotos/' + s.clave + '-1600.webp' : rutaOriginal(s.slot);
    return '<article class="medio" data-i="' + i + '">' +
      '<div class="marco" style="aspect-ratio:' + s.prop + '">' +
        (propia ? '<span class="propia">Tuya</span>' : '') +
        '<img src="' + src + '" alt="" loading="lazy">' +
      '</div>' +
      '<div class="pieza">' +
        '<h3>' + escapar(s.donde) + '</h3>' +
        '<span class="formato">' + comoProporcion(s.prop) + ' · ' + s.alto + ' px de ancho</span>' +
        '<div class="mandos">' +
          '<button class="btn" data-cambiar type="button">Cambiar</button>' +
          (propia ? '<button class="btn btn--peligro" data-volver type="button">Volver a la original</button>' : '') +
        '</div>' +
      '</div></article>';
  }).join('');

  $$('#medios .medio').forEach((m) => {
    const i = Number(m.dataset.i);
    m.querySelector('[data-cambiar]').addEventListener('click', () => pedirImagen(i));
    m.querySelector('[data-volver]')?.addEventListener('click', () => volverOriginal(i));
  });
}

/* Las fotos que trae el HTML. Están acá para poder mostrar en el panel
   cómo se ve el lugar cuando NO tiene reemplazo. Si alguna vez cambian
   en el HTML, hay que cambiarlas acá — es el único lugar donde esta
   lista se repite, y por eso conviene que sea corta. */
function rutaOriginal(slot) {
  if (slot === 'editorial-principal') return '/assets/collage/ciudad.webp';
  if (slot === 'collage-interior')    return '/assets/collage/interior.webp';
  if (slot === 'collage-ciudad')      return '/assets/collage/ciudad.webp';
  const ed = slot.match(/^editorial-(\d)$/);
  if (ed) return '/assets/social/ig-' + [null, 2, 5, 6][Number(ed[1])] + '.webp';
  const so = slot.match(/^social-(\d)$/);
  if (so) return '/assets/social/ig-' + so[1] + '.webp';
  return '';
}

let slotEnCurso = null;

function pedirImagen(i) {
  slotEnCurso = i;
  $('#archivoMedio').click();
}

$('#archivoMedio').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo || slotEnCurso === null) return;

  const s = slots[slotEnCurso];
  avisar('Preparando la imagen…');
  try {
    const cuerpo = new FormData();
    cuerpo.append('imagen', await recortar(archivo, s.alto, s.prop), 'medio.webp');
    await api('/api/admin/medios/' + s.slot, { method: 'POST', body: cuerpo });
    avisar('Listo — ya se ve en la página');
    await cargarMedios();
  } catch (err) {
    avisar(err.message, true);
  }
});

async function volverOriginal(i) {
  const s = slots[i];
  if (!confirm('¿Volver a la foto original de "' + s.donde + '"?')) return;
  try {
    await api('/api/admin/medios/' + s.slot, { method: 'DELETE' });
    avisar('Volvió a la original');
    await cargarMedios();
  } catch (err) { avisar(err.message, true); }
}

/* RECORTE `COVER`, IGUAL QUE EL DEL CSS. Se toma del centro el rectángulo
   más grande que tenga la proporción pedida y se escala. Es exactamente
   lo que hace `object-fit:cover`, pero hecho una vez acá en vez de en
   cada visita — y sin subir los píxeles que el recorte tira. */
function recortar(archivo, ancho, prop) {
  return new Promise((listo, fallo) => {
    const img = new Image();
    img.onload = () => {
      const alto = Math.round(ancho / prop);
      const escala = Math.max(ancho / img.width, alto / img.height);
      const w = img.width * escala, h = img.height * escala;

      const lienzo = document.createElement('canvas');
      lienzo.width = ancho; lienzo.height = alto;
      const pincel = lienzo.getContext('2d');
      pincel.imageSmoothingQuality = 'high';
      pincel.drawImage(img, (ancho - w) / 2, (alto - h) / 2, w, h);
      URL.revokeObjectURL(img.src);

      lienzo.toBlob((b) => (b ? listo(b) : fallo(new Error('No se pudo convertir'))),
        'image/webp', 0.84);
    };
    img.onerror = () => fallo(new Error('Ese archivo no es una imagen'));
    img.src = URL.createObjectURL(archivo);
  });
}

/* ── las dos pestañas ───────────────────────────────────────────── */

function verPestania(cual) {
  const autos = cual === 'autos';
  $('#pesAutos').setAttribute('aria-pressed', String(autos));
  $('#pesMedios').setAttribute('aria-pressed', String(!autos));
  $('#filtros').classList.toggle('oculto', !autos);
  $('#grilla').classList.toggle('oculto', !autos);
  $('#nuevo').classList.toggle('oculto', !autos);
  $('#zonaMedios').classList.toggle('oculto', autos);
  $('#sinAutos').classList.add('oculto');
  if (autos) pintarLista(); else cargarMedios();
}

$('#pesAutos').addEventListener('click', () => verPestania('autos'));
$('#pesMedios').addEventListener('click', () => verPestania('medios'));

/* ── arranque ───────────────────────────────────────────────────── */

(async () => {
  const { activa } = await fetch('/api/sesion').then((r) => r.json()).catch(() => ({}));
  if (activa) { mostrarPanel(); await cargar(); } else { mostrarEntrar(); }
})();
