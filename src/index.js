/* LA API DEL CATÁLOGO.
   ══════════════════════════════════════════════════════════════════

   El sitio sigue siendo estático: /, /garage y las fotos salen del
   disco, cacheadas en el borde. Acá adentro cae solamente lo que no
   puede ser un archivo — la API, el panel y las fotos subidas —, que es
   lo que declara `run_worker_first` en wrangler.jsonc.

   TRES PIEZAS Y CADA UNA EN SU LUGAR:

     D1 (DB)       la ficha de cada auto. Datos chicos y consultables.
     R2 (FOTOS)    los archivos de imagen. Sin cargo por tráfico de
                   salida, que es lo que hace caro hospedar fotos.
     assets        el HTML y todo lo que ya existía.

   LAS FOTOS SE ACHICAN EN EL NAVEGADOR, NO ACÁ. Un Worker no trae con
   qué redimensionar una imagen sin sumar un servicio pago o un WASM
   pesado; el navegador sí, con un canvas. Así que el panel manda la
   imagen ya reducida y en WebP, y este código solo la guarda. Sube menos
   bytes, no cuesta nada y el original queda en la compu de quien lo
   sube. Ver `achicar()` en el panel. */

import Anthropic from '@anthropic-ai/sdk';
import { PANEL } from './admin.js';

const GRUPOS = ['alta-gama', 'evolution', 'deportivos', 'urbanos'];
const TAMANOS = ['1600', '640'];

/* LOS LUGARES FIJOS DE LA HOME.

   Es una lista BLANCA: sólo se puede escribir en un slot que esté acá.
   Sin esto, cualquiera con sesión podría inventar nombres y llenar R2 de
   archivos que ninguna página muestra.

   La proporción de cada uno NO es decorativa: es la que usa el CSS de esa
   sección, y el panel recorta la imagen a esa medida antes de subirla.
   Así lo que se sube entra siempre, sin importar cómo venga la foto. */
/* ── SECCIONES ────────────────────────────────────────────────────
   El panel las muestra agrupadas y en el orden de la página. Antes era
   una grilla sola de doce y no se entendía nada: no se veía qué foto
   iba con cuál ni que dos de ellas conviven con un video. */
const SECCIONES = [
  {
    clave: 'collage',
    titulo: 'El collage',
    nota: 'Un video y dos fotos que se mueven con el scroll. Las tres '
        + 'piezas se cambian desde acá; el video acepta .mp4 y también '
        + 'se lo puede reemplazar por una foto.',
  },
];

/* ── LOS LUGARES DE IMAGEN ────────────────────────────────────────

   Es una lista BLANCA: sólo se puede escribir en un lugar que esté acá.
   Sin esto, cualquiera con sesión podría inventar nombres y llenar R2 de
   archivos que ninguna página muestra.

   CADA LUGAR DECLARA SUS PANTALLAS, y ahí está lo importante. Estas son
   las medidas reales, tomadas sobre la página:

     collage — video       16:9 apaisado    │  4:5 VERTICAL
     collage — ciudad      3:2 apaisada     │  3:4 VERTICAL
     collage — interior    4:3 apaisada     │  1:1 cuadrada

   Las tres no son variaciones de una misma forma: son formas OPUESTAS
   —dos de ellas se dan vuelta de apaisada a vertical— así que llevan un
   archivo por pantalla.

   ACA HABIA CUATRO LUGARES MAS, los de la nota de la home. Se fueron: la
   nota muestra un auto del garage, distinto cada dia, y toma sus propias
   fotos. Cargarle una a mano ya no cambiaba nada.

   LA GUÍA VA EN PROPORCIÓN Y NO EN PALABRAS. Decía "casi cuadrada" o
   "un poco más ancha que alta", que es lo que uno diría mirando, pero
   con eso nadie puede preparar una foto ni pedírsela a otro. Un 1:1 o un
   16:9 se entiende y se transmite.

   Los números están redondeados a la proporción simple más cercana: la
   foto de la nota mide 1.14 en la compu y 1.10 en el celular, y para
   quien prepara la foto eso es un cuadrado. El `object-fit` se encarga
   de la diferencia.

   NO SE RECORTA AL SUBIR. Se guarda la foto entera, sólo achicada, y el
   recorte fino lo hace el `object-fit` del CSS. La guía es un consejo de
   qué entra mejor, no una regla que el panel imponga: entra cualquier
   forma. `lado` es el lado más largo que se guarda. */
const SLOTS = {
  'collage-fondo': {
    seccion: 'collage', donde: 'Collage — el video (arriba a la izquierda)',
    /* EL ÚNICO QUE ADMITE VIDEO. Los demás son fotos y punto: si un
       lugar acepta las dos cosas hay que decidirlo en la página cada
       vez, y no hay ninguna otra sección donde eso sirva. */
    admite: ['video', 'imagen'],
    pantallas: {
      compu:   { lado: 2000, guia: '16:9 — apaisada.' },
      celular: { lado: 1200, guia: '4:5 — vertical.' },
    },
    extra: 'Puede ser un video .mp4 o una foto. El video va sin sonido, de '
         + 'pocos segundos, y conviene que el final se parezca al principio '
         + 'porque se repite en bucle.',
  },
  'collage-ciudad': {
    seccion: 'collage', donde: 'Collage — la ciudad (abajo)',
    pantallas: {
      compu:   { lado: 2000, guia: '3:2 — apaisada.' },
      celular: { lado: 1200, guia: '3:4 — vertical.' },
    },
  },
  'collage-interior': {
    seccion: 'collage', donde: 'Collage — el interior (a la derecha)',
    pantallas: {
      compu:   { lado: 1600, guia: '4:3 — apaisada.' },
      celular: { lado: 1200, guia: '1:1 — cuadrada.' },
    },
  },
};

const PANTALLAS = ['compu', 'celular', 'todo'];

/* ── ACA VIVIAN LOS TEXTOS EDITABLES ──────────────────────────────

   Eran dos —el titular y la bajada de la nota— y los dos pasaron a
   salir del auto del dia: el titular es su marca y modelo, la bajada el
   primer parrafo de su descripcion. Editables no cambiaban nada, asi
   que se fue la lista blanca, sus dos rutas de API y su pestania del
   panel.

   La tabla `textos` queda en la base, vacia. Borrarla es un cambio de
   esquema por nada: no la lee nadie y no ocupa nada. Si algun dia hace
   falta volver a tener un texto editable, esto esta entero en el
   historial. */

/* ── QUÉ SE PUEDE SUBIR ───────────────────────────────────────────

   Lista blanca de tipos, no de extensiones: la extensión la elige quien
   sube el archivo y no dice nada de lo que hay adentro.

   EL VIDEO SE GUARDA TAL CUAL LLEGA. El panel no puede convertirlo —eso
   es ffmpeg y acá no hay— así que lo que se sube es lo que se sirve. Por
   eso sólo se admite MP4: es el único formato que reproducen todos los
   navegadores sin pedir nada más. Un .mov o un .webm andarían en algunas
   máquinas y en otras no, que es peor que rechazarlo de entrada.

   EL LÍMITE DEL VIDEO ES ALTO PERO NO INFINITO. Son 40 MB: alcanza de
   sobra para los pocos segundos que dura el fondo del collage, y frena
   que alguien suba sin querer una filmación de diez minutos que después
   tendría que bajarse cada visita. */
const TIPOS = {
  imagen: { mimes: ['image/webp', 'image/jpeg', 'image/png'], tope: 3 * 1024 * 1024 },
  video:  { mimes: ['video/mp4'],                             tope: 40 * 1024 * 1024 },
};

const claseDe = (mime) =>
  TIPOS.video.mimes.includes(mime) ? 'video'
  : TIPOS.imagen.mimes.includes(mime) ? 'imagen'
  : null;

const EXTENSION = {
  'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4',
};

/* ── LA DIRECCIÓN PROPIA DE CADA AUTO ─────────────────────────────

   /auto/mercedes-benz-gla-200-2018-12

   NO SE GUARDA EN LA BASE: se calcula con lo que ya está en la ficha.
   Un slug guardado es un dato más que puede quedar viejo —se corrige el
   modelo y la dirección sigue diciendo lo anterior— y otro que hay que
   completarles a mano a los autos que ya estaban cargados. Calculándolo,
   los veinte autos de hoy tienen su dirección desde el primer despliegue
   y el que se cargue mañana la tiene sola.

   EL ID VA AL FINAL Y ES LO ÚNICO QUE SE LEE. El texto de adelante es
   para el que mira la dirección y para Google; quien resuelve el pedido
   es el número. Así, cambiarle el modelo a un auto no rompe el link que
   alguien ya mandó por WhatsApp: la dirección vieja sigue encontrando el
   auto y se contesta un 301 hacia la nueva.

   Sin acentos ni eñes: `normalize('NFD')` los parte en letra + tilde y
   el rango ̀-ͯ se queda con las tildes solas. */
const SITIO = 'https://www.mannaselected.com.ar';

const enTexto = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const enlaceDe = (a) => '/auto/' +
  [enTexto([a.marca, a.modelo, a.anio].filter(Boolean).join(' ')), a.id]
    .filter(Boolean).join('-');

/* ── respuestas ──────────────────────────────────────────────────── */

const json = (dato, estado = 200, cabeceras = {}) =>
  new Response(JSON.stringify(dato), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cabeceras },
  });

const error = (mensaje, estado = 400) => json({ error: mensaje }, estado);

/* ── LA SESIÓN ────────────────────────────────────────────────────

   Una cookie firmada, sin tabla de sesiones. El contenido es público
   —dice cuándo vence y nada más— pero viene con una firma HMAC que sólo
   se puede calcular con el secreto del Worker: cambiarle un byte a la
   fecha invalida la firma.

   SE COMPARA EN TIEMPO CONSTANTE. Un `===` sobre la firma corta apenas
   encuentra el primer byte distinto, y ese tiempo, medido muchas veces,
   filtra la firma byte por byte. `timingSafeEqual` tarda lo mismo
   siempre. */

const textoABytes = (s) => new TextEncoder().encode(s);

async function llave(env) {
  return crypto.subtle.importKey(
    'raw', textoABytes(env.FIRMA_SESION),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

const aBase64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function firmar(env, cuerpo) {
  const f = await crypto.subtle.sign('HMAC', await llave(env), textoABytes(cuerpo));
  return `${cuerpo}.${aBase64(f)}`;
}

async function sesionValida(peticion, env) {
  if (!env.FIRMA_SESION) return false;
  const cookie = peticion.headers.get('cookie') || '';
  const cruda = cookie.match(/(?:^|;\s*)sesion=([^;]+)/)?.[1];
  if (!cruda) return false;

  const [cuerpo, firma] = decodeURIComponent(cruda).split('.');
  if (!cuerpo || !firma) return false;

  const esperada = (await firmar(env, cuerpo)).split('.')[1];
  const a = textoABytes(firma), b = textoABytes(esperada);
  if (a.length !== b.length) return false;
  if (!crypto.subtle.timingSafeEqual(a, b)) return false;

  const vence = Number(cuerpo.split('|')[1]);
  return Number.isFinite(vence) && Date.now() < vence;
}

/* ── consultas ───────────────────────────────────────────────────── */

/* Los autos y sus fotos en DOS consultas, no en una por auto. Con una
   por auto, veinte autos son veintiún viajes a la base; así son dos,
   pase lo que pase. */
async function conFotos(env, filas) {
  if (!filas.length) return [];
  const ids = filas.map((f) => f.id);
  const huecos = ids.map(() => '?').join(',');
  const { results: fotos } = await env.DB
    .prepare(`SELECT id, auto_id, clave, orden FROM fotos
              WHERE auto_id IN (${huecos}) ORDER BY orden, id`)
    .bind(...ids).all();

  const porAuto = new Map(filas.map((f) => [f.id, []]));
  for (const f of fotos) porAuto.get(f.auto_id)?.push({ id: f.id, clave: f.clave });
  /* EL `enlace` VIAJA CON EL AUTO y no lo arma cada página por su cuenta.
     Lo usan el garage —para cambiar la dirección al abrir una ficha— y el
     panel —para el botón de copiar el link—; que los dos lo calcularan
     por su lado sería tener la regla escrita en tres lugares y que el día
     que cambie queden dos versiones conviviendo. Lo arma el mismo código
     que después resuelve el pedido. */
  return filas.map((a) => ({ ...a, enlace: enlaceDe(a), fotos: porAuto.get(a.id) || [] }));
}

/* ══════════════════════════════════════════════════════════════════
   LA PÁGINA DE UN AUTO
   ══════════════════════════════════════════════════════════════════

   NO ES UNA PÁGINA NUEVA: ES EL GARAGE CON OTRA CABECERA.

   La tentación era escribir acá el HTML de la ficha. Sería una segunda
   copia del mismo diseño —la galería, el zoom, los datos, el botón de
   consultar— y a la primera corrección en el garage las dos empiezan a
   separarse. En vez de eso se sirve el MISMO /garage/index.html, con dos
   cambios: el <head> pasa a hablar de este auto, y se le deja dicho cuál
   abrir. El resto —estilos, galería, zoom— es el que ya existe y sigue
   habiendo uno solo.

   EL <head> ES TODO EL PUNTO. Lo que ve una persona lo arma el script de
   todos modos; lo que NO puede armar el script es lo que leen WhatsApp,
   Google y las redes, porque miran el HTML antes de que corra nada. Sin
   esto, los seis links de los seis autos comparten título, bajada y foto
   de portada: pegados en un chat se ven todos iguales y no se sabe cuál
   es cuál.

   SE REESCRIBE CON HTMLRewriter Y NO CON REEMPLAZOS DE TEXTO. Streaming,
   y sobre todo: entiende de etiquetas. Un `.replace()` sobre el HTML
   depende de que las comillas y el orden de los atributos no cambien
   nunca — la clase de código que se rompe en silencio el día que alguien
   acomoda una línea del garage. */

/* El texto de la bajada. La descripción del auto si la tiene —cortada,
   porque WhatsApp y Google muestran unos 160 caracteres y el resto es
   peso al pedo—; si no, los datos que la vuelven reconocible. */
function bajadaDe(a) {
  if (a.descripcion) {
    const limpio = a.descripcion.replace(/\s+/g, ' ').trim();
    return limpio.length > 160 ? limpio.slice(0, 157).trimEnd() + '…' : limpio;
  }
  const senas = [
    a.anio,
    a.km !== null && a.km !== undefined ? a.km.toLocaleString('es-AR') + ' km' : null,
    a.motor, a.transmision, a.combustible,
  ].filter(Boolean).join(' · ');
  return [a.marca + ' ' + a.modelo, senas].filter(Boolean).join('. ') +
    '. Unidad seleccionada de Manna Motors.';
}

/* LO QUE ENTIENDE GOOGLE DE UN AUTO EN VENTA. Sin esto, la página es
   texto suelto; con esto, Google sabe que hay un vehículo, de qué año,
   con cuántos kilómetros y a qué precio, y puede mostrarlo como tal.

   El `<` se escapa: un `</script>` dentro de la descripción de un auto
   cerraría la etiqueta antes de tiempo y el resto del JSON quedaría
   escrito en la página. */
function fichaParaGoogle(a, direccion) {
  const dato = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: [a.marca, a.modelo, a.anio].filter(Boolean).join(' '),
    brand: { '@type': 'Brand', name: a.marca },
    model: a.modelo,
    url: direccion,
    image: a.fotos.map((f) => `${SITIO}/fotos/${f.clave}-1600.webp`),
  };

  if (a.descripcion) dato.description = a.descripcion;
  if (a.anio) dato.vehicleModelDate = String(a.anio);
  if (a.color) dato.color = a.color;
  if (a.combustible) dato.fuelType = a.combustible;
  if (a.transmision) dato.vehicleTransmission = a.transmision;
  if (a.km !== null && a.km !== undefined) {
    dato.mileageFromOdometer = { '@type': 'QuantitativeValue', value: a.km, unitCode: 'KMT' };
  }
  if (a.precio !== null && a.precio !== undefined) {
    dato.offers = {
      '@type': 'Offer',
      price: a.precio,
      priceCurrency: a.moneda === 'USD' ? 'USD' : 'ARS',
      url: direccion,
      availability: a.estado === 'vendido'
        ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
    };
  }

  return JSON.stringify(dato).replace(/</g, '\\u003c');
}

/* Cambia el contenido de una etiqueta suelta del <head>. */
class Contenido {
  constructor(valor) { this.valor = valor; }
  element(el) { el.setAttribute('content', this.valor); }
}

class Atributo {
  constructor(nombre, valor) { this.nombre = nombre; this.valor = valor; }
  element(el) { el.setAttribute(this.nombre, this.valor); }
}

class Afuera {
  element(el) { el.remove(); }
}

async function paginaDeAuto(peticion, env, url, a) {
  const direccion = SITIO + enlaceDe(a);
  const nombre = [a.marca, a.modelo, a.anio].filter(Boolean).join(' ');
  const titulo = a.estado === 'vendido'
    ? `${nombre} (vendido) — Manna Motors Selected`
    : `${nombre} — Manna Motors Selected`;
  const bajada = bajadaDe(a);

  /* LA FOTO DEL AUTO, O LA DE PORTADA SI TODAVÍA NO TIENE NINGUNA. Un
     og:image vacío no deja "sin foto": deja a WhatsApp mostrando un
     rectángulo gris con la dirección, que se ve peor que la portada. */
  const foto = a.fotos[0]
    ? `${SITIO}/fotos/${a.fotos[0].clave}-1600.webp`
    : `${SITIO}/assets/video/portada-desktop-poster.jpg`;

  const pagina = await env.ARCHIVOS.fetch(
    new Request(new URL('/garage/', url), { method: 'GET', headers: peticion.headers })
  );
  if (!pagina.ok) return pagina;

  const armada = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(titulo); } })
    .on('meta[name="description"]', new Contenido(bajada))
    .on('link[rel="canonical"]', new Atributo('href', direccion))
    .on('meta[property="og:type"]', new Contenido('product'))
    .on('meta[property="og:url"]', new Contenido(direccion))
    .on('meta[property="og:title"]', new Contenido(titulo))
    .on('meta[property="og:description"]', new Contenido(bajada))
    .on('meta[property="og:image"]', new Contenido(foto))
    .on('meta[property="og:image:alt"]', new Contenido(nombre))
    /* LAS MEDIDAS DE LA PORTADA NO SON LAS DE ESTA FOTO. Las del garage
       están escritas a mano en el HTML y acá no se sabe cuánto mide la
       foto del auto: se guarda achicada en el navegador y el alto depende
       de cómo venía. Declarar una medida falsa es peor que no declarar
       ninguna —WhatsApp reserva ese hueco y después entra otra cosa—, así
       que se van. */
    .on('meta[property="og:image:width"]', new Afuera())
    .on('meta[property="og:image:height"]', new Afuera())
    .on('meta[name="twitter:title"]', new Contenido(titulo))
    .on('meta[name="twitter:description"]', new Contenido(bajada))
    .on('meta[name="twitter:image"]', new Contenido(foto))
    /* EL ID VA EN EL HTML Y NO SE DEDUCE DE LA DIRECCIÓN. El script
       podría leerlo del propio `location`, pero entonces la regla de qué
       forma tiene una dirección de auto viviría en dos lados. Acá el
       Worker ya la resolvió —y ya sabe que ese auto existe y está
       publicado—; lo que queda es pasarle el número. */
    .on('head', {
      element(el) {
        el.append(`<script>window.__AUTO=${a.id};</script>` +
          `<script type="application/ld+json">${fichaParaGoogle(a, direccion)}</script>`,
          { html: true });
      },
    })
    .transform(pagina);

  return new Response(armada.body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      /* El mismo criterio que /garage/ en _headers: la página reparte
         las direcciones de las fotos, así que se pregunta siempre. Esas
         reglas son para los archivos del disco y esto lo arma el Worker,
         por eso van escritas acá. */
      'cache-control': 'no-cache',
      'cdn-cache-control': 'no-store',
    },
  });
}

/* ══════════════════════════════════════════════════════════════════
   EL WEBHOOK DE META (WhatsApp e Instagram)
   ══════════════════════════════════════════════════════════════════

   Es la dirección a la que Meta avisa cada vez que llega un mensaje:
   /api/meta/webhook. Una sola para los dos canales —la app de Meta es
   una y el cuerpo de cada aviso dice de dónde viene (`object` vale
   'whatsapp_business_account' o 'instagram')—.

   POR AHORA SOLO ESCUCHA. Recibe, comprueba que el aviso sea de Meta y
   lo deja en el log de Cloudflare. Contestar con la IA es el paso
   siguiente; primero hay que ver llegar mensajes reales y saber qué
   forma tienen.

   DOS SECRETOS Y NO UNO, porque sirven para cosas distintas:

     META_VERIFY_TOKEN   lo inventamos nosotros y se pega en el panel de
                         Meta. Sólo sirve para el apretón de manos del
                         alta: Meta lo manda una vez para comprobar que
                         la dirección es nuestra.

     META_APP_SECRET     lo da Meta (Configuración de la app → Básica →
                         Clave secreta). Con él Meta firma CADA aviso,
                         y es lo que impide que cualquiera que conozca
                         la dirección nos mande mensajes inventados. */

/* EL ALTA. Meta pide GET con tres parámetros y espera que le devolvamos
   `hub.challenge` tal cual, en texto plano, sólo si el token coincide.
   Cualquier otra respuesta —un JSON, un 200 vacío— y el panel de Meta
   dice que no pudo verificar la dirección. */
function verificarWebhook(url, env) {
  if (!env.META_VERIFY_TOKEN) {
    return new Response('Falta cargar META_VERIFY_TOKEN', { status: 503 });
  }
  const modo = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token') || '';
  const desafio = url.searchParams.get('hub.challenge') || '';

  const a = textoABytes(token), b = textoABytes(env.META_VERIFY_TOKEN);
  const coincide = a.length === b.length && crypto.subtle.timingSafeEqual(a, b);

  if (modo !== 'subscribe' || !coincide) {
    return new Response('No autorizado', { status: 403 });
  }
  return new Response(desafio, {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/* LA FIRMA SE CALCULA SOBRE EL CUERPO CRUDO, byte por byte. Por eso se
   lee como texto antes de interpretarlo: un JSON parseado y vuelto a
   escribir puede cambiar espacios o el orden, y la firma ya no cierra.

   Meta la manda como `sha256=` + el HMAC en hexadecimal. */
async function firmaDeMetaValida(crudo, cabecera, secreto) {
  if (!cabecera?.startsWith('sha256=')) return false;
  const llaveMeta = await crypto.subtle.importKey(
    'raw', textoABytes(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', llaveMeta, textoABytes(crudo));
  const esperada = [...new Uint8Array(firma)]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const a = textoABytes(cabecera.slice('sha256='.length).toLowerCase());
  const b = textoABytes(esperada);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}

/* QUÉ MANDA CADA CANAL, PUESTO EN UNA SOLA FORMA.

   Los tres avisos de Meta tienen cuerpos distintos y hay que leerlos
   distinto:

     WhatsApp   entry[].changes[].value.messages[]  — el teléfono viene
                en `from` y el nombre en `contacts[]`, aparte.
     Instagram  entry[].messaging[]                 — el IGSID en
     Messenger  entry[].messaging[]                   `sender.id`.

   `object` vale 'whatsapp_business_account', 'instagram' o —ojo— 'page'
   para Messenger, que no se llama 'messenger' en ningún lado.

   SE IGNORAN DOS COSAS a propósito: los avisos de estado de WhatsApp
   (entregado, leído) porque no son mensajes de nadie, y los `is_echo` de
   Instagram y Messenger, que son nuestras propias respuestas volviendo.
   Guardar un eco sería guardar dos veces lo que ya escribimos nosotros. */
function mensajesDelAviso(aviso) {
  const salida = [];
  if (!aviso?.entry) return salida;

  const canalDe = (obj) =>
    obj === 'whatsapp_business_account' ? 'whatsapp'
    : obj === 'instagram' ? 'instagram'
    : obj === 'page' ? 'messenger'
    : null;

  const canal = canalDe(aviso.object);
  if (!canal) return salida;

  for (const entrada of aviso.entry) {
    if (canal === 'whatsapp') {
      for (const cambio of entrada.changes ?? []) {
        const valor = cambio.value ?? {};
        /* El nombre llega en una lista aparte, emparejada por wa_id. */
        const nombres = {};
        for (const c of valor.contacts ?? []) {
          if (c?.wa_id) nombres[c.wa_id] = c?.profile?.name ?? null;
        }
        for (const m of valor.messages ?? []) {
          salida.push({
            canal,
            externo_id: m.from,
            nombre: nombres[m.from] ?? null,
            mensaje_id: m.id,
            tipo: tipoConocido(m.type),
            texto: m.text?.body ?? null,
            clase: 'mensaje',
            media_id: null,
          });
        }
      }
    } else {
      for (const ev of entrada.messaging ?? []) {
        if (!ev?.message || ev.message.is_echo) continue;
        salida.push({
          canal,
          externo_id: ev.sender?.id,
          nombre: null,
          mensaje_id: ev.message.mid,
          tipo: ev.message.text ? 'texto' : 'otro',
          texto: ev.message.text ?? null,
          clase: 'mensaje',
          media_id: null,
        });
      }

      /* LOS COMENTARIOS VIENEN POR OTRA PUERTA.
         Los privados llegan en `messaging`; los comentarios en
         `changes`, con otra forma. Van a la misma bandeja igual: para
         el negocio los dos son alguien preguntando.

         SE GUARDA DE QUÉ PUBLICACIÓN VINO. Es lo que después le permite
         a la IA saber que el "¿cuánto sale?" es por la Hilux y no por
         un auto cualquiera. */
      for (const cambio of entrada.changes ?? []) {
        if (cambio?.field !== 'comments') continue;
        const v = cambio.value ?? {};
        if (!v.from?.id) continue;

        /* Un comentario nuestro no es una consulta entrante: es una
           respuesta. Se reconoce porque viene de la misma cuenta que
           recibe el aviso. */
        const propio = v.from.id === entrada.id;

        salida.push({
          canal,
          externo_id: propio ? (v.parent_id ? null : v.from.id) : v.from.id,
          nombre: v.from.username ?? null,
          mensaje_id: v.id,
          tipo: 'texto',
          texto: v.text ?? null,
          clase: 'comentario',
          media_id: v.media?.id ?? null,
          direccion: propio ? 'saliente' : 'entrante',
        });
      }
    }
  }
  return salida.filter((m) => m.externo_id);
}

const TIPOS_MENSAJE = ['texto','imagen','audio','video','documento','ubicacion'];
const tipoConocido = (t) => {
  const mapa = { image: 'imagen', audio: 'audio', video: 'video',
                 document: 'documento', location: 'ubicacion', text: 'texto' };
  const v = mapa[t] ?? t;
  return TIPOS_MENSAJE.includes(v) ? v : 'otro';
};

/* GUARDAR, SIN DUPLICAR.

   Meta reintenta el mismo aviso si no le contestamos 200 a tiempo, y
   reintentar es lo normal. Por eso el id de mensaje de Meta es UNIQUE en
   la tabla y acá se inserta con OR IGNORE: el segundo intento no escribe
   nada y no rompe.

   `ultimo` se pisa en cada mensaje porque es el reloj de los 12 meses de
   conservación. */
async function guardarEntrantes(env, lista) {
  /* LAS CONVERSACIONES QUE HAY QUE CONTESTAR, y sólo ésas. Devuelve los
     ids donde entró un mensaje NUEVO de la otra persona.

     "Nuevo" es literal: Meta reintenta el mismo aviso, y un reintento
     que vuelva a disparar al bot le manda dos veces lo mismo al cliente.
     El INSERT OR IGNORE ya lo frena en la base, así que acá se mira si
     escribió algo (`changes`); si no escribió, el mensaje ya estaba y no
     hay nada que contestar. */
  const paraContestar = new Set();

  for (const m of lista) {
    const conv = await env.DB.prepare(
      `INSERT INTO conversaciones (canal, externo_id, nombre)
            VALUES (?, ?, ?)
       ON CONFLICT (canal, externo_id) DO UPDATE SET
            ultimo = datetime('now'),
            nombre = COALESCE(excluded.nombre, conversaciones.nombre)
         RETURNING id`
    ).bind(m.canal, m.externo_id, m.nombre).first();

    if (!conv?.id) continue;

    /* `direccion` puede venir en el aviso: un comentario nuestro es
       saliente aunque llegue por el mismo webhook que los entrantes.
       Lo que no la trae es entrante, que es el caso normal. */
    const escrito = await env.DB.prepare(
      `INSERT OR IGNORE INTO mensajes
         (conversacion_id, externo_id, direccion, tipo, texto, clase, media_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      conv.id, m.mensaje_id ?? null, m.direccion ?? 'entrante',
      m.tipo, m.texto, m.clase ?? 'mensaje', m.media_id ?? null
    ).run();

    const esNuevo = (escrito?.meta?.changes ?? 0) > 0;
    if (esNuevo && (m.direccion ?? 'entrante') === 'entrante') {
      paraContestar.add(conv.id);
    }
  }

  return [...paraContestar];
}

/* ── INSTAGRAM: CONTESTAR ────────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   Hasta acá el Worker sólo escuchaba. Esto es lo que habla.

   OTRA DIRECCIÓN Y OTRA LLAVE QUE LAS DE FACEBOOK. Instagram conectado
   por "inicio de sesión de Instagram" vive en graph.instagram.com y usa
   su propio token (`META_IG_TOKEN`), no el de la página.

   LAS 24 HORAS MANDAN. Se puede escribir libre sólo dentro de las 24
   horas desde el último mensaje de esa persona. Pasado ese plazo la API
   contesta un error, y acá ese error se devuelve tal cual al panel en
   vez de tragárselo: el que está atendiendo tiene que entender por qué
   no salió, y "falló" no se lo explica. */

const IG_API = 'https://graph.instagram.com/v23.0';

async function igLlamar(env, camino, opciones = {}) {
  if (!env.META_IG_TOKEN) throw new Error('Falta cargar META_IG_TOKEN');

  /* `camino` puede ser un pedazo ("/me/conversations") o una dirección
     entera: las de paginado vienen completas desde Meta y se siguen tal
     cual en vez de rearmarlas a mano. */
  const url = new URL(camino.startsWith('http') ? camino : IG_API + camino);
  const r = await fetch(url, {
    ...opciones,
    headers: {
      authorization: `Bearer ${env.META_IG_TOKEN}`,
      ...(opciones.body ? { 'content-type': 'application/json' } : {}),
      ...opciones.headers,
    },
  });

  const dato = await r.json().catch(() => ({}));
  if (!r.ok) {
    /* El mensaje de Meta es más útil que un código: dice si se venció la
       ventana, si falta un permiso o si el token murió. */
    throw new Error(dato?.error?.message || `Instagram contestó ${r.status}`);
  }
  return dato;
}

/* MANDAR UN MENSAJE.
   `destino` es el id de la persona (para un DM) o el id de un comentario
   (para una respuesta privada). Son el mismo endpoint y cambia una sola
   clave adentro de `recipient`, así que es una sola función. */
async function mandarPorInstagram(env, destino, texto, { esComentario = false } = {}) {
  return igLlamar(env, '/me/messages', {
    method: 'POST',
    body: JSON.stringify({
      recipient: esComentario ? { comment_id: destino } : { id: destino },
      message: { text: texto },
    }),
  });
}

/* DAR ME GUSTA A UN COMENTARIO.

   Meta lo habilitó el 22 de abril de 2026 y pide su propio permiso,
   `instagram_manage_engagement`: si no está en el token, esto falla con
   un error de permisos y no con otra cosa.

   ES SECUNDARIO Y FALLA SOLO. Un me gusta que no sale no es motivo para
   no contestarle a alguien, así que quien llama lo envuelve y sigue. */
async function megustaEnInstagram(env, comentarioId) {
  return igLlamar(env, '/me/likes', {
    method: 'POST',
    body: JSON.stringify({ comment_id: comentarioId }),
  });
}

/* CONTESTAR ABAJO DE LA PUBLICACIÓN, a la vista de todos.

   No es la respuesta: la respuesta va al privado. Esto es el aviso de
   que fuimos al privado, que es lo que ya se hacía a mano —"Te
   escribimos por privado"— y sirve para dos cosas. El que comentó ve
   que le contestamos aunque todavía no haya abierto los mensajes, y el
   que pasa por el comentario ve que acá se contesta.

   EL TEXTO NO LO ESCRIBE EL MODELO, y es a propósito: abajo de la
   publicación lo lee cualquiera, así que lo único que puede decir es
   que le escribimos. Un precio o un dato suelto en público es
   justamente lo que no queremos, y la forma de que no pase es que no
   tenga manera de ponerlo.

   SE ELIGE UNA DE VARIAS porque repetir el mismo renglón cincuenta
   veces abajo de cincuenta publicaciones se lee como un robot, y de
   hecho lo es.

   `message` va en la dirección y no en el cuerpo porque así lo pide la
   API. Es texto nuestro y público: no hay nada de nadie ahí. */
const AVISOS = [
  'Te escribimos por privado.',
  'Te acabamos de escribir al privado.',
  'Listo, te mandamos un privado.',
  'Te hablamos por privado.',
];

async function avisarEnElComentario(env, comentarioId) {
  const texto = AVISOS[Math.floor(Math.random() * AVISOS.length)];
  return igLlamar(
    env,
    `/${comentarioId}/replies?message=${encodeURIComponent(texto)}`,
    { method: 'POST' }
  );
}

/* Deja asentado lo que mandamos, en la misma conversación.
   `autor` separa lo que escribió una persona de lo que escribió la IA:
   es el compromiso de que después se pueda ver quién respondió qué. */
async function guardarSaliente(env, conversacionId, texto, autor, mensajeId, mediaId) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO mensajes
       (conversacion_id, externo_id, direccion, autor, tipo, texto, media_id)
     VALUES (?, ?, 'saliente', ?, 'texto', ?, ?)`
  ).bind(conversacionId, mensajeId ?? null, autor, texto, mediaId ?? null).run();

  await env.DB.prepare(
    `UPDATE conversaciones SET ultimo = datetime('now') WHERE id = ?`
  ).bind(conversacionId).run();
}

/* ── TRAER LO QUE HAY EN INSTAGRAM ───────────────────────────────

   MIENTRAS LA APP NO ESTÉ PUBLICADA, META NO AVISA. El webhook está
   programado y probado, pero Instagram no manda nada hasta que la app
   pase la revisión. Así que mientras tanto se pregunta.

   ESTO NO ES EL MODO DEFINITIVO y no debería quedar corriendo solo:
   preguntar cada tanto llega tarde, y para un bot que atiende, llegar
   tarde se nota. Es para probar hoy y para poder grabar el video que
   pide la revisión. Cuando el webhook se encienda, esto sobra. */
async function traerDeInstagram(env, { limite = 25 } = {}) {
  /* QUIÉNES SOMOS, POR NOMBRE DE USUARIO Y NO POR ID.
     Instagram tiene DOS identificadores para la misma cuenta: el que
     devuelve /me (39325821240366178) y el de la cuenta de empresa
     (17841427397601747), y los mensajes vienen con el segundo. Comparar
     contra el de /me daba siempre "no es mío", así que nuestras propias
     respuestas se guardaban como si las hubiera escrito el cliente.
     El usuario es uno solo y no se presta a confusión. */
  const miUsuario = (await igLlamar(env, '/me?fields=username'))?.username;
  if (!miUsuario) throw new Error('Instagram no devolvió el usuario de la cuenta');

  /* HAY QUE SEGUIR EL PAGINADO, Y ESTO COSTÓ UN RATO.
     La primera página vuelve con `data: []` pero CON cursor `next`. No
     quiere decir que no haya conversaciones: Meta filtra después de
     armar la página, así que las primeras pueden salir vacías y lo que
     buscás está más atrás. Quedarse en la primera y contestar "no hay
     nada" era el error.

     Con tope, igual: sin un límite, una cuenta con mucho historial deja
     al Worker dando vueltas hasta que lo cortan. */
  const paginas = [];
  let siguiente = `/me/conversations?fields=id,updated_time&limit=${limite}`;
  for (let i = 0; i < 2 && siguiente; i++) {
    const pagina = await igLlamar(env, siguiente);
    paginas.push(...(pagina?.data ?? []));
    siguiente = pagina?.paging?.next ?? null;
  }

  /* CON TOPE, Y ACÁ ESTABA EL ERROR DE "DEMASIADAS SOLICITUDES".
     Abajo se hace una llamada POR CONVERSACIÓN para traer sus mensajes.
     Con 44 conversaciones eso son 44 llamadas, y Cloudflare corta mucho
     antes. Se toman las más recientes y listo: los privados nuevos
     entran por el webhook igual, así que esto es sólo para el arranque
     y no tiene que traerlo todo de una. */
  paginas.splice(12);

  /* CUÁNTAS VIO Y CUÁNTAS GUARDÓ, POR SEPARADO.
     "No entró nada" tiene dos causas muy distintas: que Instagram no
     devuelva ninguna conversación, o que las devuelva y ya las
     tengamos. Un solo número no las distingue, y entonces hay que
     adivinar. */
  const vistas = paginas.length;
  let leidos = 0;
  let guardados = 0;

  for (const c of paginas) {
    const detalle = await igLlamar(env,
      `/${c.id}?fields=messages.limit(25){id,created_time,from{id,username},to{id,username},message}`);

    for (const m of detalle?.messages?.data ?? []) {
      leidos++;
      const mio = m.from?.username === miUsuario;
      const otro = mio ? (m.to?.data?.[0]) : m.from;
      /* Si el que no somos nosotros tampoco trae usuario, no hay con qué
         identificar la conversación y se saltea en vez de inventar. */
      if (!otro?.id) continue;

      const fila = await env.DB.prepare(
        `INSERT INTO conversaciones (canal, externo_id, nombre) VALUES ('instagram', ?, ?)
         ON CONFLICT (canal, externo_id) DO UPDATE SET
              ultimo = datetime('now'),
              nombre = COALESCE(excluded.nombre, conversaciones.nombre)
           RETURNING id`
      ).bind(otro.id, otro.username ?? null).first();
      if (!fila?.id) continue;

      /* LA FECHA SÓLO SI VINO.
         `creado` es NOT NULL con un valor por defecto, y pasarle NULL a
         mano NO usa ese valor por defecto: rompe la consulta entera. Así
         que cuando Instagram no manda la fecha, la columna no se nombra
         y la pone la base. */
      const cuando = (m.created_time || '').replace('T', ' ').slice(0, 19);
      const campos = ['conversacion_id', 'externo_id', 'direccion', 'autor', 'tipo', 'texto'];
      const valores = [
        fila.id, m.id,
        mio ? 'saliente' : 'entrante',
        mio ? 'persona' : null,
        'texto',
        m.message ?? null,
      ];
      if (cuando) { campos.push('creado'); valores.push(cuando); }

      const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO mensajes (${campos.join(', ')})
         VALUES (${campos.map(() => '?').join(', ')})`
      ).bind(...valores).run();

      guardados += r.meta?.changes ?? 0;
    }
  }

  return { vistas, leidos, guardados };
}

/* ── TRAER EL PASADO ─────────────────────────────────────────────

   EL WEBHOOK SÓLO TRAE EL PRESENTE. Avisa de lo que pasa de ahora en
   adelante, y todo lo que ya estaba —meses de comentarios— queda
   invisible. Eso no es un detalle: la mayor parte de lo que la gente
   preguntó ya pasó.

   Así que se recorren las publicaciones y se bajan sus comentarios.
   Esto es para ponerse al día una vez; lo nuevo sigue entrando solo
   por el webhook y no hace falta repetirlo.

   CADA COMENTARIO ES UNA CONVERSACIÓN DE SU AUTOR, no de la
   publicación. Si la misma persona comentó en tres reels, es una sola
   conversación con tres mensajes: lo que se atiende es a la persona.
   Y cada mensaje se queda con el `media_id` de donde salió, que es lo
   que después le dice a la IA de qué auto están hablando. */
async function traerComentariosDeInstagram(env, { desde = 0, porTanda = 5 } = {}) {
  const miUsuario = (await igLlamar(env, '/me?fields=username'))?.username;

  /* DE A TANDAS, Y ESTO NO ES UN CAPRICHO.
     Cloudflare le pone un tope a cuántas llamadas externas puede hacer
     un Worker en un solo pedido. Una llamada por publicación lo pasaba,
     el trabajo se cortaba a la mitad —y peor: se cortaba ANTES del paso
     que acomoda las fechas, así que el historial entraba fechado como
     si fuera de hoy.

     Ahora cada pedido toma unas pocas publicaciones y dice por dónde
     quedó. El panel lo vuelve a llamar hasta terminar. */
  const media = await igLlamar(env, `/me/media?fields=id&limit=100`);
  const todas = media?.data ?? [];
  const tanda = todas.slice(desde, desde + porTanda);

  let vistos = 0;
  let guardados = 0;

  for (const p of tanda) {
    const com = await igLlamar(env,
      `/${p.id}/comments?fields=id,text,timestamp,username,from&limit=50`
    ).catch(() => null);

    for (const c of com?.data ?? []) {
      vistos++;
      const quien = c.from?.id || c.username;
      if (!quien) continue;

      /* Los comentarios propios se guardan como salientes: son
         respuestas nuestras, no consultas. */
      const propio = (c.from?.username || c.username) === miUsuario;

      const fila = await env.DB.prepare(
        `INSERT INTO conversaciones (canal, externo_id, nombre) VALUES ('instagram', ?, ?)
         ON CONFLICT (canal, externo_id) DO UPDATE SET
              nombre = COALESCE(excluded.nombre, conversaciones.nombre)
           RETURNING id`
      ).bind(String(quien), c.from?.username || c.username || null).first();
      if (!fila?.id) continue;

      const cuando = (c.timestamp || '').replace('T', ' ').slice(0, 19);
      const campos = ['conversacion_id', 'externo_id', 'direccion', 'tipo',
                      'texto', 'clase', 'media_id'];
      const valores = [
        fila.id, c.id, propio ? 'saliente' : 'entrante', 'texto',
        c.text ?? null, 'comentario', p.id,
      ];
      if (propio) { campos.push('autor'); valores.push('persona'); }
      if (cuando) { campos.push('creado'); valores.push(cuando); }

      const r = await env.DB.prepare(
        `INSERT OR IGNORE INTO mensajes (${campos.join(', ')})
         VALUES (${campos.map(() => '?').join(', ')})`
      ).bind(...valores).run();

      guardados += r.meta?.changes ?? 0;
    }
  }

  const siguiente = desde + porTanda;
  return {
    vistos, guardados,
    publicaciones: todas.length,
    hechas: Math.min(siguiente, todas.length),
    siguiente: siguiente < todas.length ? siguiente : null,
  };
}

/* ── INSTAGRAM: LOS NÚMEROS ──────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   NO SE DA POR SENTADO QUÉ MÉTRICAS EXISTEN. Los nombres cambiaron
   entre versiones de la API —`impressions` desapareció, `plays` pasó a
   `views`— y además dependen del tipo de publicación: un reel tiene
   `shares` y `views`, una foto no. Pedir una lista fija hace que la
   llamada entera falle por una métrica que no aplica, y se pierden
   todas las demás.

   Por eso se pide de a grupos y lo que no entra se descarta solo. Se
   guarda lo que vino, y el panel dibuja lo que haya en vez de esperar
   un juego fijo de números. */

/* Pide un grupo de métricas; si Instagram lo rechaza, prueba de a una y
   se queda con las que pasan. Un nombre inválido no tiene que llevarse
   puestas a las válidas. */
async function igMetricas(env, camino, metricas, extra = '') {
  const pedir = async (lista) =>
    igLlamar(env, `${camino}?metric=${lista.join(',')}${extra}`);

  try {
    const r = await pedir(metricas);
    return r?.data ?? [];
  } catch {
    const salieron = [];
    for (const m of metricas) {
      try {
        const r = await pedir([m]);
        salieron.push(...(r?.data ?? []));
      } catch { /* esa métrica no aplica acá */ }
    }
    return salieron;
  }
}

/* Aplana lo que devuelve Instagram —que viene como lista de objetos con
   `values` o `total_value`— a un objeto plano {metrica: numero}, que es
   lo que el panel necesita para dibujar. */
function aplanarMetricas(lista) {
  const salida = {};
  for (const m of lista ?? []) {
    if (!m?.name) continue;
    if (typeof m?.total_value?.value === 'number') {
      salida[m.name] = m.total_value.value;
    } else if (Array.isArray(m.values) && m.values.length) {
      /* El último tramo es el más reciente. */
      salida[m.name] = m.values[m.values.length - 1]?.value ?? null;
    }
  }
  return salida;
}

/* Lo último que sabemos, para mostrarlo mientras se busca lo nuevo. */
async function leerEstado(env, clave) {
  const f = await env.DB.prepare('SELECT valor, cuando FROM estado WHERE clave = ?')
    .bind(clave).first();
  if (!f) return null;
  try { return { valor: JSON.parse(f.valor), cuando: f.cuando }; }
  catch { return null; }
}

async function guardarEstado(env, clave, valor) {
  await env.DB.prepare(
    `INSERT INTO estado (clave, valor, cuando) VALUES (?, ?, datetime('now'))
     ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, cuando = excluded.cuando`
  ).bind(clave, JSON.stringify(valor)).run();
}

/* ACTUALIZAR DE A TANDAS, Y GUARDANDO EN CADA UNA.
   Son treinta y pico de consultas —una por publicación— y Cloudflare
   corta antes. Cada pedido hace un pedazo y lo guarda; si se corta, lo
   guardado sirve igual y la próxima sigue donde iba.

   La primera tanda trae lo barato y lo más mirado —seguidores,
   alcance, público— para que la pantalla tenga algo bueno enseguida,
   y las publicaciones van después. */
async function actualizarNumeros(env, { desde = 0, porTanda = 6 } = {}) {
  const guardado = (await leerEstado(env, 'instagram_numeros'))?.valor ?? {};

  if (desde === 0) {
    const perfil = await igLlamar(env,
      '/me?fields=id,username,name,followers_count,follows_count,media_count,profile_picture_url');

    const cuenta = aplanarMetricas(await igMetricas(env, '/me/insights',
      ['reach', 'profile_views', 'accounts_engaged', 'total_interactions'],
      '&period=day'));

    const publico = {};
    for (const corte of ['age', 'gender', 'country']) {
      const r = await igMetricas(env, '/me/insights', ['follower_demographics'],
        `&period=lifetime&metric_type=total_value&breakdown=${corte}`);
      const dims = r?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
      if (dims.length) {
        publico[corte] = dims
          .map((d) => ({ valor: d.dimension_values?.[0], cuantos: d.value }))
          .sort((a, b) => b.cuantos - a.cuantos);
      }
    }

    const media = await igLlamar(env,
      '/me/media?fields=id,caption,media_type,media_product_type,permalink,' +
      'thumbnail_url,media_url,timestamp,like_count,comments_count&limit=24');

    /* Las publicaciones entran sin sus métricas: las trae la tanda
       siguiente. Así la pantalla ya muestra cuáles son y cuándo, y los
       números van apareciendo. */
    const publicaciones = (media?.data ?? []).map((p) => ({
      id: p.id,
      texto: p.caption ?? null,
      tipo: p.media_product_type || p.media_type || null,
      enlace: p.permalink ?? null,
      imagen: p.thumbnail_url || p.media_url || null,
      cuando: p.timestamp ?? null,
      likes: p.like_count ?? null,
      comentarios: p.comments_count ?? null,
    }));

    const nuevo = { perfil, cuenta, publico, publicaciones };
    await guardarEstado(env, 'instagram_numeros', nuevo);
    /* `siguiente: 1` Y NO 0. Las tandas de métricas arrancan en 1 —el 0
       es esta primera, la de los datos de cuenta— y devolver 0 hacía
       que el panel volviera a pedir ESTA tanda para siempre: nunca
       llegaba a las métricas de cada publicación, y la tabla quedaba
       con los títulos y sin un solo número. Un cero donde iba un uno. */
    return {
      ...nuevo,
      total: publicaciones.length,
      hechas: 0,
      siguiente: publicaciones.length ? 1 : null,
    };
  }

  /* Y acá las métricas de cada publicación, de a poco. */
  const publicaciones = guardado.publicaciones ?? [];
  const tanda = publicaciones.slice(desde - 1, desde - 1 + porTanda);

  for (const p of tanda) {
    const n = aplanarMetricas(await igMetricas(env, `/${p.id}/insights`,
      ['reach', 'views', 'shares', 'saved', 'total_interactions']));
    p.alcance = n.reach ?? null;
    p.reproducciones = n.views ?? null;
    p.envios = n.shares ?? null;
    p.guardados = n.saved ?? null;
    p.interacciones = n.total_interactions ?? null;
  }

  await guardarEstado(env, 'instagram_numeros', guardado);

  const hechas = Math.min(desde - 1 + porTanda, publicaciones.length);
  return {
    ...guardado,
    total: publicaciones.length,
    hechas,
    siguiente: hechas < publicaciones.length ? hechas + 1 : null,
  };
}

async function instagramNumeros(env, { cuantas = 24 } = {}) {
  const perfil = await igLlamar(env,
    '/me?fields=id,username,name,followers_count,follows_count,media_count,profile_picture_url');

  /* De la cuenta. `day` y no `lifetime`: lo que importa es si se está
     moviendo, no el acumulado histórico. */
  const cuenta = aplanarMetricas(await igMetricas(env, '/me/insights',
    ['reach', 'profile_views', 'accounts_engaged', 'total_interactions'],
    '&period=day'));

  /* El público. Es lo que Tomás venía mirando a mano en la app, y es lo
     que dice si un reel le llegó a quien tenía que llegarle. */
  const publico = {};
  for (const corte of ['age', 'gender', 'country']) {
    const r = await igMetricas(env, '/me/insights', ['follower_demographics'],
      `&period=lifetime&metric_type=total_value&breakdown=${corte}`);
    const dims = r?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    if (dims.length) {
      publico[corte] = dims
        .map((d) => ({ valor: d.dimension_values?.[0], cuantos: d.value }))
        .sort((a, b) => b.cuantos - a.cuantos);
    }
  }

  /* Y las publicaciones, una por una. Las métricas por publicación son
     las que sirven para medir el método del feed: los ENVÍOS sobre todo,
     que es el número que mueve a quién le llega. */
  const media = await igLlamar(env,
    `/me/media?fields=id,caption,media_type,media_product_type,permalink,` +
    `thumbnail_url,media_url,timestamp,like_count,comments_count&limit=${cuantas}`);

  const publicaciones = [];
  for (const p of media?.data ?? []) {
    const n = aplanarMetricas(await igMetricas(env, `/${p.id}/insights`,
      ['reach', 'views', 'shares', 'saved', 'total_interactions', 'likes', 'comments']));
    publicaciones.push({
      id: p.id,
      texto: p.caption ?? null,
      tipo: p.media_product_type || p.media_type || null,
      enlace: p.permalink ?? null,
      imagen: p.thumbnail_url || p.media_url || null,
      cuando: p.timestamp ?? null,
      /* like_count y comments_count vienen del objeto y son más
         confiables que las métricas homónimas, que no todas las
         publicaciones tienen. */
      likes: p.like_count ?? n.likes ?? null,
      comentarios: p.comments_count ?? n.comments ?? null,
      alcance: n.reach ?? null,
      reproducciones: n.views ?? null,
      envios: n.shares ?? null,
      guardados: n.saved ?? null,
      interacciones: n.total_interactions ?? null,
    });
  }

  return { perfil, cuenta, publico, publicaciones };
}

/* HAIKU Y NO OPUS. Lo eligió Tomás y para esto cierra: son dos
   renglones de atención al cliente con las reglas servidas, no un
   problema difícil. Sale unas cuarenta veces más barato. */
const MODELO = 'claude-haiku-5-5';

/* LAS INSTRUCCIONES SON CORTAS A PROPÓSITO.
   Antes decían tres veces "no inventes" y explicaban el porqué de cada
   regla. A un modelo el porqué no le suma y el ruido le resta — y con
   Haiku más, que responde mejor a reglas cortas e imperativas que a
   párrafos. Cada línea de acá abajo tapa un error concreto que el bot
   podría cometer; si se agrega una, que sea por un error nuevo.

   LA PERMUTA SE TOMA, Y ESO ANTES ESTABA MAL ESCRITO. Lo que el bot no
   puede hacer es decir cuánto vale: junta los datos y las fotos, y la
   diferencia la pasa una persona. */
function instruccionesDelBot({
  autos, posteo, nuestro = null, decidiendo = false, esComentario = false,
}) {
  /* CADA AUTO CON SU DIRECCIÓN PROPIA, y no la del garage entero.
     Cuando piden fotos, el link es la respuesta: la ficha las tiene
     todas. Mandar el garage entero es hacerle buscar de nuevo el auto
     que acaba de nombrar, y ahí se cae la mitad.

     Los miles con punto: "USD 72.900" se lee de un vistazo y "USD 72900"
     hay que contarlo con el dedo. */
  const conPuntos = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const stock = autos.map((a) => {
    const precio = a.precio === null
      ? 'a consultar' : `${a.moneda} ${conPuntos(a.precio)}`;
    const km = a.km === null || a.km === undefined ? '?' : conPuntos(a.km);
    return `- ${a.marca} ${a.modelo} ${a.anio ?? ''} · ${km} km · ${precio}` +
           `${a.color ? ' · ' + a.color : ''}\n` +
           `  fotos y ficha: ${SITIO}${enlaceDe(a)}`;
  }).join('\n') || '(no hay autos publicados)';

  /* DE DÓNDE SALE ESTO, y qué pusimos nosotros ahí.
     Es lo que deja al bot atar cabos: si la publicación habla de un auto,
     el que comenta "cuánto" pregunta por ESE y no hay que preguntarle
     cuál. Sin esto, cada comentario arranca de cero. */
  const nuestroTexto = nuestro
    ? `\n\nY esto lo pusimos nosotros en el primer comentario:\n<<<\n${nuestro}\n>>>`
    : '';

  const deDonde = posteo
    ? `DE DÓNDE SALE ESTO. Lo escribimos nosotros al publicar:\n<<<\n${posteo}\n>>>${nuestroTexto}\n\nATÁ CABOS CON ESO: si ahí se habla de un auto de la lista, están\npreguntando por ESE y no les preguntes cuál. Si la publicación no es de\nun auto, contestá sobre lo que dice y no ofrezcas ninguno.\n\nPERO LOS DATOS NO SALEN DE AHÍ. La publicación sirve para saber DE QUÉ\nAUTO hablan, nada más. El precio, los kilómetros y si está disponible\nsalen SÓLO de la lista de arriba, que es la que está al día. Un posteo o\nun comentario de hace meses puede tener un precio viejo: no lo repitas\nnunca, ni aunque lo hayamos escrito nosotros.`
    : `ESTO NO VIENE DE NINGUNA PUBLICACIÓN. Si no queda claro por qué auto\npreguntan, preguntá cuál antes de dar datos.`;

  return `Sos el asistente automático de Manna Motors Selected, concesionaria de
autos seleccionados en Buenos Aires. Atendés por Instagram.

NO ARRANQUES PRESENTÁNDOTE. Contestá lo que preguntaron, primero y
directo. Nada de "hola", nada de "soy el asistente de", nada de "gracias
por escribir".

SÓLO EN TU PRIMER MENSAJE de la conversación, después de haber
contestado, cerrá con este renglón, tal cual, en una línea aparte:
Te contesta un asistente automático. Si preferís hablar con una persona, decímelo.
En los mensajes que siguen no lo repitas nunca más.

PASÁ A UNA PERSONA SÓLO EN DOS CASOS, y en ningún otro:
- piden hablar con alguien del equipo
- piden que borremos sus datos

Son los únicos dos. En cualquier otra cosa seguís vos.

Si te preguntan algo que no sabés, decí que no lo tenés y que se lo
confirma una persona — pero seguí atendiendo el resto normalmente. No
saber un detalle no es motivo para pasar la conversación.

TU OBJETIVO es que vengan a ver el auto. Se visita con cita.

DÓNDE ESTAMOS: Pasaje Nanin, Barracas, Ciudad de Buenos Aires. Si
preguntan la ubicación, pasásela. Después de darla preguntá qué día
quiere venir, que el salón se abre con cita.

PRECIOS Y STOCK — sólo esto. Lo que no está en la lista, no lo tenemos:
${stock}

NO HACEMOS FINANCIACIÓN. Si preguntan, decilo y listo. No es algo que
confirme una persona después: no existe.

NUNCA des un descuento, una reserva, una seña, ni cuánto vale un auto
en parte de pago. Eso lo cierra una persona.

PERMUTA: sí tomamos. Pedí marca, modelo, año, kilómetros, estado y
fotos. Decí que con eso una persona le pasa la diferencia. No des vos
ningún número, ni aproximado, ni un rango.

${deDonde}

FOTOS: no podés mandar fotos por acá. Cada auto tiene su página con
todas las fotos y la ficha entera: pasá ESE link, el del auto que te
están preguntando. Nunca el del garage, nunca el de otro auto. Para
cualquier detalle fino —el color del techo, el equipamiento, el baúl—
mandá el mismo link, que está todo ahí.

Si dudás entre dos autos, preguntá cuál.

Castellano rioplatense, de vos. Dos o tres renglones. Sin emojis, sin
signos de exclamación, sin vender humo.${decidiendo ? decidir(esComentario) : ''}`;
}

/* ── A QUIÉN SE LE ESCRIBE ───────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   Esto es lo único que el bot decide por su cuenta, y es la diferencia
   entre atender y ser spam.

   UN MENSAJE PRIVADO SE CONTESTA SIEMPRE. Alguien se tomó el trabajo de
   escribirnos: dejarlo sin respuesta es el peor resultado posible.

   UN COMENTARIO, CASI NUNCA. Mandarle un privado a cada uno que comenta
   "qué lindo" es spam, lo vive como spam y además Instagram lo mide como
   spam. El privado se gana con una pregunta concreta sobre un auto, y
   ante la duda no se escribe: un interesado que no recibió el privado
   vuelve a preguntar, y un privado a quien no preguntó nada no se
   deshace.

   POR QUÉ SE LE PIDE EL TEXTO AUNQUE DIGA QUE NO. Porque sin el texto no
   hay cómo revisar la decisión: en el log queda qué hubiera contestado y
   se puede ver si se está callando donde debería hablar. */
function decidir(esComentario) {
  const cuando = esComentario
    ? `ESTO ES UN COMENTARIO EN UNA PUBLICACIÓN NUESTRA. Nadie te escribió:
le vas a escribir vos primero, por privado. Así que escribile SÓLO si hay
algo concreto que contestar de un auto.

responder: false si
- la publicación no es de un auto de la lista
- opinó y nada más: "qué lindo", "tremendo", un emoji, una puteada, un
  chiste, etiquetar a un amigo
- le habla a otro que comentó, no a nosotros
- no se entiende qué quiere

responder: true sólo si pregunta algo de un auto: precio, kilómetros,
año, si está disponible, si lo puede ver, si tomamos permuta.

ANTE LA DUDA, false.

ME GUSTA. Va en true si el comentario es bueno con nosotros o con el
auto: un elogio, un "qué máquina", aplausos, un corazón, una pregunta
hecha de buen modo. Eso se agradece aunque no le contestemos.

Va en false, y ahí no se hace nada de nada —ni me gusta, ni respuesta,
ni derivar—, si es una crítica, una cargada, un insulto, una queja, un
chiste a costa nuestra, o si le parece caro o un robo. A eso se lo deja
pasar: ponerle me gusta a quien nos pegó es ridículo, y contestarle es
darle cuerda adelante de todos.`
    : `ESTO ES UN MENSAJE PRIVADO: te escribió. responder va true siempre.`;

  return `

${cuando}

Devolvé SÓLO este JSON, sin una palabra antes ni después:
{"responder": true, "derivar": false, "megusta": false, "texto": "..."}

responder — si le escribimos o no.
derivar — si de acá sigue una persona.
megusta — si le ponemos me gusta al comentario.
texto — lo que le escribimos. Escribilo siempre, incluso si responder es
false: si derivás, que sea que ya le pasás con alguien del equipo.`;
}

/* PIENSA LA RESPUESTA. NO MANDA NADA: eso lo decide quien la llama.

   `decidiendo` cambia lo que se le pide a Claude. Sin eso devuelve un
   texto y se terminó — es el borrador que escribe el botón del panel.
   Con eso devuelve además si hay que escribirle y si de ahí sigue una
   persona, que es lo que hace falta cuando contesta solo.

   ES UNA SOLA FUNCIÓN PARA LOS DOS CASOS A PROPÓSITO. El contexto que
   junta —el stock, el texto del posteo, el hilo— es idéntico, y tener dos
   copias garantiza que el día que se arregle una, la otra quede vieja.
   Lo único que cambia son las instrucciones y qué se lee de la vuelta. */
async function pensarRespuesta(env, conversacionId, { decidiendo = false } = {}) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('Falta cargar ANTHROPIC_API_KEY en Cloudflare');
  }

  const { results: mensajes } = await env.DB.prepare(
    `SELECT direccion, autor, texto, clase, media_id, externo_id
       FROM mensajes WHERE conversacion_id = ?
      ORDER BY creado, id`
  ).bind(conversacionId).all();

  const todos = (mensajes ?? []).filter((m) => m.texto);
  if (!todos.length) throw new Error('No hay nada que contestar todavía');

  const ultimo = todos[todos.length - 1];
  const esComentario = ultimo.clase === 'comentario';

  /* ── EL CONTEXTO DE UN COMENTARIO NO ES EL HILO ──────────────────

     Acá estaba el ruido. Una "conversación" es una persona, no una
     charla: si alguien comentó cuarenta y seis veces en dieciséis
     publicaciones distintas a lo largo de meses, las cuarenta y seis
     entraban juntas como si fueran un diálogo seguido — y encima con el
     texto de UNA sola de las dieciséis. El modelo tenía que adivinar de
     qué se estaba hablando entre pedazos de dieciséis temas.

     UN COMENTARIO SE MIRA SOLO, contra su publicación. Lo que entra es
     lo que esa persona escribió EN ESA publicación y nada más. Si
     comentó tres veces abajo del mismo posteo, las tres: eso sí es un
     hilo. Lo que dijo en otro posteo hace dos meses, no.

     UN PRIVADO SÍ ES UNA CHARLA, pero sólo con los privados: los
     comentarios viejos no son parte de ella. Y los últimos veinte, que
     más atrás ya no se está hablando de lo mismo. */
  const privados = todos.filter((m) => m.clase !== 'comentario').slice(-20);

  const hilo = esComentario
    ? todos.filter((m) => m.clase === 'comentario' && m.media_id === ultimo.media_id)
    : (privados.length ? privados : [ultimo]);

  const { results: autos } = await env.DB.prepare(
    `SELECT id, marca, modelo, anio, km, precio, moneda, color, estado
       FROM autos WHERE estado = 'publicado' ORDER BY marca, modelo`
  ).all();

  /* DE QUÉ PUBLICACIÓN SALE ESTO.
     En un comentario, la suya. En un privado, la del comentario que lo
     originó — pero sólo si fue lo último que pasó: si hay que irse diez
     mensajes atrás para encontrarlo, ya no es de eso que están
     hablando, y arrastrarlo confunde más de lo que ayuda. */
  const origen = esComentario
    ? ultimo
    : [...todos].slice(-4).reverse().find((m) => m.media_id);

  let posteo = null;
  let nuestro = null;

  if (origen?.media_id) {
    /* El texto sale de las estadísticas que ya tenemos guardadas, así
       que no cuesta una llamada a Instagram. Si todavía no se leyeron,
       el bot se arregla sin eso. */
    const guardado = (await leerEstado(env, 'instagram_numeros'))?.valor;
    posteo = (guardado?.publicaciones ?? [])
      .find((p) => p.id === origen.media_id)?.texto ?? null;

    /* Y SI NO ESTÁ GUARDADA, SE PREGUNTA.
       Acá se rompía de verdad. Lo guardado son las publicaciones que
       entraron en la última lectura, y la gente comenta en posteos de
       hace meses: el comentario que destapó esto colgaba de uno que no
       estaba. Sin el texto el bot queda ciego y termina preguntando "de
       cuál auto" abajo de una publicación que dice cuál.

       Es una sola llamada y sólo cuando falta. Si tampoco sale, se sigue
       sin ella: las instrucciones ya dicen qué hacer a oscuras. */
    if (!posteo) {
      try {
        const m = await igLlamar(env, `/${origen.media_id}?fields=caption`);
        posteo = m?.caption ?? null;
      } catch (e) {
        console.error('No se pudo leer la publicación:', e?.message ?? e);
      }
    }

    /* Y EL COMENTARIO QUE PONEMOS NOSOTROS ABAJO, si hay.
       No las respuestas a la gente —esas arrancan con la arroba— sino
       lo que escribimos al publicar, que es donde suelen ir los datos
       que no entraron en la descripción. */
    const propio = await env.DB.prepare(
      `SELECT texto FROM mensajes
        WHERE media_id = ? AND clase = 'comentario' AND direccion = 'saliente'
          AND texto IS NOT NULL AND texto NOT LIKE '@%'
        ORDER BY creado, id LIMIT 1`
    ).bind(origen.media_id).first();

    nuestro = propio?.texto ?? null;
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const respuesta = await client.messages.create({
    model: MODELO,
    max_tokens: 1000,
    /* Esfuerzo bajo: son dos renglones de atención al cliente, no un
       problema difícil. Subirlo acá es pagar de más por pensar algo
       que no lo necesita. */
    output_config: { effort: 'low' },
    system: instruccionesDelBot({
      autos: autos ?? [], posteo, nuestro, decidiendo, esComentario,
    }),
    messages: hilo.map((m) => ({
      role: m.direccion === 'entrante' ? 'user' : 'assistant',
      content: m.texto,
    })),
  });

  const crudo = (respuesta.content ?? [])
    .filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

  if (!crudo) throw new Error('Claude no devolvió una respuesta');
  if (!decidiendo) return { texto: crudo, conPosteo: Boolean(posteo), ultimo };

  /* TOLERANTE AL LEER, ESTRICTO AL DECIDIR.
     Claude puede envolver el JSON en un "acá va:" o en un bloque de
     código, y eso no es motivo para no contestarle a un cliente: se
     busca de la primera llave a la última. Lo que no se perdona es que
     adentro falte algo — ahí tira, y quien llama no manda nada. */
  const abre = crudo.indexOf('{');
  const cierra = crudo.lastIndexOf('}');
  if (abre < 0 || cierra < abre) throw new Error('Claude no devolvió una decisión');

  const d = JSON.parse(crudo.slice(abre, cierra + 1));
  const texto = typeof d?.texto === 'string' ? d.texto.trim() : '';
  if (!texto) throw new Error('La decisión vino sin texto');

  return {
    texto, conPosteo: Boolean(posteo), ultimo,
    responder: d.responder === true,
    derivar: d.derivar === true,
    megusta: d.megusta === true,
  };
}

/* El botón del panel. Devuelve el borrador y nada más: lo de adentro no
   le sirve a la pantalla. */
async function borradorDeRespuesta(env, conversacionId) {
  const { texto, conPosteo } = await pensarRespuesta(env, conversacionId);
  return { texto, conPosteo };
}

/* ── CONTESTAR SOLO ──────────────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   DE ACÁ EN ADELANTE EL BOT MANDA SIN QUE NADIE MIRE. Eso no se
   deshace: un mensaje enviado ya está en el teléfono del cliente. Así
   que hay cuatro frenos, y ninguno es decorativo.

   1. SI FALLA ALGO, NO MANDA. Si Claude no contesta, si la respuesta no
      se entiende, si se rompe una consulta — silencio. El error cae del
      lado de no escribir, nunca del lado de escribir cualquier cosa.

   2. NUNCA SE CONTESTA A SÍ MISMO. Sólo si el último mensaje del hilo es
      de la otra persona. Sin esto, nuestra propia respuesta vuelve por
      el webhook y arranca una conversación del bot consigo mismo.

   3. CUANDO PIDEN UNA PERSONA, SE CALLA PARA SIEMPRE EN ESE CHAT. Deja
      la conversación marcada y no vuelve a escribir ahí. Es el
      compromiso asumido ante Meta y es el que más importa.

   4. NO LE ESCRIBE A TODO EL QUE COMENTA. Lo decide `decidir()` más
      arriba, y por defecto decide que no.

   Y una más: siempre por privado, nunca contestando en el comentario a
   la vista de todos. Una respuesta equivocada en un privado la lee una
   persona; abajo de la publicación, la lee cualquiera. */
async function contestarSolo(env, conversacionId) {
  try {
    if (!env.ANTHROPIC_API_KEY || !env.META_IG_TOKEN) return;

    const chat = await env.DB.prepare(
      'SELECT id, canal, externo_id, humano FROM conversaciones WHERE id = ?'
    ).bind(conversacionId).first();

    /* Marcada para una persona: acá el bot no escribe más. */
    if (!chat || chat.humano) return;
    if (chat.canal !== 'instagram') return;

    /* ── EL FRENO DE RÁFAGA ──────────────────────────────────────────
       Nadie necesita cinco mensajes nuestros en diez minutos, y Meta
       menos: los límites de Instagram se cuentan por cuenta y por hora,
       y una cuenta que dispara seguido termina con la dirección cortada.

       Esto no es el límite de Meta —con ochocientos seguidores no se
       llega ni cerca—, es el freno de que algo nuestro se vuelva loco:
       un bucle, una tanda de avisos repetidos, un error que reintenta.
       Cinco en diez minutos no lo alcanza nadie atendiendo bien. */
    const recientes = await env.DB.prepare(
      `SELECT COUNT(*) n FROM mensajes
        WHERE conversacion_id = ? AND direccion = 'saliente'
          AND creado > datetime('now', '-10 minutes')`
    ).bind(conversacionId).first();

    if ((recientes?.n ?? 0) >= 5) {
      console.log(JSON.stringify({
        bot: 'frenado por ráfaga', chat: conversacionId, salientes: recientes.n,
      }));
      return;
    }

    const d = await pensarRespuesta(env, conversacionId, { decidiendo: true });

    /* El último con texto no es de la otra persona: o ya le contestaron,
       o lo que entró es nuestro. En los dos casos no hay nada que decir. */
    if (d.ultimo?.direccion !== 'entrante') return;

    if (d.derivar) {
      await env.DB.prepare(
        `UPDATE conversaciones
            SET humano = 1,
                nota = COALESCE(nota, 'La IA lo pasó a una persona')
          WHERE id = ?`
      ).bind(conversacionId).run();
    }

    /* EL ME GUSTA VA PRIMERO Y VA APARTE.
       A un comentario amable se le pone me gusta aunque no haya nada que
       contestarle — es el caso más común y el que más se nota. Y va
       envuelto porque es lo secundario: si falla el me gusta, la
       respuesta tiene que salir igual. */
    const esUnComentario = d.ultimo.clase === 'comentario' && d.ultimo.externo_id;

    if (d.megusta && esUnComentario) {
      try {
        await megustaEnInstagram(env, d.ultimo.externo_id);
      } catch (e) {
        console.error('No se pudo dar me gusta:', e?.message ?? e);
      }
    }

    if (!d.responder && !d.derivar) {
      /* Queda el texto que hubiera mandado, para poder revisar si se
         está callando donde debería hablar. Es nuestro propio borrador,
         no lo que escribió el cliente. */
      console.log(JSON.stringify({
        bot: 'no le escribe', chat: conversacionId,
        megusta: Boolean(d.megusta && esUnComentario),
        hubiera_dicho: d.texto,
      }));
      return;
    }

    /* UN COMENTARIO SE CONTESTA POR EL ID DEL COMENTARIO, no por el de
       la persona: a alguien que nunca nos escribió no se le puede abrir
       un privado, y la respuesta privada a un comentario es la única
       puerta que da Instagram. Dura 7 días y se usa una sola vez. */
    /* UN PRIVADO POR PUBLICACIÓN, Y NO UNO POR COMENTARIO.
       Meta deja una respuesta privada por comentario, así que alguien
       que comenta cinco veces abajo del mismo posteo habilita cinco
       privados. Que esté permitido no lo hace sensato: son cinco
       mensajes nuestros por una sola consulta, y así es como la gente
       marca una cuenta como spam.

       Ya le escribimos por esta publicación: el me gusta ya se puso más
       arriba, y con eso alcanza. */
    if (esUnComentario && d.ultimo.media_id) {
      const yaFuimos = await env.DB.prepare(
        `SELECT 1 FROM mensajes
          WHERE conversacion_id = ? AND direccion = 'saliente'
            AND media_id = ? LIMIT 1`
      ).bind(conversacionId, d.ultimo.media_id).first();

      if (yaFuimos) {
        console.log(JSON.stringify({
          bot: 'ya le escribió por esta publicación', chat: conversacionId,
        }));
        return;
      }
    }

    const envio = await mandarPorInstagram(
      env,
      esUnComentario ? d.ultimo.externo_id : chat.externo_id,
      d.texto,
      { esComentario: Boolean(esUnComentario) }
    );

    await guardarSaliente(
      env, conversacionId, d.texto, 'ia', envio?.message_id,
      esUnComentario ? d.ultimo.media_id : null
    );

    /* Y EL AVISO ABAJO DE LA PUBLICACIÓN, después de que el privado
       salió. En ese orden: avisar que escribimos antes de haber escrito
       es mentirle a todo el que lo lea. Envuelto, porque no se puede
       responder abajo de una respuesta a otro comentario y eso no es
       motivo para dar por fallado un privado que ya salió bien. */
    if (esUnComentario) {
      try {
        await avisarEnElComentario(env, d.ultimo.externo_id);
      } catch (e) {
        console.error('No se pudo avisar en el comentario:', e?.message ?? e);
      }
    }

    console.log(JSON.stringify({
      bot: d.derivar ? 'derivó' : 'contestó',
      chat: conversacionId,
      por: esUnComentario ? 'comentario' : 'privado',
      megusta: Boolean(d.megusta && esUnComentario),
    }));
  } catch (e) {
    /* NO SE PROPAGA. Esto corre colgado del webhook: si tira, Meta
       nunca se enteraría igual, pero un error sin atrapar se lleva
       puesto el resto de las conversaciones de la misma tanda. */
    console.error('El bot no pudo contestar:', e?.message ?? e);
  }
}

/* SE CONTESTA 200 SIEMPRE QUE EL AVISO SEA DE META, y rápido. Si Meta
   no recibe un 200 en unos segundos, reintenta el mismo aviso una y otra
   vez, y si falla seguido termina desactivando la dirección. Lo que haya
   que hacer con el mensaje no puede demorar esta respuesta.

   MIENTRAS NO ESTÉ LA CLAVE SECRETA, se acepta y se anota como "sin
   verificar". Así el botón "Probar" del panel de Meta funciona desde el
   primer minuto; cuando se cargue META_APP_SECRET, lo que no venga
   firmado se rechaza. Nada de lo que llega sin verificar se usa para
   responder.

   EL CONTENIDO DE LOS MENSAJES NO VA AL LOG. Antes se anotaba el aviso
   entero porque no se guardaba en ningún lado y era la única forma de
   ver qué llegaba. Ahora se guarda en la base, con plazo y con borrado,
   y el log de Cloudflare no tiene ninguna de las dos cosas: queda solo
   el recuento, que alcanza para saber si el webhook anda.

   SI FALLA LA BASE SE CONTESTA 200 IGUAL. Un 500 acá hace que Meta
   reintente, y si el problema persiste termina dando de baja la
   dirección. El reintento no pierde nada —el id de mensaje es único— así
   que conviene aceptar y anotar el error.

   HAY DOS CLAVES SECRETAS, NO UNA, Y ESTO COSTÓ UNA TARDE.
   ──────────────────────────────────────────────────────────────────
   WhatsApp y Messenger firman con la clave de la app de Facebook
   (`META_APP_SECRET`). Instagram, cuando se conecta por "inicio de
   sesión de Instagram", es otra app con su propio identificador y su
   PROPIA clave: en el panel aparece como "Clave secreta de la app de
   Instagram", separada de la otra.

   Con una sola clave cargada, todo aviso de Instagram fallaba la firma
   y se iba en un 401 antes de llegar a guardarse. Y el 401 no anotaba
   nada, así que desde afuera era idéntico a que no llegara nada: no
   había forma de distinguir "Meta no mandó" de "llegó y lo rechacé".

   Por eso ahora: se prueba contra las dos claves que estén cargadas, y
   SI NINGUNA DA, SE ANOTA. El rechazo tiene que dejar rastro, porque es
   justo el caso que uno necesita ver. */
async function recibirDeMeta(peticion, env, ctx) {
  const crudo = await peticion.text();
  const firma = peticion.headers.get('x-hub-signature-256');

  /* Las que estén cargadas. Cada canal firma con la suya y acá no se
     sabe cuál es sin parsear el cuerpo, que todavía no es de fiar. */
  const claves = [
    ['facebook',  env.META_APP_SECRET],
    ['instagram', env.META_IG_APP_SECRET],
  ].filter(([, valor]) => valor);

  let verificado = null;
  for (const [cual, valor] of claves) {
    if (await firmaDeMetaValida(crudo, firma, valor)) { verificado = cual; break; }
  }

  if (claves.length && !verificado) {
    /* SIN NADA DEL CUERPO: no está verificado, así que no se anota ni
       una letra de lo que trajo. Sólo que hubo un rechazo y si venía
       firmado, que es lo único que hace falta para diagnosticar. */
    console.log(JSON.stringify({
      meta: 'firma inválida',
      traia_firma: Boolean(firma),
      claves_probadas: claves.map(([cual]) => cual),
    }));
    return new Response('Firma inválida', { status: 401 });
  }

  let aviso = null;
  try { aviso = JSON.parse(crudo); } catch { /* cuerpo ilegible */ }

  let guardados = 0;
  let contestando = 0;
  try {
    const lista = mensajesDelAviso(aviso);
    if (lista.length) {
      const chats = await guardarEntrantes(env, lista);
      guardados = lista.length;

      /* CONTESTAR VA COLGADO, NO ANTES DEL 200.
         Pensar la respuesta son unos segundos de Claude y uno más de
         Instagram, y Meta no espera: si el 200 tarda, reintenta el mismo
         aviso y a la larga desactiva la dirección. Así que se contesta
         200 ya, y el bot sigue trabajando después con `waitUntil`, que
         es lo que mantiene vivo al Worker un rato más.

         UNA POR VEZ. En paralelo serían varias llamadas a Claude y
         varias a Instagram desde la misma invocación, y Cloudflare corta
         por cantidad de pedidos salientes. Son conversaciones distintas:
         que una espere a la otra no se nota. */
      if (chats.length && env.ANTHROPIC_API_KEY) {
        contestando = chats.length;
        const trabajo = (async () => {
          for (const id of chats) await contestarSolo(env, id);
        })();
        if (ctx?.waitUntil) ctx.waitUntil(trabajo); else await trabajo;
      }
    }
  } catch (e) {
    console.error('No se pudo guardar el aviso de Meta:', e?.message ?? e);
  }

  /* El `object` sale de un cuerpo que puede venir de cualquiera, así que
     al log va sólo si es uno de los tres que conocemos. Pegar texto
     ajeno en el log es ensuciarlo con lo que el otro quiera escribir. */
  const CANALES_META = ['whatsapp_business_account', 'instagram', 'page'];
  const canal = CANALES_META.includes(aviso?.object) ? aviso.object : 'desconocido';

  console.log(JSON.stringify({
    meta: verificado ? `verificado (${verificado})` : 'sin verificar (no hay claves cargadas)',
    canal,
    mensajes: guardados,
    contestando,
  }));

  return new Response('ok', { status: 200 });
}

/* ── el panel ────────────────────────────────────────────────────── */

function pedirClave(env) {
  if (!env.CLAVE_ADMIN || !env.FIRMA_SESION) {
    return new Response(
      'Falta configurar el panel. Cargá los dos secretos:\n\n' +
      '  npx wrangler secret put CLAVE_ADMIN\n' +
      '  npx wrangler secret put FIRMA_SESION\n',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
    );
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════ */

export default {
  async fetch(peticion, env, ctx) {
    const url = new URL(peticion.url);
    const ruta = url.pathname.replace(/\/+$/, '') || '/';
    const metodo = peticion.method;

    try {
      /* ── LA VERIFICACION DE GOOGLE SEARCH CONSOLE ─────────────────

         El archivo esta en public/ como cualquier otro, pero la capa de
         assets tiene `html_handling: auto-trailing-slash`: a todo .html
         le saca la extension. O sea que el archivo se sirve bien en
         /googleecbc432f0d3bc834 y la direccion QUE GOOGLE PIDE —la que
         termina en .html— contesta un 307 hacia ella.

         Google casi seguro sigue ese redirect. "Casi seguro" no alcanza
         para una verificacion que, si falla, no dice por que: se
         contesta 200 en la direccion exacta y listo.

         Se lee del propio archivo en vez de escribir el texto aca: el
         archivo es el que Google dio y sigue siendo el unico lugar
         donde vive ese dato.

         LA REGLA NO NOMBRA UN TOKEN, RECONOCE LA FORMA. Google cambia
         el archivo cada vez que uno vuelve a verificar, y con el token
         escrito aca cada cambio pedia tocar el codigo. Asi, cambiar de
         token es dejar el archivo nuevo en public/ y corregir una linea
         en wrangler.jsonc, que es la unica que si tiene que nombrarlo.

         Si el archivo no esta, `ARCHIVOS.fetch` contesta lo que
         corresponde y no se inventa un 200: un token que no existe
         tiene que dar 404, no una pagina en blanco que Google lea como
         valida.

         Va PRIMERO de todo y no mezclado con el resto de las rutas
         porque no es parte de la API: es un archivo, y esta linea
         existe solo para saltear el renombrado de la capa de assets. */
      const verificacion = ruta.match(/^\/(google[a-z0-9]+)\.html$/);
      if (verificacion) {
        const archivo = new URL('/' + verificacion[1], url);
        const r = await env.ARCHIVOS.fetch(new Request(archivo, peticion));
        return new Response(r.body, {
          status: r.status,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }

      /* ── LAS FOTOS ────────────────────────────────────────────────
         Salen de R2 con cache eterno porque la llave lleva un
         identificador único: si la foto cambia, cambia la dirección, así
         que la vieja no le sirve a nadie. */
      if (ruta.startsWith('/fotos/')) {
        if (metodo !== 'GET' && metodo !== 'HEAD') return error('Método no permitido', 405);
        const clave = decodeURIComponent(ruta.slice('/fotos/'.length));

        /* PEDIDOS POR TRAMO, Y NO ES UN LUJO: SIN ESTO SAFARI NO
           REPRODUCE.

           Para una imagen da igual, se manda entera. Para un <video>
           no: Safari abre pidiendo `Range: bytes=0-1` y si le contestan
           200 con el archivo completo, en vez de 206 con el tramo, da
           el video por no reproducible y no vuelve a intentar. Chrome
           lo tolera, y por eso es la clase de cosa que funciona en la
           máquina del que la programó.

           R2 lee tramos de una, así que el Worker no baja el archivo
           entero para recortar dos bytes. */
        const tramo = peticion.headers.get('range');
        const pedido = tramo && /^bytes=(\d*)-(\d*)$/.exec(tramo.trim());

        if (pedido) {
          const desde = pedido[1] === '' ? undefined : Number(pedido[1]);
          const hasta = pedido[2] === '' ? undefined : Number(pedido[2]);
          /* Los dos vacíos —"bytes=-"— no piden nada; se sirve entero. */
          const rango = desde === undefined
            ? (hasta === undefined ? null : { suffix: hasta })
            : { offset: desde, ...(hasta === undefined ? {} : { length: hasta - desde + 1 }) };

          if (rango) {
            const parte = await env.FOTOS.get(clave, { range: rango });
            if (!parte) return new Response('No está', { status: 404 });
            const r = parte.range || {};
            const arranca = r.offset ?? 0;
            const largo = r.length ?? parte.size;
            return new Response(parte.body, {
              status: 206,
              headers: {
                'content-type': parte.httpMetadata?.contentType || 'application/octet-stream',
                'content-range': `bytes ${arranca}-${arranca + largo - 1}/${parte.size}`,
                'content-length': String(largo),
                'accept-ranges': 'bytes',
                'cache-control': 'public, max-age=31536000, immutable',
                etag: parte.httpEtag,
              },
            });
          }
        }

        const obj = await env.FOTOS.get(clave);
        if (!obj) return new Response('No está', { status: 404 });
        return new Response(obj.body, {
          headers: {
            'content-type': obj.httpMetadata?.contentType || 'image/webp',
            'content-length': String(obj.size),
            /* Se anuncia siempre, aunque este pedido no traiga tramo: es
               así como el navegador sabe que puede pedirlos. */
            'accept-ranges': 'bytes',
            'cache-control': 'public, max-age=31536000, immutable',
            etag: obj.httpEtag,
          },
        });
      }

      /* ── LA PÁGINA DE UN AUTO ─────────────────────────────────────

         El id es lo último de la dirección, después del último guión.
         Todo lo de adelante es texto para leer: no se compara para
         resolver el pedido, pero sí para corregirlo. */
      const pedidoDeAuto = ruta.match(/^\/auto\/(.+)$/);
      if (pedidoDeAuto) {
        if (metodo !== 'GET' && metodo !== 'HEAD') return error('Método no permitido', 405);

        const partes = decodeURIComponent(pedidoDeAuto[1]).split('-');
        const id = partes.pop();
        if (!/^\d+$/.test(id)) return Response.redirect(new URL('/garage/', url), 302);

        const fila = await env.DB
          .prepare(`SELECT * FROM autos WHERE id = ? AND estado IN ('publicado', 'vendido')`)
          .bind(id).first();

        /* UN AUTO QUE YA NO ESTÁ MANDA AL GARAGE Y NO A UN 404.
           Estas direcciones se comparten por WhatsApp y sobreviven al
           auto: el que la abre tres meses después es alguien que quiere
           comprar. Dejarlo en una página de error es perderlo; dejarlo
           en el listado es la respuesta útil. Va como 302 —"por ahora
           está acá"— porque el borrador de hoy puede publicarse mañana
           en esta misma dirección. */
        if (!fila) return Response.redirect(new URL('/garage/', url), 302);

        const auto = (await conFotos(env, [fila]))[0];

        /* LA DIRECCIÓN BUENA ES UNA SOLA. Si el texto no coincide —le
           cambiaron el modelo al auto, o alguien recortó el link— se
           contesta un 301 hacia la que corresponde. Sin esto, la misma
           ficha existiría en infinitas direcciones y Google las trataría
           como copias compitiendo entre sí. */
        const canonica = enlaceDe(auto);
        if (ruta !== canonica) {
          return Response.redirect(new URL(canonica, url), 301);
        }

        return paginaDeAuto(peticion, env, url, auto);
      }

      /* ── EL MAPA DEL SITIO ────────────────────────────────────────

         SE ARMA ACÁ Y YA NO ES UN ARCHIVO. Era una lista de tres
         páginas escrita a mano, con una nota que decía que el día que
         cada auto tuviera dirección propia iban a ir ahí. Ese día es
         hoy, y mantenerla a mano sería acordarse de tocar un archivo
         cada vez que entra o sale un auto. Sale de la base, así que
         siempre dice la verdad.

         LOS VENDIDOS VAN, CON MENOS PRIORIDAD. Son páginas reales que
         alguien puede tener guardadas, pero no es lo que queremos que
         Google muestre primero. */
      if (ruta === '/sitemap.xml') {
        if (metodo !== 'GET' && metodo !== 'HEAD') return error('Método no permitido', 405);

        const { results } = await env.DB.prepare(
          `SELECT id, marca, modelo, anio, estado, editado FROM autos
            WHERE estado IN ('publicado', 'vendido')
            ORDER BY orden, creado DESC`
        ).all();

        const fijas = [
          ['/', 'weekly', '1.0'],
          ['/garage/', 'daily', '0.9'],
          ['/por-que-elegirnos/', 'monthly', '0.6'],
          ['/privacidad/', 'yearly', '0.2'],
          ['/terminos/', 'yearly', '0.2'],
        ].map(([donde, cada, peso]) =>
          `  <url>\n    <loc>${SITIO}${donde}</loc>\n` +
          `    <changefreq>${cada}</changefreq>\n    <priority>${peso}</priority>\n  </url>`);

        const autos = results.map((a) =>
          `  <url>\n    <loc>${SITIO}${enlaceDe(a)}</loc>\n` +
          (a.editado ? `    <lastmod>${String(a.editado).slice(0, 10)}</lastmod>\n` : '') +
          `    <changefreq>weekly</changefreq>\n` +
          `    <priority>${a.estado === 'vendido' ? '0.3' : '0.8'}</priority>\n  </url>`);

        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          fijas.concat(autos).join('\n') + '\n</urlset>\n',
          {
            headers: {
              'content-type': 'application/xml; charset=utf-8',
              'cache-control': 'public, max-age=3600',
            },
          }
        );
      }

      /* ── EL PANEL ─────────────────────────────────────────────── */
      if (ruta === '/admin') {
        const falta = pedirClave(env);
        if (falta) return falta;
        return new Response(PANEL, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            /* Que no lo indexe nadie: es una puerta de servicio. */
            'x-robots-tag': 'noindex, nofollow',
          },
        });
      }

      /* ── SESIÓN ───────────────────────────────────────────────── */
      if (ruta === '/api/sesion' && metodo === 'GET') {
        return json({ activa: await sesionValida(peticion, env) });
      }

      if (ruta === '/api/entrar' && metodo === 'POST') {
        const falta = pedirClave(env);
        if (falta) return error('El panel todavía no está configurado', 503);

        const { clave } = await peticion.json().catch(() => ({}));
        const a = textoABytes(String(clave ?? ''));
        const b = textoABytes(env.CLAVE_ADMIN);
        const bien = a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
        /* Un rato de espera fijo: encarece probar claves de a miles sin
           molestar a quien la escribe bien. */
        await new Promise((r) => setTimeout(r, 350));
        if (!bien) return error('Clave incorrecta', 401);

        const vence = Date.now() + 12 * 60 * 60 * 1000;
        const galleta = await firmar(env, `admin|${vence}`);
        return json({ ok: true }, 200, {
          'set-cookie': `sesion=${encodeURIComponent(galleta)}; Path=/; HttpOnly; Secure; ` +
                        `SameSite=Strict; Max-Age=${12 * 60 * 60}`,
        });
      }

      if (ruta === '/api/salir' && metodo === 'POST') {
        return json({ ok: true }, 200, {
          'set-cookie': 'sesion=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
        });
      }

      /* ── LAS IMÁGENES FIJAS ───────────────────────────────────────
         Devuelve sólo los slots que TIENEN reemplazo. La página ya trae
         sus fotos de siempre escritas en el HTML; esto le dice cuáles
         cambiar. Con la tabla vacía la respuesta es `{}` y el sitio se
         ve exactamente como antes de que esto existiera. */
      if (ruta === '/api/medios' && metodo === 'GET') {
        const { results } = await env.DB
          .prepare('SELECT slot, variante, clave, clase FROM medios').all();
        /* Un objeto por lugar, con una entrada por pantalla cargada:

             { 'collage-ciudad': { compu: {clave, clase},
                                   celular: {clave, clase} } }

           Va la clase además de la clave porque el fondo del collage
           puede ser un video o una foto, y la página necesita saber cuál
           para poner <video> o <img>. La clave viene completa —con
           extensión— así que la dirección es `/fotos/` + clave. */
        const mapa = {};
        for (const m of results) {
          /* SOLO LOS LUGARES QUE SIGUEN EXISTIENDO.

             Esto leia la tabla entera sin preguntarle nada a SLOTS: la
             lista blanca mandaba al ESCRIBIR pero no al leer. Mientras
             los lugares solo se agregaban daba igual; el dia que se
             saco uno —los cuatro de la nota— su fila quedo en la tabla
             y la pagina la seguia recibiendo, con un slot que ya no
             existe en ningun lado.

             Preguntando aca, sacar un lugar de SLOTS alcanza para que
             deje de servirse, sin depender de que alguien se acuerde de
             limpiar la base. */
          if (!SLOTS[m.slot]) continue;
          (mapa[m.slot] ||= {})[m.variante] = { clave: m.clave, clase: m.clase };
        }
        return json(mapa, 200, { 'cache-control': 'public, max-age=60' });
      }

      /* ── CATÁLOGO PÚBLICO ─────────────────────────────────────────

         LO PUBLICADO Y LO VENDIDO. Los vendidos salieron a la luz
         cuando el garage sumo su propia solapa: ya no son unidades a la
         venta, son la prueba de lo que paso por la casa.

         EL BORRADOR SIGUE SIN SALIR, y esa distincion es la que importa:
         un borrador es un auto a medio cargar —sin fotos, sin precio,
         con datos que todavia se estan escribiendo— y mostrarlo seria
         publicar por accidente. Un vendido, en cambio, esta completo;
         lo unico que cambio es que ya no esta disponible.

         El `estado` viaja en la respuesta porque quien la lee necesita
         poder separarlos: el garage no mezcla vendidos con disponibles
         en la misma lista. */
      if (ruta === '/api/autos' && metodo === 'GET') {
        const grupo = url.searchParams.get('grupo');
        if (grupo && !GRUPOS.includes(grupo)) return error('Grupo desconocido');

        const { results } = await env.DB.prepare(
          `SELECT * FROM autos
            WHERE estado IN ('publicado', 'vendido') ${grupo ? 'AND grupo = ?' : ''}
            ORDER BY orden, creado DESC`
        ).bind(...(grupo ? [grupo] : [])).all();

        return json({ autos: await conFotos(env, results) }, 200, {
          'cache-control': 'public, max-age=60',
        });
      }

      const unAuto = ruta.match(/^\/api\/autos\/(\d+)$/);
      if (unAuto && metodo === 'GET') {
        /* Mismo criterio que la lista: si un vendido se muestra, su
           ficha tiene que poder abrirse. El borrador no. */
        const fila = await env.DB
          .prepare(`SELECT * FROM autos WHERE id = ? AND estado IN ('publicado', 'vendido')`)
          .bind(unAuto[1]).first();
        if (!fila) return error('No está', 404);
        return json({ auto: (await conFotos(env, [fila]))[0] });
      }

      /* ── EL WEBHOOK DE META ────────────────────────────────────── */
      if (ruta === '/api/meta/webhook') {
        if (metodo === 'GET') return verificarWebhook(url, env);
        if (metodo === 'POST') return recibirDeMeta(peticion, env, ctx);
        return error('Método no permitido', 405);
      }

      /* ── DE ACÁ PARA ABAJO, TODO PIDE SESIÓN ─────────────────── */
      if (ruta.startsWith('/api/admin')) {
        if (!(await sesionValida(peticion, env))) return error('Sin sesión', 401);
        return admin(peticion, env, ruta, metodo);
      }

      return new Response('No está', { status: 404 });
    } catch (e) {
      /* El detalle va al log de Cloudflare, no a la respuesta: un
         mensaje de la base cuenta el nombre de las tablas. */
      console.error(e);
      return error('Algo falló del lado del servidor', 500);
    }
  },

  /* ── LA LIMPIEZA DE LOS 12 MESES ───────────────────────────────

     Corre sola una vez por día (ver `triggers` en wrangler.jsonc).

     EL PLAZO ESTÁ DECLARADO ANTE META Y PUBLICADO EN /privacidad/. No es
     una decisión técnica que se pueda cambiar acá sin más: si cambia el
     número, cambia también la política y las respuestas en Meta el mismo
     día.

     SE CUENTA DESDE EL ÚLTIMO MENSAJE, no desde el primero: una
     conversación viva sigue sirviendo para la consulta en curso, y una
     que murió hace un año no le sirve a nadie.

     El CASCADE de la tabla se lleva los mensajes. */
  /* DOS TAREAS Y UN SOLO DISPARADOR, QUE SE REPARTEN POR LA HORA.

     La limpieza es diaria y corre de madrugada. Las estadísticas se
     refrescan cada media hora para que el panel esté al día sin que
     nadie entre: antes sólo se actualizaban cuando alguien abría la
     pestaña, así que el primero del día siempre veía datos de ayer.

     UNA TANDA POR VUELTA, Y NO TODO. Son treinta y pico de consultas y
     Cloudflare corta antes; además Instagram limita a 200 por hora.
     Avanzando de a poco, el recorrido completo se da solo en un par de
     horas y no se gasta casi nada. Dónde quedó se guarda, así que cada
     vuelta sigue por donde iba. */
  async scheduled(evento, env, _ctx) {
    const hora = new Date(evento.scheduledTime ?? Date.now()).getUTCHours();

    if (hora === 4) {
      const r = await env.DB.prepare(
        `DELETE FROM conversaciones WHERE ultimo < datetime('now','-12 months')`
      ).run();
      console.log(JSON.stringify({
        limpieza: 'conversaciones +12 meses',
        borradas: r.meta?.changes ?? 0,
      }));
    }

    if (!env.META_IG_TOKEN) return;
    try {
      const cursor = (await leerEstado(env, 'instagram_cursor'))?.valor ?? 0;
      const r = await actualizarNumeros(env, { desde: cursor });
      /* Al terminar la vuelta se arranca de nuevo desde el principio:
         los números de las publicaciones viejas también cambian. */
      await guardarEstado(env, 'instagram_cursor', r.siguiente ?? 0);
      console.log(JSON.stringify({
        estadisticas: 'actualizadas', desde: cursor, hasta: r.hechas, de: r.total,
      }));
    } catch (e) {
      console.error('No se pudieron refrescar las estadísticas:', e?.message ?? e);
    }
  },
};

/* ══════════════════════════════════════════════════════════════════
   LO QUE PIDE SESIÓN
   ══════════════════════════════════════════════════════════════════ */

/* Los campos que el panel puede escribir, con su forma. Es una lista
   BLANCA y no una negra: lo que no está acá no entra, así que agregar
   una columna a la base no abre sola una puerta para escribirla. */
const CAMPOS = {
  grupo:       (v) => (GRUPOS.includes(v) ? v : null),
  marca:       (v) => String(v ?? '').trim().slice(0, 60) || null,
  modelo:      (v) => String(v ?? '').trim().slice(0, 90) || null,
  anio:        (v) => entero(v, 1900, 2100),
  km:          (v) => entero(v, 0, 2000000),
  precio:      (v) => entero(v, 0, 100000000),
  moneda:      (v) => (['USD', 'ARS'].includes(v) ? v : 'USD'),
  motor:       (v) => texto(v, 60),
  transmision: (v) => texto(v, 40),
  combustible: (v) => texto(v, 40),
  color:       (v) => texto(v, 40),
  descripcion: (v) => texto(v, 4000),
  estado:      (v) => (['borrador', 'publicado', 'vendido'].includes(v) ? v : 'borrador'),
};

const texto = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

const entero = (v, min, max) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/* Marca y modelo son lo único obligatorio. El resto puede faltar: un
   auto se carga de a poco y por eso existe el estado `borrador`.
   Publicar sí exige lo mínimo para que la ficha no salga coja. */
function revisar(datos, cuerpo) {
  if (!datos.marca || !datos.modelo) return 'Marca y modelo son obligatorios';
  if (!datos.grupo) return 'Elegí un grupo';
  if (datos.estado === 'publicado' && (datos.precio === null && !cuerpo.sinPrecio))
    return 'Para publicar hace falta el precio, o marcarlo como "a consultar"';
  return null;
}

function limpiar(cuerpo) {
  const salida = {};
  for (const [campo, filtro] of Object.entries(CAMPOS)) salida[campo] = filtro(cuerpo[campo]);
  return salida;
}

/* Las listas cerradas del embudo. Tienen que coincidir con los CHECK de
   esquema/009-embudo.sql: si se agrega una acá y no allá, la base la
   rechaza. Las etapas van EN ORDEN, porque de ese orden salen los
   acumulados del panel. */
const TIPOS_EMBUDO = ['comprador', 'vendedor', 'permuta', 'ruido'];
const ETAPAS = ['consulta', 'charla', 'precio', 'visita', 'vino', 'cerrado'];

async function admin(peticion, env, ruta, metodo) {
  /* ══════════════════════════════════════════════════════════════
     LA BANDEJA DE MENSAJES
     ══════════════════════════════════════════════════════════════

     NINGUNA DE ESTAS DIRECCIONES LLEVA UN TELÉFONO NI UN USUARIO. Se
     navega por el `id` interno de la conversación, que no dice nada de
     nadie. El dato personal viaja en el cuerpo de la respuesta —sobre
     HTTPS y detrás de la sesión— y nunca en la URL, que termina en el
     log de Cloudflare y en el historial del navegador. */

  /* La lista: lo último arriba, con una línea de adelanto. */
  if (ruta === '/api/admin/chats' && metodo === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.canal, c.externo_id, c.nombre, c.humano, c.nota, c.ultimo,
              c.tipo, c.etapa, c.perdido,
              (SELECT m.texto FROM mensajes m
                WHERE m.conversacion_id = c.id
                ORDER BY m.creado DESC, m.id DESC LIMIT 1) AS adelanto,
              /* De qué clase fue lo último. La lista marca si lo que
                 quedó sin contestar es un comentario público o un
                 privado: no se atienden igual ni se contestan igual. */
              (SELECT m.clase FROM mensajes m
                WHERE m.conversacion_id = c.id
                ORDER BY m.creado DESC, m.id DESC LIMIT 1) AS clase,
              (SELECT COUNT(*) FROM mensajes m
                WHERE m.conversacion_id = c.id) AS cantidad
         FROM conversaciones c
        ORDER BY c.ultimo DESC
        LIMIT 200`
    ).all();
    return json({ chats: results });
  }

  /* Un chat con su historial. */
  const unChat = ruta.match(/^\/api\/admin\/chats\/(\d+)$/);
  if (unChat && metodo === 'GET') {
    const chat = await env.DB
      .prepare('SELECT * FROM conversaciones WHERE id = ?')
      .bind(unChat[1]).first();
    if (!chat) return error('No está', 404);

    const { results } = await env.DB.prepare(
      `SELECT id, direccion, autor, tipo, texto, creado
         FROM mensajes WHERE conversacion_id = ?
        ORDER BY creado, id`
    ).bind(unChat[1]).all();

    return json({ chat, mensajes: results });
  }

  /* PASAR UNA CONVERSACIÓN A UNA PERSONA.

     Son los dos casos que nos comprometimos a atender: alguien que pide
     hablar con una persona, y alguien que pide que le borremos los
     datos. Con `humano` en 1 la IA deja de contestar ese chat y la nota
     deja asentado por qué. */
  const aHumano = ruta.match(/^\/api\/admin\/chats\/(\d+)\/humano$/);
  if (aHumano && metodo === 'POST') {
    const cuerpo = await peticion.json().catch(() => ({}));
    const prendido = cuerpo?.humano === false ? 0 : 1;
    const nota = texto(cuerpo?.nota, 200);

    const r = await env.DB.prepare(
      'UPDATE conversaciones SET humano = ?, nota = ? WHERE id = ?'
    ).bind(prendido, nota, aHumano[1]).run();

    if (!r.meta.changes) return error('No está', 404);
    return json({ ok: true, humano: prendido });
  }

  /* QUE CLAUDE ESCRIBA UN BORRADOR.

     DEVUELVE EL TEXTO, NO LO MANDA. Queda escrito en el cuadro de
     respuesta y lo manda Tomás si le gusta. Una respuesta equivocada a
     un cliente no se puede deshacer, así que hasta que no se vea cómo
     contesta con gente de verdad, la última palabra es de una persona.
     Cuando esté probado, se cambia una línea. */
  const sugerirA = ruta.match(/^\/api\/admin\/chats\/(\d+)\/sugerir$/);
  if (sugerirA && metodo === 'POST') {
    try {
      return json(await borradorDeRespuesta(env, sugerirA[1]));
    } catch (e) {
      return error(e?.message || 'No se pudo escribir la respuesta', 502);
    }
  }

  /* ── PROBAR LA DECISIÓN SIN MANDAR NADA ──────────────────────────

     El bot ya contesta solo, y lo único que no se puede revisar después
     de que mandó es lo que mandó. Esto corre la misma decisión sobre las
     conversaciones que YA están guardadas y devuelve qué haría con cada
     una: a quién le escribiría, a quién no y con qué texto.

     Es la única forma honesta de mirarlo: son comentarios y mensajes
     reales de gente real, no ejemplos inventados por mí que el bot va a
     acertar porque los escribí pensando en él.

     NO MANDA. Ni marca nada. Se puede correr las veces que haga falta.
     Cuesta una llamada a Claude por conversación, así que de a diez. */
  if (ruta === '/api/admin/chats/probar' && metodo === 'POST') {
    const pedido = await peticion.json().catch(() => ({}));
    const cuantas = Math.min(Number(pedido?.cuantas) || 10, 25);

    const { results: chats } = await env.DB.prepare(
      `SELECT c.id, c.nombre, m.clase, m.texto
         FROM conversaciones c
         JOIN mensajes m ON m.id = (
              SELECT id FROM mensajes
               WHERE conversacion_id = c.id AND texto IS NOT NULL
               ORDER BY creado DESC, id DESC LIMIT 1)
        WHERE c.humano = 0 AND m.direccion = 'entrante'
        ORDER BY c.ultimo DESC
        LIMIT ?`
    ).bind(cuantas).all();

    const salida = [];
    for (const c of chats ?? []) {
      try {
        const d = await pensarRespuesta(env, c.id, { decidiendo: true });
        salida.push({
          chat: c.id, nombre: c.nombre, clase: c.clase,
          le_dijo: c.texto, responder: d.responder,
          derivar: d.derivar, texto: d.texto,
        });
      } catch (e) {
        salida.push({
          chat: c.id, nombre: c.nombre, clase: c.clase,
          le_dijo: c.texto, falla: e?.message ?? String(e),
        });
      }
    }

    return json({ probadas: salida.length, decisiones: salida });
  }

  /* CONTESTAR DESDE EL PANEL.

     EL ERROR DE META VUELVE TAL CUAL. Si se venció la ventana de 24
     horas, si falta un permiso o si el token murió, la API lo dice con
     todas las letras y eso es lo que tiene que leer el que está
     atendiendo. Un "no se pudo enviar" lo deja adivinando.

     SE GUARDA DESPUÉS DE QUE META CONFIRMA, no antes: si se guardara
     primero, un envío fallido quedaría en la conversación como si la
     persona lo hubiera recibido, y en una semana nadie se acuerda. */
  const responderA = ruta.match(/^\/api\/admin\/chats\/(\d+)\/responder$/);
  if (responderA && metodo === 'POST') {
    const cuerpo = await peticion.json().catch(() => ({}));
    const mensaje = texto(cuerpo?.texto, 1000);
    if (!mensaje) return error('Falta el texto');

    const chat = await env.DB
      .prepare('SELECT id, canal, externo_id FROM conversaciones WHERE id = ?')
      .bind(responderA[1]).first();
    if (!chat) return error('No está', 404);
    if (chat.canal !== 'instagram') {
      return error('Por ahora sólo se puede contestar por Instagram', 400);
    }

    let envio;
    try {
      envio = await mandarPorInstagram(env, chat.externo_id, mensaje);
    } catch (e) {
      return error(e?.message || 'Instagram no aceptó el mensaje', 502);
    }

    /* `autor: persona` porque esto lo escribió alguien del equipo en el
       panel. Cuando conteste la IA, va a escribir 'ia' y se va a poder
       distinguir una de otra mirando la conversación. */
    await guardarSaliente(env, chat.id, mensaje, 'persona', envio?.message_id);
    return json({ ok: true });
  }

  /* QUÉ CONTESTA INSTAGRAM, CRUDO.

     Para cuando "no devuelve nada" y hay que saber si el problema es el
     token, un permiso o el parámetro con el que se pregunta. Prueba las
     mismas llamadas que usa la sincronización y devuelve lo que vino,
     sin interpretarlo: interpretar es justo lo que falla cuando uno no
     entiende qué está pasando.

     NO ES PARA DEJAR PUESTO. Devuelve nombres de usuario y debería irse
     cuando Instagram entre solo. */
  if (ruta === '/api/admin/instagram/diagnostico' && metodo === 'GET') {
    const pruebas = {};
    const probar = async (nombre, camino) => {
      try { pruebas[nombre] = await igLlamar(env, camino); }
      catch (e) { pruebas[nombre] = { fallo: e?.message ?? String(e) }; }
    };

    await probar('quien_soy', '/me?fields=id,username,followers_count,media_count');

    /* QUÉ MÉTRICAS EXISTEN DE VERDAD. Los nombres cambiaron entre
       versiones de la API —`impressions` se fue, `plays` pasó a
       `views`— así que en vez de suponer, se piden y el que no exista
       contesta con su propio error diciendo cuáles valen. */
    await probar('cuenta_dia',
      '/me/insights?metric=reach,profile_views,accounts_engaged,total_interactions&period=day');
    await probar('cuenta_publico',
      '/me/insights?metric=follower_demographics&period=lifetime' +
      '&metric_type=total_value&breakdown=age,gender');

    /* Y las de UNA publicación: las de arriba son de la cuenta entera y
       lo que importa para medir un reel es el reel. Se toma la última
       en vez de una fija, para que esto siga sirviendo mañana. */
    const ultimas = await igLlamar(env, '/me/media?fields=id,media_type,timestamp&limit=1')
      .catch(() => null);
    const unaMedia = ultimas?.data?.[0];
    pruebas.media_probada = unaMedia ?? null;

    if (unaMedia?.id) {
      await probar('metricas_de_esa_publicacion',
        `/${unaMedia.id}/insights?metric=reach,likes,comments,shares,saved,views,total_interactions`);
    }

    return json(pruebas);
  }

  /* LOS NÚMEROS DE INSTAGRAM.

     Tarda: son muchas llamadas —una por publicación— y Instagram no es
     rápido. Por eso el panel lo pide cuando se abre la pestaña y no en
     cada vista. */
  /* LO GUARDADO, AL INSTANTE. No consulta a Instagram: devuelve lo
     último que se leyó y de cuándo es. Un dato viejo a la vista le gana
     a uno nuevo dentro de quince segundos, siempre que se diga la
     fecha. */
  if (ruta === '/api/admin/instagram/numeros' && metodo === 'GET') {
    const g = await leerEstado(env, 'instagram_numeros');
    return json(g ? { ...g.valor, leido: g.cuando } : { vacio: true });
  }

  /* Y la actualización, una tanda por pedido. */
  if (ruta === '/api/admin/instagram/numeros' && metodo === 'POST') {
    const cuerpo = await peticion.json().catch(() => ({}));
    try {
      return json(await actualizarNumeros(env, { desde: Number(cuerpo?.desde) || 0 }));
    } catch (e) {
      return error(e?.message || 'No se pudieron leer las estadísticas', 502);
    }
  }

  /* TRAER LO QUE HAY EN INSTAGRAM, a mano.

     Es el puente hasta que la app esté publicada: mientras Meta no
     avise, esto pregunta. No corre solo a propósito —ver el comentario
     de `traerDeInstagram`— y se dispara desde un botón del panel. */
  if (ruta === '/api/admin/instagram/traer' && metodo === 'POST') {
    try {
      /* Las dos cosas de una. Separarlas en dos botones obliga a saber
         que existen dos puertas —privados y comentarios— y eso es
         nuestro problema, no de quien usa el panel.

         Los privados sólo en la primera tanda: son pocos y no hace
         falta repetirlos en cada vuelta. */
      const cuerpo = await peticion.json().catch(() => ({}));
      const desde = Number(cuerpo?.desde) || 0;

      const r = desde === 0 ? await traerDeInstagram(env) : {};
      const c = await traerComentariosDeInstagram(env, { desde });

      /* LAS FECHAS SE ACOMODAN EN CADA TANDA, no sólo al final.
         Antes esto corría recién al terminar todo, así que un corte a
         la mitad dejaba el historial entero fechado como de hoy. Es
         sólo base de datos: no gasta llamadas y puede repetirse. */
      await env.DB.prepare(
        `UPDATE conversaciones SET ultimo = COALESCE(
           (SELECT MAX(m.creado) FROM mensajes m
             WHERE m.conversacion_id = conversaciones.id),
           ultimo)
         WHERE canal = 'instagram'`
      ).run();

      return json({ ok: true, ...r, comentarios: c });
    } catch (e) {
      return error(e?.message || 'No se pudo consultar a Instagram', 502);
    }
  }

  /* EL EMBUDO DE UNA CONVERSACIÓN: qué vino a hacer, hasta dónde llegó
     y si se perdió. Solo valores de una lista cerrada —ver
     esquema/009-embudo.sql—: lo que no está en la lista se rechaza en
     vez de guardarse a medias. Mandar null en `tipo` o `etapa` los
     vuelve a "sin marcar", para poder corregir un error. */
  const embudoDe = ruta.match(/^\/api\/admin\/chats\/(\d+)\/embudo$/);
  if (embudoDe && metodo === 'POST') {
    const cuerpo = await peticion.json().catch(() => ({}));
    const tipo = cuerpo?.tipo ?? null;
    const etapa = cuerpo?.etapa ?? null;
    if (tipo !== null && !TIPOS_EMBUDO.includes(tipo)) return error('Tipo desconocido');
    if (etapa !== null && !ETAPAS.includes(etapa)) return error('Etapa desconocida');
    const perdido = cuerpo?.perdido ? 1 : 0;

    const r = await env.DB.prepare(
      `UPDATE conversaciones
          SET tipo = ?, etapa = ?, perdido = ?, etapa_cambio = datetime('now')
        WHERE id = ?`
    ).bind(tipo, etapa, perdido, embudoDe[1]).run();

    if (!r.meta.changes) return error('No está', 404);
    return json({ ok: true });
  }

  /* LOS NÚMEROS DEL MES. Cuenta las conversaciones que EMPEZARON ese mes
     —no las que se movieron—, así cada mes es una camada que se puede
     seguir hasta el final. Devuelve los conteos crudos; los acumulados
     ("cuántos llegaron al menos a la visita") se arman en el panel.

     El mes va en la dirección y está bien: "2026-10" no dice nada de
     nadie. */
  if (ruta === '/api/admin/embudo' && metodo === 'GET') {
    const mes = new URL(peticion.url).searchParams.get('mes') ?? '';
    if (!/^\d{4}-\d{2}$/.test(mes)) return error('El mes va como 2026-10');

    const { results } = await env.DB.prepare(
      `SELECT tipo, etapa, perdido, COUNT(*) AS cantidad
         FROM conversaciones
        WHERE substr(creado, 1, 7) = ?
        GROUP BY tipo, etapa, perdido`
    ).bind(mes).all();

    return json({ mes, filas: results, etapas: ETAPAS, tipos: TIPOS_EMBUDO });
  }

  /* EL BORRADO A PEDIDO.

     El compromiso publicado dice: todo lo que se guarde de una persona
     tiene que poder borrarse entero —conversaciones y datos de
     contacto—, buscándolo por teléfono o usuario, dentro de los 10 días
     hábiles.

     EL IDENTIFICADOR VA EN EL CUERPO Y NO EN LA DIRECCIÓN, por lo mismo
     de arriba: un teléfono en la URL queda escrito en los logs.

     BORRA EN LOS TRES CANALES de una. Si la misma persona escribió por
     WhatsApp y por Instagram con el mismo identificador, se va todo.
     El CASCADE se lleva los mensajes. */
  if (ruta === '/api/admin/olvidar' && metodo === 'POST') {
    const cuerpo = await peticion.json().catch(() => ({}));
    const externo = String(cuerpo?.externo ?? '').trim();
    if (!externo) return error('Falta el teléfono o usuario');

    const r = await env.DB
      .prepare('DELETE FROM conversaciones WHERE externo_id = ?')
      .bind(externo).run();

    /* Queda asentado que se cumplió, sin anotar de quién: el pedido se
       registra, el dato borrado no vuelve a escribirse en ningún lado. */
    console.log(JSON.stringify({
      borrado_a_pedido: true, conversaciones: r.meta.changes,
    }));

    return json({ ok: true, borradas: r.meta.changes });
  }
  /* ── el listado del panel: TODO, no sólo lo publicado ── */
  if (ruta === '/api/admin/autos' && metodo === 'GET') {
    /* MISMO ORDEN QUE EL SITIO, y no por fecha de edición como antes.
       El panel es donde se arrastra la lista para dejarla como se quiere
       ver; si acá se mostrara en otro orden, arrastrar sería adivinar. */
    const { results } = await env.DB
      .prepare('SELECT * FROM autos ORDER BY orden, creado DESC').all();
    return json({ autos: await conFotos(env, results) });
  }

  /* ── GUARDAR EL ORDEN ──────────────────────────────────────────

     Llega la lista de ids TAL COMO QUEDÓ EN PANTALLA. Puede ser la lista
     entera o la de un solo grupo.

     SI ES UN GRUPO, SE PERMUTAN SÓLO SUS LUGARES. Se leen las posiciones
     que esos autos ya ocupaban en la lista general, se ordenan, y se
     reparten en el orden nuevo. Los autos que no vinieron no se mueven:
     reordenar "Alta gama" no puede reacomodar el resto de la lista.

     Se escribe con posiciones de 10 en 10 —0, 10, 20…— para que quede
     lugar entre dos sin tener que renumerar todo. */
  if (ruta === '/api/admin/autos/orden' && metodo === 'PUT') {
    const cuerpo = await peticion.json().catch(() => null);
    const ids = Array.isArray(cuerpo?.ids) ? cuerpo.ids.map(Number) : null;
    if (!ids || !ids.length) return error('Falta la lista');
    if (ids.some((n) => !Number.isInteger(n) || n <= 0)) return error('Lista inválida');
    if (new Set(ids).size !== ids.length) return error('Hay ids repetidos');
    if (ids.length > 500) return error('Son demasiados');

    /* SE TRABAJA SOBRE LA LISTA ENTERA, aunque lleguen los de un grupo.

       La clave es qué LUGARES ocupa el conjunto que llegó dentro de la
       lista general. Reordenar "Alta gama" tiene que permutar los autos
       entre esos lugares y no tocar ninguno más: si los tres de alta
       gama están 1º, 4º y 6º, después de reordenar siguen estando 1º, 4º
       y 6º — con otros autos adentro, pero en los mismos lugares. Lo que
       hay en 2º, 3º y 5º no se entera. */
    const { results: todos } = await env.DB
      .prepare('SELECT id FROM autos ORDER BY orden, creado DESC').all();

    const puestoDe = new Map(todos.map((a, i) => [a.id, i]));
    if (ids.some((id) => !puestoDe.has(id))) return error('Algún auto no existe', 404);

    /* Los lugares del conjunto, en el orden en que estaban. */
    const lugares = ids.map((id) => puestoDe.get(id)).sort((a, b) => a - b);

    const fila = todos.map((a) => a.id);
    lugares.forEach((lugar, k) => { fila[lugar] = ids[k]; });

    /* SE REESCRIBE TODO Y NO SÓLO LO QUE SE MOVIÓ.

       Los autos ya cargados arrancan todos en 0 y entre ellos desempata
       la fecha; mientras haya empates, "el lugar que ocupa" depende de
       ese desempate y cualquier cuenta sobre los números viejos se
       ensucia. Numerar la lista completa de 10 en 10 deja una posición
       propia por auto y el problema desaparece para siempre. Son unas
       decenas de filas: cuesta menos que llevar la cuenta. */
    await env.DB.batch(fila.map((id, i) => env.DB
      .prepare('UPDATE autos SET orden = ? WHERE id = ?')
      .bind(i * 10, id)));

    return json({ ok: true });
  }

  if (ruta === '/api/admin/autos' && metodo === 'POST') {
    const cuerpo = await peticion.json().catch(() => ({}));
    const datos = limpiar(cuerpo);
    const mal = revisar(datos, cuerpo);
    if (mal) return error(mal);

    const campos = Object.keys(datos);
    const { meta } = await env.DB.prepare(
      `INSERT INTO autos (${campos.join(',')})
       VALUES (${campos.map(() => '?').join(',')})`
    ).bind(...campos.map((c) => datos[c])).run();

    return json({ id: meta.last_row_id }, 201);
  }

  const uno = ruta.match(/^\/api\/admin\/autos\/(\d+)$/);

  if (uno && metodo === 'PUT') {
    const cuerpo = await peticion.json().catch(() => ({}));
    const datos = limpiar(cuerpo);
    const mal = revisar(datos, cuerpo);
    if (mal) return error(mal);

    const campos = Object.keys(datos);
    const { meta } = await env.DB.prepare(
      `UPDATE autos SET ${campos.map((c) => `${c} = ?`).join(', ')},
              editado = datetime('now')
        WHERE id = ?`
    ).bind(...campos.map((c) => datos[c]), uno[1]).run();

    if (!meta.changes) return error('No está', 404);
    return json({ ok: true });
  }

  /* BORRAR ES DOS BORRADOS, Y EL ORDEN IMPORTA. Las filas de fotos se
     van solas por el ON DELETE CASCADE, pero los archivos de R2 no: eso
     la base no lo puede hacer. Se leen las llaves ANTES de borrar la
     fila, porque después ya no hay de dónde sacarlas — y si el borrado
     de R2 fallara, quedarían archivos huérfanos ocupando lugar sin que
     nadie sepa que están. */
  if (uno && metodo === 'DELETE') {
    const { results: fotos } = await env.DB
      .prepare('SELECT clave FROM fotos WHERE auto_id = ?').bind(uno[1]).all();

    const { meta } = await env.DB.prepare('DELETE FROM autos WHERE id = ?')
      .bind(uno[1]).run();
    if (!meta.changes) return error('No está', 404);

    await borrarArchivos(env, fotos.map((f) => f.clave));
    return json({ ok: true });
  }

  /* ── SUBIR UNA FOTO ───────────────────────────────────────────────
     Llega ya achicada y en WebP desde el panel, en dos tamaños: el de
     la ficha y el de la grilla. Se guardan los dos bajo la misma llave
     base y con el sufijo del ancho, así una sola fila de la base alcanza
     para las dos. */
  const subir = ruta.match(/^\/api\/admin\/autos\/(\d+)\/fotos$/);
  if (subir && metodo === 'POST') {
    const auto = await env.DB.prepare('SELECT id FROM autos WHERE id = ?')
      .bind(subir[1]).first();
    if (!auto) return error('Ese auto no existe', 404);

    const form = await peticion.formData();
    const base = `autos/${auto.id}/${crypto.randomUUID()}`;

    for (const tam of TAMANOS) {
      const parte = form.get(tam);
      if (!(parte instanceof File)) return error(`Falta la imagen de ${tam}px`);
      if (parte.size > 3 * 1024 * 1024) return error('Esa foto pesa demasiado');
      await env.FOTOS.put(`${base}-${tam}.webp`, parte.stream(), {
        httpMetadata: { contentType: 'image/webp' },
      });
    }

    /* Al final de la fila, sin pisarle el lugar a las que ya están. */
    const ultimo = await env.DB
      .prepare('SELECT COALESCE(MAX(orden), -1) AS n FROM fotos WHERE auto_id = ?')
      .bind(auto.id).first();

    const { meta } = await env.DB.prepare(
      'INSERT INTO fotos (auto_id, clave, orden) VALUES (?, ?, ?)'
    ).bind(auto.id, base, ultimo.n + 1).run();

    await tocar(env, auto.id);
    return json({ id: meta.last_row_id, clave: base }, 201);
  }

  /* ── LAS IMÁGENES FIJAS DE LA HOME ────────────────────────────── */

  if (ruta === '/api/admin/medios' && metodo === 'GET') {
    const { results } = await env.DB
      .prepare('SELECT slot, variante, clave, clase, editado FROM medios').all();
    const puestas = new Map(results.map((m) => [`${m.slot}/${m.variante}`, m]));
    /* Van TODOS los lugares, tengan reemplazo o no: el panel necesita
       mostrar el lugar aunque siga con la foto original. Y van agrupados
       por sección y en el orden de la página, que es el único orden en
       el que alguien puede reconocer cuál es cuál. */
    return json({
      secciones: SECCIONES.map((s) => ({
        ...s,
        slots: Object.entries(SLOTS)
          .filter(([, v]) => v.seccion === s.clave)
          .map(([slot, v]) => ({
            slot, donde: v.donde, extra: v.extra || null,
            admite: v.admite || ['imagen'],
            /* Una entrada por pantalla, con su guía, su medida y lo que
               haya cargado. El panel dibuja una tarjeta por cada una. */
            pantallas: Object.entries(v.pantallas).map(([variante, d]) => {
              const hay = puestas.get(`${slot}/${variante}`);
              return {
                variante, guia: d.guia, lado: d.lado,
                clave: hay?.clave || null,
                clase: hay?.clase || null,
                editado: hay?.editado || null,
              };
            }),
          })),
      })),
    });
  }

  const medio = ruta.match(/^\/api\/admin\/medios\/([a-z0-9-]+)\/([a-z]+)$/);

  if (medio && metodo === 'POST') {
    const [, slot, variante] = medio;
    if (!SLOTS[slot]) return error('Ese lugar no existe', 404);
    if (!PANTALLAS.includes(variante) || !SLOTS[slot].pantallas[variante]) {
      return error('Ese lugar no tiene esa pantalla', 404);
    }

    const form = await peticion.formData();
    const parte = form.get('imagen');
    if (!(parte instanceof File)) return error('Falta el archivo');

    const clase = claseDe(parte.type);
    if (!clase) return error('Ese tipo de archivo no se puede subir acá');

    const admite = SLOTS[slot].admite || ['imagen'];
    if (!admite.includes(clase)) {
      return error(clase === 'video'
        ? 'Ese lugar es sólo para fotos'
        : 'Ese lugar es sólo para videos');
    }

    const regla = TIPOS[clase];
    if (parte.size > regla.tope) {
      return error(`Ese archivo pesa demasiado — el tope es ${Math.round(regla.tope / 1048576)} MB`);
    }

    /* LA CLAVE LLEVA LA EXTENSIÓN. Antes se guardaba a medias y cada
       lugar que la usaba la completaba con `-1600.webp`; con videos de
       por medio eso deja de tener una respuesta única. Guardar la
       dirección entera saca esa regla repetida de encima. */
    const clave = `medios/${slot}/${variante}/${crypto.randomUUID()}.${EXTENSION[parte.type]}`;
    await env.FOTOS.put(clave, parte.stream(), {
      httpMetadata: { contentType: parte.type },
    });

    /* La anterior se borra DESPUÉS de que la nueva quedó guardada y la
       fila apunta a ella. Al revés, si algo falla en el medio, el sitio
       queda pidiendo un archivo que ya no está. */
    const antes = await env.DB
      .prepare('SELECT clave FROM medios WHERE slot = ? AND variante = ?')
      .bind(slot, variante).first();

    await env.DB.prepare(
      `INSERT INTO medios (slot, variante, clave, clase) VALUES (?, ?, ?, ?)
       ON CONFLICT(slot, variante) DO UPDATE SET clave = excluded.clave,
                                                 clase = excluded.clase,
                                                 editado = datetime('now')`
    ).bind(slot, variante, clave, clase).run();

    if (antes?.clave) await env.FOTOS.delete(antes.clave);
    return json({ clave, clase }, 201);
  }

  /* Volver a la original: se borra la fila y la página vuelve a usar la
     foto que trae escrita en el HTML. */
  if (medio && metodo === 'DELETE') {
    const [, slot, variante] = medio;
    const fila = await env.DB
      .prepare('SELECT clave FROM medios WHERE slot = ? AND variante = ?')
      .bind(slot, variante).first();
    if (!fila) return error('Ese lugar ya está con la original', 404);

    await env.DB.prepare('DELETE FROM medios WHERE slot = ? AND variante = ?')
      .bind(slot, variante).run();
    await env.FOTOS.delete(fila.clave);
    return json({ ok: true });
  }

  const foto = ruta.match(/^\/api\/admin\/fotos\/(\d+)$/);
  if (foto && metodo === 'DELETE') {
    const fila = await env.DB.prepare('SELECT auto_id, clave FROM fotos WHERE id = ?')
      .bind(foto[1]).first();
    if (!fila) return error('No está', 404);

    await env.DB.prepare('DELETE FROM fotos WHERE id = ?').bind(foto[1]).run();
    await borrarArchivos(env, [fila.clave]);
    await tocar(env, fila.auto_id);
    return json({ ok: true });
  }

  /* Reordenar: llega la lista de ids en el orden nuevo. Va en lote —una
     sola ida a la base— y no de a una consulta por foto. */
  const orden = ruta.match(/^\/api\/admin\/autos\/(\d+)\/fotos\/orden$/);
  if (orden && metodo === 'PUT') {
    const { ids } = await peticion.json().catch(() => ({}));
    if (!Array.isArray(ids)) return error('Falta la lista de fotos');

    await env.DB.batch(ids.map((id, i) =>
      env.DB.prepare('UPDATE fotos SET orden = ? WHERE id = ? AND auto_id = ?')
        .bind(i, id, orden[1])
    ));
    await tocar(env, orden[1]);
    return json({ ok: true });
  }

  return error('No está', 404);
}

const tocar = (env, id) =>
  env.DB.prepare("UPDATE autos SET editado = datetime('now') WHERE id = ?").bind(id).run();

/* Cada foto son DOS objetos en R2, uno por tamaño. */
const borrarArchivos = (env, claves) =>
  Promise.all(claves.flatMap((c) => TAMANOS.map((t) => env.FOTOS.delete(`${c}-${t}.webp`))));
