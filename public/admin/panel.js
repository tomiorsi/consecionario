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
  $('#fotosWA').classList.toggle('oculto', prende);
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
function achicar(archivo, lado, tipo = 'image/webp', calidad = 0.82) {
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
        tipo, calidad);
    };
    img.onerror = () => fallo(new Error('Ese archivo no es una imagen'));
    /* Un archivo elegido o, para las fotos ya subidas, su dirección. */
    img.src = typeof archivo === 'string' ? archivo : URL.createObjectURL(archivo);
  });
}

/* Achicar las dos versiones de una foto. Se hace siempre acá, exista el
   auto o no: lo que cambia después es si se manda o si se guarda. */
async function preparar(archivo) {
  return {
    g: await achicar(archivo, 1600),
    ch: await achicar(archivo, 640),
    /* LA DE WHATSAPP. La vista previa de un link sale con foto sólo si
       la imagen es JPG y liviana: con el WebP de 1600 px salía el título
       sin la foto (Maxi, 29/10). 800 px en JPG pesa unos 80 KB. */
    og: await achicar(archivo, 800, 'image/jpeg', 0.8),
  };
}

async function mandar(par) {
  const cuerpo = new FormData();
  cuerpo.append('1600', par.g, '1600.webp');
  cuerpo.append('640', par.ch, '640.webp');
  if (par.og) cuerpo.append('og', par.og, 'og.jpg');
  return api('/api/admin/autos/' + actual.id + '/fotos', { method: 'POST', body: cuerpo });
}

/* LAS FOTOS QUE YA ESTABAN, PARA WHATSAPP. Las subidas antes del 29/10
   no tienen su JPG. Esto lo arma acá, en el navegador, a partir de la de
   1600, y lo sube. Sólo la primera foto de cada auto: es la que usa la
   vista previa del link. Las que ya lo tienen se saltean. */
async function fotosParaWhatsApp() {
  const boton = $('#fotosWA');
  boton.disabled = true;
  let hechas = 0;
  try {
    const { autos: lista } = await api('/api/admin/autos');
    for (const a of lista ?? []) {
      const f = a.fotos?.[0];
      if (!f) continue;
      const ya = await fetch('/fotos/' + f.clave + '-og.jpg', { method: 'HEAD' });
      if (ya.ok) continue;
      boton.textContent = 'Armando ' + (hechas + 1) + '…';
      const jpg = await achicar('/fotos/' + f.clave + '-1600.webp', 800, 'image/jpeg', 0.8);
      const cuerpo = new FormData();
      cuerpo.append('clave', f.clave);
      cuerpo.append('og', jpg, 'og.jpg');
      await api('/api/admin/fotos/og', { method: 'POST', body: cuerpo });
      hechas++;
    }
    boton.textContent = hechas ? 'Listo: ' + hechas + ' fotos' : 'Ya estaban todas';
  } catch (e) {
    boton.textContent = 'Falló: ' + e.message;
  } finally {
    boton.disabled = false;
  }
}
$('#fotosWA').addEventListener('click', fotosParaWhatsApp);

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

/* PARA TASAR: la marca la deja la IA en la nota, que empieza así. */
const esParaTasar = (c) => String(c.nota ?? '').startsWith('Para tasar');
let soloTasar = false;

$('#filtroTasar').addEventListener('click', () => {
  soloTasar = !soloTasar;
  $('#filtroTasar').setAttribute('aria-pressed', String(soloTasar));
  pintarChats();
});

function pintarChats() {
  const lista = soloTasar ? chats.filter(esParaTasar) : chats;
  $('#filtroTasar').textContent = 'Para tasar (' + chats.filter(esParaTasar).length + ')';
  $('#sinChats').classList.toggle('oculto', lista.length > 0);

  $('#chats').innerHTML = lista.map((c) => {
    /* Sin nombre se muestra el canal y no el teléfono: el teléfono ya
       está en la línea de abajo y repetirlo arriba no agrega nada. */
    const quien = c.nombre || CANALES[c.canal] || c.canal;
    const adelanto = c.adelanto
      ? escapar(c.adelanto)
      : '<em>' + (c.cantidad ? 'Mandó algo que no es texto' : 'Sin mensajes') + '</em>';

    /* La inicial del nombre. Si no hay nombre queda el circulo vacio,
       que es mejor que meterle una letra inventada del canal. */
    const inicial = (quien.replace(/^@/, '').trim()[0] || '·');

    /* EL CANAL Y LA CLASE EN UNA LINEA, separados por un punto. Antes
       eran tres pastillas por fila; con veinte filas eran sesenta
       rectangulos. El dato es el mismo y se mira de reojo. */
    const meta = [
      '<span>' + escapar(CANALES[c.canal] || c.canal) + '</span>',
      c.clase === 'comentario'
        ? '<span class="publico">Comentario</span>'
        : '<span>Privado</span>',
    ];
    if (esParaTasar(c)) meta.push('<span class="tasar">' + escapar(c.nota.split(':')[0]) + '</span>');
    if (c.humano) meta.push('<span class="espera">La sigue una persona</span>');

    return '<button class="chat" type="button" data-id="' + c.id + '">' +
      '<span class="chat-inicial" aria-hidden="true">' + escapar(inicial) + '</span>' +
      '<span class="nombre">' + escapar(quien) + '</span>' +
      '<span class="cuando">' + cuandoCorto(c.ultimo) + '</span>' +
      '<span class="adelanto">' + adelanto + '</span>' +
      '<span class="meta">' +
        meta.join('<span class="punto">·</span>') +
      '</span>' +
    '</button>';
  }).join('');

  $$('#chats .chat').forEach((f) =>
    f.addEventListener('click', () => abrirChat(Number(f.dataset.id))));
}


/* ── un chat abierto ────────────────────────────────────────────── */

async function abrirChat(id) {
  try {
    chatActual = await api('/api/admin/chats/' + id);
  } catch (err) { avisar(err.message, true); return; }

  const { chat, mensajes } = chatActual;

  $('#tituloChat').textContent = chat.nombre || CANALES[chat.canal] || chat.canal;
  let anuncio = null;
  try { anuncio = chat.anuncio ? JSON.parse(chat.anuncio) : null; } catch { anuncio = null; }
  $('#anuncioChat').classList.toggle('oculto', !anuncio?.titulo && !anuncio?.texto);
  $('#anuncioChat').textContent = anuncio
    ? 'Vino del anuncio: ' + [anuncio.titulo, anuncio.texto].filter(Boolean).join(' · ')
    : '';
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

   Lo mismo en los tres canales: WhatsApp y Messenger tienen la misma
   ventana de 24 horas. Si al canal le falta su llave en Cloudflare, el
   error de Meta lo dice al mandar. */
function prepararRespuesta(chat, mensajes) {
  const form = $('#responder');
  form.classList.remove('oculto');
  $('#respuesta').value = '';
  limpiarSugerido();
  const red = CANALES[chat.canal] || chat.canal;

  const ultimoDeEl = [...mensajes].reverse().find((m) => m.direccion === 'entrante');
  const horas = ultimoDeEl
    ? (Date.now() - aFecha(ultimoDeEl.creado)) / 3600000
    : Infinity;

  const plazo = $('#plazo');
  if (!isFinite(horas)) {
    plazo.textContent = 'Esta persona todavía no escribió, así que ' + red + ' no deja escribirle primero.';
  } else if (horas >= 24) {
    plazo.textContent = 'Pasaron más de 24 horas desde su último mensaje. ' + red + ' va a rechazar el envío.';
  } else {
    plazo.textContent = 'Quedan ' + Math.max(0, Math.floor(24 - horas)) + ' h para contestar libremente.';
  }
  $('#enviar').disabled = !isFinite(horas) || horas >= 24;
}

/* QUE ESCRIBA LA IA.
   Deja el borrador en el cuadro y no lo manda: lo lee el que atiende y
   decide. Y si lo edita antes de mandarlo, mejor — el que conoce al
   cliente es él.

   LA FICHA DEL AUTO VA APARTE DEL TEXTO. Si el bot quiere mandar el link
   de un auto del garage, se dice abajo del cuadro con un botón para
   sacarlo: lo que sale es lo que se ve antes de apretar Enviar. El link
   sale primero, solo, para que el chat lo muestre con la foto. */
let fichaSugerida = null;
let ubicacionSugerida = false;

function limpiarSugerido() {
  fichaSugerida = null;
  ubicacionSugerida = false;
  $('#sugeridoFotos').classList.add('oculto');
  $('#sugeridoDerivar').classList.add('oculto');
}

/* Lo fijo que va con la respuesta: el link de un auto y la ubicación,
   cada uno con su botón para sacarlo. */
function pintarFichaSugerida() {
  const zona = $('#sugeridoFotos');
  const que = [];
  if (fichaSugerida) que.push(['ficha', 'el link del ' + fichaSugerida.titulo + ' en el garage']);
  if (ubicacionSugerida) que.push(['ubicacion', 'la ubicación con el mapa']);
  if (!que.length) { zona.classList.add('oculto'); return; }
  zona.innerHTML = que.map(([k, t]) => escapar('Va ' + t + ', en un mensaje aparte.') +
    ' <button class="btn" type="button" data-sacar="' + k + '" ' +
    'style="padding:.3em .7em;font-size:.5rem">No mandarlo</button>').join('<br>');
  zona.classList.remove('oculto');
  zona.querySelectorAll('[data-sacar]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.sacar === 'ficha') fichaSugerida = null; else ubicacionSugerida = false;
    pintarFichaSugerida();
  }));
}

$('#sugerir').addEventListener('click', async () => {
  if (!chatActual) return;
  const boton = $('#sugerir');
  const antes = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Escribiendo…';
  try {
    const { texto, conPosteo, ficha, derivar, ubicacion } = await api(
      '/api/admin/chats/' + chatActual.chat.id + '/sugerir', { method: 'POST' });
    $('#respuesta').value = texto;
    $('#respuesta').focus();

    fichaSugerida = ficha || null;
    ubicacionSugerida = Boolean(ubicacion);
    pintarFichaSugerida();

    /* Si cree que lo tiene que seguir una persona, se dice acá y no se
       hace solo: en borrador decide el que atiende, con el botón de
       arriba. */
    const zona = $('#sugeridoDerivar');
    zona.classList.toggle('oculto', !derivar);
    if (derivar) zona.textContent = 'La IA cree que esto lo tiene que seguir una persona: ' + derivar;

    /* Decir si supo de qué publicación venía importa: sin eso el bot
       contestó a ciegas y conviene leerlo con más cuidado. */
    avisar(conPosteo ? 'Escrito, con el texto del posteo' : 'Escrito, sin saber de qué publicación');
  } catch (err) {
    avisar(err.message, true);
  } finally {
    boton.disabled = false;
    boton.textContent = antes;
  }
});

$('#responder').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!chatActual) return;
  const mensaje = $('#respuesta').value.trim();
  if (!mensaje) return;

  const boton = $('#enviar');
  boton.disabled = true;
  try {
    const r = await api('/api/admin/chats/' + chatActual.chat.id + '/responder', {
      method: 'POST',
      body: JSON.stringify({
        texto: mensaje, auto_id: fichaSugerida?.auto_id ?? null, ubicacion: ubicacionSugerida,
      }),
    });
    /* Sale la primera parte y el resto va saliendo solo, de a diez
       segundos: el hilo se completa con el refresco de la bandeja. */
    avisar(r.partes > 1
      ? 'Salió el primer mensaje. Los otros ' + (r.partes - 1) + ' salen solos, de a 10 segundos'
      : 'Enviado');
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
/* Por fecha de entrada, que es como uno lee una lista. Pero la pregunta
   real suele ser "cuál anduvo mejor", y para eso se toca la columna. */
let ordenMedia = 'cuando';

const CORTES = { age: 'Edad', gender: 'Género', country: 'País' };
const GENEROS = { M: 'Hombres', F: 'Mujeres', U: 'Sin declarar' };

/* Un número que no vino NO es un cero: es que Instagram no lo da para
   ese tipo de publicación. Mostrarlo como 0 sería decir una mentira
   —"este reel no se compartió"— en vez de "esto no se sabe". */
const cifra = (n) => (n === null || n === undefined
  ? '<span class="nada">—</span>'
  : conPuntos(n));

/* LO GUARDADO PRIMERO, SIEMPRE. Leer Instagram entero tarda quince
   segundos, y durante esos quince segundos una pantalla en blanco se
   lee como rota. Se muestra lo último que sabemos —diciendo de cuándo
   es— y lo nuevo va reemplazándolo por detrás. */
async function cargarNumeros() {
  $('#sinNumeros').classList.add('oculto');

  try {
    const g = await api('/api/admin/instagram/numeros');
    if (!g.vacio) {
      numeros = g;
      pintarNumeros();
      $('#leidoNum').textContent = 'Lo que se ve es de ' + cuandoLargo(g.leido);
      $('#leidoNum').classList.remove('oculto');
    }
  } catch { /* si no hay nada guardado, se busca igual abajo */ }

  await actualizarNumeros();
}

async function actualizarNumeros() {
  let desde = 0;
  let vueltas = 0;

  try {
    while (desde !== null && vueltas < 20) {
      const r = await api('/api/admin/instagram/numeros', {
        method: 'POST', body: JSON.stringify({ desde }),
      });
      numeros = r;
      pintarNumeros();
      progreso('progresoNum', 'Leyendo Instagram', r.hechas || 0, r.total || 1);
      desde = r.siguiente ?? null;
      vueltas++;
    }
    progreso('progresoNum', null);
    $('#leidoNum').textContent = 'Actualizado recién';
    $('#leidoNum').classList.remove('oculto');
  } catch (err) {
    progreso('progresoNum', null);
    /* Si falla la actualización queda lo guardado, que es mejor que
       nada y además dice su fecha. */
    if (!numeros) {
      $('#sinNumeros').textContent = err.message;
      $('#sinNumeros').classList.remove('oculto');
    } else {
      avisar(err.message, true);
    }
  }
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

  /* LOS DOS RANKINGS. Una sola serie cada uno, un solo color: pintar
     cada barra de un tono según su largo sería decir dos veces lo
     mismo. Se etiquetan todas porque son diez y el número ES el
     contenido de un ranking, no un adorno sobre un punto. */
  $('#rankings').innerHTML = [
    ['envios', 'Envíos', 'Lo que la gente le mandó a alguien. Es lo que decide a quién le llega.'],
    ['alcance', 'Alcance', 'Cuánta gente distinta lo vio.'],
  ].map(([campo, titulo, nota]) => {
    const filas = publicaciones
      .filter((p) => typeof p[campo] === 'number')
      .sort((a, b) => b[campo] - a[campo])
      .slice(0, 10);
    if (!filas.length) return '';

    const tope = filas[0][campo] || 1;
    return '<div class="ranking"><h3 class="seccion-rotulo" style="margin:0 0 .3rem">' +
      titulo + '</h3>' +
      '<p class="seccion-nota" style="margin:0 0 1rem">' + nota + '</p>' +
      filas.map((p) => {
        const nombre = (p.texto || '(sin texto)').split('\n')[0];
        return '<div class="barra-fila" title="' + escapar(nombre) + '">' +
          '<span class="arriba"><span>' + escapar(nombre) + '</span>' +
            '<b>' + conPuntos(p[campo]) + '</b></span>' +
          '<span class="barra-riel"><span class="barra-fill" style="width:' +
            Math.round((p[campo] / tope) * 100) + '%"></span></span>' +
        '</div>';
      }).join('') + '</div>';
  }).join('');

  /* Y la tabla. Lo más nuevo arriba, que es como uno la lee. */
  $('#tablaMedia').innerHTML =
    '<thead><tr>' +
      '<th data-orden="cuando">Publicación</th>' +
      '<th data-orden="alcance">Alcance</th>' +
      '<th data-orden="reproducciones">Repr.</th>' +
      '<th class="envios" data-orden="envios">Envíos</th>' +
      '<th data-orden="guardados">Guardados</th>' +
      '<th data-orden="likes">Me gusta</th>' +
      '<th data-orden="comentarios">Coment.</th>' +
    '</tr></thead><tbody>' +
    [...publicaciones].sort((a, b) => {
      const x = a[ordenMedia], y = b[ordenMedia];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return x > y ? -1 : 1;
    }).map((p) => {
      /* Sin foto va un hueco y no un <img> vacío: un <img> sin src lo
         dibuja cada navegador a su manera, casi siempre con el ícono de
         imagen rota. */
      const foto = p.imagen
        ? '<img src="' + escapar(p.imagen) + '" alt="" loading="lazy">'
        : '<span class="sinfoto"></span>';
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

  /* Marcar por cuál está ordenada, y dejar cambiarla. */
  $$('#tablaMedia th[data-orden]').forEach((th) => {
    if (th.dataset.orden === ordenMedia) th.setAttribute('aria-sort', 'descending');
    th.addEventListener('click', () => { ordenMedia = th.dataset.orden; pintarNumeros(); });
  });
}

/* ── PONERSE AL DÍA SOLO ─────────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   ANTES ESTO ERA UN BOTÓN Y AHORA NO LO ES. El webhook trae lo nuevo,
   pero lo viejo —meses de comentarios— hay que ir a buscarlo. Pedirle
   a alguien que apriete un botón para eso es pedirle que sepa que
   existen dos puertas; eso es problema nuestro.

   DE A TANDAS PORQUE NO QUEDA OTRA: Cloudflare limita cuántas llamadas
   externas hace un Worker por pedido. Y con barra, porque esto tarda y
   una pantalla quieta diez segundos se lee como rota. */

function progreso(cual, texto, hechas, total) {
  const caja = $('#' + cual);
  if (texto === null) { caja.classList.add('oculto'); return; }
  caja.classList.remove('oculto');
  $('#' + cual + 'Texto').textContent = texto;
  $('#' + cual + 'Fill').style.width =
    (total ? Math.round((hechas / total) * 100) : 0) + '%';
}

/* Una sola vez por sesión: el historial no cambia, y repetirlo cada vez
   que se entra a la pestaña sería gastar llamadas al pedo. */
let alDia = false;

async function ponerseAlDia() {
  if (alDia) return;
  alDia = true;

  let desde = 0;
  let total = 0;
  let vueltas = 0;

  try {
    while (desde !== null && vueltas < 40) {
      const r = await api('/api/admin/instagram/traer', {
        method: 'POST', body: JSON.stringify({ desde }),
      });
      total += (r.guardados || 0) + (r.comentarios?.guardados || 0);

      const c = r.comentarios ?? {};
      progreso('progreso', 'Trayendo el historial', c.hechas || 0, c.publicaciones || 1);
      desde = c.siguiente ?? null;
      vueltas++;
      await cargarChats();
    }
    progreso('progreso', null);
    if (total) avisar('Entraron ' + total + ' mensajes y comentarios');
  } catch (err) {
    progreso('progreso', null);
    /* Que falle la puesta al día no puede tapar la bandeja: lo que ya
       estaba se sigue viendo. Se avisa y se sigue. */
    avisar(err.message, true);
    alDia = false;
  }
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
      /* Un audio que se pasó a texto: se ve qué dijo. */
      : !mio && m.tipo === 'audio' && m.texto
      ? '<span class="adjunto">Un audio · dice</span><p>' + escapar(m.texto) + '</p>'
      /* Una foto que miró la IA: se ve qué notó. */
      : !mio && m.tipo === 'imagen' && m.texto
      ? '<span class="adjunto">Una foto</span><p>' + escapar(m.texto) + '</p>'
      : mio && m.texto
      ? '<span class="adjunto">' + escapar(m.texto) + '</span>'
      /* Una foto con leyenda: estaba guardada y no se mostraba, así que
         había que abrir WhatsApp para saber qué escribió. */
      : !mio && m.texto
      ? '<span class="adjunto">' + (ADJUNTOS[m.tipo] || ADJUNTOS.otro) + ' · con este texto</span>' +
        '<p>' + escapar(m.texto) + '</p>'
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
}

$('#volverChat').addEventListener('click', cerrarChat);


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

/* ── PROBAR LA IA SIN MANDAR NADA ────────────────────────────────

   La IA contesta sola. Lo único que no se puede revisar después de que
   mandó es lo que mandó, así que esto corre la misma decisión sobre
   mensajes reales que ya entraron y muestra qué haría con cada uno.

   SE MIRA UNA COSA SOLA: a quién le escribe. Un comentario que es sólo
   una opinión tiene que caer en "no le escribe". Si le escribe a todos,
   la decisión está mal y hay que arreglarla antes de dejarlo correr. */
$('#probarIA').addEventListener('click', async () => {
  const boton = $('#probarIA');
  const donde = $('#decisiones');

  boton.disabled = true;
  boton.textContent = 'Pensando…';
  donde.innerHTML = '';

  try {
    const r = await api('/api/admin/chats/probar', {
      method: 'POST',
      body: JSON.stringify({ cuantas: 10 }),
    });

    const d = r.decisiones ?? [];
    if (!d.length) {
      donde.innerHTML = '<p class="nota">No hay mensajes para probar.</p>';
      return;
    }

    donde.innerHTML = d.map((x) => {
      const escribe = x.responder || x.derivar;
      const veredicto = x.falla
        ? 'Se rompió'
        : escribe ? (x.derivar ? 'La pasa a una persona' : 'Le escribe')
                  : 'No le escribe';

      return '<div class="decision">' +
        '<p class="quien">' +
          '<span>' + escapar(x.nombre || 'Sin nombre') + '</span>' +
          '<span class="veredicto' + (escribe ? ' veredicto--si' : '') + '">' +
            escapar(veredicto) + '</span>' +
          '<span class="veredicto">' + escapar(x.clase || 'mensaje') + '</span>' +
        '</p>' +
        '<p class="dijo">' + escapar(x.le_dijo || '') + '</p>' +
        '<p class="diria' + (escribe ? '' : ' diria--no') + '">' +
          escapar(x.falla || x.texto || '') + '</p>' +
      '</div>';
    }).join('');
  } catch (err) {
    avisar(err.message, true);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Probar la IA sin mandar nada';
  }
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

/* ── NOCHE Y DIA ─────────────────────────────────────────────────

   SE ELIGE UNA VEZ Y QUEDA. Se guarda en el navegador de quien lo
   eligio, asi que no es una decision del negocio sino de cada uno: el
   que atiende de noche en el salon lo deja oscuro y el que carga autos
   de dia lo pone claro, en el mismo panel y sin pisarse.

   SE APLICA ANTES DE PINTAR NADA. El atributo se escribe sobre <html>
   apenas carga el archivo, no cuando termina: si se hiciera despues, el
   panel arrancaria negro y pegaria un flash blanco a los dos cuadros.

   Y SI EL NAVEGADOR NO DEJA GUARDAR —modo privado, permisos—, el tema
   igual cambia; lo unico que se pierde es que lo recuerde. */
const TEMA_GUARDADO = 'manna-tema';

function ponerTema(cual) {
  const dia = cual === 'dia';
  document.documentElement.dataset.tema = dia ? 'dia' : 'noche';

  const boton = document.querySelector('#temaTexto');
  if (boton) boton.textContent = dia ? 'Modo noche' : 'Modo día';

  const icono = document.querySelector('#tema [aria-hidden]');
  if (icono) icono.textContent = dia ? '☾' : '☀';
}

try { ponerTema(localStorage.getItem(TEMA_GUARDADO)); } catch { ponerTema('noche'); }

$('#tema').addEventListener('click', () => {
  const nuevo = document.documentElement.dataset.tema === 'dia' ? 'noche' : 'dia';
  ponerTema(nuevo);
  try { localStorage.setItem(TEMA_GUARDADO, nuevo); } catch { /* sigue andando igual */ }
});

/* ── PRENDER Y APAGAR LA IA ──────────────────────────────────────

   UN BOTON, Y QUE DIGA LO QUE VA A PASAR. Antes esto eran cinco
   controles —uno por canal, dos de horario y guardar— para lo que en la
   practica es una sola decision: contesta sola o no. Y mientras estuvo
   apagada desde el codigo, los cinco estaban grises y no se podia hacer
   nada con ellos.

   PRENDERLA PIDE CONFIRMACION; APAGARLA NO. Apagar nunca puede salir
   mal: lo peor que pasa es que alguien conteste a mano un rato. Prender
   si, porque a partir de ese momento le escribe a clientes reales sin
   que nadie lo lea antes, y eso no se deshace. */
function pintarIA(cfg) {
  const caja = $('#interruptorIA');
  caja.hidden = false;
  caja.classList.toggle('viva', cfg.encendida);

  $('#estadoIA').textContent = cfg.encendida
    ? 'La IA está contestando sola'
    : 'La IA está apagada';

  /* EL DE ARRIBA MANDA. Apagado no contesta nadie y punto; prendido,
     Instagram y Messenger van siempre y de WhatsApp decide el de abajo. */
  $('#detalleIA').textContent = cfg.encendida
    ? 'Contesta Instagram y Messenger siempre, y WhatsApp de 20 a 8. '
      + 'Si alguien pide hablar con una persona, deja ese chat.'
    : 'Contestás vos, por los tres canales. No sale ningún mensaje solo. '
      + 'El botón "Que escriba la IA" te arma el borrador igual.';

  $('#palancaIA').textContent = cfg.encendida ? 'Apagar' : 'Prender';
  $('#palancaIA').classList.toggle('btn--fuerte', cfg.encendida);

  /* CON LA IA APAGADA, EL DE WHATSAPP NO SE VE. No decide nada mientras
     ella esté apagada, y mostrarlo ahí sólo sirve para que las dos
     tarjetas parezcan contradecirse. */
  const wa = $('#interruptorWA');
  /* `hidden` solo no alcanza: el CSS de `.interruptor` le pone display
     y le gana. Con la IA apagada el recuadro confundía ("lo prendí y no
     contesta"), así que se esconde a mano. */
  wa.hidden = !cfg.encendida;
  wa.style.display = cfg.encendida ? '' : 'none';
  wa.classList.toggle('viva', cfg.whatsappDeDia);
  $('#estadoWA').textContent = cfg.whatsappDeDia
    ? 'WhatsApp de día: contesta la IA'
    : 'WhatsApp de día: lo atienden ustedes';
  $('#detalleWA').textContent = cfg.whatsappDeDia
    ? 'Prendido a propósito: de 8 a 20 la IA también contesta WhatsApp.'
    : 'De 8 a 20 la IA no contesta WhatsApp. De 20 a 8 contesta igual.';
  $('#palancaWA').textContent = cfg.whatsappDeDia ? 'Apagar de día' : 'Prender de día';
  $('#palancaWA').classList.toggle('btn--fuerte', cfg.whatsappDeDia);
}

$('#palancaWA').addEventListener('click', async () => {
  const prendiendo = !$('#interruptorWA').classList.contains('viva');
  if (prendiendo && !confirm(
    'De 8 a 20 la IA también le va a contestar sola a los clientes por WhatsApp. ¿Seguimos?')) return;
  const boton = $('#palancaWA');
  boton.disabled = true;
  try {
    pintarIA(await api('/api/admin/bot', {
      method: 'PUT',
      body: JSON.stringify({ whatsappDeDia: prendiendo }),
    }));
    avisar(prendiendo ? 'WhatsApp de día quedó prendido' : 'WhatsApp de día quedó apagado');
  } catch (err) {
    avisar(err.message, true);
  } finally {
    boton.disabled = false;
  }
});

async function cargarIA() {
  try { pintarIA(await api('/api/admin/bot')); } catch { /* el panel abre igual */ }
}

$('#palancaIA').addEventListener('click', async () => {
  const prendiendo = !$('#interruptorIA').classList.contains('viva');

  if (prendiendo && !confirm(
    'A partir de ahora la IA le va a contestar sola a los clientes, ' +
    'sin que nadie lo lea antes. ¿Seguimos?')) return;

  const boton = $('#palancaIA');
  boton.disabled = true;
  try {
    pintarIA(await api('/api/admin/bot', {
      method: 'PUT',
      body: JSON.stringify({ encendida: prendiendo }),
    }));
    avisar(prendiendo ? 'La IA quedó contestando sola' : 'La IA quedó apagada');
  } catch (err) {
    avisar(err.message, true);
  } finally {
    boton.disabled = false;
  }
});

/* ── los avisos del bot ─────────────────────────────────────────── */

/* Un número "+54 9 11 6384-9094" pasa a ser un link a su chat. El texto
   se escapa primero: los links se arman sobre texto ya seguro. */
function conLinks(texto) {
  return escapar(texto)
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/\+54 9 [\d -]{8,14}\d/g, (tel) =>
      '<a href="https://wa.me/' + tel.replace(/\D/g, '') + '" target="_blank" rel="noopener">' + tel + '</a>');
}

async function cargarAvisos() {
  try {
    const { avisos = [] } = await api('/api/admin/avisos');
    const lista = avisos.slice().reverse();
    $('#sinAvisos').classList.toggle('oculto', lista.length > 0);
    $('#avisos').innerHTML = lista.map((a) =>
      '<article class="aviso">' +
        '<div class="aviso-cuando">' + escapar(new Date(a.cuando).toLocaleString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short', day: 'numeric',
          month: 'numeric', hour: '2-digit', minute: '2-digit' })) + '</div>' +
        '<div class="aviso-texto">' + conLinks(a.texto) + '</div>' +
      '</article>').join('');
  } catch (err) {
    avisar(err.message, true);
  }
}

function verPestania(cual) {
  const autos = cual === 'autos';
  [['avisos', '#pesAvisos'], ['autos', '#pesAutos'], ['medios', '#pesMedios'],
   ['bandeja', '#pesBandeja'], ['numeros', '#pesNumeros']]
    .forEach(([c, sel]) => $(sel).setAttribute('aria-pressed', String(cual === c)));

  $('#filtros').classList.toggle('oculto', !autos);
  $('#grilla').classList.toggle('oculto', !autos);
  $('#nuevo').classList.toggle('oculto', !autos || ordenando);
  $('#ordenar').classList.toggle('oculto', !autos || ordenando);
  $('#fotosWA').classList.toggle('oculto', !autos || ordenando);
  $('#guardarOrden').classList.toggle('oculto', !autos || !ordenando);
  $('#cancelarOrden').classList.toggle('oculto', !autos || !ordenando);
  $('#zonaAvisos').classList.toggle('oculto', cual !== 'avisos');
  $('#zonaMedios').classList.toggle('oculto', cual !== 'medios');
  $('#zonaBandeja').classList.toggle('oculto', cual !== 'bandeja');
  $('#zonaNumeros').classList.toggle('oculto', cual !== 'numeros');
  $('#sinAutos').classList.add('oculto');
  $('#sinChats').classList.add('oculto');

  if (autos) pintarLista();
  else if (cual === 'avisos') cargarAvisos();
  else if (cual === 'medios') cargarMedios();
  else if (cual === 'numeros') cargarNumeros();
  else {
    cargarChats().catch((err) => avisar(err.message, true));
    cargarIA();
    arrancarRefresco();
    ponerseAlDia();
  }
}

$('#pesAvisos').addEventListener('click', () => verPestania('avisos'));
$('#pesAutos').addEventListener('click', () => verPestania('autos'));
$('#pesMedios').addEventListener('click', () => verPestania('medios'));
$('#pesBandeja').addEventListener('click', () => verPestania('bandeja'));
$('#pesNumeros').addEventListener('click', () => verPestania('numeros'));

/* ── arranque ───────────────────────────────────────────────────── */

(async () => {
  const { activa } = await fetch('/api/sesion').then((r) => r.json()).catch(() => ({}));
  if (activa) { mostrarPanel(); await cargar(); } else { mostrarEntrar(); }
})();
