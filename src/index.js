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
import { PLANTILLAS, comoLasPideMeta, textoDe, IDIOMA } from './plantillas.js';
import { DurableObject } from 'cloudflare:workers';
import { PANEL } from './admin.js';
import { instruccionesDelBot } from './instrucciones.js';

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
  /* PARA WHATSAPP, EL JPG CHICO SI ESTÁ. Con el WebP de 1600 px la
     vista previa salía sin foto (Maxi, 29/10). */
  const ogJpg = a.fotos[0] && await env.FOTOS.head(`${a.fotos[0].clave}-og.jpg`).catch(() => null);
  const foto = !a.fotos[0]
    ? `${SITIO}/assets/video/portada-desktop-poster.jpg`
    : ogJpg
    ? `${SITIO}/fotos/${a.fotos[0].clave}-og.jpg`
    : `${SITIO}/fotos/${a.fotos[0].clave}-1600.webp`;

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
/* DE QUÉ ANUNCIO VINO, si vino de uno. Cada canal lo manda con otra
   forma; acá queda una sola: id, título y texto del anuncio. */
function anuncioDe(ref, canal) {
  if (!ref) return null;
  const a = canal === 'whatsapp'
    ? { id: ref.source_id ?? null, titulo: ref.headline ?? null, texto: ref.body ?? null }
    : { id: ref.ad_id ?? null, titulo: ref.ads_context_data?.ad_title ?? null, texto: null };
  return a.id || a.titulo || a.texto ? JSON.stringify(a) : null;
}

function mensajesDelAviso(aviso, nuestroId = null) {
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

        /* SOLO EL NUMERO POR EL QUE CONTESTAMOS.

           Una app de Meta puede estar suscrita a mas de un numero —el
           de prueba quedo suscrito de cuando se usaba— y todos entran
           por el mismo webhook. Atenderlos todos termina en lo peor que
           puede pasar: alguien le escribe a un numero y le contesta
           otro, porque el bot manda siempre por WHATSAPP_PHONE_ID.

           Pasa aca y no al contestar porque un mensaje que no vamos a
           poder contestar bien tampoco queremos guardarlo: ensucia la
           bandeja con charlas que nadie puede seguir.

           Si el aviso no dice a que numero entro, se atiende igual: no
           saberlo no es razon para tirarlo. */
        const entroA = valor.metadata?.phone_number_id;
        if (nuestroId && entroA && String(entroA) !== String(nuestroId)) continue;
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
            /* Una foto con leyenda trae texto igual: "este es el mío,
               tiene 40 mil km" es justo lo que el bot tiene que leer. */
            texto: m.text?.body ?? m[m.type]?.caption ?? null,
            clase: 'mensaje',
            media_id: null,
            anuncio: anuncioDe(m.referral, canal),
            /* Un audio: con qué pedirlo a Meta para pasarlo a texto. */
            audio: m.type === 'audio' && m.audio?.id ? { whatsappId: m.audio.id } : null,
            foto: m.type === 'image' && m.image?.id ? { whatsappId: m.image.id } : null,
          });
        }

        /* LO QUE CONTESTAN DESDE EL CELULAR, QUE TAMBIEN ES NUESTRO.

           Con la coexistencia el numero vive en dos lados a la vez: el
           panel y la app de WhatsApp del celular. Cuando alguien del
           equipo contesta desde el celular, Meta no lo manda como un
           mensaje mas: lo manda aparte, en 'smb_message_echoes'.

           SIN ESTO EL PANEL VE MEDIA CHARLA. Y es peor que incompleto:
           la IA no se entera de que ya le contestaron y vuelve a
           contestar lo mismo, encima de una persona.

           Guardarlos alcanza para las dos cosas. Van al contexto que lee
           la IA, y como `atenderSolo` solo contesta si el ultimo mensaje
           del chat es el que lo disparo, una respuesta desde el celular
           lo deja callado sin que haya que avisarle nada.

           `m.to` es el telefono del cliente: el eco va de nosotros hacia
           el, asi que la conversacion es la misma de siempre. */
        for (const m of valor.message_echoes ?? []) {
          salida.push({
            canal,
            externo_id: m.to,
            nombre: null,
            mensaje_id: m.id,
            tipo: tipoConocido(m.type),
            texto: m.text?.body ?? m[m.type]?.caption ?? null,
            clase: 'mensaje',
            media_id: null,
            direccion: 'saliente',
            autor: 'persona',
            desdeElCelular: true,
          });
        }
      }
    } else {
      for (const ev of entrada.messaging ?? []) {
        /* En Messenger e Instagram el anuncio puede llegar solo, al abrir
           la conversación, antes del primer mensaje. Se guarda igual. */
        if (!ev?.message && ev?.referral && ev.sender?.id) {
          salida.push({ canal, externo_id: ev.sender.id, nombre: null,
            soloAnuncio: true, anuncio: anuncioDe(ev.referral, canal) });
          continue;
        }
        if (!ev?.message || ev.message.is_echo) continue;
        salida.push({
          canal,
          externo_id: ev.sender?.id,
          nombre: null,
          mensaje_id: ev.message.mid,
          tipo: ev.message.text ? 'texto' : tipoConocido(ev.message.attachments?.[0]?.type),
          texto: ev.message.text ?? null,
          clase: 'mensaje',
          /* SI RESPONDE A UNA HISTORIA O COMPARTE UNA PUBLICACIÓN, de cuál
             (Maxi, 29/10: un "Info" a la historia del C300 es por el C300).
             La historia se borra a las 24 h: su imagen se guarda aparte
             para poder reconocer el auto (`historias`). */
          media_id: ev.message.reply_to?.story?.id
            ?? ev.message.attachments?.[0]?.payload?.reel_video_id
            ?? ev.message.attachments?.[0]?.payload?.ig_post_media_id
            ?? null,
          historiaUrl: ev.message.reply_to?.story?.url ?? null,
          anuncio: anuncioDe(ev.message.referral ?? ev.referral, canal),
          audio: ev.message.attachments?.[0]?.type === 'audio' && ev.message.attachments[0].payload?.url
            ? { url: ev.message.attachments[0].payload.url } : null,
          foto: ev.message.attachments?.[0]?.type === 'image' && ev.message.attachments[0].payload?.url
            ? { url: ev.message.attachments[0].payload.url } : null,
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
                 document: 'documento', file: 'documento',
                 location: 'ubicacion', text: 'texto' };
  const v = mapa[t] ?? t;
  return TIPOS_MENSAJE.includes(v) ? v : 'otro';
};

/* GUARDAR, SIN DUPLICAR.

   Meta reintenta el mismo aviso si no le contestamos 200 a tiempo, y
   reintentar es lo normal. Por eso el id de mensaje de Meta es UNIQUE en
   la tabla y acá se inserta con OR IGNORE: el segundo intento no escribe
   nada y no rompe.

   `ultimo` se pisa en cada mensaje porque es el reloj de los 12 meses de
   conservación.

   DEVUELVE QUÉ MENSAJES PRIVADOS ENTRARON RECIÉN, con su conversación:
   es lo que el bot necesita para saber a quién contestar. Un reintento
   de Meta no escribe nada y por eso no aparece: no se contesta dos veces
   el mismo mensaje. */
/* ¿YA ESTÁ LA COLUMNA DEL ANUNCIO? (esquema/012-anuncio.sql)
   La web se publica sola al subir código, y la base se cambia a mano:
   puede pasar que el código llegue antes que la columna. Sin esto, cada
   mensaje que entrara en ese rato fallaría al guardarse. Se pregunta una
   vez por arranque del Worker. */
let conAnuncio = null;
async function hayColumnaAnuncio(env) {
  if (conAnuncio === null) {
    const { results } = await env.DB.prepare('PRAGMA table_info(conversaciones)').all();
    conAnuncio = (results ?? []).some((c) => c.name === 'anuncio');
  }
  return conAnuncio;
}

async function guardarEntrantes(env, lista) {
  const audios = [];
  const fotos = [];
  const anuncioOk = await hayColumnaAnuncio(env);
  /* LAS CONVERSACIONES QUE HAY QUE CONTESTAR, y sólo ésas: dónde entró
     un mensaje NUEVO de la otra persona, privado o comentario, con el id
     de ese mensaje. "Nuevo" es literal: un reintento de Meta no escribe
     nada en la base (INSERT OR IGNORE) y por eso no aparece. */
  const disparos = [];
  for (const m of lista) {
    const conv = anuncioOk
      ? await env.DB.prepare(
        `INSERT INTO conversaciones (canal, externo_id, nombre, anuncio)
              VALUES (?, ?, ?, ?)
         ON CONFLICT (canal, externo_id) DO UPDATE SET
              ultimo = datetime('now'),
              nombre = COALESCE(excluded.nombre, conversaciones.nombre),
              anuncio = COALESCE(excluded.anuncio, conversaciones.anuncio)
           RETURNING id`
      ).bind(m.canal, m.externo_id, m.nombre, m.anuncio ?? null).first()
      : await env.DB.prepare(
        `INSERT INTO conversaciones (canal, externo_id, nombre)
              VALUES (?, ?, ?)
         ON CONFLICT (canal, externo_id) DO UPDATE SET
              ultimo = datetime('now'),
              nombre = COALESCE(excluded.nombre, conversaciones.nombre)
           RETURNING id`
      ).bind(m.canal, m.externo_id, m.nombre).first();

    if (!conv?.id || m.soloAnuncio) continue;

    if (m.media_id && m.historiaUrl) {
      const h = (await leerEstado(env, 'historias'))?.valor ?? {};
      h[m.media_id] = m.historiaUrl;
      await guardarEstado(env, 'historias', Object.fromEntries(Object.entries(h).slice(-200)));
    }

    /* `direccion` puede venir en el aviso: un comentario nuestro es
       saliente aunque llegue por el mismo webhook que los entrantes.
       Lo que no la trae es entrante, que es el caso normal. */
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO mensajes
         (conversacion_id, externo_id, direccion, autor, tipo, texto, clase, media_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      conv.id, m.mensaje_id ?? null, m.direccion ?? 'entrante', m.autor ?? null,
      m.tipo, m.texto, m.clase ?? 'mensaje', m.media_id ?? null
    ).run();

    /* SI ALGUIEN DEL EQUIPO ESCRIBE DESDE EL CELULAR, EL CHAT ES SUYO.
       Antes el bot se callaba sólo frente a ese mensaje y al siguiente
       del cliente volvía a contestar, encima de la persona (Ram, 28/10:
       el equipo se despidió y el bot le contestó al "Ok"). Ahora el chat
       pasa a "lo atiende una persona" y el bot no vuelve hasta que lo
       devuelvan desde el panel.
       LOS AUTOMÁTICOS DE LA APP NO CUENTAN. El saludo y el mensaje de
       ausencia de WhatsApp Business también llegan como eco, pero salen
       al instante; una persona tarda más. Por eso un eco a menos de 15
       segundos del último mensaje del cliente no toma el chat. */
    if (r.meta?.changes && m.desdeElCelular) {
      const ult = await env.DB.prepare(
        `SELECT (julianday('now') - julianday(MAX(creado))) * 86400 AS seg
           FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante'`
      ).bind(conv.id).first();
      if (ult?.seg == null || ult.seg > 15) {
        await env.DB.prepare(
          `UPDATE conversaciones SET humano = 1,
                  nota = COALESCE(nota, 'Lo tomó alguien del equipo desde el celular')
            WHERE id = ? AND humano = 0`
        ).bind(conv.id).run();
      }
    }

    if (r.meta?.changes && m.audio) audios.push({ fila: r.meta.last_row_id, ...m.audio });
    if (r.meta?.changes && m.foto) fotos.push({ fila: r.meta.last_row_id, texto: m.texto ?? null, ...m.foto });

    if (r.meta?.changes && (m.direccion ?? 'entrante') === 'entrante') {
      /* Si la misma persona mandó varios en un aviso, cuenta el último. */
      const previo = disparos.find((d) => d.conversacion === conv.id);
      if (previo) previo.mensaje = r.meta.last_row_id;
      else disparos.push({ conversacion: conv.id, canal: m.canal, mensaje: r.meta.last_row_id });
    }
  }
  /* Los audios nuevos viajan colgados de la lista, para pasarlos a texto
     antes de que conteste el bot (ver `transcribirAudios`). */
  disparos.audios = audios;
  disparos.fotos = fotos;
  return disparos;
}

/* ── LOS AUDIOS, A TEXTO ─────────────────────────────────────────

   Pedido de Maxi (28/10): que el bot entienda los audios. Los pasa a
   texto WHISPER, PERO EL DE CLOUDFLARE (Workers AI), no el de OpenAI: el
   audio no sale de Cloudflare, que ya está declarado ante Meta y en
   /privacidad/. Usar el de OpenAI sería sumar un proveedor, y eso pide
   antes cambiar la política (CLAUDE.md, regla 1).

   EL AUDIO NO SE GUARDA. Se baja de Meta, se pasa a texto y se descarta;
   en la base queda sólo el texto, en el mismo mensaje, como si lo
   hubiera escrito. Se borra con la conversación, como todo.

   SI FALLA, NO PASA NADA GRAVE: el mensaje queda como "[Mandó un audio]"
   y el bot hace lo de antes, pasarlo a una persona. */
const TOPE_AUDIO = 15 * 1024 * 1024;

/* Baja un archivo de Meta: un audio o una foto. Devuelve los bytes y de
   qué tipo son. */
async function bajarDeMeta(env, a) {
  if (a.whatsappId) {
    /* WhatsApp da primero la dirección, y después el archivo, los dos con
       el token: el link solo no alcanza. */
    if (!env.WHATSAPP_TOKEN) return null;
    const auth = { authorization: `Bearer ${env.WHATSAPP_TOKEN}` };
    const meta = await fetch(`${GRAPH}/${a.whatsappId}`, { headers: auth }).then((r) => r.json());
    if (!meta?.url) return null;
    const r = await fetch(meta.url, { headers: auth });
    return r.ok ? { bytes: await r.arrayBuffer(), tipo: meta.mime_type || r.headers.get('content-type') } : null;
  }
  if (a.url) {
    const r = await fetch(a.url);
    return r.ok ? { bytes: await r.arrayBuffer(), tipo: r.headers.get('content-type') } : null;
  }
  return null;
}

/* Base64 común, no el "url" de las sesiones: así lo piden la API de
   Anthropic y Workers AI. */
const aBase64Plano = (bytes) => {
  const crudo = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < crudo.length; i += 0x8000) s += String.fromCharCode(...crudo.subarray(i, i + 0x8000));
  return btoa(s);
};

/* ── LAS FOTOS, MIRADAS ───────────────────────────────────────────

   Pedido de Maxi (28/10): un cliente mandó la foto del tablero con
   104.455 km y el bot le volvió a preguntar los kilómetros. Ahora cada
   foto que llega la mira Claude (Anthropic, ya declarado) y deja una
   línea con lo que muestra: el odómetro, qué auto es, de qué lado. El bot
   lee esa línea y no pregunta lo que ya se ve.

   LA FOTO NO SE GUARDA, sólo la línea. Y la línea nunca lleva patentes,
   documentos ni datos de personas: se le pide así, porque guardar lo
   mínimo es un compromiso (CLAUDE.md, regla 3).

   Van todas a la vez: un cliente manda cinco fotos juntas, y una por
   una no entrarían en el tiempo que da Cloudflare antes de contestar. */
const TOPE_FOTO = 4.5 * 1024 * 1024;
const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MARCA_FOTO = '[Se ve: ';

async function describirFotos(env, fotos = []) {
  if (!env.ANTHROPIC_API_KEY || !fotos.length) return;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  await Promise.all(fotos.slice(0, 8).map(async (f) => {
    try {
      const bajado = await bajarDeMeta(env, f);
      const tipo = String(bajado?.tipo ?? '').split(';')[0].trim();
      if (!bajado || bajado.bytes.byteLength > TOPE_FOTO || !TIPOS_FOTO.includes(tipo)) return;
      const r = await client.messages.create({
        model: MODELO,
        max_tokens: 300,
        output_config: { effort: 'low' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: tipo, data: aBase64Plano(bajado.bytes) } },
            { type: 'text', text: `Un cliente de una concesionaria de autos mandó esta foto por chat. Describila en UNA línea corta, en castellano, con lo que le sirve a quien lo atiende: qué auto es (marca, modelo, color) y de qué lado se ve, o qué parte muestra. Si se ve el tablero, escribí los kilómetros EXACTOS del odómetro, tal cual se leen. Si se ve algún daño, decilo. Nunca escribas patentes, números de documento, nombres ni datos de personas. Sólo la línea, sin nada más.` },
          ],
        }],
      });
      const linea = (r.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join(' ')
        .replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!linea) return;
      const texto = (f.texto ? f.texto + '\n' : '') + MARCA_FOTO + linea + ']';
      await env.DB.prepare('UPDATE mensajes SET texto = ? WHERE id = ?').bind(texto, f.fila).run();
    } catch (e) {
      console.error('No se pudo mirar una foto:', e?.message ?? e);
    }
  }));
}

async function transcribirAudios(env, audios = []) {
  if (!env.AI || !audios.length) return;
  for (const a of audios) {
    try {
      const bajado = await bajarDeMeta(env, a);
      if (!bajado || bajado.bytes.byteLength > TOPE_AUDIO) continue;
      const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
        audio: aBase64Plano(bajado.bytes), language: 'es',
      });
      const texto = String(r?.text ?? '').trim().slice(0, 4000);
      if (texto) {
        await env.DB.prepare('UPDATE mensajes SET texto = ? WHERE id = ?').bind(texto, a.fila).run();
      }
    } catch (e) {
      console.error('No se pudo pasar un audio a texto:', e?.message ?? e);
    }
  }
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
  'Hola! Te escribimos por privado así te pasamos toda la info.',
  'Hola, cómo estás? Te mandamos un privado con todos los datos.',
  'Hola! Te acabamos de escribir por privado, fijate en tus mensajes.',
  'Gracias por escribir! Te hablamos por privado y te contamos todo.',
];

/* A UN ELOGIO SE LE AGRADECE EN PÚBLICO (Maxi, 28/10: "no está
   respondiendo los comentarios"). Con el mismo criterio que los avisos:
   texto nuestro, de una lista, nunca escrito por el modelo. */
const GRACIAS = [
  'Gracias!',
  'Muchas gracias!',
  'Gracias, un gusto!',
  'Gracias por bancarnos!',
  'Qué bueno que te guste, gracias!',
];

async function avisarEnElComentario(env, comentarioId, lista = AVISOS) {
  const texto = lista[Math.floor(Math.random() * lista.length)];
  return igLlamar(
    env,
    `/${comentarioId}/replies?message=${encodeURIComponent(texto)}`,
    { method: 'POST' }
  );
}

/* Deja asentado lo que mandamos, en la misma conversación.
   `autor` separa lo que escribió una persona de lo que escribió la IA:
   es el compromiso de que después se pueda ver quién respondió qué.
   `mediaId` marca la publicación por la que le escribimos (un privado por
   publicación); `tipo`, si no fue texto. */
async function guardarSaliente(env, conversacionId, texto, autor, mensajeId,
  { tipo = 'texto', mediaId = null } = {}) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO mensajes
       (conversacion_id, externo_id, direccion, autor, tipo, texto, media_id)
     VALUES (?, ?, 'saliente', ?, ?, ?, ?)`
  ).bind(conversacionId, mensajeId ?? null, autor, tipo, texto, mediaId ?? null).run();

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
      `/${c.id}?fields=messages.limit(25){id,created_time,from{id,username},to{id,username},message,attachments}`);

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
      /* UNA FOTO SIN TEXTO VIENE COMO MENSAJE VACÍO, con el adjunto
         aparte. Guardada como texto vacío desaparecía, y el bot volvía a
         pedir las fotos que el cliente ya había mandado. */
      const adjunto = m.attachments?.data?.[0];
      const tipo = m.message ? 'texto'
        : adjunto?.image_data ? 'imagen'
        : adjunto?.video_data ? 'video'
        : adjunto ? 'otro' : 'texto';
      const campos = ['conversacion_id', 'externo_id', 'direccion', 'autor', 'tipo', 'texto'];
      const valores = [
        fila.id, m.id,
        mio ? 'saliente' : 'entrante',
        mio ? 'persona' : null,
        tipo,
        m.message || null,
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

/* LA CHARLA DE ANTES, ANTES DE CONTESTAR (Maxi, 31/10: un cliente había
   dicho en septiembre que tenía un A250 2014, y el bot le contestó como
   a un desconocido). El webhook sólo trae lo nuevo: si de esta persona
   no hay nada guardado de antes de hoy, se le piden a Instagram sus
   últimos mensajes. Una sola vez por charla. */
async function historialDeInstagram(env, chat) {
  if (chat?.canal !== 'instagram') return;
  const viejo = await env.DB.prepare(
    `SELECT 1 FROM mensajes WHERE conversacion_id = ? AND creado < datetime('now','-2 hours') LIMIT 1`
  ).bind(chat.id).first();
  if (viejo) return;
  const ya = (await leerEstado(env, 'historial_ig'))?.valor ?? [];
  if (ya.includes(chat.id)) return;
  await guardarEstado(env, 'historial_ig', [...ya, chat.id].slice(-500));

  const r = await igLlamar(env, `/me/conversations?platform=instagram&user_id=${encodeURIComponent(chat.externo_id)}`
    + `&fields=messages.limit(25){id,created_time,from{id},message,attachments}`);
  for (const m of r?.data?.[0]?.messages?.data ?? []) {
    const suyo = m.from?.id === chat.externo_id;
    const adjunto = m.attachments?.data?.[0];
    const tipo = m.message ? 'texto' : adjunto?.image_data ? 'imagen' : adjunto?.video_data ? 'video' : adjunto ? 'otro' : 'texto';
    const campos = ['conversacion_id', 'externo_id', 'direccion', 'autor', 'tipo', 'texto'];
    const valores = [chat.id, m.id, suyo ? 'entrante' : 'saliente', suyo ? null : 'persona', tipo, m.message || null];
    const cuando = (m.created_time || '').replace('T', ' ').slice(0, 19);
    if (cuando) { campos.push('creado'); valores.push(cuando); }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO mensajes (${campos.join(', ')}) VALUES (${campos.map(() => '?').join(', ')})`
    ).bind(...valores).run();
  }
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

/* ══════════════════════════════════════════════════════════════════
   EL BOT
   ══════════════════════════════════════════════════════════════════

   QUÉ DICE Y CÓMO LO DICE ESTÁ EN src/instrucciones.js (y las
   presentaciones de cada auto en src/presentaciones.js). Acá está lo que
   lo rodea: qué historial ve, qué stock, de qué publicación o anuncio
   viene, y qué se hace con lo que contesta.

   HAIKU Y NO OPUS. Lo eligió Tomás y para esto cierra: son dos
   renglones de atención al cliente con las reglas servidas, no un
   problema difícil. Sale unas cuarenta veces más barato. */
const MODELO = 'claude-haiku-5-5';

/* CONTESTA EN UNA FORMA FIJA Y NO EN TEXTO SUELTO.
   Además del mensaje, el bot dice qué ficha de auto mandar, si lo tiene
   que seguir una persona y —en un comentario— si conviene escribirle y
   ponerle me gusta. Cada cosa en su campo: el código no interpreta nada.

   `partes`: cada una sale como un mensaje aparte, con pausas.
   `responder` y `megusta` sólo pesan en un comentario: a un privado se
   le contesta siempre. */
const FORMA_DE_RESPUESTA = {
  type: 'object',
  properties: {
    partes: { type: 'array', items: { type: 'string' } },
    ficha_de: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    pasar_a_persona: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    responder: { type: 'boolean' },
    megusta: { type: 'boolean' },
    ubicacion: { type: 'boolean' },
    ir_a_whatsapp: { type: 'boolean' },
    para_tasar: { anyOf: [{ type: 'string', enum: ['permuta', 'consignacion'] }, { type: 'null' }] },
    resumen_para_tasar: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    consulta_a_maxi: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    visita: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    visita_auto: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    visita_condiciones: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    interesado_reservado: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
  },
  required: ['partes', 'ficha_de', 'pasar_a_persona', 'responder', 'megusta', 'ubicacion',
    'ir_a_whatsapp', 'para_tasar', 'resumen_para_tasar', 'consulta_a_maxi', 'visita', 'visita_auto', 'visita_condiciones', 'interesado_reservado'],
  additionalProperties: false,
};

const FORMA_EN_TEXTO = `

TU RESPUESTA FINAL ES SÓLO UN OBJETO JSON, sin nada antes ni después
{"partes": ["primer mensaje", "segundo mensaje"], "ficha_de": número del auto o null, "pasar_a_persona": "motivo" o null, "responder": true, "megusta": false, "ubicacion": false, "ir_a_whatsapp": false, "para_tasar": null, "resumen_para_tasar": null, "consulta_a_maxi": null, "visita": null, "visita_auto": null, "visita_condiciones": null, "interesado_reservado": null}
Escribí "partes" siempre, aunque "responder" sea false: así se puede revisar
qué hubieras dicho.`;

/* TOLERANTE AL LEER, ESTRICTO AL DECIDIR.
   La respuesta es el texto que viene después de la última búsqueda, y del
   objeto JSON se toma de la primera llave a la última. Si no se entiende
   nada, vuelve sin partes y arriba se repregunta. */
function loQueDijo(respuesta) {
  const bloques = respuesta.content ?? [];
  const ultimaBusqueda = bloques.map((b) => b.type).lastIndexOf('web_search_tool_result');
  const final = bloques.slice(ultimaBusqueda + 1)
    .filter((b) => b.type === 'text').map((b) => b.text).join('');
  let dato = null;
  try { dato = JSON.parse(final.slice(final.indexOf('{'), final.lastIndexOf('}') + 1)); } catch { /* sin partes */ }
  const partes = (Array.isArray(dato?.partes) ? dato.partes : [])
    .map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 4);
  return { ...(dato ?? {}), partes };
}

/* LO QUE NO ES TEXTO, DICHO CON PALABRAS.
   Antes un audio o una foto desaparecían del historial que veía el bot,
   y entonces pedía las fotos que el cliente ya había mandado. Ahora
   sabe que llegaron, aunque no las vea. */
const NO_ES_TEXTO = {
  imagen: '[Mandó una foto]',
  audio: '[Mandó un audio]',
  video: '[Mandó un video]',
  documento: '[Mandó un archivo]',
  ubicacion: '[Mandó una ubicación]',
  otro: '[Mandó algo que no es texto]',
};

/* EL HISTORIAL EN TURNOS, ALTERNADOS Y EMPEZANDO POR LA PERSONA.
   La API pide que arranque el cliente, así que lo nuestro que haya antes
   se saltea. Y no puede terminar en un turno nuestro: si lo último lo
   escribimos nosotros, se le avisa al bot con una línea. */
/* EL DÍA EN BUENOS AIRES, "2026-10-28", de una fecha de la base
   ("2026-10-28 23:10:00", en UTC) o de ahora. Para saber si ya se saludó
   hoy: después de medianoche de acá es otro día, aunque en UTC no. */
function diaDeBsAs(sqlite) {
  const d = sqlite ? new Date(String(sqlite).replace(' ', 'T') + 'Z') : new Date();
  return new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/* "¡HOLA! QUIERO MÁS INFORMACIÓN." ES UNA CONSULTA DE CONSIGNACIÓN.
   Es el mensaje que Meta pone solo en el anuncio de consignaciones, que no
   deja cambiarlo (28/10). Maxi: si alguien arranca con eso, tal cual y con
   los dos signos del "Hola", viene a vender su auto. Se perdona la tilde y
   el punto final; los signos del "¡Hola!" no, que son lo que lo distingue
   de cualquier otro "hola, quiero info". */
function esDeConsignacion(texto) {
  const t = String(texto ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
  return /^¡hola! quiero mas informacion\.?$/.test(t);
}

/* ── EL TIEMPO QUE PASÓ, QUE ANTES SE PERDÍA ─────────────────────

   El historial iba sin una sola fecha. Una charla de hace una semana le
   llegaba al bot pegada a la de hoy, como si fuera todo seguido, y
   entonces arrastraba lo que había quedado pendiente. El 28/10 pasó
   justo eso: alguien escribió "Hola" y el bot volvió a pasar el chat a
   una persona por una pregunta del 21 que desde el 23 ya tiene
   respuesta.

   Ahora, cuando entre dos mensajes pasaron horas, se lo decimos. Sólo
   antes de uno del cliente: metido adentro de uno nuestro sonaría a que
   lo dijimos nosotros. */
const HUECO = 4 * 3600 * 1000;

function haceCuanto(ms) {
  const horas = Math.round(ms / 3600000);
  if (horas < 48) return `${horas} horas`;
  return `${Math.round(horas / 24)} días`;
}

function historialParaClaude(mensajes) {
  const turnos = [];
  let anteriorCuando = null;
  for (const m of mensajes) {
    const nuestro = m.direccion === 'saliente';
    let contenido = nuestro
      ? (m.tipo === 'texto' ? m.texto : m.texto && `[Le mandamos ${m.texto.toLowerCase()}]`)
      : m.tipo === 'texto' ? m.texto
      : m.tipo === 'audio' && m.texto ? `[Mandó un audio. Dice: «${m.texto}»]`
      : m.tipo === 'imagen' && m.texto?.includes(MARCA_FOTO) ? (() => {
          const i = m.texto.indexOf(MARCA_FOTO);
          const leyenda = m.texto.slice(0, i).trim();
          const seVe = m.texto.slice(i + MARCA_FOTO.length).replace(/\]$/, '');
          return `[Mandó una foto. Se ve: ${seVe}]` + (leyenda ? ` Escribió: «${leyenda}»` : '');
        })()
      /* UNA FOTO PUEDE VENIR CON UNA LEYENDA, y suele ser lo que hay que
         leer: "este es el mío, tiene 40 mil km". Llega en el mismo campo
         que el texto y se guardaba bien, pero acá se perdía: para todo lo
         que no fuera texto ni audio, el bot veía el cartel y nada más. */
      : m.texto ? `${NO_ES_TEXTO[m.tipo] ?? NO_ES_TEXTO.otro} Escribió: «${m.texto}»`
      : (NO_ES_TEXTO[m.tipo] ?? NO_ES_TEXTO.otro);
    if (!contenido) continue;

    const cuando = m.creado ? new Date(String(m.creado).replace(' ', 'T') + 'Z').getTime() : null;
    if (!nuestro && cuando && anteriorCuando && cuando - anteriorCuando >= HUECO) {
      contenido = `[Pasaron ${haceCuanto(cuando - anteriorCuando)} desde el mensaje de arriba]\n` + contenido;
    }
    if (cuando) anteriorCuando = cuando;

    const rol = nuestro ? 'assistant' : 'user';
    const anterior = turnos[turnos.length - 1];
    if (anterior?.role === rol) anterior.content += '\n' + contenido;
    else if (rol === 'user' || turnos.length) turnos.push({ role: rol, content: contenido });
  }

  if (turnos[turnos.length - 1]?.role === 'assistant') {
    turnos.push({
      role: 'user',
      content: '[No escribió nada nuevo desde nuestra última respuesta. Escribí un seguimiento corto sólo si suma algo.]',
    });
  }
  return turnos;
}

/* PIENSA LA RESPUESTA. NO MANDA NADA: eso lo decide quien la llama.
   Es una sola función para el borrador del panel, para la prueba sin
   mandar y para cuando contesta solo: el contexto que junta es el mismo,
   y dos copias garantizan que el día que se arregle una, la otra quede
   vieja. */
/* ── DE QUÉ AUTO ES UNA PUBLICACIÓN, UNA HISTORIA O UN ANUNCIO ────
   Maxi (29/10): "si escriben 'info' o 'precio' en una publicación del
   C300, ya tenés que saber que es el C300; nunca le vuelvas a preguntar
   por qué auto". Antes el bot dependía de que el texto de la publicación
   nombrara el modelo, y un reel con texto genérico lo dejaba a ciegas.
   Ahora:
   1. busca el modelo en el texto (rápido, sin costo);
   2. si no aparece, MIRA LA IMAGEN y la compara con el stock;
   3. si es de consignación ("vendé tu auto"), lo dice.
   Se resuelve una vez por publicación y queda guardado
   (`estado.publicaciones`). */
const CLAVES_CONSIGNACION = /consign|vend[eé] tu auto|vendemos tu auto|quer[eé]s vender tu|te lo vendemos/i;
const NO_DISTINGUE = /^(coupe|coupé|cabrio|cabriolet|sedan|plus|line|sport|mild|hybrid|sdrive|limited|lounge|gr|iii|ii|benz)$/;

function clavesDe(a) {
  const t = String(a.modelo ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 2 && !NO_DISTINGUE.test(x));
  const primera = t[0] ?? '';
  return /^\d+$/.test(primera) ? [String(a.marca ?? '').toLowerCase().split(/\s+/)[0]].filter(Boolean) : [primera].filter(Boolean);
}

async function deQueEs(env, clave, { texto = '', imagen = null } = {}) {
  if (!clave) return null;
  const guardadas = (await leerEstado(env, 'publicaciones'))?.valor ?? {};
  if (guardadas[clave]) return guardadas[clave];

  const { results: autos } = await env.DB.prepare(
    `SELECT id, marca, modelo, anio, estado FROM autos WHERE estado IN ('publicado','vendido')
      ORDER BY estado DESC, orden`
  ).all();
  const t = String(texto ?? '').toLowerCase();
  let res = null;

  if (CLAVES_CONSIGNACION.test(t)) res = { tipo: 'consignacion' };
  else if (t) {
    const coinciden = (autos ?? []).filter((a) => clavesDe(a).some((k) => new RegExp(`\\b${k}\\b`).test(t)));
    const publicados = coinciden.filter((a) => a.estado === 'publicado');
    const uno = publicados.length === 1 ? publicados[0] : coinciden.length === 1 ? coinciden[0] : null;
    if (uno) res = { tipo: 'auto', auto: uno.id };
  }

  if (!res && env.ANTHROPIC_API_KEY && (t || imagen)) {
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const r = await client.messages.create({
        model: MODELO,
        max_tokens: 200,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: ['auto', 'consignacion', 'general'] },
            auto: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          },
          required: ['tipo', 'auto'], additionalProperties: false,
        } } },
        messages: [{ role: 'user', content: [
          ...(imagen ? [{ type: 'image', source: { type: 'url', url: imagen } }] : []),
          { type: 'text', text: `Es una publicación, historia o anuncio de Manna Selected, una concesionaria de autos.
${t ? `Su texto: «${t.slice(0, 1500)}»` : 'No tiene texto.'}
Estos son nuestros autos (número, auto, estado):
${(autos ?? []).map((a) => `${a.id}: ${a.marca} ${a.modelo} ${a.anio ?? ''} (${a.estado})`).join('\n')}
Decí de cuál de estos autos es ("tipo": "auto" y su número), si es para que la gente nos deje su auto en consignación ("consignacion"), o si es general, de varios autos o de ninguno ("general"). Mirá la imagen si la hay.` },
        ] }],
      });
      const d = JSON.parse((r.content ?? []).find((b) => b.type === 'text')?.text ?? '{}');
      if (d.tipo === 'auto' && (autos ?? []).some((a) => a.id === d.auto)) res = { tipo: 'auto', auto: d.auto };
      else if (d.tipo === 'consignacion') res = { tipo: 'consignacion' };
      else res = { tipo: 'general' };
    } catch (e) {
      console.error('No se pudo reconocer la publicación:', e?.message ?? e);
    }
  }
  res = res ?? { tipo: 'general' };
  guardadas[clave] = res;
  await guardarEstado(env, 'publicaciones', Object.fromEntries(Object.entries(guardadas).slice(-400)));
  return res;
}

async function pensarRespuesta(env, conversacionId, { automatico = false, deNoche = false, seguimiento = false, soloDatos = false } = {}) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('Falta cargar ANTHROPIC_API_KEY en Cloudflare');
  }

  const chat = await env.DB
    .prepare(`SELECT canal, nombre${(await hayColumnaAnuncio(env)) ? ', anuncio' : ''}
                FROM conversaciones WHERE id = ?`)
    .bind(conversacionId).first();
  if (!chat) throw new Error('Esa conversación no está');
  let anuncio = null;
  try { anuncio = chat.anuncio ? JSON.parse(chat.anuncio) : null; } catch { /* viejo o roto */ }

  const { results: mensajes } = await env.DB.prepare(
    `SELECT direccion, autor, tipo, texto, clase, media_id, externo_id, creado
       FROM mensajes WHERE conversacion_id = ?
      ORDER BY creado, id`
  ).bind(conversacionId).all();

  /* Lo que tiene algo: un texto, o una foto o un audio aunque no traiga
     texto. Un mensaje vacío no le dice nada al bot. */
  const todos = (mensajes ?? []).filter((m) => m.texto || m.tipo !== 'texto');
  if (!todos.length) throw new Error('No hay nada que contestar todavía');

  const ultimo = todos[todos.length - 1];
  const esComentario = ultimo.clase === 'comentario';

  /* ── EL CONTEXTO DE UN COMENTARIO NO ES EL HILO ──────────────────

     Una "conversación" es una persona, no una charla: si alguien comentó
     cuarenta y seis veces en dieciséis publicaciones, las cuarenta y seis
     no son un diálogo seguido.

     UN COMENTARIO SE MIRA SOLO, contra su publicación: lo que esa persona
     escribió EN ESA publicación y nada más.

     UN PRIVADO SÍ ES UNA CHARLA, pero sólo con los privados, y los
     últimos veinte: más atrás ya no se está hablando de lo mismo. */
  const privados = todos.filter((m) => m.clase !== 'comentario').slice(-20);
  const hilo = esComentario
    ? todos.filter((m) => m.clase === 'comentario' && m.media_id === ultimo.media_id)
    : (privados.length ? privados : [ultimo]);

  const turnos = historialParaClaude(hilo);
  if (!turnos.length) throw new Error('No hay nada que contestar todavía');

  /* El primer mensaje de la persona en esta charla. */
  const primero = privados.find((m) => m.direccion === 'entrante' && m.texto);
  const deConsignacion = !esComentario && esDeConsignacion(primero?.texto);

  /* EL STOCK ENTERO, CON LO QUE EL CLIENTE PUEDE PREGUNTAR. */
  const { results: autos } = await env.DB.prepare(
    `SELECT a.id, a.marca, a.modelo, a.anio, a.km, a.precio, a.moneda,
            a.motor, a.transmision, a.combustible, a.color, a.descripcion,
            (SELECT COUNT(*) FROM fotos f WHERE f.auto_id = a.id) AS fotos
       FROM autos a WHERE a.estado = 'publicado'
      ORDER BY a.orden, a.creado DESC`
  ).all();

  /* LO RESERVADO CON SEÑA (Maxi, 29/10): sigue publicado, pero no se
     ofrece como disponible. Vive en `estado.reservados` porque la tabla
     de autos no tiene ese estado y agregarlo pide cambiar la base. */
  const reservadosIds = (await leerEstado(env, 'reservados'))?.valor ?? [];
  const reservados = (autos ?? []).filter((a) => reservadosIds.includes(a.id));

  /* LO QUE YA SE VENDIÓ, para no ofrecerlo (Maxi, 29/10: el bot seguía
     ofreciendo el 500C en Instagram, abajo de su publicación vieja). */
  const { results: vendidos } = await env.DB.prepare(
    `SELECT marca, modelo, anio FROM autos WHERE estado = 'vendido'
      AND COALESCE(editado, creado) > datetime('now','-180 days')`
  ).all();

  /* DE QUÉ PUBLICACIÓN SALE ESTO.
     En un comentario, la suya. En un privado, la del comentario que lo
     originó — pero sólo si fue de lo último que pasó: si hay que irse
     diez mensajes atrás, ya no es de eso que están hablando. */
  const origen = esComentario
    ? ultimo
    : [...todos].reverse().find((m) => m.media_id
        && Date.now() - new Date(String(m.creado).replace(' ', 'T') + 'Z').getTime() < 72 * HORAS);

  let posteo = null;
  let nuestro = null;
  let publicacion = null;

  if (origen?.media_id) {
    /* El texto sale de las estadísticas que ya tenemos guardadas, así
       que no cuesta una llamada a Instagram. */
    const guardado = (await leerEstado(env, 'instagram_numeros'))?.valor;
    posteo = (guardado?.publicaciones ?? [])
      .find((p) => p.id === origen.media_id)?.texto ?? null;

    /* Y SI NO ESTÁ GUARDADA, SE PREGUNTA. La gente comenta en posteos de
       hace meses, que no entraron en la última lectura. Una llamada y
       sólo cuando falta; si tampoco sale, se sigue sin ella. */
    let imagen = ((await leerEstado(env, 'historias'))?.valor ?? {})[origen.media_id] ?? null;
    const yaSabida = ((await leerEstado(env, 'publicaciones'))?.valor ?? {})[`ig:${origen.media_id}`];
    if (!posteo || (!yaSabida && !imagen)) {
      try {
        const m = await igLlamar(env, `/${origen.media_id}?fields=caption,media_url,thumbnail_url`);
        posteo = posteo ?? m?.caption ?? null;
        imagen = imagen ?? m?.thumbnail_url ?? m?.media_url ?? null;
      } catch (e) {
        console.error('No se pudo leer la publicación:', e?.message ?? e);
      }
    }
    publicacion = await deQueEs(env, `ig:${origen.media_id}`, { texto: posteo, imagen });

    /* Y EL COMENTARIO QUE PONEMOS NOSOTROS AL PUBLICAR, si hay: ahí
       suelen ir los datos que no entraron en la descripción. No las
       respuestas a la gente, que arrancan con la arroba. */
    const propio = await env.DB.prepare(
      `SELECT texto FROM mensajes
        WHERE media_id = ? AND clase = 'comentario' AND direccion = 'saliente'
          AND texto IS NOT NULL AND texto NOT LIKE '@%'
        ORDER BY creado, id LIMIT 1`
    ).bind(origen.media_id).first();
    nuestro = propio?.texto ?? null;
  }

  /* EL ANUNCIO TAMBIÉN SE RECONOCE, por si su título no dice el modelo. */
  const delAnuncio = !publicacion && anuncio && (anuncio.titulo || anuncio.texto)
    ? await deQueEs(env, `anuncio:${anuncio.id ?? `${anuncio.titulo}|${anuncio.texto}`.slice(0, 120)}`,
      { texto: [anuncio.titulo, anuncio.texto].filter(Boolean).join('\n') })
    : null;
  /* UN LINK A UNA PUBLICACIÓN NUESTRA DE INSTAGRAM, pegado en el chat
     (Maxi, 1/11: lo mandaron por WhatsApp y el bot pidió que le dijeran
     qué auto era). Se busca entre nuestras publicaciones por el código
     del link y se reconoce el auto por su texto. */
  let delLink = null;
  if (!publicacion && !delAnuncio) {
    const codigo = [...privados].reverse().map((m) => String(m.texto ?? '')
      .match(/instagram\.com\/(?:p|reel|reels)\/([\w-]+)/i)?.[1]).find(Boolean);
    if (codigo) {
      try {
        const media = await igLlamar(env, '/me/media?fields=id,permalink,caption&limit=50');
        const p = (media?.data ?? []).find((x) => String(x.permalink ?? '').includes(`/${codigo}`));
        if (p) {
          delLink = await deQueEs(env, `ig:${p.id}`, { texto: p.caption ?? '' });
          if (!posteo && p.caption) posteo = p.caption;
        }
      } catch (e) {
        console.error('No se pudo leer el link de Instagram:', e?.message ?? e);
      }
    }
  }
  const origenSabido = publicacion ?? delAnuncio ?? delLink;
  let deQueAuto = null;
  if (origenSabido?.tipo === 'auto') {
    const a = (autos ?? []).find((x) => x.id === origenSabido.auto)
      ?? await env.DB.prepare('SELECT id, marca, modelo, anio, estado FROM autos WHERE id = ?').bind(origenSabido.auto).first();
    if (a) deQueAuto = `[${a.id}] ${[a.marca, a.modelo, a.anio].filter(Boolean).join(' ')}`
      + (a.estado === 'vendido' ? ' (YA SE VENDIÓ)' : reservadosIds.includes(a.id) ? ' (RESERVADO CON SEÑA)' : '');
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const pedido = {
    model: MODELO,
    max_tokens: 4000,
    /* Esfuerzo bajo: son dos renglones de atención al cliente.
       SIN FORMATO FORZADO MIENTRAS PUEDE BUSCAR: las búsquedas traen
       citas, y las citas no conviven con un formato JSON forzado. La
       forma se pide en las instrucciones y se lee con tolerancia abajo. */
    output_config: { effort: 'low' },
    system: instruccionesDelBot({
      /* TODO LO QUE DIJO EL CLIENTE, no sólo lo de los últimos 20
         mensajes: lo que contó al principio de una charla larga (qué
         auto tiene, los km) se perdía y el bot lo volvía a preguntar. */
      loQueDijo: todos.filter((m) => m.clase !== 'comentario' && m.direccion === 'entrante' && m.texto)
        .map((m) => `[${String(m.creado).slice(5, 16)}] ${m.texto.replace(/\s+/g, ' ').slice(0, 300)}`)
        .slice(-80),
      autos: autos ?? [], posteo, nuestro, anuncio, canal: chat.canal,
      automatico, esComentario, deNoche, nombre: chat.nombre,
      deConsignacion: deConsignacion || origenSabido?.tipo === 'consignacion',
      deQueAuto,
      aprendizajes: await loAprendido(env),
      vendidos: (vendidos ?? []).map((a) => [a.marca, a.modelo, a.anio].filter(Boolean).join(' ')),
      reservados: reservados.map((a) => `[${a.id}] ${[a.marca, a.modelo, a.anio].filter(Boolean).join(' ')}`),
      porEntrar: ((await leerEstado(env, 'por_entrar'))?.valor ?? []).map((a) => a.texto),
      hoy: hoyEnBsAs(), seguimiento, soloDatos,
      tomados: ((await leerEstado(env, 'agenda'))?.valor ?? [])
        .filter((v) => v.chat !== conversacionId && v.visita.length > 10).map((v) => v.visita),
      /* Si ya le escribimos por privado, no vuelve a saludar. Lo decide
         el código y no el bot: en una charla larga, el bot se olvidaba. */
      yaHablamos: privados.some((m) => m.direccion === 'saliente'),
      /* "Hoy" es el día de Buenos Aires. Las fechas de la base son UTC. */
      saludamosHoy: privados.some((m) => m.direccion === 'saliente' && diaDeBsAs(m.creado) === diaDeBsAs()),
    }) + FORMA_EN_TEXTO,
    /* BUSCAR EN LA WEB, PARA NO INVENTAR: el modelo del auto del cliente
       (una versión, un motor) y, desde el 28/10, el tema que traiga a la
       charla (Maxi: "que converse de cualquier tema e investigue"). Se
       busca el tema, NUNCA a la persona, y lo hace Anthropic, que ya está
       declarado. Tres por respuesta como mucho. */
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: turnos,
  };

  let respuesta;
  try {
    respuesta = await client.messages.create(pedido);
  } catch (e) {
    /* Si la cuenta no tiene la búsqueda web habilitada, se contesta igual
       sin buscar y con el formato forzado. */
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    console.error('Sin búsqueda web:', e.message);
    const { tools, ...sinBuscar } = pedido;
    respuesta = await client.messages.create({
      ...sinBuscar,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: FORMA_DE_RESPUESTA } },
    });
  }

  /* Una búsqueda larga puede cortar el turno a la mitad (`pause_turn`):
     se le devuelve lo que llevaba para que siga, una vez. */
  if (respuesta.stop_reason === 'pause_turn') {
    respuesta = await client.messages.create({
      ...pedido,
      messages: [...turnos, { role: 'assistant', content: respuesta.content }],
    });
  }

  if (respuesta.stop_reason === 'refusal') {
    throw new Error('Claude no quiso contestar esta conversación');
  }

  /* ANTES DE DEJARLO MUDO, SE LE PREGUNTA DE NUEVO.
     Con la búsqueda web prendida la forma no se puede forzar: se pide en
     las instrucciones y a veces el bot contesta en texto suelto. Pasó el
     28/10 con un "hola, cómo estás" por Instagram: no hubo JSON, saltó el
     error y el cliente se quedó sin respuesta. Ahora se repregunta una vez
     sin buscar y con la forma obligada, que esa sí la garantiza la API.
     Un cliente esperando es peor que una respuesta sin cita. */
  let dato = loQueDijo(respuesta);
  if (!dato.partes.length) {
    /* Sin el texto del mensaje: en el log van el motivo del corte y los
       tipos de bloque, que alcanzan para entender qué pasó. */
    console.error('Sin JSON, repregunta:', JSON.stringify({
      motivo: respuesta.stop_reason,
      bloques: (respuesta.content ?? []).map((b) => b.type),
    }));
    const { tools: _sinUsar, ...sinBuscar } = pedido;
    respuesta = await client.messages.create({
      ...sinBuscar,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: FORMA_DE_RESPUESTA } },
    });
    dato = loQueDijo(respuesta);
  }

  /* SIN "¿" DE APERTURA, SIEMPRE. Es una regla de las instrucciones y
     igual se escapaba alguno (Hugo, 28/10): se saca acá, que no falla. */
  const partes = dato.partes.map((p) => String(p).replace(/¿/g, '').trim()).filter(Boolean);
  if (!partes.length) throw new Error('Claude no devolvió una respuesta');

  /* El número de auto se cruza con el stock: uno inventado o vendido no
     llega a ningún lado. */
  /* EL LINK DEL AUTO DEL QUE VIENE, AUNQUE EL BOT NO LO PIDA (Maxi, 1/11:
     "a algunos no les mandás el link del modelo por el que preguntaron").
     Si vino de la publicación o el anuncio de un auto publicado y no
     reservado, ese es el auto: el link sale (una sola vez, ver
     `linkSinRepetir`) salvo que la charla sea de una consignación. */
  const delOrigen = origenSabido?.tipo === 'auto' && !reservadosIds.includes(origenSabido.auto)
    && !deConsignacion ? origenSabido.auto : null;
  const auto = (autos ?? []).find((a) => a.id === dato.ficha_de)
    ?? (autos ?? []).find((a) => a.id === delOrigen);

  return {
    partes,
    texto: partes.join('\n\n'),
    autoId: auto?.id ?? null,
    derivar: dato.pasar_a_persona ? String(dato.pasar_a_persona).slice(0, 200) : null,
    /* A un privado se le contesta siempre; a un comentario, si el bot
       decide que hay algo concreto que contestar. */
    responder: esComentario ? dato.responder === true : dato.responder !== false,
    megusta: esComentario && dato.megusta === true,
    ubicacion: dato.ubicacion === true,
    /* Que siga por WhatsApp sin pasarlo a una persona: la Ranger, que se
       atiende sólo por ahí (ver AUTOS QUE NO ESTÁN EN EL SITIO). */
    irAWhatsapp: dato.ir_a_whatsapp === true,
    /* Un auto que dejan para evaluar, con lo que se juntó. */
    paraTasar: ['permuta', 'consignacion'].includes(dato.para_tasar) ? dato.para_tasar : null,
    resumenParaTasar: dato.resumen_para_tasar ? String(dato.resumen_para_tasar).slice(0, 300) : null,
    consulta: !esComentario && dato.consulta_a_maxi ? String(dato.consulta_a_maxi).slice(0, 400) : null,
    visita: !esComentario && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(dato.visita ?? '') ? dato.visita : null,
    visitaAuto: dato.visita_auto ? String(dato.visita_auto).slice(0, 120) : null,
    visitaCondiciones: dato.visita_condiciones ? String(dato.visita_condiciones).slice(0, 300) : null,
    interesadoReservado: reservados.some((a) => a.id === dato.interesado_reservado) ? dato.interesado_reservado : null,
    conPosteo: Boolean(posteo),
    esComentario,
    ultimo,
  };
}

/* ── LA FICHA DE UN AUTO, EN VEZ DE FOTOS SUELTAS ────────────────

   ASÍ LO HACE MAXI A MANO: no manda fotos, manda el link del auto en el
   garage. WhatsApp, Instagram y Messenger arman solos la vista previa con
   la portada, y desde ahí el cliente ve todas las fotos y los datos. */
async function fichaDe(env, autoId) {
  const auto = await env.DB.prepare(
    `SELECT id, marca, modelo, anio FROM autos WHERE id = ? AND estado = 'publicado'`
  ).bind(autoId).first();
  if (!auto) return null;
  return {
    titulo: [auto.marca, auto.modelo, auto.anio].filter(Boolean).join(' '),
    enlace: SITIO + enlaceDe(auto),
  };
}

/* ── MANDAR, POR CUALQUIERA DE LOS TRES ──────────────────────────

   UNA FUNCIÓN PARA LOS TRES CANALES. Lo que cambia es la dirección, la
   llave y la forma del pedido; quien llama no tiene que saber por dónde
   sale.

   CADA CANAL CON SU LLAVE, cargada con `wrangler secret put`:
   - WhatsApp: WHATSAPP_TOKEN (y el número en WHATSAPP_PHONE_ID).
   - Messenger: META_PAGE_TOKEN, el de la página de Facebook.
   - Instagram: META_IG_TOKEN, el que ya se usa.

   EL ERROR DE META VUELVE TAL CUAL: si se venció la ventana de 24 horas,
   si falta un permiso o si el token murió, lo dice con todas las letras,
   y eso es lo que tiene que leer el que está atendiendo. */
const GRAPH = 'https://graph.facebook.com/v23.0';

async function graphMandar(token, nombre, camino, cuerpo) {
  if (!token) throw new Error(`Falta cargar ${nombre} en Cloudflare`);
  const r = await fetch(GRAPH + camino, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const dato = await r.json().catch(() => ({}));
  if (!r.ok) {
    /* QUIEN RECHAZO Y CON QUE TOKEN, en el mensaje mismo. Meta devuelve
       textos como "Authentication Error" a secas, que leidos en un log
       parecen un problema de la clave de Claude y mandan a buscar del
       lado equivocado. El nombre del secreto que fallo es lo que dice
       cual hay que renovar. */
    const e = new Error(
      `Meta rechazo el envio (${nombre}): ${dato?.error?.message || r.status}`);
    e.codigo = dato?.error?.code ?? null;
    e.deMeta = true;
    throw e;
  }
  return dato;
}

/* LAS OTRAS FORMAS DE ESCRIBIR UN CELULAR ARGENTINO.

   El número llega del webhook como 549 + área + línea, que es el
   correcto y el único que usa WhatsApp. Pero la lista de destinatarios
   del número de prueba no se compara contra ése: se compara contra cómo
   quedó anotado el número ahí, y Meta lo anota a su manera. A un número
   lo guardó sin el 9 (54 11 ...) y a otro con el viejo 15 adentro
   (54 11 15 ...), que es lo que arma su propia herramienta de envío.
   Cuando no coincide, rechaza con el código 131030 y nada más.

   Por eso, y SÓLO ante ese código, se reintenta con las otras formas.
   El 15 va después del área, y el área puede tener 2, 3 o 4 dígitos
   (11 en Buenos Aires, 351 en Córdoba, 2302 en General Villegas), así
   que se prueban los tres cortes en vez de adivinar uno.

   ESTO ES DEL NÚMERO DE PRUEBA Y SE VA CON ÉL. Un número de producción
   no tiene lista de destinatarios, así que el 131030 no existe y este
   reintento nunca corre. Cualquier otro error sube tal cual. */
const OTRAS_FORMAS = (n) => {
  if (!/^549\d{10}$/.test(n)) return [];
  const resto = n.slice(3);
  return ['54' + resto,
          ...[2, 3, 4].map((a) => '54' + resto.slice(0, a) + '15' + resto.slice(a))];
};

/* `comentarioId`: en Instagram, la respuesta privada a un comentario.
   A alguien que nunca nos escribió no se le puede abrir un privado; la
   respuesta privada a su comentario es la única puerta, dura 7 días y se
   usa UNA sola vez. */
async function mandarUno(env, chat, texto, { comentarioId = null } = {}) {
  if (chat.canal === 'whatsapp') {
    /* `preview_url` es lo que hace que un link salga con su foto. */
    /* LA UBICACIÓN, COMO UBICACIÓN DE WHATSAPP: el pin en el mapa con el
       nombre y la dirección, que se toca y abre el mapa. Un link suelto
       salía sin vista previa (Maxi, 28/10). */
    const contenido = texto === UBICACION
      ? { type: 'location', location: UBICACION_WHATSAPP }
      : { type: 'text', text: { body: texto, preview_url: true } };
    const mandarA = (to) => graphMandar(env.WHATSAPP_TOKEN, 'WHATSAPP_TOKEN',
      `/${env.WHATSAPP_PHONE_ID}/messages`, {
        messaging_product: 'whatsapp',
        to,
        ...contenido,
      });
    /* LOS ULTIMOS CUATRO DIGITOS Y NADA MAS. Un telefono entero es un
       dato personal y no va al log, pero sin saber a quien se intento
       no hay forma de diagnosticar un rechazo. Cuatro digitos alcanzan
       para reconocerlo y no identifican a nadie. */
    const cola = (n) => "..." + String(n).slice(-4);

    const formas = [chat.externo_id, ...OTRAS_FORMAS(chat.externo_id)];
    let r = null;
    let rechazo = null;
    for (const forma of formas) {
      try {
        r = await mandarA(forma);
        rechazo = null;
        break;
      } catch (e) {
        /* Cualquier cosa que no sea "ese numero no esta en la lista"
           sube ya mismo: reintentar un token vencido o una ventana
           cerrada con otro formato no arregla nada y tapa el motivo. */
        if (e.codigo !== 131030) {
          e.message += " [a " + cola(forma) + ", desde " + env.WHATSAPP_PHONE_ID + "]";
          throw e;
        }
        rechazo = e;
      }
    }
    if (rechazo) {
      rechazo.message += " [a " + cola(chat.externo_id) + ", desde " + env.WHATSAPP_PHONE_ID
        + ": ninguna de las " + formas.length + " formas esta en la lista de destinatarios]";
      throw rechazo;
    }
    return r?.messages?.[0]?.id ?? null;
  }

  if (chat.canal === 'messenger') {
    const r = await graphMandar(env.META_PAGE_TOKEN, 'META_PAGE_TOKEN', '/me/messages', {
      recipient: { id: chat.externo_id },
      messaging_type: 'RESPONSE',
      message: { text: texto },
    });
    return r?.message_id ?? null;
  }

  if (chat.canal === 'instagram') {
    const r = await igLlamar(env, '/me/messages', {
      method: 'POST',
      body: JSON.stringify({
        recipient: comentarioId ? { comment_id: comentarioId } : { id: chat.externo_id },
        message: { text: texto },
      }),
    });
    return r?.message_id ?? null;
  }

  throw new Error('No sé mandar por ese canal');
}

/* EN PARTES Y CON PAUSAS, COMO ESCRIBE UNA PERSONA.
   ══════════════════════════════════════════════════════════════════

   Así lo pidió Maxi: una respuesta sale en varios mensajes, con diez
   segundos entre uno y otro. Si va el link de un auto, entra antes de la
   última parte, y después del link se espera un poco más para que el
   chat termine de mostrar la foto:

     Hola, cómo estás? Qué bueno que te interesó la GLA. Es una ...
        10 s
     Está impecable, sin un detalle por afuera ni adentro.
        10 s
     https://www.mannaselected.com.ar/auto/...
        12 s
     La estabas viendo para compra directa o tenés algún vehículo ...

   EL LINK NO SE REPITE: si ya se mandó en esta conversación, no vuelve a
   salir. Repetirlo es justo lo que delata a un robot.

   LA PRIMERA PARTE SALE EN EL MOMENTO y el resto queda en la cola de
   envíos de esa conversación (la clase `Envios`, abajo). Así un error de
   Meta se ve enseguida en el panel, y las pausas no dependen de que
   nadie espere: Cloudflare no deja que una tarea suelta siga más de
   treinta segundos. */
/* MÁS PAUSA Y NUNCA LA MISMA (Maxi, 29/10: "manejá más pausas"). Una
   persona no escribe a intervalos exactos: entre 14 y 22 segundos entre
   mensajes, y más después del link (24 a 32 s): WhatsApp tarda en armar la
   vista previa con la foto, y lo que sigue no puede taparla (Maxi, 29/10). */
/* EL LINK DE LA FICHA SALE PRESENTADO, en el mismo mensaje, con la frase
   que usa Maxi (29/10). La vista previa con la foto se arma igual, abajo
   del texto. */
/* EN INSTAGRAM Y MESSENGER VA EL LINK SOLO (Maxi, 31/10): ahí la vista
   previa sale como una burbuja aparte y el texto con el link como otra, y
   se veía el link dos veces. Con el link solo queda la tarjeta con la foto. */
const conPresentacion = (link, canal = 'whatsapp') => !link ? null
  : canal === 'whatsapp' ? `Te mando el link para que vayas viendo un poco más de información.\n${link}`
  : link;

const PAUSA_ENTRE_PARTES = 14000;
const PAUSA_TRAS_EL_LINK = 24000;
const conVaivén = (ms) => ms + Math.floor(Math.random() * 8000);

/* LA UBICACIÓN ES UN MENSAJE FIJO, NO LO ESCRIBE EL BOT. Así la mandan en
   los chats: la dirección y el link, solos, que el chat muestra con su
   vista previa. El link es el de la ficha de Manna Selected en Google
   (con el nombre, las fotos y las reseñas), no el de la dirección suelta:
   lo pasó Maxi el 28/10. Escrita por el bot salía pegada a otra frase, y sin el
   mapa. El bot sólo dice que va (`ubicacion: true`). */
const UBICACION = 'Manna Selected · Pje. Lanín 154, Barracas\nhttps://www.google.com/maps?cid=11593578828243501902';

/* En WhatsApp no va el texto de arriba: va una ubicación de verdad (ver
   mandarUno). El texto queda igual en la base, que es lo que se mira para
   no mandarla dos veces. En Instagram y Messenger, que no tienen
   ubicación, va el texto: el link es la ficha de Manna Selected en Google
   Maps (el `cid` sale de la ficha de Google del negocio). */
const UBICACION_WHATSAPP = {
  latitude: -34.6405727,
  longitude: -58.3792391,
  name: 'Manna Selected',
  address: 'Pje. Lanín 154, Barracas, CABA',
};

/* A WHATSAPP, CUANDO SE PASA A UNA PERSONA DESDE INSTAGRAM O MESSENGER.
   Maxi sigue las charlas por WhatsApp (28/10). El bot le dice con
   amabilidad que sigan por ahí, y el link va fijo, en su propio mensaje:
   es el mismo número del botón del sitio (public/wa.js). */
const A_WHATSAPP = 'https://wa.me/5491176703813';

/* EL ORDEN DE LOS MENSAJES: lo que se cuenta, después lo fijo (el link
   del auto, la ubicación) y al final la pregunta, si la última parte es
   una. Lo fijo se espera un poco más, para que se vea la vista previa. */
function armarTextos(partes, fijos) {
  const textos = [...partes];
  const termina = textos.length > 1 && /\?\s*$/.test(textos[textos.length - 1]);
  textos.splice(termina ? textos.length - 1 : textos.length, 0, ...fijos);
  return textos;
}

async function linkSinRepetir(env, chatId, autoId) {
  const ficha = autoId ? await fichaDe(env, autoId) : null;
  if (!ficha) return null;
  /* `instr` Y NO `LIKE`. Con LIKE, D1 cortaba la consulta entera con
     "LIKE or GLOB pattern too complex" y el bot se quedaba mudo a mitad
     de una charla: contestaba el primer mensaje y el segundo no, sin
     que se viera nada raro del lado del cliente.

     Y aunque no fallara, LIKE es el metodo equivocado: lee el `%` y el
     `_` que haya dentro de la direccion como comodines, asi que un auto
     podria dar por repetido el link de otro. `instr` busca el texto tal
     cual, no interpreta nada y no tiene limite de patron. */
  const yaEsta = await env.DB.prepare(
    `SELECT 1 FROM mensajes WHERE conversacion_id = ? AND direccion = 'saliente'
        AND texto IS NOT NULL AND instr(texto, ?) > 0 LIMIT 1`
  ).bind(chatId, ficha.enlace).first();
  return yaEsta ? null : ficha.enlace;
}

/* LA UBICACIÓN SALE SIEMPRE QUE SE PIDE, aunque ya se haya mandado.
   Antes se bloqueaba la segunda vez y se le dejaba al bot decir "te la
   mandamos más arriba". El 28/10 lo dijo sin haberla mandado nunca, y el
   cliente —que además había borrado el chat— se enojó con razón. Si la
   pide, la necesita: va de nuevo. */
async function ubicacionSinRepetir(_env, _chatId, ubicacion) {
  return ubicacion ? UBICACION : null;
}

async function mandarRespuesta(env, chat, {
  partes, autoId = null, ubicacion = false, aWhatsapp = false, autor, despues = null,
}) {
  const link = conPresentacion(await linkSinRepetir(env, chat.id, autoId), chat.canal);
  const fijos = [
    link,
    await ubicacionSinRepetir(env, chat.id, ubicacion),
    aWhatsapp && chat.canal !== 'whatsapp' ? A_WHATSAPP : null,
  ].filter(Boolean);

  /* El plan: qué sale y cuánto se espera ANTES de cada cosa. */
  const textos = armarTextos(partes, fijos);
  const pasos = textos.map((texto, n) => ({
    texto,
    espera: n === 0 ? 0 : conVaivén(fijos.includes(textos[n - 1]) ? PAUSA_TRAS_EL_LINK : PAUSA_ENTRE_PARTES),
  }));

  const [primero, ...resto] = pasos;
  /* Un paso para más tarde (ver SEGUIMIENTO DEL PRECIO en `Envios`): va
     al final de la cola y se cancela igual que las partes si el cliente
     escribe antes. */
  if (despues) resto.push(despues);
  const id = await mandarUno(env, chat, primero.texto);
  await guardarSaliente(env, chat.id, primero.texto, autor, id);

  if (resto.length) {
    /* Hasta qué mensaje del cliente se tuvo en cuenta: si después llega
       otro, lo que falta de esta respuesta ya no corresponde. */
    const visto = (await env.DB.prepare(
      `SELECT COALESCE(MAX(id), 0) AS n FROM mensajes
        WHERE conversacion_id = ? AND direccion = 'entrante'`
    ).bind(chat.id).first())?.n ?? 0;
    /* Si el chat ya estaba en manos de una persona al encolar —porque
       esta misma respuesta lo pasó—, lo que falta sale igual: es parte de
       lo que el bot decidió decir. Se corta sólo si alguien lo toma
       después. */
    const humanoAntes = (await env.DB.prepare('SELECT humano FROM conversaciones WHERE id = ?')
      .bind(chat.id).first())?.humano ? 1 : 0;
    const cola = env.ENVIOS.get(env.ENVIOS.idFromName(String(chat.id)));
    await cola.encolar({ id: chat.id, canal: chat.canal, externo_id: chat.externo_id },
      resto, autor, visto, humanoAntes);
  }
  return { link: Boolean(link), partes: pasos.length };
}

/* LA COLA DE ENVÍOS DE UNA CONVERSACIÓN.
   Una por chat. Guarda las partes que faltan y se despierta sola a la
   hora de cada una (una alarma de Cloudflare). Manda una, programa la
   siguiente, y cuando no queda nada se vacía: lo que guarda dura lo que
   dura la respuesta, unos segundos.

   SI EL CLIENTE ESCRIBE EN EL MEDIO, SE CORTA. Meta no avisa cuándo
   alguien está escribiendo o grabando, así que no se puede esperar a que
   termine; pero si llega un mensaje suyo mientras salen las partes, las
   que faltan ya no corresponden y no salen.

   SI LO QUE MANDA LA IA YA LO SIGUE UNA PERSONA, SE CORTA. Si alguien
   apretó "Que siga una persona" en el medio, no sale una parte más.
   SI FALLA UNA PARTE, se cortan las que siguen: una respuesta a medias
   es mejor que una desordenada. */
export class Envios extends DurableObject {
  /* El resumen que pidió Maxi: se arma en la alarma, sin apuro. */
  /* Una tarea grande que no entra en la vuelta del reloj: el buen día o
     el repaso. Se arma en la alarma, sin apuro. */
  async tarea(cual) {
    await this.ctx.storage.put('cola', [{ tarea: cual, espera: 0 }]);
    await this.ctx.storage.setAlarm(Date.now() + 100);
  }

  /* 20 MINUTOS PARA QUE CONTESTE EL EQUIPO; si no, datos simples. */
  async esperarAlEquipo(chat, mensaje) {
    await this.ctx.storage.put('cola', [{ equipo: true, chat, mensaje, espera: 0 }]);
    await this.ctx.storage.setAlarm(Date.now() + 20 * 60 * 1000);
  }

  async resumen(porPanel = false) {
    await this.ctx.storage.put('cola', [{ resumen: true, porPanel, espera: 0 }]);
    await this.ctx.storage.setAlarm(Date.now() + 100);
  }

  async encolar(chat, pasos, autor, visto, humanoAntes = 0) {
    /* Una respuesta nueva reemplaza a la que estaba saliendo. */
    const cola = pasos.map((p) => ({ ...p, chat, autor, visto, humanoAntes }));
    await this.ctx.storage.put('cola', cola);
    await this.ctx.storage.setAlarm(Date.now() + cola[0].espera);
  }

  async alarm() {
    const cola = (await this.ctx.storage.get('cola')) ?? [];
    const paso = cola.shift();
    if (paso?.tarea) {
      try {
        if (paso.tarea === 'buenDia') {
          /* Primero las confirmaciones a los clientes: son lo que más
             importa que salga temprano. */
          await confirmarVisitasDeHoy(this.env).catch((e) =>
            anotarAviso(this.env, `No pude confirmar las visitas de hoy: ${String(e?.message ?? e).slice(0, 200)}`));
          await buenDia(this.env);
        } else if (paso.tarea === 'repaso') {
          await agendaDeManana(this.env).catch(() => {});
          await repasarElDia(this.env);
        }
      } catch (e) {
        console.error('No salió la tarea', paso.tarea, e?.message ?? e);
        await anotarAviso(this.env, `No pude armar ${paso.tarea === 'buenDia' ? 'el resumen de la mañana' : 'el repaso del día'}: ${String(e?.message ?? e).slice(0, 200)}`);
      }
      await this.ctx.storage.deleteAll();
      return;
    }
    if (paso?.equipo) {
      await this.ctx.storage.deleteAll();
      try {
        const cfg = await configDelBot(this.env);
        const horaBsAs = new Date(Date.now() - 3 * HORAS).getUTCHours();
        const ultimo = await this.env.DB.prepare(
          `SELECT id FROM mensajes WHERE conversacion_id = ? ORDER BY creado DESC, id DESC LIMIT 1`
        ).bind(paso.chat.id).first();
        if (ultimo?.id === paso.mensaje && canalActivo(cfg, paso.chat.canal) && horaBsAs >= 9 && horaBsAs < 21) {
          const r = await pensarRespuesta(this.env, paso.chat.id, { automatico: true, soloDatos: true });
          if (r.responder && !r.derivar && r.partes.length) {
            await mandarRespuesta(this.env, paso.chat, { partes: r.partes.slice(0, 2), autor: 'ia' });
          }
        }
      } catch (e) {
        console.error('No salió la respuesta de datos:', e?.message ?? e);
      }
      return;
    }
    if (paso?.resumen) {
      try { await buenDia(this.env, { aPedido: true, porPanel: paso.porPanel }); }
      catch (e) {
        console.error('No salió el resumen:', e?.message ?? e);
        /* El error queda SIEMPRE en el panel, además de intentar decírselo
           por WhatsApp: si el WhatsApp también falla, sin esto no queda
           rastro (30/10). */
        const motivo = `No pude armar el resumen: ${String(e?.message ?? e).slice(0, 300)}`;
        await anotarAviso(this.env, motivo);
        if (!paso.porPanel) await escribirleAlJefe(this.env, `${motivo}. Probá de nuevo en un rato.`, { respuesta: true });
      }
      await this.ctx.storage.deleteAll();
      return;
    }
    if (paso) {
      try {
        const escribio = await this.env.DB.prepare(
          `SELECT 1 FROM mensajes WHERE conversacion_id = ?
              AND direccion = 'entrante' AND id > ? LIMIT 1`
        ).bind(paso.chat.id, paso.visto).first();
        const humanoAhora = (await this.env.DB
          .prepare('SELECT humano FROM conversaciones WHERE id = ?')
          .bind(paso.chat.id).first())?.humano ? 1 : 0;
        const sigue = !escribio &&
          (paso.autor !== 'ia' || humanoAhora <= (paso.humanoAntes ?? 0));
        if (sigue && paso.pensar) {
          /* SEGUIMIENTO DEL PRECIO (Maxi, 29/10): le pasamos el precio y
             a los 20 minutos no contestó. El bot piensa en el momento si
             le escribe —preguntarle si lo pudo ver y algo cordial— o si
             no corresponde. Las partes van por esta misma cola: llamar a
             `mandarRespuesta` desde acá sería pedirle algo a esta cola
             mientras está ocupada. */
          const cfg = await configDelBot(this.env);
          const horaBsAs = new Date(Date.now() - 3 * HORAS).getUTCHours();
          if (!humanoAhora && !(await loAtendioElEquipo(this.env, paso.chat.id))
              && canalActivo(cfg, paso.chat.canal) && horaBsAs >= 8 && horaBsAs < 23) {
            const r = await pensarRespuesta(this.env, paso.chat.id, { automatico: true, seguimiento: paso.pensar });
            if (r.responder && !r.derivar && r.partes.length) {
              const [uno, ...otros] = r.partes.slice(0, 2);
              const id = await mandarUno(this.env, paso.chat, uno);
              await guardarSaliente(this.env, paso.chat.id, uno, 'ia', id);
              cola.unshift(...otros.map((texto) => ({ ...paso, pensar: null, texto,
                espera: conVaivén(PAUSA_ENTRE_PARTES) })));
            }
          }
        } else if (sigue && paso.plantilla) {
          /* POSVENTA: texto libre si la persona escribió hace menos de 23
             horas (la ventana sigue abierta); si no, la plantilla aprobada,
             con el mismo texto. */
          const reciente = await this.env.DB.prepare(
            `SELECT 1 FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante'
                AND creado > datetime('now','-23 hours') LIMIT 1`
          ).bind(paso.chat.id).first();
          const id = reciente
            ? await mandarUno(this.env, paso.chat, paso.texto)
            : await mandarPlantilla(this.env, paso.chat, paso.plantilla, paso.valores ?? []);
          await guardarSaliente(this.env, paso.chat.id, paso.texto, paso.autor, id);
        } else if (sigue) {
          const id = await mandarUno(this.env, paso.chat, paso.texto);
          await guardarSaliente(this.env, paso.chat.id, paso.texto, paso.autor, id);
        } else {
          cola.length = 0;
        }
      } catch (e) {
        console.error('No salió una parte de la respuesta:', e?.message ?? e);
        cola.length = 0;
      }
    }
    if (cola.length) {
      await this.ctx.storage.put('cola', cola);
      await this.ctx.storage.setAlarm(Date.now() + cola[0].espera);
    } else {
      await this.ctx.storage.deleteAll();
    }
  }
}

/* ── CONTESTAR SOLO ──────────────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   DE ACÁ EN ADELANTE EL BOT MANDA SIN QUE NADIE MIRE. Eso no se
   deshace: un mensaje enviado ya está en el teléfono del cliente.

   EL INTERRUPTOR GENERAL ES UN BOTÓN DEL PANEL, no una línea de código.

   Antes era una constante acá, y prenderla o apagarla pedía editar el
   código y volver a publicar. Eso está mal para lo único que hay que
   poder apagar rápido: si el bot empieza a decir cualquier cosa, el que
   lo ve no es el que programa, y tiene que poder frenarlo él, desde el
   teléfono, en dos segundos.

   Ahora vive en la tabla `estado` y se prende desde el panel. Apagado de
   fábrica: si nunca nadie lo prendió, o si la lectura falla, no sale un
   solo mensaje solo. Lo que no manda nada sigue andando igual —el botón
   "Que escriba la IA" y el de probar sin mandar—, porque esos los
   dispara una persona. */

/* UN SOLO INTERRUPTOR, NO UNO POR CANAL.

   Antes esto guardaba un modo por canal —borrador o automático en
   WhatsApp, Instagram y Messenger por separado— y el bot sólo contestaba
   donde dijera "automatico". Tres decisiones para lo que en la práctica
   es una: el cliente es el mismo y pregunta lo mismo, lo único que
   cambia es por qué caño entró.

   Y ADEMÁS ERA UN AGUJERO. Cuando los selectores se sacaron del panel,
   nadie podía ya poner un canal en "automatico": la IA se prendía, el
   panel decía que estaba contestando sola, y esa condición la frenaba
   en silencio en los tres canales. Prendido y sin contestar es el peor
   estado posible, porque no se nota.

   Queda `encendida` y nada más. Si está prendida contesta los tres
   canales igual; si está apagada, ninguno.

   EL HORARIO SE QUEDA aunque hoy no haya control en el panel: lo lee el
   bot y vale lo que esté guardado. Sin horario elegido, contesta a toda
   hora, que es lo que hay ahora. */
async function configDelBot(env) {
  const g = (await leerEstado(env, 'bot'))?.valor ?? {};
  const hora = (v) => (Number.isInteger(v) && v >= 0 && v <= 23 ? v : null);

  /* `=== true` y no un valor que parezca verdadero: si lo guardado se
     corrompe o viene de una versión vieja, queda apagada. */
  const encendida = g.encendida === true;

  /* WHATSAPP DE DÍA. Sólo significa algo con la IA prendida: ver
     `canalActivo`. Mismo criterio que arriba, sólo `true` lo prende. */
  const whatsappDeDia = g.whatsappDeDia === true;

  return {
    desde: hora(g.desde), hasta: hora(g.hasta), encendida, apagado: !encendida,
    whatsappDeDia, deNoche: esDeNoche(),
  };
}

/* SI ES DE NOCHE O NO. NO DECIDE SI CONTESTA —eso lo decide el botón y
   nada más— sino CÓMO CONTESTA: de noche, cuando tiene que pasar una
   charla a una persona o no puede contestar algo, dice que a la mañana
   temprano lo contactan. De noche nadie va a seguir esa charla en un
   rato, y prometerlo sería mentirle. */
function esDeNoche(ahora = new Date()) {
  const min = ((ahora.getUTCHours() + 21) % 24) * 60 + ahora.getUTCMinutes();  // Buenos Aires, UTC-3
  return min >= 20 * 60 + 1 || min < 8 * 60;
}

function canalActivo(cfg, canal, ahora = new Date()) {
  if (!cfg.encendida) return false;
  if (canal !== 'whatsapp') return true;
  return esDeNoche(ahora) || cfg.whatsappDeDia;
}

/* DOS BOTONES, UNO ADENTRO DEL OTRO. NO SON DOS DECISIONES SUELTAS.

   El de arriba manda: APAGADO NO CONTESTA NADIE, NUNCA, por ningún
   canal. No hay nada abajo que pueda contradecirlo, y por eso el panel
   ni siquiera muestra el segundo mientras esté apagado: dos tarjetas
   diciendo cosas distintas es como alguien termina creyendo que la IA
   está contestando cuando no.

   Prendido el de arriba, recién ahí decide el de abajo, y sólo sobre
   WhatsApp:

     Instagram y Messenger   contestan siempre.
     WhatsApp de 20 a 8      contesta siempre: no hay nadie despierto.
     WhatsApp de 8 a 20      lo atienden ustedes, salvo que lo prendan
                             a propósito con "WhatsApp de día".

   WhatsApp tiene su propia regla porque es por donde se cierran las
   ventas: de día conviene que lo lea una persona. */

function enHorario(cfg, ahora = new Date()) {
  if (cfg.desde === null || cfg.hasta === null || cfg.desde === cfg.hasta) return true;
  const h = (ahora.getUTCHours() + 21) % 24;   // Buenos Aires, UTC-3 todo el año
  return cfg.desde < cfg.hasta
    ? h >= cfg.desde && h < cfg.hasta
    : h >= cfg.desde || h < cfg.hasta;
}

/* LOS FRENOS, y ninguno es decorativo.

   1. SI FALLA ALGO, NO MANDA. El error cae del lado de no escribir.
   2. NUNCA SE CONTESTA A SÍ MISMO, y espera a que la persona termine:
      contesta sólo si el último mensaje sigue siendo el que lo despertó.
   3. CUANDO PIDEN UNA PERSONA, SE CALLA EN ESE CHAT para siempre.
   4. NO LE ESCRIBE A TODO EL QUE COMENTA. Lo decide el bot, y ante la
      duda decide que no.
   5. LA RÁFAGA: cinco mensajes nuestros en diez minutos en un chat y se
      frena. Es el freno de que algo nuestro se vuelva loco —un bucle,
      un error que reintenta—, no el límite de Meta.
   6. UN PRIVADO POR PUBLICACIÓN, no uno por comentario: cinco
      comentarios abajo del mismo posteo no son cinco consultas.

   ESPERA UN POCO ANTES DE CONTESTAR. La gente escribe en tres mensajes
   seguidos: "hola", "vi la Hilux", "sigue disponible?". Cada mensaje
   arranca su propia espera, y al terminarla sólo contesta si nadie
   escribió algo después: responde el último, una vez, y lee los tres. */
const ESPERA_ANTES_DE_CONTESTAR = 8000;

/* Cómo empieza la nota de un chat "Para tasar". El panel la reconoce por
   esto, así no hace falta otra columna en la base. */
const PARA_TASAR = 'Para tasar';

/* ── MAXI, EL QUE ENSEÑA ─────────────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   Pedido de Maxi (28/10): "quiero que vayas evolucionando, que te des
   cuenta de lo que hacés mal, y preguntame todo lo que necesites a mi
   WhatsApp". Son tres cosas:

   1. CONSULTAS. Cuando el bot no sabe algo, contesta lo que puede y le
      manda la pregunta a Maxi por WhatsApp ("consulta_a_maxi").
   2. SUS RESPUESTAS. Lo que Maxi le escribe al número del negocio no se
      contesta como a un cliente: si responde una consulta, el bot sigue
      la charla con ese cliente con lo que él dijo; si es una regla
      ("no digas X", "la GLA tiene techo"), se guarda en "aprendizajes" y
      entra en las instrucciones de todas las charlas desde ahí.
   3. EL REPASO. A las 21 el bot relee las charlas del día, ve qué hizo
      mal o dónde dudó, y le manda a Maxi lo que necesita preguntarle.

   EL NÚMERO DE MAXI va en SUPERVISOR_WHATSAPP (wrangler.jsonc). Sin él,
   nada de esto corre y el bot sigue como antes.

   LA VENTANA DE 24 HORAS DE META vale también para él: si Maxi no le
   escribió al número en el último día, WhatsApp no deja mandarle nada
   suelto. La consulta queda guardada igual y sale en el repaso. */

const soloDigitos = (n) => String(n ?? '').replace(/\D/g, '');

function esElJefe(env, chat) {
  const jefe = soloDigitos(env.SUPERVISOR_WHATSAPP);
  return Boolean(jefe && chat?.canal === 'whatsapp' && soloDigitos(chat.externo_id) === jefe);
}

async function chatDelJefe(env) {
  const jefe = soloDigitos(env.SUPERVISOR_WHATSAPP);
  if (!jefe) return null;
  return env.DB.prepare(
    `INSERT INTO conversaciones (canal, externo_id, nombre) VALUES ('whatsapp', ?, 'Maxi')
     ON CONFLICT (canal, externo_id) DO UPDATE SET ultimo = conversaciones.ultimo
     RETURNING id, canal, externo_id`
  ).bind(jefe).first();
}

/* Lo que Maxi le enseñó. Pocas y claras: entran en cada charla. */
async function loAprendido(env) {
  const lista = (await leerEstado(env, 'aprendizajes'))?.valor ?? [];
  return lista.map((a) => a.texto).filter(Boolean).slice(-60);
}

/* LOS AVISOS YA NO VAN POR WHATSAPP (Maxi, 29/10: "no me manden más
   mensajes de WhatsApp, avisame por acá"). Quedan guardados en el panel
   (`estado.avisos`) y los lee el asistente que lo acompaña, que se los
   pasa con una notificación. Por WhatsApp sólo sale lo que es RESPUESTA
   a algo que él escribió (resumen, números, "anotado"): `respuesta`.
   Los avisos dicen teléfonos y nombres de clientes: viven en la misma
   base y se van con la limpieza; no salen del sistema. */
async function anotarAviso(env, texto, { tipo = null } = {}) {
  const avisos = (await leerEstado(env, 'avisos'))?.valor ?? [];
  const n = (avisos.at(-1)?.n ?? 0) + 1;
  avisos.push({ n, cuando: new Date().toISOString(), texto: String(texto).slice(0, 3000), ...(tipo ? { tipo } : {}) });
  await guardarEstado(env, 'avisos', avisos.slice(-200));
  return true;
}

async function escribirleAlJefe(env, texto, { respuesta = false } = {}) {
  if (!respuesta) return anotarAviso(env, texto);
  const jefe = await chatDelJefe(env);
  if (!jefe) return false;
  try {
    const id = await mandarUno(env, jefe, texto);
    await guardarSaliente(env, jefe.id, texto, 'ia', id);
    return true;
  } catch (e) {
    console.error('No se pudo escribirle a Maxi:', e?.message ?? e);
    return false;
  }
}

/* Cómo se nombra a un cliente frente a Maxi: el nombre y los últimos
   cuatro del teléfono, que es como lo encuentra en el celular. */
/* EL TELÉFONO COMO LO MUESTRA WHATSAPP, para que Maxi lo toque y le
   abra el chat: "+54 9 11 1234-5678", "+54 9 2345 67-8901". Lo pidió él
   (29/10): es su cliente y su teléfono, y lo ve en su propio WhatsApp. */
function telefono(n) {
  const d = soloDigitos(n);
  if (!/^549\d{10}$/.test(d)) return `+${d}`;
  const r = d.slice(3);
  return r.startsWith('11')
    ? `+54 9 11 ${r.slice(2, 6)}-${r.slice(6)}`
    : `+54 9 ${r.slice(0, 4)} ${r.slice(4, 6)}-${r.slice(6)}`;
}

/* Cómo se nombra a un cliente frente a Maxi, en su formato (29/10):
   "+54 9 11 1234-5678, Juan". En Instagram y Facebook, el usuario. */
const quienEs = (chat) => chat.canal === 'whatsapp'
  ? `${telefono(chat.externo_id)}${chat.nombre && chat.nombre !== '-' ? `, ${chat.nombre}` : ''}`
  : `${chat.canal === 'instagram' ? '@' : ''}${chat.nombre ?? 'sin nombre'} (${chat.canal === 'instagram' ? 'Instagram' : 'Facebook'})`;

/* LAS LISTAS DE WHATSAPP DE MAXI (las de la app, 29/10). El bot no puede
   poner un chat en una lista —Meta no lo deja desde el sistema—, así que
   le dice en cuál va, con el mismo nombre, y él lo mueve en un toque. */
const LISTAS = {
  permuta: 'Importante',
  consignacion: 'Consignaciones Posibles',
  visita: 'Visita posible',
  comprador: 'Posible Comprador',
  potencial: 'Cliente potencial',
  reservado: 'Reservado',
};

/* Una línea por cliente, como las arma Maxi:
   "+54 9 11 1234-5678, Juan (Para tasar)  Peugeot 2008 2020, 99.000 km → Hilux GR" */
const lineaDe = (chat, estado, detalle) =>
  `${quienEs(chat)} (${estado})${detalle ? `  ${detalle}` : ''}`;

async function consultarAlJefe(env, chat, pregunta, loQueDijo) {
  if (!soloDigitos(env.SUPERVISOR_WHATSAPP)) return;
  const consultas = (await leerEstado(env, 'consultas'))?.valor ?? [];
  /* Una por chat: si ya hay una esperando, no se lo vuelve a molestar. */
  if (consultas.some((c) => c.chat === chat.id)) return;
  const n = (consultas.reduce((m, c) => Math.max(m, c.n ?? 0), 0) || 0) + 1;
  consultas.push({ n, chat: chat.id, pregunta, cuando: new Date().toISOString() });
  await guardarEstado(env, 'consultas', consultas.slice(-30));

  await escribirleAlJefe(env,
    `Consulta ${n}\n${lineaDe(chat, LISTAS.permuta, 'Esperando tu respuesta')}\n${pregunta}` +
    (loQueDijo ? `\n\nLo último que escribió: «${String(loQueDijo).slice(0, 200)}»` : '') +
    `\n\nContestame acá y sigo yo con el cliente.`);
}

/* POR QUÉ SE PERDIÓ UNA VENTA, DE UNA LISTA CERRADA. El embudo no lleva
   texto libre (ver esquema/009-embudo.sql): se anota el estado de la
   consulta, nunca una opinión sobre la persona. */
const MOTIVOS_PERDIDA = ['precio', 'km o estado', 'financiación', 'la permuta no cerró',
  'se enfrió', 'compró en otro lado', 'otro'];

const FORMA_DEL_JEFE = {
  type: 'object',
  properties: {
    consulta: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    al_cliente: { type: 'array', items: { type: 'string' } },
    aprendizaje: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    olvidar: { type: 'array', items: { type: 'integer' } },
    quitar_visitas: { type: 'array', items: { type: 'integer' } },
    mover_visita: { anyOf: [{ type: 'object', properties: {
      n: { type: 'integer' }, visita: { type: 'string' } },
      required: ['n', 'visita'], additionalProperties: false }, { type: 'null' }] },
    ya_compraron: { type: 'array', items: { type: 'string' } },
    vendidos: { type: 'array', items: { type: 'integer' } },
    reservar: { type: 'array', items: { type: 'integer' } },
    se_cayo_reserva: { type: 'array', items: { type: 'integer' } },
    por_entrar: { type: 'array', items: { type: 'string' } },
    recordar: { type: 'array', items: { type: 'object', properties: {
      cuando: { type: 'string' }, texto: { type: 'string' } },
      required: ['cuando', 'texto'], additionalProperties: false } },
    ya_no_entran: { type: 'array', items: { type: 'integer' } },
    resumen: { type: 'boolean' },
    resultados: { type: 'array', items: { type: 'object', properties: {
      quien: { type: 'string' },
      resultado: { type: 'string', enum: ['vino', 'no_vino', 'compro', 'perdido'] },
      motivo: { anyOf: [{ type: 'string', enum: MOTIVOS_PERDIDA }, { type: 'null' }] },
    }, required: ['quien', 'resultado', 'motivo'], additionalProperties: false } },
    numeros: { type: 'boolean' },
    a_maxi: { type: 'string' },
  },
  required: ['consulta', 'al_cliente', 'aprendizaje', 'olvidar', 'quitar_visitas', 'mover_visita',
    'ya_compraron', 'vendidos', 'reservar', 'se_cayo_reserva', 'por_entrar', 'ya_no_entran', 'recordar', 'resumen', 'resultados', 'numeros', 'a_maxi'],
  additionalProperties: false,
};

async function atenderAlJefe(env, conversacionId, mensajeId, { porPanel = false } = {}) {
  if (!env.ANTHROPIC_API_KEY) return;
  /* Como con los clientes: si manda tres seguidos, se lee el último. Lo
     que llega por el panel ya viene entero. */
  if (!porPanel) await new Promise((listo) => setTimeout(listo, ESPERA_ANTES_DE_CONTESTAR));
  const { results: ultimos } = await env.DB.prepare(
    `SELECT id, direccion, texto FROM mensajes WHERE conversacion_id = ?
      ORDER BY creado DESC, id DESC LIMIT 6`
  ).bind(conversacionId).all();
  const dijo = ultimos?.[0];
  if (!dijo || dijo.id !== mensajeId || dijo.direccion !== 'entrante' || !dijo.texto) return;

  const consultas = (await leerEstado(env, 'consultas'))?.valor ?? [];
  const aprendizajes = (await leerEstado(env, 'aprendizajes'))?.valor ?? [];
  const porEntrar = (await leerEstado(env, 'por_entrar'))?.valor ?? [];
  const agenda = ((await leerEstado(env, 'agenda'))?.valor ?? [])
    .filter((v) => aMs(v.visita) > Date.now() - 12 * HORAS);
  const agendaFuera = new Set();
  const { results: stock } = await env.DB.prepare(
    `SELECT id, marca, modelo, anio, km FROM autos WHERE estado = 'publicado' ORDER BY id`
  ).all();

  /* Cada consulta con lo último de su charla, para que la respuesta al
     cliente siga el hilo. */
  const conHilo = [];
  for (const c of consultas.slice(-8)) {
    const chat = await env.DB.prepare('SELECT id, canal, externo_id, nombre FROM conversaciones WHERE id = ?')
      .bind(c.chat).first();
    if (!chat) continue;
    const { results: hilo } = await env.DB.prepare(
      `SELECT direccion, texto FROM mensajes WHERE conversacion_id = ? AND texto IS NOT NULL
        ORDER BY creado DESC, id DESC LIMIT 8`
    ).bind(c.chat).all();
    conHilo.push(`CONSULTA ${c.n} · ${quienEs(chat)}: ${c.pregunta}\n` +
      (hilo ?? []).reverse().map((m) => `  ${m.direccion === 'entrante' ? 'Cliente' : 'Nosotros'}: ${m.texto.slice(0, 200)}`).join('\n'));
  }

  const charla = (ultimos ?? []).slice().reverse()
    .map((m) => `${m.direccion === 'entrante' ? 'Maxi' : 'Bot'}: ${m.texto ?? ''}`).join('\n');

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model: MODELO,
    max_tokens: 1500,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: FORMA_DEL_JEFE } },
    system: `Sos el asistente de ventas de Manna Selected (autos seleccionados,
Barracas). Maxi es el dueño y te está escribiendo por WhatsApp: te contesta
consultas que le hiciste o te enseña cómo trabajar. No es un cliente.

CONSULTAS QUE ESTÁN ESPERANDO
${conHilo.join('\n\n') || '(ninguna)'}

HOY ES ${hoyEnBsAs()}.

LA AGENDA (numerada)
${agenda.map((v, i) => `${i + 1}. ${v.visita} · ${v.quien} · ${v.auto ?? ''} · ${v.condiciones ?? v.motivo ?? ''}`).join('\n') || '(vacía)'}

EL STOCK PUBLICADO (número entre corchetes)
${(stock ?? []).map((a) => `[${a.id}] ${a.marca} ${a.modelo} ${a.anio} · ${a.km} km`).join('\n') || '(vacío)'}

LOS AUTOS QUE ESTÁN POR ENTRAR (numerados)
${porEntrar.map((a, i) => `${i + 1}. ${a.texto}`).join('\n') || '(ninguno)'}

LO QUE YA TE ENSEÑÓ (numerado)
${aprendizajes.map((a, i) => `${i + 1}. ${a.texto}`).join('\n') || '(nada todavía)'}

Qué hacer con lo que escribió:
- Si contesta una consulta, "consulta" es su número (si cita el número o
  si es obvio por el tema; si hay una sola esperando y habla de eso, es
  esa). En "al_cliente" escribí lo que le decís al cliente con lo que
  dijo Maxi: en partes cortas, rioplatense, de vos, sin signos de apertura,
  sin dos puntos ni emojis, sin saludar de nuevo, como venía la charla.
  Si Maxi dice que no le contestes o que lo sigue él, "al_cliente" va vacío.
- Si dice algo que sirve para siempre (una regla, un dato de un auto, cómo
  hablar), ponelo en "aprendizaje": una línea clara, en segunda persona,
  para el bot ("No digas 'el dueño': hablale de vos"). Si sólo sirve para
  ese cliente, null.
- Si dice que algo de lo aprendido ya no va, poné sus números en "olvidar".
- LA AGENDA. Si pregunta qué tiene ("qué tengo mañana?", "agenda"),
  contestale en "a_maxi" con cada visita: día y hora, quién, qué auto y en
  qué condiciones. Si cancela una, sus números en "quitar_visitas". Si la
  cambia de día u hora, "mover_visita" con su número y la fecha nueva
  ("AAAA-MM-DD HH:MM"). Si no toca la agenda, [] y null.
- CÓMO TERMINÓ CADA CLIENTE (Maxi, 29/10). Si te cuenta que alguien vino,
  no vino, compró o se perdió ("Jorge vino", "Richi compró", "el del
  Cruze se perdió por precio", "6766 no vino"), poné una entrada por
  cliente en "resultados": en "quien" los dígitos del teléfono que dio
  (al menos los últimos 4) o, si no los dio, el nombre tal cual; en
  "resultado" vino, no_vino, compro o perdido; y si es perdido, el
  "motivo" de la lista (precio, km o estado, financiación, la permuta no
  cerró, se enfrió, compró en otro lado, otro). Si no dijo el motivo,
  "otro" y preguntáselo en "a_maxi". Si no, [].
- LOS NÚMEROS. Si pregunta cómo vamos ("cómo venimos?", "números",
  "cuántos vinieron?"), "numeros": true y en "a_maxi" sólo "Ya te los
  paso". Si no, false.
- EL RESUMEN. SÓLO si pide explícitamente el resumen o qué tiene hoy
  ("resumen", "qué tengo hoy?", "pasame todo"), "resumen": true y en
  "a_maxi" sólo "Ya te lo armo". Si te cuenta algo (una reserva, una
  venta, que alguien vino), eso NO es pedir el resumen: false, y
  contestale sobre lo que te contó.
- RESERVAS. Si dice que un auto se reservó o se señó ("el C300 se
  reservó con una seña"), su número del stock en "reservar". Si dice que
  se cayó la reserva, en "se_cayo_reserva". Si no queda claro cuál es,
  preguntale. Si no, [] y [].
- LOS RECORDATORIOS (Maxi, 31/10). Si pide que le recuerdes algo para un
  día ("el martes recordame escribirle a Federico"), poné en "recordar" una
  entrada con "cuando" ("AAAA-MM-DD HH:MM", sacado de la fecha de hoy; sin
  hora, 10:00) y en "texto" qué hay que hacer, con nombre, teléfono y lo
  que se habló, como para que lo haga sin abrir el chat. Si no, [].
- LO QUE ESTÁ POR ENTRAR (Maxi, 30/10). Si cuenta que está por entrar un
  auto (una permuta que estamos por tomar, una consignación, una compra:
  "está por entrar un Audi A4 2019"), ponelo en "por_entrar": una línea
  con marca, modelo, año, km y lo que sepa (precio, cuándo llega). Si dice
  que uno ya entró o que se cayó, su número en "ya_no_entran". Si no, [] y [].
- LO QUE SE VENDIÓ. Si dice que un auto se vendió ("se vendió el 500"),
  poné su número del stock en "vendidos" y confirmale cuál marcaste. Si
  no queda claro cuál es, preguntale y dejá []. Si no, [].
- LOS QUE YA COMPRARON. Si dice que alguien ya compró o que no le hables
  más ("Juan 1234 ya compró", "a 5678 no le escribas"), poné en
  "ya_compraron" los dígitos de cada teléfono que dio (al menos los
  últimos 4; sólo los dígitos). Si no los dio, preguntáselos en "a_maxi". Si no, [].
- "a_maxi": lo que le contestás a él. Corto y natural ("Anotado", "Dale,
  le escribo", "Listo, se lo dije"). Si no entendiste, preguntale.`,
    messages: [{ role: 'user', content: charla }],
  });
  let dato = null;
  try { dato = JSON.parse((r.content ?? []).find((b) => b.type === 'text')?.text ?? ''); }
  catch { return; }

  /* Lo aprendido, con lo que pidió olvidar afuera. */
  const olvidar = new Set((dato.olvidar ?? []).map((n) => n - 1));
  let lista = aprendizajes.filter((_, i) => !olvidar.has(i));
  if (dato.aprendizaje) {
    lista.push({ texto: String(dato.aprendizaje).slice(0, 300), cuando: new Date().toISOString() });
  }
  if (dato.aprendizaje || olvidar.size) await guardarEstado(env, 'aprendizajes', lista.slice(-60));

  /* LOS QUE YA COMPRARON: el bot no les vuelve a hablar. Se buscan por
     los últimos cuatro del teléfono, que es lo que Maxi ve en el celular.
     Si hay más de un chat que termina igual, no se toca ninguno y se le
     avisa: mejor preguntar que callar a quien no era. */
  for (const cuatro of (dato.ya_compraron ?? []).map((d) => soloDigitos(d).slice(-10)).filter((d) => d.length >= 4)) {
    const { results: chats } = await env.DB.prepare(
      `SELECT id, canal, externo_id, nombre FROM conversaciones
        WHERE canal = 'whatsapp' AND externo_id LIKE ?`
    ).bind(`%${cuatro}`).all();
    if (chats?.length === 1) {
      await env.DB.prepare(
        `UPDATE conversaciones SET humano = 1, nota = 'Ya compró: el bot no le habla' WHERE id = ?`
      ).bind(chats[0].id).run();
    } else {
      dato.a_maxi = `${dato.a_maxi}\n\n(${chats?.length ? `Hay ${chats.length} chats que terminan en ${cuatro}` : `No encontré ningún chat que termine en ${cuatro}`}: pasame el número completo.)`;
    }
  }

  /* LOS RECORDATORIOS: salen en los avisos, en verde, el día que dijo. */
  const recordar = (dato.recordar ?? []).filter((r) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.cuando) && r.texto?.trim());
  if (recordar.length) {
    const ya = (await leerEstado(env, 'recordatorios'))?.valor ?? [];
    await guardarEstado(env, 'recordatorios', [...ya, ...recordar].slice(-50));
  }

  /* LO QUE ESTÁ POR ENTRAR: el bot lo ofrece cuando es más parecido a lo
     que busca el cliente que lo publicado. */
  if ((dato.por_entrar ?? []).length || (dato.ya_no_entran ?? []).length) {
    const fuera = new Set((dato.ya_no_entran ?? []).map((n) => n - 1));
    await guardarEstado(env, 'por_entrar', [
      ...porEntrar.filter((_, i) => !fuera.has(i)),
      ...(dato.por_entrar ?? []).filter((t) => t?.trim()).map((texto) => ({ texto: texto.trim(), desde: new Date().toISOString() })),
    ].slice(-20));
  }

  /* RESERVAS: se marca o se desmarca. Si se cae, se le pasa a Maxi la
     lista de los que preguntaron mientras tanto, para avisarles. */
  let reservados = (await leerEstado(env, 'reservados'))?.valor ?? [];
  const reservar = (dato.reservar ?? []).filter((n) => (stock ?? []).some((a) => a.id === n));
  const caidas = (dato.se_cayo_reserva ?? []).filter((n) => reservados.includes(n));
  if (reservar.length || caidas.length) {
    reservados = [...new Set([...reservados, ...reservar])].filter((n) => !caidas.includes(n));
    await guardarEstado(env, 'reservados', reservados);
  }
  if (caidas.length) {
    const esperan = (await leerEstado(env, 'esperan_reserva'))?.valor ?? {};
    for (const id of caidas) {
      const auto = (stock ?? []).find((a) => a.id === id);
      const lineas = [];
      for (const chatId of esperan[id] ?? []) {
        const c = await env.DB.prepare('SELECT id, canal, externo_id, nombre FROM conversaciones WHERE id = ?')
          .bind(chatId).first();
        if (c) lineas.push(lineaDe(c, 'Importante', `Preguntó por el ${auto?.modelo ?? 'auto'} mientras estaba reservado. Avisale que se liberó.`));
      }
      delete esperan[id];
      await anotarAviso(env, `Se cayó la reserva del ${auto ? `${auto.marca} ${auto.modelo}` : 'auto'}` +
        (lineas.length ? `. Avisales a los que preguntaron:\n${lineas.join('\n')}` : '. Nadie preguntó mientras estuvo reservado.'));
    }
    await guardarEstado(env, 'esperan_reserva', esperan);
  }

  /* LO VENDIDO SALE DEL STOCK AL INSTANTE (Maxi, 29/10: el bot le
     ofreció a un cliente el 500C, que ya se había vendido). Es el mismo
     cambio que el botón del panel: deja de verse en el sitio y el bot ya
     no lo ofrece. Sólo autos que estaban publicados. */
  const publicados = new Set((stock ?? []).map((a) => a.id));
  if ((dato.vendidos ?? []).some((n) => reservados.includes(n))) {
    reservados = reservados.filter((n) => !(dato.vendidos ?? []).includes(n));
    await guardarEstado(env, 'reservados', reservados);
  }
  for (const id of (dato.vendidos ?? []).filter((n) => publicados.has(n))) {
    await env.DB.prepare(
      `UPDATE autos SET estado = 'vendido', editado = datetime('now') WHERE id = ? AND estado = 'publicado'`
    ).bind(id).run();
  }

  /* CÓMO TERMINÓ CADA CLIENTE. Va al embudo que ya existe: la etapa más
     alta a la que llegó ('vino', 'cerrado') y la marca de perdido, con
     el motivo de la lista en la nota. Si no se encuentra uno solo, no se
     toca nada y se le pregunta. */
  const hechos = [];
  for (const r of dato.resultados ?? []) {
    const digitos = soloDigitos(r.quien).slice(-10);
    const { results: candidatos } = digitos.length >= 4
      ? await env.DB.prepare(
        `SELECT id, canal, externo_id, nombre, etapa, nota FROM conversaciones
          WHERE canal = 'whatsapp' AND externo_id LIKE ?`).bind(`%${digitos}`).all()
      : await env.DB.prepare(
        `SELECT id, canal, externo_id, nombre, etapa, nota FROM conversaciones
          WHERE nombre LIKE ? AND ultimo > datetime('now','-60 days') AND id != ?`)
        .bind(`%${String(r.quien).trim()}%`, conversacionId).all();
    if (candidatos?.length !== 1) {
      hechos.push(`${r.quien}: ${candidatos?.length ? `hay ${candidatos.length} que coinciden` : 'no lo encontré'}, pasame el número`);
      continue;
    }
    const c = candidatos[0];
    const etapaNueva = r.resultado === 'compro' ? 'cerrado'
      : r.resultado === 'vino' && c.etapa !== 'cerrado' ? 'vino' : c.etapa;
    const nota = r.resultado === 'compro' ? 'Compró: el bot no le habla'
      : r.resultado === 'perdido' ? `Perdido: ${MOTIVOS_PERDIDA.includes(r.motivo) ? r.motivo : 'otro'}`
      : r.resultado === 'no_vino' ? 'No vino a la visita'
      : c.nota;
    await env.DB.prepare(
      `UPDATE conversaciones SET etapa = ?, perdido = ?, nota = ?, etapa_cambio = datetime('now'),
              humano = CASE WHEN ? THEN 1 ELSE humano END
        WHERE id = ?`
    ).bind(etapaNueva, r.resultado === 'perdido' ? 1 : 0, nota, r.resultado === 'compro' ? 1 : 0, c.id).run();
    agendaFuera.add(c.id);
    hechos.push(`${quienEs(c)}: ${{ vino: 'vino', no_vino: 'no vino', compro: 'compró', perdido: `perdido (${r.motivo ?? 'otro'})` }[r.resultado]}`);
  }
  if (hechos.length) dato.a_maxi = `${dato.a_maxi}\n\nAnotado:\n${hechos.join('\n')}`;
  if (agendaFuera.size) {
    await guardarEstado(env, 'agenda', agenda.filter((v) => !agendaFuera.has(v.chat)));
  }

  /* La agenda, como la dejó Maxi. */
  const quitar = new Set((dato.quitar_visitas ?? []).map((n) => n - 1));
  const mover = dato.mover_visita;
  if (quitar.size || mover) {
    const nueva = agenda
      .map((v, i) => (mover && i === mover.n - 1 && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(mover.visita)
        ? { ...v, visita: mover.visita, recordada: false } : v))
      .filter((v, i) => !quitar.has(i) && !agendaFuera.has(v.chat))
      .sort((a, b) => aMs(a.visita) - aMs(b.visita));
    await guardarEstado(env, 'agenda', nueva);
  }

  /* La consulta contestada: se sigue con el cliente y sale de la lista. */
  const c = consultas.find((x) => x.n === dato.consulta);
  if (c) {
    await guardarEstado(env, 'consultas', consultas.filter((x) => x.n !== c.n));
    const chat = await env.DB.prepare('SELECT id, canal, externo_id, humano FROM conversaciones WHERE id = ?')
      .bind(c.chat).first();
    const partes = (dato.al_cliente ?? []).map((t) => String(t).trim()).filter(Boolean);
    if (chat && !chat.humano && partes.length) {
      try { await mandarRespuesta(env, chat, { partes, autor: 'ia' }); }
      catch (e) {
        console.error('No se pudo seguir con el cliente:', e?.message ?? e);
        dato.a_maxi = `${dato.a_maxi}\n\n(No le pude escribir al cliente: ${String(e?.message ?? e).slice(0, 120)})`;
      }
    }
  }

  if (dato.a_maxi) await escribirleAlJefe(env, String(dato.a_maxi).slice(0, 1500), { respuesta: !porPanel });
  if (dato.numeros) await escribirleAlJefe(env, await numerosDelMes(env), { respuesta: !porPanel });

  /* EL RESUMEN NO SE ARMA ACÁ. Esto corre colgado del aviso de Meta, que
     tiene treinta segundos en total, y leer todas las charlas y pensar el
     resumen no entra: se cortaba en silencio después del "Ya te lo armo"
     (Maxi, 29/10). Lo arma la cola de envíos de su chat, que no tiene ese
     límite. */
  if (dato.resumen) {
    const cola = env.ENVIOS.get(env.ENVIOS.idFromName(`resumen-${conversacionId}`));
    await cola.resumen(porPanel);
  }
}

/* LOS NÚMEROS DEL MES, para Maxi: cuántos llegaron a cada paso. Cuenta
   las conversaciones que empezaron este mes (una camada por mes, como el
   embudo del panel). Sin las marcas de "vino", "compró" y "perdido" que
   carga Maxi, las últimas filas dan cero: por eso se le piden. */
async function numerosDelMes(env) {
  const mes = new Date(Date.now() - 3 * HORAS).toISOString().slice(0, 7);
  const f = await env.DB.prepare(
    `SELECT COUNT(*) AS nuevos,
            SUM(CASE WHEN etapa IN ('vino','cerrado') THEN 1 ELSE 0 END) AS vinieron,
            SUM(CASE WHEN etapa = 'cerrado' THEN 1 ELSE 0 END) AS cerrados,
            SUM(perdido) AS perdidos,
            SUM(CASE WHEN nota LIKE 'Para tasar%' THEN 1 ELSE 0 END) AS tasar
       FROM conversaciones
      WHERE substr(creado, 1, 7) = ? AND canal = 'whatsapp'`
  ).bind(mes).first();
  const { results: motivos } = await env.DB.prepare(
    `SELECT substr(nota, 10) AS motivo, COUNT(*) AS n FROM conversaciones
      WHERE substr(creado, 1, 7) = ? AND perdido = 1 AND nota LIKE 'Perdido: %'
      GROUP BY motivo ORDER BY n DESC`
  ).bind(mes).all();
  const agenda = (await leerEstado(env, 'agenda'))?.valor ?? [];
  return [
    `*NÚMEROS DE ${mes.slice(5)}/${mes.slice(0, 4)}* (WhatsApp)`,
    `Consultas nuevas: ${f?.nuevos ?? 0}`,
    `Para tasar: ${f?.tasar ?? 0}`,
    `Visitas en agenda: ${agenda.length}`,
    `Vinieron: ${f?.vinieron ?? 0}`,
    `Compraron: ${f?.cerrados ?? 0}`,
    `Perdidos: ${f?.perdidos ?? 0}${(motivos ?? []).length ? ` (${motivos.map((m) => `${m.motivo} ${m.n}`).join(', ')})` : ''}`,
    '',
    'Para que esto sirva, contame cómo termina cada uno: "Jorge vino", "Richi compró", "el del Cruze se perdió por precio".',
  ].join('\n');
}

/* EL REPASO DE LAS 21. Relee lo que el bot contestó hoy y le manda a
   Maxi sus dudas: dónde cree que se equivocó y qué necesita saber. Va
   sin teléfonos completos: nombre y últimos cuatro, como en las
   consultas. */
async function repasarElDia(env) {
  if (!env.ANTHROPIC_API_KEY || !soloDigitos(env.SUPERVISOR_WHATSAPP)) return;
  const jefe = await chatDelJefe(env);
  const { results: chats } = await env.DB.prepare(
    `SELECT DISTINCT c.id, c.canal, c.externo_id, c.nombre FROM conversaciones c
       JOIN mensajes m ON m.conversacion_id = c.id
      WHERE m.autor = 'ia' AND m.creado > datetime('now','-24 hours') AND c.id != ?
      LIMIT 25`
  ).bind(jefe?.id ?? 0).all();
  if (!chats?.length) return;

  const charlas = [];
  for (const c of chats) {
    const { results: ms } = await env.DB.prepare(
      `SELECT direccion, autor, texto FROM mensajes WHERE conversacion_id = ? AND texto IS NOT NULL
         AND creado > datetime('now','-24 hours') ORDER BY creado, id LIMIT 40`
    ).bind(c.id).all();
    charlas.push(`### ${quienEs(c)}\n` + (ms ?? []).map((m) =>
      `${m.direccion === 'entrante' ? 'Cliente' : m.autor === 'ia' ? 'Bot' : 'Equipo'}: ${m.texto.slice(0, 220)}`).join('\n'));
  }
  const pendientes = ((await leerEstado(env, 'consultas'))?.valor ?? [])
    .map((c) => `Consulta ${c.n}: ${c.pregunta}`).join('\n');

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model: MODELO,
    max_tokens: 6000,
    /* SIN PENSAR: para resumir no hace falta y se comía todo el espacio. */
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: `Sos el bot de ventas de Manna Selected y estás repasando tus charlas
de hoy para mejorar. Las reglas con las que trabajás son éstas:

${instruccionesDelBot({ autos: [], posteo: null, canal: 'whatsapp', automatico: true,
  aprendizajes: await loAprendido(env) })}

Escribile a Maxi, el dueño, UN mensaje de WhatsApp corto (máximo 8
renglones), rioplatense y sin vueltas:
- hasta 3 cosas que hiciste mal o que no te salieron bien hoy, cada una
  con el cliente (nombre y …últimos 4) y qué vas a hacer distinto. Mirá
  sobre todo la venta: dónde perdiste las riendas, dónde el cliente se
  enfrió o no quedó un próximo paso, qué objeción no supiste responder;
- hasta 3 preguntas concretas que necesitás que te conteste para mejorar,
  numeradas, así te responde "1. …".
Si hoy no hubo nada que valga la pena, escribí sólo "Hoy sin dudas".`,
    messages: [{ role: 'user', content:
      `CHARLAS DE HOY\n\n${charlas.join('\n\n')}` +
      (pendientes ? `\n\nCONSULTAS QUE MAXI TODAVÍA NO CONTESTÓ\n${pendientes}` : '') }],
  });
  const texto = (r.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (texto && texto !== 'Hoy sin dudas') await escribirleAlJefe(env, `Repaso del día\n\n${texto}`);
}

/* ── LA AGENDA Y EL SEGUIMIENTO ──────────────────────────────────
   ══════════════════════════════════════════════════════════════════

   Pedido de Maxi (28/10): "especialista en retargeting, no un pesado
   sino estratégico; organizame agenda, recordatorios, novedades, avisos,
   posibles negocios y oportunidades". Cuatro piezas:

   1. VISITAS. Cuando un cliente da un día, el bot lo anota ("visita") y
      le avisa a Maxi en el momento para que lo confirme.
   2. RECORDATORIO. Una hora y media antes de cada visita, aviso a Maxi.
   3. SEGUIMIENTO. Si un cliente con interés real dejó de contestar, a las
      20 horas el bot decide si le escribe UNA vez, con algo que aporte.
      Por qué ahí: WhatsApp sólo deja escribir libremente dentro de las 24
      horas desde el último mensaje del cliente. Pasado eso hace falta una
      plantilla aprobada por Meta, que además se paga. Uno solo por
      silencio: después del seguimiento la ventana se cierra sola.
   4. BUEN DÍA. A las 8:30, a Maxi: visitas del día, a quién llamar,
      autos para tasar, consultas sin contestar y oportunidades.

   La agenda vive en `estado` ('agenda'), con nombre y los últimos cuatro
   del teléfono, como todo lo que se le manda a Maxi. Se borra sola una
   vez pasada la visita. */

const HORAS = 3600 * 1000;

/* WHATSAPP EN CUARENTENA (Maxi, 30/10): Meta avisó "es posible que se
   restrinja tu cuenta pronto" por posible spam, después de una tanda de
   mensajes a clientes que no escribían hacía días. Hasta esta fecha el
   bot sólo contesta en WhatsApp: no hace seguimientos a quien no
   respondió ni manda posventa. Instagram y Messenger siguen igual. */
const WHATSAPP_SOLO_RESPONDE_HASTA = Date.parse('2026-11-07T03:00:00Z');
const whatsappEnCuarentena = (canal) => canal === 'whatsapp' && Date.now() < WHATSAPP_SOLO_RESPONDE_HASTA;

/* LO QUE ATENDIÓ EL EQUIPO NO LO TOCA EL BOT, NUNCA MÁS (Maxi, 29/10:
   "todo lo que atendimos nosotros, no les hables"). Alcanza con un
   mensaje de una persona —desde el celular o desde el panel— en
   cualquier momento de la charla. Sólo la posventa le escribe después,
   y eso es a propósito. */
async function loAtendioElEquipo(env, chatId) {
  return Boolean(await env.DB.prepare(
    `SELECT 1 FROM mensajes WHERE conversacion_id = ? AND direccion = 'saliente'
        AND autor = 'persona' LIMIT 1`
  ).bind(chatId).first());
}

/* Un precio en lo que dijo el bot: "USD 23.900", "US$ 69.000". */
const DIO_PRECIO = /\b(USD|US\$|U\$S)\s?\d{1,3}(\.\d{3})+/i;

/* "martes 28 de octubre de 2026, 19:45" en Buenos Aires. */
function hoyEnBsAs(cuando = new Date()) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric',
    month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(cuando);
}

/* "2026-10-30 12:00" (hora de Buenos Aires) a milisegundos. Sin hora,
   se toma el mediodía para ordenar, y no se recuerda a una hora fija. */
const aMs = (visita) => new Date(
  `${visita.slice(0, 10)}T${visita.length > 10 ? visita.slice(11, 16) : '12:00'}:00-03:00`
).getTime();

/* Cómo se le muestra una visita a Maxi: día y hora, quién, qué auto y en
   qué condiciones. */
function fichaDeVisita(v) {
  const dia = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', weekday: 'long', day: 'numeric', month: 'numeric',
    ...(v.visita.length > 10 ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }).format(new Date(aMs(v.visita)));
  return `${dia}${v.visita.length > 10 ? ' h' : ' (sin hora)'}\n` +
    `${v.quien} (${LISTAS.permuta})  ${[v.condiciones, v.auto && `→ ${v.auto}`].filter(Boolean).join(' ')}`;
}

async function agendarVisita(env, chat, { visita, auto = null, condiciones = null, motivo = null }) {
  const agenda = (await leerEstado(env, 'agenda'))?.valor ?? [];
  const resto = agenda.filter((v) => v.chat !== chat.id);
  const nueva = { chat: chat.id, quien: quienEs(chat), visita, auto, condiciones,
    motivo: auto || condiciones ? null : motivo, recordada: false };
  resto.push(nueva);
  resto.sort((a, b) => aMs(a.visita) - aMs(b.visita));
  await guardarEstado(env, 'agenda', resto.filter((v) => aMs(v.visita) > Date.now() - 12 * HORAS));

  await escribirleAlJefe(env,
    `Visita agendada · ${fichaDeVisita(nueva)}` +
    (nueva.motivo ? `\n${nueva.motivo}` : '') +
    `\n\nSe la confirmé yo. Ponelo en Visita posible.`);
}

/* ── EL DÍA DE LA VISITA (Maxi, 30/10) ───────────────────────────
   "Con los que agendás una cita, el día de la cita a la mañana mandales
   un mensaje: si sigue en pie, confirmás día y hora, que los estamos
   esperando. Y a nosotros, la agenda al día: mañana tenés tal, hoy viene
   tal." Clientes tibios, sin ser pesados: UN mensaje, temprano (8:30).
   - Al cliente: texto libre si la ventana de 24 h está abierta; si no,
     la plantilla aprobada `visita_recordatorio`.
   - A Maxi: "Hoy en el salón" a las 8:30 y "Mañana" a las 21.
   - Si el cliente contesta, aviso a Maxi con lo que dijo: el chat ya
     es del equipo y el bot no le responde.
   Una sola confirmación por visita. */
async function confirmarVisitasDeHoy(env) {
  const agenda = (await leerEstado(env, 'agenda'))?.valor ?? [];
  const hoy = diaDeBsAs();
  const deHoy = agenda.filter((v) => v.visita.slice(0, 10) === hoy);
  if (!deHoy.length) return;
  const lineas = [];
  for (const v of deHoy) {
    const c = await env.DB.prepare('SELECT id, canal, externo_id, nombre FROM conversaciones WHERE id = ?')
      .bind(v.chat).first();
    if (!c) continue;
    let enviada = Boolean(v.confirmacion);
    /* INSTAGRAM Y MESSENGER TAMBIÉN (Maxi, 31/10: "lo que agendás por
       Instagram o Facebook, es todo lo mismo"). Ahí no hay plantillas:
       sólo se puede escribir si la persona habló en las últimas 23 horas.
       Si no, se lo confirma el equipo. */
    const abierta = c.canal === 'whatsapp' || Boolean(await env.DB.prepare(
      `SELECT 1 FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante'
          AND creado > datetime('now','-23 hours') LIMIT 1`
    ).bind(c.id).first());
    if (!enviada && abierta) {
      const nombre = primerNombre(c.nombre);
      const hora = v.visita.length > 10 ? v.visita.slice(11, 16) : null;
      const libre = `Hola${nombre ? ` ${nombre}` : ''}! Buen día. Te escribo para confirmar que hoy`
        + `${hora ? ` a las ${hora}` : ''} te esperamos en el salón, en Pje. Lanín 154, Barracas`
        + `${v.auto ? `, para ver el ${v.auto}` : ''}. Sigue todo en pie?`;
      const visto = (await env.DB.prepare(
        `SELECT COALESCE(MAX(id), 0) AS n FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante'`
      ).bind(c.id).first())?.n ?? 0;
      await env.ENVIOS.get(env.ENVIOS.idFromName(`visita-${c.id}`)).encolar(
        { id: c.id, canal: c.canal, externo_id: c.externo_id },
        [c.canal === 'whatsapp'
          ? { plantilla: 'visita_recordatorio',
              valores: [nombre || 'qué tal', 'hoy', hora ?? 'la hora que acordamos', v.auto ?? 'auto'],
              texto: libre, espera: 0 }
          : { texto: libre, espera: 0 }],
        'ia', visto, 1);
      v.confirmacion = new Date().toISOString();
      enviada = true;
    }
    lineas.push(`${fichaDeVisita(v)}${enviada ? '\nLe mandé la confirmación.' : '\nConfirmale vos: no escribió en las últimas 23 horas y por Instagram o Facebook no se le puede mandar.'}`);
  }
  await guardarEstado(env, 'agenda', agenda);
  if (lineas.length) await anotarAviso(env, `*CONFIRMACIONES DE HOY*\n\n${lineas.join('\n\n')}`);
}

/* RECORDATORIOS PARA MAXI (31/10): "el martes escribile a Federico".
   Corren en el reloj del Worker, así que salen aunque nadie tenga la
   compu prendida. En el panel se ven en verde: es algo para hacer. */
async function recordatoriosDeHoy(env) {
  await programadosDeHoy(env);
  const todos = (await leerEstado(env, 'recordatorios'))?.valor ?? [];
  const toca = (r) => aMs(r.cuando) <= Date.now();
  const ahora = todos.filter(toca);
  if (!ahora.length) return;
  await guardarEstado(env, 'recordatorios', todos.filter((r) => !toca(r)));
  for (const r of ahora) await anotarAviso(env, `*PARA HACER HOY*\n${r.texto}`, { tipo: 'hacer' });
}

/* RESPUESTAS PROGRAMADAS (Maxi, 31/10: "respondé esto mañana a las 11").
   A la hora, si la ventana de 24 h está abierta, salen solas, en partes.
   Si se cerró, Meta no deja escribir sin plantilla: quedan en la Agenda,
   en verde, con el texto listo para que Maxi lo mande desde el teléfono. */
async function programadosDeHoy(env) {
  const todos = (await leerEstado(env, 'programados'))?.valor ?? [];
  const toca = (p) => aMs(p.cuando) <= Date.now();
  const ahora = todos.filter(toca);
  if (!ahora.length) return;
  await guardarEstado(env, 'programados', todos.filter((p) => !toca(p)));
  for (const p of ahora) {
    const chat = await env.DB.prepare('SELECT id, canal, externo_id, nombre FROM conversaciones WHERE id = ?')
      .bind(p.chat).first();
    if (!chat) continue;
    const abierta = await env.DB.prepare(
      `SELECT 1 FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante'
          AND creado > datetime('now','-23 hours') LIMIT 1`
    ).bind(chat.id).first();
    try {
      if (!abierta) throw new Error('ventana cerrada');
      await mandarRespuesta(env, chat, { partes: p.partes, autor: 'persona' });
    } catch (e) {
      await anotarAviso(env, `*PARA HACER HOY*\nMandale esto a ${lineaDe(chat, LISTAS.permuta, '')}`
        + `(${String(e?.message ?? e).includes('ventana') ? 'WhatsApp no deja que lo mande el sistema: pasaron más de 24 h' : 'no salió'}):\n\n${p.partes.join('\n\n')}`, { tipo: 'hacer' });
    }
  }
}

async function hoyEnElSalon(env) {
  const agenda = (await leerEstado(env, 'agenda'))?.valor ?? [];
  const deHoy = agenda.filter((v) => v.visita.slice(0, 10) === diaDeBsAs());
  if (deHoy.length) {
    await anotarAviso(env, `*HOY EN EL SALÓN*\n\n${deHoy.map(fichaDeVisita).join('\n\n')}\n\nA las 8:30 les mando la confirmación.`);
  }
}

async function agendaDeManana(env) {
  const agenda = (await leerEstado(env, 'agenda'))?.valor ?? [];
  const manana = diaDeBsAs(new Date(Date.now() + 24 * HORAS).toISOString().replace('T', ' ').slice(0, 19));
  const deManana = agenda.filter((v) => v.visita.slice(0, 10) === manana);
  if (deManana.length) {
    await anotarAviso(env, `*MAÑANA*\n\n${deManana.map(fichaDeVisita).join('\n\n')}\n\nA la mañana les mando la confirmación.`);
  }
}

async function recordarVisitas(env) {
  const agenda = (await leerEstado(env, 'agenda'))?.valor ?? [];
  const ahora = Date.now();
  let cambio = false;
  for (const v of agenda) {
    if (v.recordada || v.visita.length <= 10) continue;
    const falta = aMs(v.visita) - ahora;
    if (falta > 0 && falta <= 1.5 * HORAS) {
      await escribirleAlJefe(env, `En un rato tenés visita\n${fichaDeVisita(v)}` + (v.motivo ? `\n${v.motivo}` : ''));
      v.recordada = true;
      cambio = true;
    }
  }
  if (cambio) await guardarEstado(env, 'agenda', agenda);
}

async function hacerSeguimientos(env) {
  const cfg = await configDelBot(env);
  if (!enHorario(cfg)) return;
  /* De día y de tarde: un mensaje de venta a la madrugada es de pesado. */
  const horaBsAs = new Date(Date.now() - 3 * HORAS).getUTCHours();
  if (horaBsAs < 9 || horaBsAs >= 21) return;

  const jefe = await chatDelJefe(env);
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.canal, c.externo_id, c.nombre, e.id AS suyo
       FROM conversaciones c
       JOIN mensajes e ON e.id = (
         SELECT id FROM mensajes WHERE conversacion_id = c.id AND direccion = 'entrante'
          AND clase = 'mensaje' ORDER BY creado DESC, id DESC LIMIT 1)
       JOIN mensajes u ON u.id = (
         SELECT id FROM mensajes WHERE conversacion_id = c.id
          ORDER BY creado DESC, id DESC LIMIT 1)
      WHERE c.humano = 0 AND c.id != ?
        /* Lo mismo que en ponerseAlDia: la fecha de la charla primero.
           Va solo el piso —"u" es el último mensaje y puede ser más
           nuevo que "e"—, y con eso alcanza para no recorrer el archivo
           entero. Medido: 1277 filas leídas pasaron a 342, con las
           mismas nueve conversaciones. */
        AND c.ultimo >= datetime('now','-23 hours','-30 minutes')
        AND u.direccion = 'saliente' AND u.autor = 'ia'
        AND e.creado BETWEEN datetime('now','-23 hours','-30 minutes') AND datetime('now','-20 hours')
      LIMIT 20`
  ).bind(jefe?.id ?? 0).all();

  const vistos = (await leerEstado(env, 'seguidos'))?.valor ?? [];
  const nuevos = (results ?? []).filter((c) => canalActivo(cfg, c.canal) && !whatsappEnCuarentena(c.canal)
    && !vistos.includes(c.suyo)).slice(0, 4);
  if (!nuevos.length) return;
  await guardarEstado(env, 'seguidos', [...vistos, ...nuevos.map((c) => c.suyo)].slice(-300));

  for (const chat of nuevos) {
    try {
      if (await loAtendioElEquipo(env, chat.id)) continue;
      const r = await pensarRespuesta(env, chat.id, { automatico: true, seguimiento: 'dia' });
      if (!r.responder || r.derivar || !r.partes.length) continue;
      await mandarRespuesta(env, chat, { partes: r.partes.slice(0, 1), autoId: r.autoId, autor: 'ia' });
      console.log(JSON.stringify({ bot: 'seguimiento', canal: chat.canal }));
    } catch (e) {
      console.error('Seguimiento fallido:', e?.message ?? e);
    }
  }
}

async function buenDia(env, { aPedido = false, porPanel = false, devolver = false } = {}) {
  if (!env.ANTHROPIC_API_KEY || !soloDigitos(env.SUPERVISOR_WHATSAPP)) return;
  const jefe = await chatDelJefe(env);

  const hoy = diaDeBsAs();
  const agenda = ((await leerEstado(env, 'agenda'))?.valor ?? [])
    .filter((v) => v.visita.slice(0, 10) >= hoy);
  const consultas = (await leerEstado(env, 'consultas'))?.valor ?? [];
  const { results: tasar } = await env.DB.prepare(
    `SELECT id, canal, externo_id, nombre, nota FROM conversaciones
      WHERE nota LIKE ? AND ultimo > datetime('now','-14 days') LIMIT 15`
  ).bind(`${PARA_TASAR}%`).all();

  /* Las charlas de los últimos tres días, para leer quién está caliente
     y qué oportunidades hay. Los últimos mensajes de cada una alcanzan. */
  const { results: chats } = await env.DB.prepare(
    `SELECT id, canal, externo_id, nombre, humano, nota FROM conversaciones
      WHERE ultimo > datetime('now','-36 hours') AND id != ?
      ORDER BY (nota IS NULL), (canal != 'whatsapp'), ultimo DESC LIMIT 40`
  ).bind(jefe?.id ?? 0).all();
  const charlas = [];
  for (const c of chats ?? []) {
    const { results: ms } = await env.DB.prepare(
      `SELECT direccion, autor, texto, creado FROM mensajes WHERE conversacion_id = ? AND texto IS NOT NULL
        ORDER BY creado DESC, id DESC LIMIT 10`
    ).bind(c.id).all();
    charlas.push(`### ${quienEs(c)}${c.humano ? ' (lo atiende el equipo)' : ''}${c.nota ? ` · ${c.nota}` : ''}\n` +
      (ms ?? []).reverse().map((m) =>
        `[${String(m.creado).slice(5, 16)}] ${m.direccion === 'entrante' ? 'Cliente' : m.autor === 'ia' ? 'Bot' : 'Equipo'}: ${m.texto.slice(0, 180)}`).join('\n'));
  }
  const { results: autos } = await env.DB.prepare(
    `SELECT marca, modelo, anio, km, precio, moneda FROM autos WHERE estado = 'publicado'`
  ).all().catch(() => ({ results: [] }));

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model: MODELO,
    max_tokens: 8000,
    /* SIN PENSAR: para resumir no hace falta y se comía todo el espacio. */
    thinking: { type: 'disabled' },
    output_config: { effort: 'low' },
    system: `Sos la mano derecha comercial de Maxi, dueño de Manna Selected (autos
seleccionados, Barracas). ${aPedido ? 'Te pidió el resumen del día' : 'Son las 8:30 y le mandás el resumen para arrancar el día'} por
WhatsApp. Pensá como el mejor gerente de ventas: qué hay que hacer hoy
para vender más.

EL FORMATO ES EL DE MAXI. Cada cliente en UNA línea, exactamente así, sin
viñetas ni guiones al principio:
+54 9 11 1234-5678, Juan (Para tasar)  Peugeot 2008 2020, 99.000 km → Hilux GR
Primero el teléfono y el nombre tal como vienen. Entre paréntesis, LA LISTA
DE WHATSAPP DE MAXI donde va ese chat, con estos nombres exactos:
- Importante: TODO lo que necesita que intervenga una persona hoy: para
  tasar (permuta o consignación con datos o fotos), chats pasados al
  equipo, consultas sin contestar, negociaciones, visitas por confirmar,
  y cualquier cliente caliente para cerrar
- Visita posible: quiere venir o ya tiene día
- Consignaciones Posibles: quiere que le vendamos su auto, pero todavía
  no pasó datos ni fotos
- Posible Comprador: pregunta por un auto, sin auto para entregar
- Cliente potencial: interés todavía tibio
- Reservado: ya reservó
Después, su auto con año y km → el auto que le interesa, o en pocas
palabras qué hay que hacer. Los títulos de cada parte, solos en su línea.
NO DEJES AFUERA A NADIE que esté para tasar, con visita o esperando
respuesta: cada uno aparece en alguna parte.

Hoy es ${hoyEnBsAs()}.

ARMÁ EL MENSAJE IGUAL A ESTE MODELO (es el que Maxi aprobó, 29/10): los
mismos títulos en negrita con asteriscos, en este orden, y sólo las
partes que tengan algo. Los datos del modelo son inventados; usá los
reales.

*RESUMEN JUEVES 29/10*

*HOY EN EL SALÓN*
+54 9 11 1234-5678, Carla (Visita posible)  Quiere ver el C300 hoy a la tarde o mañana a la mañana. Confirmale horario.

*DOMINGO 1/11*
+54 9 2345 67-8901 (Importante)  10:00 h  Chevrolet Cruze 2020, 105.000 km → Ranger LTD. Quiere un rango por su auto antes de venir.

*RESPONDER PRIMERO*
+54 9 11 2222-3333, Enrique (Importante)  Mercedes-Benz C 400 2018, 85.000 km → C300. Fotos pendientes.
+54 9 11 4444-5555 (Importante)  BMW 330i 2008, 158.000 km → C300. Ojo: más de 150.000 km.

*PARA AGENDAR*
+54 9 11 6666-7777 (Posible Comprador)  GLA 200, compra directa de contado. Falta día de visita.

*SIN RESPUESTA DEL CLIENTE*
+54 9 11 8888-9999 (Cliente potencial)  C300 Cabrio.

*INSTAGRAM*
@usuario (Cliente potencial)  Comentó "Info?" en el C300. Sin respuesta.

*TENER EN CUENTA*
+54 9 11 1111-2222, Gonzalo (Lo atiende el equipo)  Ofrece un lote en Ezeiza como parte de pago.

*OPORTUNIDADES*
Ranger LTD: 3 consultas hoy. Hay demanda.

Cómo llenar cada parte:
- El título lleva el día de hoy. Las visitas de hoy en "HOY EN EL
  SALÓN"; las de otros días, cada día con su propio título.
- "RESPONDER PRIMERO": los que esperan respuesta nuestra, el más caliente
  arriba, con qué hay que contestarle.
- "PARA AGENDAR": los que quieren venir y no tienen día.
- "SIN RESPUESTA DEL CLIENTE": los que dejaron de contestar.
- "INSTAGRAM": lo de Instagram y Facebook que quedó pendiente.
- "TENER EN CUENTA": lo que no es urgente pero no hay que olvidar.
- "OPORTUNIDADES": lo que puede ser plata (demanda de un auto, un auto
  que nos ofrecen que encaja con lo que otro busca, una consignación
  posible, una permuta que cierra con el stock).
- Si un auto que ofrecen tiene más de 150.000 km, agregá "Ojo: más de
  150.000 km". Si un cliente pidió un horario para que lo llamen,
  ponelo.
- SÓLO LO VIGENTE. Mirá la fecha de cada mensaje: una visita "de hoy" que
  era de ayer ya pasó, alguien que "está en la puerta" ayer ya vino, y lo
  que el equipo ya resolvió no va. Nunca repitas a un cliente en dos
  partes ni pongas líneas de "ya figura arriba". Los teléfonos, tal cual
  vienen: nunca inventes ni completes uno.
Si no hay nada en una parte, no la pongas. Si no hay nada en ninguna,
escribí sólo "${aPedido ? 'Hoy no hay nada pendiente' : 'Buen día. Hoy sin novedades'}".`,
    messages: [{ role: 'user', content:
      `VISITAS\n${agenda.map((v) => `${v.visita} · ${v.quien} · ${v.auto ?? ''} · ${v.condiciones ?? v.motivo ?? ''}`).join('\n') || '(ninguna)'}\n\n` +
      `PARA TASAR\n${(tasar ?? []).map((c) => `${quienEs(c)}: ${c.nota}`).join('\n') || '(ninguno)'}\n\n` +
      `CONSULTAS SIN CONTESTAR\n${consultas.map((c) => `${c.n}. ${c.pregunta}`).join('\n') || '(ninguna)'}\n\n` +
      `STOCK\n${(autos ?? []).map((a) => `${a.marca} ${a.modelo} ${a.anio} · ${a.km} km · ${a.moneda} ${a.precio}`).join('\n')}\n\n` +
      `CHARLAS DE LAS ÚLTIMAS 36 HORAS (cada mensaje con su fecha y hora UTC; Buenos Aires es UTC-3)\n\n${charlas.join('\n\n')}` }],
  });
  const texto = (r.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  /* VACÍO NO ES "NADA QUE CONTAR": es que se cortó (30/10: se gastaba el
     espacio pensando y no escribía nada). Que se note. */
  if (!texto) throw new Error(`Claude no escribió el resumen (corte: ${r.stop_reason})`);
  if (texto) await escribirleAlJefe(env, texto, { respuesta: aPedido && !porPanel });
  if (devolver) return texto;
}

/* MANDAR UNA PLANTILLA APROBADA (ver src/plantillas.js). Es lo único que
   se puede escribir pasadas las 24 horas del último mensaje de la persona. */
async function mandarPlantilla(env, chat, nombre, valores = []) {
  const r = await graphMandar(env.WHATSAPP_TOKEN, 'WHATSAPP_TOKEN',
    `/${env.WHATSAPP_PHONE_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: chat.externo_id,
      type: 'template',
      template: {
        name: nombre,
        language: { code: IDIOMA },
        ...(valores.length ? { components: [{ type: 'body',
          parameters: valores.map((t) => ({ type: 'text', text: String(t) })) }] } : {}),
      },
    });
  return r?.messages?.[0]?.id ?? null;
}

/* ── POSVENTA (Maxi, 29/10) ──────────────────────────────────────
   "Que vean que estamos presentes, que no nos borramos". Cuenta desde
   que el cliente queda como "compró" (etapa 'cerrado': Maxi lo dice por
   WhatsApp o desde el panel).
   - A las 48 horas: un gracias corto y "acá estamos", con palabras que
     varían si la ventana está abierta, o la plantilla si no.
   - A las 72 horas: el pedido de reseña de Google, en los tres mensajes
     que escribió Maxi, con 5 y 2 segundos entre uno y otro.
   SI CONTESTA EN EL MEDIO, LO QUE FALTA NO SALE (la cola se corta sola)
   y le llega un aviso a Maxi: a un cliente que ya compró le contesta una
   persona. WhatsApp no avisa cuando alguien está escribiendo o grabando,
   así que no se puede esperar a eso; lo que sí se respeta es si escribió.
   Sólo de 10 a 20, y una sola vez cada cosa por cliente. */
const GRACIAS_POSVENTA = [
  (n) => `Hola ${n}! Cómo va todo con el auto? Te escribo para agradecerte de nuevo por confiar en nosotros. Cualquier cosa que necesites, acá estamos.`,
  (n) => `${n}, cómo andás? Pasaba a saludarte y a darte las gracias otra vez por elegirnos. Si necesitás algo del auto, escribime cuando quieras.`,
  (n) => `Hola ${n}! Qué tal los primeros días con el auto? Gracias de nuevo por la confianza. Acá estamos para lo que haga falta.`,
];

const primerNombre = (nombre) => {
  const n = String(nombre ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,20}$/.test(n) ? n : '';
};

async function hacerPosventa(env) {
  if (whatsappEnCuarentena('whatsapp')) return;
  const horaBsAs = new Date(Date.now() - 3 * HORAS).getUTCHours();
  if (horaBsAs < 10 || horaBsAs >= 20) return;
  const { results } = await env.DB.prepare(
    `SELECT id, canal, externo_id, nombre, etapa_cambio,
            (julianday('now') - julianday(etapa_cambio)) * 24 AS horas
       FROM conversaciones
      WHERE etapa = 'cerrado' AND canal = 'whatsapp'
        AND etapa_cambio > datetime('now','-6 days')`
  ).all();
  if (!results?.length) return;

  const hechos = (await leerEstado(env, 'posventa'))?.valor ?? {};
  for (const c of results) {
    const h = hechos[c.id] ?? {};
    const nombre = primerNombre(c.nombre);
    const chat = { id: c.id, canal: c.canal, externo_id: c.externo_id };
    let pasos = null;
    if (!h.gracias && c.horas >= 48 && c.horas < 96) {
      const libre = GRACIAS_POSVENTA[Math.floor(Math.random() * GRACIAS_POSVENTA.length)](nombre || 'qué tal')
        .replace(/^qué tal, /, 'Qué tal, ');
      pasos = [{ plantilla: 'posventa_gracias', valores: [nombre || 'qué tal'], texto: libre, espera: 0 }];
      h.gracias = new Date().toISOString();
    } else if (h.gracias && !h.resena && c.horas >= 72 && c.horas < 120) {
      const valores = [nombre || 'qué tal'];
      pasos = [
        { plantilla: 'posventa_resena_1', valores, texto: textoDe('posventa_resena_1', valores), espera: 0 },
        { plantilla: 'posventa_resena_2', valores: [], texto: textoDe('posventa_resena_2'), espera: 5000 },
        { plantilla: 'posventa_resena_3', valores: [], texto: textoDe('posventa_resena_3'), espera: 2000 },
      ];
      h.resena = new Date().toISOString();
    }
    if (!pasos) continue;
    hechos[c.id] = h;
    await guardarEstado(env, 'posventa', hechos);
    const visto = (await env.DB.prepare(
      `SELECT COALESCE(MAX(id), 0) AS n FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante'`
    ).bind(c.id).first())?.n ?? 0;
    /* humanoAntes = 1: el chat ya es del equipo y eso no lo corta. */
    await env.ENVIOS.get(env.ENVIOS.idFromName(`posventa-${c.id}`))
      .encolar(chat, pasos, 'ia', visto, 1);
  }
}

/* LO QUE QUEDÓ SIN CONTESTAR (Maxi, 28/10).
   Si el bot estaba apagado cuando alguien escribió, ese chat quedaba
   colgado para siempre: el bot sólo se despierta con un mensaje nuevo.
   Esto lo busca cuando se prende y en cada vuelta del reloj (cada media
   hora), y lo contesta como si recién hubiera llegado.

   QUÉ CUENTA COMO PENDIENTE: el último mensaje es del cliente, tiene
   entre 2 minutos y 12 horas (más viejo, ya se enfrió y la ventana de
   Meta se achica), nadie del equipo escribió en esas 12 horas, y el chat
   no lo atiende una persona. Si el equipo anda en la charla, no se mete. */
async function ponerseAlDia(env, { hasta = 10 } = {}) {
  const { results } = await env.DB.prepare(
    `SELECT c.id AS conversacion, c.canal, m.id AS mensaje
       FROM conversaciones c
       JOIN mensajes m ON m.id = (
         SELECT id FROM mensajes WHERE conversacion_id = c.id
          ORDER BY creado DESC, id DESC LIMIT 1)
      WHERE c.humano = 0
        /* EMPEZAR POR LA FECHA DE LA CHARLA Y NO POR TODAS LAS CHARLAS.
           Sin esta línea la consulta miraba las 328 conversaciones una
           por una —buscando el último mensaje de cada una— para quedarse
           con dos. La columna "ultimo" se escribe en cada mensaje y
           tiene índice, así que pedirla acá no cambia el resultado: si
           el último mensaje entró en las últimas 12 horas, esa fecha
           también está ahí. Medido contra la base real: 1875 filas
           leídas pasaron a 402, con las mismas dos respuestas. */
        AND c.ultimo >= datetime('now','-12 hours')
        AND m.direccion = 'entrante'
        AND m.clase = 'mensaje'
        AND m.creado BETWEEN datetime('now','-12 hours') AND datetime('now','-2 minutes')
        AND NOT EXISTS (
          SELECT 1 FROM mensajes p WHERE p.conversacion_id = c.id
             AND p.direccion = 'saliente' AND p.autor = 'persona')
      ORDER BY m.creado
      LIMIT 50`
  ).all();

  /* UNA VEZ POR MENSAJE. Si el bot decidió que un "Ok" no se contesta,
     ese "Ok" sigue siendo el último; sin esta memoria lo volvería a
     pensar cada media hora. */
  const vistos = (await leerEstado(env, 'al_dia'))?.valor ?? [];
  const jefe = await chatDelJefe(env);
  const nuevos = (results ?? [])
    .filter((r) => !vistos.includes(r.mensaje) && r.conversacion !== jefe?.id)
    .slice(0, hasta);
  if (!nuevos.length) return 0;
  await guardarEstado(env, 'al_dia', [...vistos, ...nuevos.map((r) => r.mensaje)].slice(-300));

  console.log(JSON.stringify({ alDia: 'pendientes', cuantos: nuevos.length }));
  await atenderSolo(env, nuevos);
  return nuevos.length;
}

async function atenderSolo(env, disparos) {
  const cfg = await configDelBot(env);
  if (!disparos.some((d) => canalActivo(cfg, d.canal))) return;
  if (!enHorario(cfg)) return;

  await new Promise((listo) => setTimeout(listo, ESPERA_ANTES_DE_CONTESTAR));

  /* UNA POR VEZ: en paralelo serían varias llamadas a Claude y a Meta
     desde la misma invocación, y Cloudflare corta por pedidos salientes. */
  for (const d of disparos) {
    /* Se vuelve a mirar después de la espera: si en esos segundos dieron
       las 8, WhatsApp ya no le toca al bot. */
    if (!canalActivo(cfg, d.canal)) continue;
    try {
      const chat = await env.DB.prepare(
        'SELECT id, canal, externo_id, humano, nombre, nota, etapa FROM conversaciones WHERE id = ?'
      ).bind(d.conversacion).first();
      await historialDeInstagram(env, chat)
        .catch((e) => console.error('No se pudo traer la charla anterior:', e?.message ?? e));
      /* UN CLIENTE QUE YA COMPRÓ CONTESTA (casi siempre, a la posventa):
         no le habla el bot, se le avisa a Maxi para que le conteste él. */
      /* CONTESTA LA CONFIRMACIÓN DE SU VISITA: lo que dijo, a Maxi. */
      if (chat?.humano && !esElJefe(env, chat)) {
        const agendaHoy = (await leerEstado(env, 'agenda'))?.valor ?? [];
        const suya = agendaHoy.find((v) => v.chat === chat.id && v.confirmacion
          && Date.now() - new Date(v.confirmacion).getTime() < 24 * HORAS);
        if (suya) {
          const dijo = await env.DB.prepare('SELECT texto, tipo FROM mensajes WHERE id = ?').bind(d.mensaje).first();
          await anotarAviso(env, `Contestó la confirmación de su visita\n${lineaDe(chat, LISTAS.permuta,
            `${suya.visita.slice(11, 16) || 'hoy'}: «${(dijo?.texto ?? `[${dijo?.tipo ?? 'mensaje'}]`).slice(0, 300)}»`)}`);
          continue;
        }
      }
      if (chat?.humano && chat.etapa === 'cerrado' && !esElJefe(env, chat)) {
        const dijo = await env.DB.prepare('SELECT texto, tipo FROM mensajes WHERE id = ?')
          .bind(d.mensaje).first();
        await anotarAviso(env, `Te escribió un cliente que ya compró\n${lineaDe(chat, LISTAS.permuta, `«${(dijo?.texto ?? `[${dijo?.tipo ?? 'mensaje'}]`).slice(0, 300)}»`)}`);
        continue;
      }
      if (!chat || esElJefe(env, chat)) continue;
      /* CHATS DEL EQUIPO (Maxi, 31/10): si el cliente pregunta un dato y
         en 20 minutos nadie le contestó, contesta el bot, sólo datos. */
      if (chat.humano || await loAtendioElEquipo(env, chat.id)) {
        if (chat.etapa !== 'cerrado' && !/borr/i.test(chat.nota ?? '')) {
          await env.ENVIOS.get(env.ENVIOS.idFromName(`equipo-${chat.id}`))
            .esperarAlEquipo({ id: chat.id, canal: chat.canal, externo_id: chat.externo_id }, d.mensaje)
            .catch((e) => console.error('No se pudo programar la espera:', e?.message ?? e));
        }
        continue;
      }

      const ultimo = await env.DB.prepare(
        `SELECT id FROM mensajes WHERE conversacion_id = ?
          ORDER BY creado DESC, id DESC LIMIT 1`
      ).bind(chat.id).first();
      if (ultimo?.id !== d.mensaje) continue;

      /* EL FRENO CUENTA LO QUE SALIO SIN QUE EL CLIENTE DIJERA NADA.

         Antes contaba todos los mensajes nuestros de los ultimos diez
         minutos y cortaba a los cinco. Pero el bot manda cada respuesta
         en tres o cuatro partes a proposito, asi que DOS respuestas
         normales ya lo disparaban: contestaba dos veces y despues se
         quedaba mudo en plena charla, justo cuando la persona estaba
         mas enganchada.

         Lo que hay que detectar no es "muchos mensajes" sino "muchos
         mensajes sin que el otro conteste", que es la forma de un bucle.
         Mientras el cliente siga escribiendo, la cuenta se reinicia
         sola: una charla larga no se frena nunca, y un bucle se frena
         igual de rapido que antes. */
      const sinRespuesta = await env.DB.prepare(
        `SELECT COUNT(*) n FROM mensajes
          WHERE conversacion_id = ? AND direccion = 'saliente'
            AND id > COALESCE((SELECT MAX(id) FROM mensajes
                                WHERE conversacion_id = ? AND direccion = 'entrante'), 0)`
      ).bind(chat.id, chat.id).first();

      if ((sinRespuesta?.n ?? 0) >= 8) {
        console.log(JSON.stringify({
          bot: 'frenado por ráfaga', chat: chat.id, sin_respuesta: sinRespuesta.n,
        }));
        continue;
      }

      const r = await pensarRespuesta(env, chat.id, { automatico: true, deNoche: esDeNoche() });
      /* SI MIENTRAS PENSABA ESCRIBIÓ OTRA COSA, esta respuesta ya llega
         tarde (Maxi, 1/11: le preguntó qué auto era justo después de que
         lo dijo). La contesta el aviso de su mensaje nuevo. */
      const despues = await env.DB.prepare(
        `SELECT 1 FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante' AND id > ? LIMIT 1`
      ).bind(chat.id, d.mensaje).first();
      if (despues) continue;
      if (r.ultimo?.direccion !== 'entrante') continue;

      /* PASAR A UNA PERSONA ES AUTOMÁTICO TAMBIÉN. Si pide hablar con
         alguien o que borremos sus datos, el bot deja de contestar ese
         chat y queda anotado por qué. Igual sale el mensaje corto que
         avisa que sigue alguien. */
      /* PARA TASAR (pedido de Maxi, 28/10): un auto que dejan para ver el
         valor, en permuta o en consignación. Queda marcado en el panel con
         lo que se juntó, para tenerlo a mano en "Para tasar". La marca no
         corta la charla: eso lo decide `derivar`, aparte. */
      const notaTasar = r.paraTasar
        ? `${PARA_TASAR} (${r.paraTasar === 'permuta' ? 'permuta' : 'consignación'}): ${r.resumenParaTasar ?? ''}`.trim()
        : null;
      if (notaTasar) {
        await env.DB.prepare('UPDATE conversaciones SET nota = ?, tipo = ? WHERE id = ?')
          .bind(notaTasar, r.paraTasar === 'permuta' ? 'permuta' : 'vendedor', chat.id).run();
      }
      /* UNA VISITA NO CORTA LA CHARLA (Maxi, 31/10): el bot la confirma y
         sigue contestando. Si lo único que pasó fue la visita, no se pasa. */
      if (r.derivar && r.visita && /visita|venir|viene|salón|salon/i.test(r.derivar)
          && !/negoci|señ|reserv|pag|enoj|reclam|borr|persona|equipo|150\.000|130\.000/i.test(r.derivar)) {
        r.derivar = null;
      }
      if (r.derivar) {
        /* Si es para tasar, la nota de tasar se queda: dice más. */
        await env.DB.prepare('UPDATE conversaciones SET humano = 1, nota = ? WHERE id = ?')
          .bind(notaTasar ?? `La IA lo pasó: ${r.derivar}`, chat.id).run();
      }

      if (r.esComentario) await atenderComentario(env, chat, r);
      /* UN "OK" DESPUÉS DE DESPEDIRSE NO SE CONTESTA (Maxi, 28/10): el
         bot puede decidir que no hace falta decir nada. Y A QUIEN YA
         COMPRÓ, NI UNA PALABRA: pasa al equipo en silencio (Esteban,
         28/10: el bot le habló como a un desconocido). */
      else if (!r.responder) {
        console.log(JSON.stringify({ bot: r.derivar ? 'pasó en silencio' : 'no hacía falta', canal: chat.canal }));
      }
      else await mandarRespuesta(env, chat, {
        partes: r.partes, autoId: r.autoId, ubicacion: r.ubicacion,
        aWhatsapp: Boolean(r.derivar || r.irAWhatsapp), autor: 'ia',
        /* Si le pasó un precio, a los 20 minutos de silencio se piensa un
           seguimiento (ver `Envios`). */
        despues: !r.derivar && !whatsappEnCuarentena(chat.canal) && DIO_PRECIO.test(r.partes.join(' '))
          ? { pensar: 'precio', texto: null, espera: 20 * 60 * 1000 } : null,
      });

      /* LO QUE MAXI TIENE QUE SABER, en el momento: una visita, un chat
         que pasa al equipo, un auto nuevo para tasar. Uno por evento. */
      if (r.visita) {
        await agendarVisita(env, chat, {
          visita: r.visita, auto: r.visitaAuto, condiciones: r.visitaCondiciones, motivo: r.derivar,
        }).catch((e) => console.error('No se pudo agendar:', e?.message ?? e));
      } else if (r.derivar) {
        /* TODO LO QUE PIDE UNA PERSONA VA A IMPORTANTE (Maxi, 30/10). */
        await escribirleAlJefe(env, `Te paso un chat\n${lineaDe(chat, LISTAS.permuta, r.derivar)}`);
      } else if (notaTasar && !String(chat.nota ?? '').startsWith(PARA_TASAR)) {
        /* UNA VEZ POR CLIENTE: cada dato nuevo reescribe la nota y antes
           salía un aviso por cada uno (29/10, tres del mismo Cruze). */
        /* PARA TASAR ES IMPORTANTE, permuta o consignación: ya hay un auto
           con datos y fotos esperando propuesta (Maxi, 29/10). */
        await escribirleAlJefe(env, 'Para tasar\n' +
          lineaDe(chat, LISTAS.permuta,
            notaTasar.replace(/^Para tasar \([^)]*\):\s*/, '')));
      }

      /* A QUIÉN AVISARLE SI SE CAE LA RESERVA. */
      if (r.interesadoReservado) {
        const esperan = (await leerEstado(env, 'esperan_reserva'))?.valor ?? {};
        const lista = esperan[r.interesadoReservado] ?? [];
        if (!lista.includes(chat.id)) {
          esperan[r.interesadoReservado] = [...lista, chat.id].slice(-50);
          await guardarEstado(env, 'esperan_reserva', esperan);
        }
      }

      if (r.consulta && !r.derivar) {
        await consultarAlJefe(env, chat, r.consulta, r.ultimo?.texto)
          .catch((e) => console.error('No se pudo consultar a Maxi:', e?.message ?? e));
      }

      /* Sin una palabra del mensaje: sólo qué hizo y por dónde. */
      console.log(JSON.stringify({
        bot: r.derivar ? 'derivó' : 'contestó', canal: chat.canal,
        por: r.esComentario ? 'comentario' : 'privado',
      }));
    } catch (e) {
      /* EL DETALLE Y NO SOLO EL TITULO. "Authentication Error" a secas
         no dice si la clave esta mal, si falta saldo o si el modelo no
         esta habilitado: los tres se arreglan distinto. El SDK trae el
         codigo y el cuerpo del error, y eso es lo que sirve para
         diagnosticar sin tener que adivinar. */
      console.error('El bot no pudo contestar:', JSON.stringify({
        mensaje: e?.message ?? String(e),
        status: e?.status ?? null,
        tipo: e?.error?.error?.type ?? e?.name ?? null,
        detalle: e?.error?.error?.message ?? null,
      }));
    }
  }
}

/* UN COMENTARIO DE INSTAGRAM.
   El me gusta va primero y aparte: a un comentario amable se le pone
   aunque no haya nada que contestar, y si falla no frena lo demás.
   Después, si hay que escribirle, va UN privado —la respuesta privada a
   un comentario se usa una sola vez, así que las partes y el link van
   juntos en ese mensaje— y recién cuando salió, el aviso público abajo
   del comentario. En ese orden: avisar que escribimos antes de haber
   escrito es mentirle a todo el que lo lea. */
async function atenderComentario(env, chat, r) {
  const comentario = r.ultimo;
  if (chat.canal !== 'instagram' || !comentario?.externo_id) return;

  if (r.megusta) {
    try { await megustaEnInstagram(env, comentario.externo_id); }
    catch (e) { console.error('No se pudo dar me gusta:', e?.message ?? e); }
  }

  if (!r.responder && !r.derivar) {
    /* Un elogio: me gusta y un gracias abajo. Uno por persona y por
       publicación, aunque deje cinco emojis. */
    if (r.megusta) {
      const clave = `${chat.id}:${comentario.media_id ?? comentario.externo_id}`;
      const ya = (await leerEstado(env, 'gracias'))?.valor ?? [];
      if (!ya.includes(clave)) {
        await guardarEstado(env, 'gracias', [...ya, clave].slice(-500));
        try { await avisarEnElComentario(env, comentario.externo_id, GRACIAS); }
        catch (e) { console.error('No se pudo agradecer en el comentario:', e?.message ?? e); }
      }
    }
    return;
  }

  if (comentario.media_id) {
    const yaFuimos = await env.DB.prepare(
      `SELECT 1 FROM mensajes WHERE conversacion_id = ? AND direccion = 'saliente'
          AND media_id = ? LIMIT 1`
    ).bind(chat.id, comentario.media_id).first();
    if (yaFuimos) return;
  }

  const link = conPresentacion(await linkSinRepetir(env, chat.id, r.autoId), chat.canal);
  const texto = armarTextos(r.partes, [
    link,
    await ubicacionSinRepetir(env, chat.id, r.ubicacion),
    r.derivar || r.irAWhatsapp ? A_WHATSAPP : null,
  ].filter(Boolean)).join('\n\n');

  const id = await mandarUno(env, chat, texto, { comentarioId: comentario.externo_id });
  await guardarSaliente(env, chat.id, texto, 'ia', id, { mediaId: comentario.media_id });

  try { await avisarEnElComentario(env, comentario.externo_id); }
  catch (e) { console.error('No se pudo avisar en el comentario:', e?.message ?? e); }
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
  let disparos = [];
  try {
    const lista = mensajesDelAviso(aviso, env.WHATSAPP_PHONE_ID);
    if (lista.length) {
      disparos = await guardarEntrantes(env, lista);
      guardados = lista.length;
    }
  } catch (e) {
    console.error('No se pudo guardar el aviso de Meta:', e?.message ?? e);
  }

  /* EL BOT CONTESTA DESPUÉS DE ESTA RESPUESTA, no antes: Meta necesita
     el 200 en segundos —si tarda, reintenta el mismo aviso y a la larga
     desactiva la dirección— y el bot espera a que la persona termine de
     escribir. `waitUntil` deja que siga trabajando con la respuesta ya
     enviada.
     SÓLO CON FIRMA VERIFICADA (regla 11): lo que no se pudo verificar
     se guarda, pero nunca se usa para contestar. */
  if (verificado && disparos.length && ctx) {
    /* Primero los audios a texto, así el bot ya los lee al contestar. */
    ctx.waitUntil((async () => {
      await Promise.all([
        transcribirAudios(env, disparos.audios),
        describirFotos(env, disparos.fotos),
      ]);
      /* Lo que escribe Maxi no es una consulta: es el jefe. */
      const delJefe = [];
      const deClientes = [];
      for (const d of disparos) {
        const c = await env.DB.prepare('SELECT canal, externo_id FROM conversaciones WHERE id = ?')
          .bind(d.conversacion).first();
        (esElJefe(env, c) ? delJefe : deClientes).push(d);
      }
      for (const d of delJefe) {
        await atenderAlJefe(env, d.conversacion, d.mensaje)
          .catch((e) => console.error('No se pudo atender a Maxi:', e?.message ?? e));
      }
      if (deClientes.length) await atenderSolo(env, deClientes);
    })());
  }

  /* El `object` sale de un cuerpo que puede venir de cualquiera, así que
     al log va sólo si es uno de los tres que conocemos. Pegar texto
     ajeno en el log es ensuciarlo con lo que el otro quiera escribir. */
  const CANALES_META = ['whatsapp_business_account', 'instagram', 'page'];
  const canal = CANALES_META.includes(aviso?.object) ? aviso.object : 'desconocido';

  /* A QUE NUMERO NUESTRO ENTRO EL AVISO, y con que campo. Teniendo dos
     numeros dados de alta —el de prueba y el del negocio— un aviso que
     llega no dice por si solo cual de los dos lo recibio, y sin eso no
     hay forma de saber si el numero nuevo esta andando.

     ES UN DATO NUESTRO, NO DE NADIE MAS: el telefono del negocio esta
     publicado en la web. El de la otra persona sigue sin ir al log.

     `campo` es el tipo de aviso ('messages', 'smb_message_echoes',
     'history'...). Hoy solo se leen los mensajes; ver cual llega es lo
     que dice si falta atender alguno. */
  const cambios = (aviso?.entry ?? []).flatMap((e) => e.changes ?? []);
  const nuestro = cambios.map((c) => c?.value?.metadata?.display_phone_number).find(Boolean) ?? null;
  const campos = [...new Set(cambios.map((c) => c?.field).filter(Boolean))];

  console.log(JSON.stringify({
    meta: verificado ? `verificado (${verificado})` : 'sin verificar (no hay claves cargadas)',
    canal,
    a: nuestro,
    campos,
    mensajes: guardados,
    contestando: verificado ? disparos.length : 0,
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
        return admin(peticion, env, ruta, metodo, ctx);
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
    const minutoDelReloj = new Date(evento.scheduledTime ?? Date.now()).getUTCMinutes();

    /* LO QUE MANDA A MAXI VA PRIMERO Y EN LA COLA (30/10: el buen día de
       las 8:30 y el repaso de las 21 no llegaban). Antes corrían al final
       de esta vuelta, después de ponerse al día y de los seguimientos, que
       piensan con Claude y tardan: la vuelta se cortaba antes. Ahora se
       encargan a la cola de envíos, que corre aparte y sin ese límite. */
    /* HOY EN EL SALÓN, A LAS 7:30 (Maxi, 31/10). A los clientes se les
       sigue escribiendo a las 8:30: a las 7:30 es temprano para ellos. */
    if (hora === 10 && minutoDelReloj >= 30 && minutoDelReloj < 35) {
      await hoyEnElSalon(env).catch((e) => console.error('No salió hoy en el salón:', e?.message ?? e));
    }
    if (hora === 11 && minutoDelReloj >= 30 && minutoDelReloj < 35) {
      await env.ENVIOS.get(env.ENVIOS.idFromName('tareas-buen-dia')).tarea('buenDia').catch(() => {});
    }
    if (hora === 0 && minutoDelReloj < 5) {
      await env.ENVIOS.get(env.ENVIOS.idFromName('tareas-repaso')).tarea('repaso').catch(() => {});
    }
    /* Constancia de que la vuelta arrancó, para poder verificarlo sin
       mirar el log (ver /api/admin/reloj). */
    await guardarEstado(env, 'reloj', { cuando: new Date().toISOString(), hora, minuto: minutoDelReloj })
      .catch(() => {});

    try { await ponerseAlDia(env); }
    catch (e) { console.error('No se pudo poner al día:', e?.message ?? e); }

    const minuto = new Date(evento.scheduledTime ?? Date.now()).getUTCMinutes();

    try { await hacerPosventa(env); }
    catch (e) { console.error('No se pudo hacer la posventa:', e?.message ?? e); }
    try { await hacerSeguimientos(env); }
    catch (e) { console.error('No se pudieron hacer los seguimientos:', e?.message ?? e); }
    try { await recordatoriosDeHoy(env); }
    catch (e) { console.error('No salieron los recordatorios:', e?.message ?? e); }
    try { await recordarVisitas(env); }
    catch (e) { console.error('No se pudieron recordar las visitas:', e?.message ?? e); }
    void minuto;

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

async function admin(peticion, env, ruta, metodo, ctx) {
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

  /* BUSCAR EN LOS MENSAJES (30/10: los que preguntaron por el 118).
     POST con el texto en el cuerpo, no en la dirección. Devuelve cada
     chat con lo que hace falta para decidir si escribirle: si le dijimos
     que estaba reservado, si habló alguien del equipo, cómo terminó y
     cuándo escribió por última vez. */
  if (ruta === '/api/admin/buscar' && metodo === 'POST') {
    const cuerpo = await peticion.json().catch(() => ({}));
    const q = texto(cuerpo?.q, 80);
    if (!q) return error('Falta qué buscar');
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.canal, c.externo_id, c.nombre, c.humano, c.nota, c.etapa, c.perdido, c.ultimo,
              (SELECT MAX(creado) FROM mensajes WHERE conversacion_id = c.id AND direccion = 'entrante') AS ultimo_suyo,
              (SELECT COUNT(*) FROM mensajes WHERE conversacion_id = c.id AND direccion = 'saliente'
                 AND instr(lower(texto), 'reservad') > 0) AS dijimos_reservado,
              (SELECT COUNT(*) FROM mensajes WHERE conversacion_id = c.id AND direccion = 'saliente'
                 AND autor = 'persona') AS hablo_equipo
         FROM conversaciones c
        WHERE EXISTS (SELECT 1 FROM mensajes m WHERE m.conversacion_id = c.id
                       AND instr(lower(m.texto), lower(?)) > 0)
        ORDER BY c.ultimo DESC LIMIT 300`
    ).bind(q).all();
    for (const c of results ?? []) {
      const { results: ms } = await env.DB.prepare(
        `SELECT creado, direccion, autor, texto FROM mensajes WHERE conversacion_id = ?
          AND texto IS NOT NULL ORDER BY creado DESC, id DESC LIMIT 6`
      ).bind(c.id).all();
      c.ultimos = (ms ?? []).reverse().map((m) =>
        `[${String(m.creado).slice(5, 16)}] ${m.direccion === 'entrante' ? 'Cliente' : m.autor === 'ia' ? 'Bot' : 'Equipo'}: ${m.texto.slice(0, 160)}`);
    }
    return json({ chats: results ?? [] });
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
     respuesta y lo manda una persona si le gusta. Una respuesta
     equivocada a un cliente no se puede deshacer, así que hasta que no
     se vea cómo contesta con gente de verdad, la última palabra es de
     una persona. Para que conteste solo está el modo automático, por
     canal, más abajo.

     Con el texto viene la ficha de auto que mandaría y si cree que lo
     tiene que seguir una persona: el panel lo muestra y decide el que
     atiende. */
  const sugerirA = ruta.match(/^\/api\/admin\/chats\/(\d+)\/sugerir$/);
  if (sugerirA && metodo === 'POST') {
    try {
      const r = await pensarRespuesta(env, sugerirA[1]);
      const ficha = r.autoId ? await fichaDe(env, r.autoId) : null;
      return json({
        texto: r.texto,
        conPosteo: r.conPosteo,
        derivar: r.derivar,
        ficha: ficha && { auto_id: r.autoId, ...ficha },
        ubicacion: r.ubicacion,
      });
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
        const d = await pensarRespuesta(env, c.id);
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
    const mensaje = texto(cuerpo?.texto, 3000);
    if (!mensaje) return error('Falta el texto');
    const autoId = entero(cuerpo?.auto_id, 1, 1e9);
    const ubicacion = cuerpo?.ubicacion === true;
    /* Cada párrafo del cuadro —separado por una línea en blanco— sale
       como un mensaje aparte. */
    const partes = mensaje.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);

    const chat = await env.DB
      .prepare('SELECT id, canal, externo_id FROM conversaciones WHERE id = ?')
      .bind(responderA[1]).first();
    if (!chat) return error('No está', 404);

    /* `autor: persona` porque esto lo mandó alguien del equipo desde el
       panel, aunque el borrador lo haya escrito la IA: lo leyó y decidió
       mandarlo una persona. Lo que sale solo queda como 'ia'. */
    /* SI SÓLO COMENTÓ, NO HAY PRIVADO ABIERTO: Instagram rechaza un
       mensaje común ("outside of allowed window"). La única puerta es la
       respuesta privada a su comentario, que es UN mensaje y se usa una
       vez, así que las partes van juntas. */
    if (chat.canal === 'instagram') {
      const privado = await env.DB.prepare(
        `SELECT 1 FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante'
            AND clase = 'mensaje' AND creado > datetime('now','-24 hours') LIMIT 1`
      ).bind(chat.id).first();
      const comentario = privado ? null : await env.DB.prepare(
        `SELECT externo_id, media_id FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante'
            AND clase = 'comentario' ORDER BY creado DESC, id DESC LIMIT 1`
      ).bind(chat.id).first();
      if (comentario?.externo_id) {
        try {
          const link = conPresentacion(await linkSinRepetir(env, chat.id, autoId), chat.canal);
          const todo = armarTextos(partes, [link].filter(Boolean)).join('\n\n');
          const id = await mandarUno(env, chat, todo, { comentarioId: comentario.externo_id });
          await guardarSaliente(env, chat.id, todo, 'persona', id, { mediaId: comentario.media_id });
          try { await avisarEnElComentario(env, comentario.externo_id); } catch { /* secundario */ }
          return json({ ok: true, partes: 1, comoComentario: true });
        } catch (e) {
          return error(e?.message || 'Instagram no aceptó la respuesta al comentario', 502);
        }
      }
    }

    try {
      return json({ ok: true, ...(await mandarRespuesta(env, chat, {
        partes, autoId, ubicacion, autor: 'persona',
      })) });
    } catch (e) {
      return error(e?.message || 'Meta no aceptó el mensaje', 502);
    }
  }

  /* LO QUE MAXI LE DICE A LA IA, POR EL PANEL. Lo mismo que si se lo
     escribiera por WhatsApp (contestar una consulta, "Richi compró", una
     regla), pero sin WhatsApp: lo carga el asistente que lo acompaña. La
     respuesta queda en los avisos. Se guarda en su chat, como sus
     mensajes, para que la IA lo lea igual. */
  if (ruta === '/api/admin/jefe' && metodo === 'POST') {
    const cuerpo = await peticion.json().catch(() => ({}));
    const dicho = texto(cuerpo?.texto, 2000);
    if (!dicho) return error('Falta el texto');
    const jefe = await chatDelJefe(env);
    if (!jefe) return error('Falta SUPERVISOR_WHATSAPP');
    const r = await env.DB.prepare(
      `INSERT INTO mensajes (conversacion_id, direccion, tipo, texto, clase)
       VALUES (?, 'entrante', 'texto', ?, 'mensaje')`
    ).bind(jefe.id, dicho).run();
    /* SE ESPERA ACÁ Y NO EN waitUntil (31/10): con la agenda, las
       consultas y lo aprendido, Claude tarda más de los 30 segundos que
       da waitUntil, y el pedido se cortaba sin rastro. Un pedido HTTP
       puede esperar; si falla, devuelve el motivo. */
    try {
      await atenderAlJefe(env, jefe.id, r.meta.last_row_id, { porPanel: true });
      return json({ ok: true });
    } catch (e) {
      return error(`No se pudo atender: ${String(e?.message ?? e).slice(0, 500)}`, 500);
    }
  }

  /* EL RESUMEN, ARMADO EN EL MOMENTO y devuelto en la respuesta (30/10:
     por la cola no terminaba nunca). Un pedido HTTP puede esperar lo que
     tarde Claude mientras quien lo pidió siga conectado. Queda además en
     los avisos. Si falla, devuelve el motivo. */
  if (ruta === '/api/admin/resumen' && metodo === 'POST') {
    try {
      const texto = await buenDia(env, { aPedido: true, porPanel: true, devolver: true });
      return json({ ok: true, texto });
    } catch (e) {
      return error(`No se pudo armar el resumen: ${String(e?.message ?? e).slice(0, 500)}`, 500);
    }
  }

  /* CUÁNDO CORRIÓ EL RELOJ POR ÚLTIMA VEZ (ver `scheduled`). */
  if (ruta === '/api/admin/reloj' && metodo === 'GET') {
    return json((await leerEstado(env, 'reloj'))?.valor ?? {});
  }

  /* EL TABLERO DE LA AGENDA (Maxi, 31/10): las visitas, lo que hay que
     hacer, las consultas que esperan y los avisos, por separado, para
     que el panel los muestre cada uno en su lugar. */
  /* PROGRAMAR UNA RESPUESTA A UN CLIENTE (ver `programadosDeHoy`). */
  if (ruta === '/api/admin/programar' && metodo === 'POST') {
    const c = await peticion.json().catch(() => ({}));
    const chat = entero(c?.chat, 1, 1e9);
    const partes = (Array.isArray(c?.partes) ? c.partes : []).map((t) => texto(t, 1000)).filter(Boolean);
    if (!chat || !partes.length || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(c?.cuando ?? '')) return error('Faltan datos');
    const ya = (await leerEstado(env, 'programados'))?.valor ?? [];
    await guardarEstado(env, 'programados', [...ya, { chat, cuando: c.cuando, partes }].slice(-100));
    return json({ ok: true });
  }

  /* UNA CONSULTA QUE YA SE RESOLVIÓ POR OTRO LADO: sale de la lista. */
  const resuelta = ruta.match(/^\/api\/admin\/consultas\/(\d+)\/resuelta$/);
  if (resuelta && metodo === 'POST') {
    const consultas = (await leerEstado(env, 'consultas'))?.valor ?? [];
    await guardarEstado(env, 'consultas', consultas.filter((c) => c.n !== Number(resuelta[1])));
    return json({ ok: true });
  }

  if (ruta === '/api/admin/tablero' && metodo === 'GET') {
    const deChat = async (id) => id ? env.DB.prepare(
      'SELECT id, canal, externo_id, nombre FROM conversaciones WHERE id = ?').bind(id).first() : null;
    const conQuien = async (x) => {
      const c = await deChat(x.chat);
      const nombre = c?.nombre?.trim() || null;
      return { ...x, quien: nombre || (c ? quienEs(c) : (x.quien ?? '')), canal: c?.canal ?? null,
        tel: c?.canal === 'whatsapp' ? c.externo_id : null };
    };
    const agenda = (await leerEstado(env, 'agenda'))?.valor ?? [];
    const consultas = (await leerEstado(env, 'consultas'))?.valor ?? [];
    return json({
      hoy: diaDeBsAs(),
      agenda: await Promise.all(agenda.map(conQuien)),
      consultas: await Promise.all(consultas.map(conQuien)),
      recordatorios: [
        ...((await leerEstado(env, 'recordatorios'))?.valor ?? []),
        ...await Promise.all(((await leerEstado(env, 'programados'))?.valor ?? []).map(async (p) => {
          const c = await deChat(p.chat);
          return { cuando: p.cuando, texto: `Respuesta programada a ${c?.nombre || (c ? quienEs(c) : 'un cliente')}:\n${p.partes.join('\n')}` };
        })),
      ],
      avisos: ((await leerEstado(env, 'avisos'))?.valor ?? []).slice(-150),
    });
  }

  /* LOS AVISOS PARA MAXI, los más nuevos que `desde`. Ver `anotarAviso`. */
  if (ruta === '/api/admin/avisos' && metodo === 'GET') {
    const desde = Number(new URL(peticion.url).searchParams.get('desde') ?? 0) || 0;
    const avisos = (await leerEstado(env, 'avisos'))?.valor ?? [];
    return json({ avisos: avisos.filter((a) => a.n > desde) });
  }

  /* CÓMO CONTESTA EL BOT: borrador o automático, por canal, y en qué
     horario. Ver `configDelBot`. */
  if (ruta === '/api/admin/bot' && metodo === 'GET') {
    return json(await configDelBot(env));
  }
  if (ruta === '/api/admin/bot' && metodo === 'PUT') {
    const cuerpo = await peticion.json().catch(() => ({}));

    /* Lo que no venga en el cuerpo se queda como estaba: el botón de
       prender manda sólo `encendida` y no tiene por qué pisar el
       horario que alguien haya dejado puesto. */
    const antes = (await leerEstado(env, 'bot'))?.valor ?? {};

    await guardarEstado(env, 'bot', {
      desde: 'desde' in (cuerpo ?? {}) ? entero(cuerpo.desde, 0, 23) : (antes.desde ?? null),
      hasta: 'hasta' in (cuerpo ?? {}) ? entero(cuerpo.hasta, 0, 23) : (antes.hasta ?? null),
      encendida: 'encendida' in (cuerpo ?? {}) ? cuerpo.encendida === true : antes.encendida === true,
      whatsappDeDia: 'whatsappDeDia' in (cuerpo ?? {})
        ? cuerpo.whatsappDeDia === true : antes.whatsappDeDia === true,
    });
    /* Al prenderlo, lo que quedó esperando se contesta ya, sin esperar
       la vuelta del reloj. Pocos por vez: esto corre con poco tiempo. */
    ctx?.waitUntil?.(ponerseAlDia(env, { hasta: 3 }).catch((e) =>
      console.error('No se pudo poner al día:', e?.message ?? e)));
    return json(await configDelBot(env));
  }

  /* QUÉ CONTESTA INSTAGRAM, CRUDO.

     Para cuando "no devuelve nada" y hay que saber si el problema es el
     token, un permiso o el parámetro con el que se pregunta. Prueba las
     mismas llamadas que usa la sincronización y devuelve lo que vino,
     sin interpretarlo: interpretar es justo lo que falla cuando uno no
     entiende qué está pasando.

     NO ES PARA DEJAR PUESTO. Devuelve nombres de usuario y debería irse
     cuando Instagram entre solo. */
  /* QUE CONTESTA WHATSAPP, CRUDO.

     Para cuando un envio se rechaza y el mensaje resumido no alcanza.
     Devuelve la respuesta entera de Meta —codigo, subcodigo, detalle y
     numero de rastreo— que es lo que hay que leer para saber si el
     problema es el destinatario, el token, la cuenta o el numero de
     origen. El mensaje corto que se ve en el log muchas veces dice una
     cosa y el subcodigo dice otra.

     NO MANDA NADA SI FALLA, que es el caso que interesa. Si el numero
     esta habilitado, si manda: es el precio de probar de verdad.

     Se abre desde el panel, ya con la sesion puesta:
       /api/admin/whatsapp/diagnostico?a=5491133762494  */
  if (ruta === '/api/admin/whatsapp/diagnostico' && metodo === 'GET') {
    const a = (new URL(peticion.url).searchParams.get('a') || '').replace(/\D/g, '');
    if (!a) return error('Falta ?a= con el numero a probar', 400);

    const probar = async (destino) => {
      const r = await fetch(`${GRAPH}/${env.WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: destino,
          type: 'text', text: { body: 'Prueba de diagnostico.' },
        }),
      });
      return { destino, estado: r.status, respuesta: await r.json().catch(() => ({})) };
    };

    const salida = { phone_id: env.WHATSAPP_PHONE_ID, intentos: [await probar(a)] };
    for (const forma of OTRAS_FORMAS(a)) {
      if (salida.intentos[salida.intentos.length - 1].respuesta?.messages) break;
      salida.intentos.push(await probar(forma));
    }
    return json(salida);
  }

  /* QUE LA APP RECIBA LOS MENSAJES DE ESTA CUENTA.

     Conectar el numero no alcanza. Meta no manda un solo aviso hasta
     que la app queda suscrita a la cuenta de WhatsApp, y esa
     suscripcion NO ESTA EN NINGUNA PANTALLA de Meta: se pide por la
     API y nada mas. Cuando un numero entra por el registro embebido la
     suscripcion sale sola; este numero ya estaba conectado de antes,
     asi que hay que pedirla a mano una vez.

     Sin ?activar=1 solo dice quien esta suscrito hoy, sin tocar nada. */
  if (ruta === '/api/admin/whatsapp/suscribir' && metodo === 'GET') {
    const pedida = (new URL(peticion.url).searchParams.get('cuenta') || '').replace(/\D/g, '');
    const cuenta = pedida || env.WHATSAPP_CUENTA_ID;
    if (!cuenta) return error('Falta WHATSAPP_CUENTA_ID', 400);
    const pedir = async (verbo) => {
      const r = await fetch(`${GRAPH}/${cuenta}/subscribed_apps`, {
        method: verbo,
        headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
      });
      return { estado: r.status, respuesta: await r.json().catch(() => ({})) };
    };
    const salida = { cuenta };
    const q = new URL(peticion.url).searchParams;
    if (q.get('activar') === '1') salida.suscripcion = await pedir('POST');
    if (q.get('sacar') === '1') salida.baja = await pedir('DELETE');
    salida.suscritas = await pedir('GET');
    return json(salida);
  }

  /* MANDAR LAS PLANTILLAS A REVISION.

     El texto vive en src/plantillas.js; esto solo lo sube. Se separa a
     proposito: lo que se aprueba y lo que se manda tienen que ser el
     mismo texto, y si se pudiera escribir desde el panel dejarian de
     serlo al primer retoque.

     SIN ?crear=1 SOLO MUESTRA COMO ESTAN. Es lo que hay que mirar
     despues: Meta las revisa y cada una queda en APPROVED o REJECTED,
     con el motivo.

     Subir dos veces la misma no rompe nada: Meta contesta que el nombre
     ya existe y esa plantilla queda como estaba. */
  if (ruta === '/api/admin/whatsapp/plantillas' && (metodo === 'GET' || metodo === 'POST')) {
    const cuenta = env.WHATSAPP_CUENTA_ID;
    if (!cuenta) return error('Falta WHATSAPP_CUENTA_ID', 400);

    const salida = { cuenta };

    /* Subir: con ?crear=1, o con POST (sin nada en la dirección). */
    if (metodo === 'POST' || new URL(peticion.url).searchParams.get('crear') === '1') {
      salida.subidas = [];
      for (const p of PLANTILLAS) {
        const r = await fetch(`${GRAPH}/${cuenta}/message_templates`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(comoLasPideMeta(p)),
        });
        const d = await r.json().catch(() => ({}));
        salida.subidas.push({
          plantilla: p.nombre,
          estado: r.status,
          resultado: d?.error?.error_user_msg || d?.error?.message || d?.status || 'subida',
        });
      }
    }

    const r = await fetch(
      `${GRAPH}/${cuenta}/message_templates?fields=name,status,category,rejected_reason&limit=100`,
      { headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}` } });
    const d = await r.json().catch(() => ({}));
    salida.en_meta = (d?.data ?? []).map((t) =>
      ({ nombre: t.name, estado: t.status, categoria: t.category, motivo: t.rejected_reason || null }));
    if (d?.error) salida.en_meta = d.error;

    return json(salida);
  }

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

    /* La de WhatsApp (ver fotosParaWhatsApp en el panel). Opcional: un
       panel viejo abierto en otra pestaña no la manda y igual sube. */
    const og = form.get('og');
    if (og instanceof File && og.size <= 1024 * 1024) {
      await env.FOTOS.put(`${base}-og.jpg`, og.stream(), {
        httpMetadata: { contentType: 'image/jpeg' },
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

  /* LA FOTO DE WHATSAPP DE UNA FOTO QUE YA ESTABA. Sólo para claves
     que existen en la base: no es una puerta para subir cualquier cosa
     a cualquier lado. */
  if (ruta === '/api/admin/fotos/og' && metodo === 'POST') {
    const form = await peticion.formData();
    const clave = String(form.get('clave') ?? '');
    const og = form.get('og');
    if (!(og instanceof File) || og.size > 1024 * 1024) return error('Falta la foto, o pesa demasiado');
    const existe = await env.DB.prepare('SELECT 1 FROM fotos WHERE clave = ?').bind(clave).first();
    if (!existe) return error('Esa foto no existe', 404);
    await env.FOTOS.put(`${clave}-og.jpg`, og.stream(), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    return json({ ok: true });
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
  Promise.all(claves.flatMap((c) => [
    ...TAMANOS.map((t) => env.FOTOS.delete(`${c}-${t}.webp`)),
    env.FOTOS.delete(`${c}-og.jpg`),
  ]));
