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
  {
    clave: 'nota',
    titulo: 'La nota',
    nota: 'OJO: estas cuatro ya casi no se usan. La nota muestra un auto '
        + 'del garage, distinto cada dia, y toma sus primeras cuatro '
        + 'fotos. Lo que se cargue aca se ve solo si no hay ningun auto '
        + 'publicado con al menos cuatro fotos.',
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
     nota — foto grande    1.14 casi cuadr. │  1.10 casi cuadr.
     nota — tira (x3)      1.07 casi cuadr. │  1.20 casi cuadr.

   Las tres del collage no son variaciones de una misma forma: son
   formas OPUESTAS —dos de ellas se dan vuelta de apaisada a vertical—,
   así que llevan un archivo por pantalla.

   Las de la nota no: esa sección usa la misma disposición en las dos
   pantallas, sólo que más chica, y las formas quedan casi iguales.
   Partirlas sería pedir dos veces el mismo archivo, así que llevan una
   sola, `todo`.

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
  'editorial-principal': {
    seccion: 'nota', donde: 'La nota — foto grande',
    /* UNA SOLA, DESDE QUE LA NOTA SE VE IGUAL EN LAS DOS PANTALLAS.

       Llevaba dos porque en el celular la maqueta se apilaba y la foto
       pasaba a ser apaisada 3:2. Ahora el celular usa la misma
       disposición que la compu —la grande a la izquierda, la tira al
       costado— y medido queda en 1.10 contra 1.14: la misma foto. */
    pantallas: { todo: { lado: 1600, guia: '1:1 — cuadrada.' } },
  },
  'editorial-1': {
    seccion: 'nota', donde: 'La nota — tira, primera',
    pantallas: { todo: { lado: 900, guia: '1:1 — cuadrada.' } },
  },
  'editorial-2': {
    seccion: 'nota', donde: 'La nota — tira, segunda',
    pantallas: { todo: { lado: 900, guia: '1:1 — cuadrada.' } },
  },
  'editorial-3': {
    seccion: 'nota', donde: 'La nota — tira, tercera',
    pantallas: { todo: { lado: 900, guia: '1:1 — cuadrada.' } },
  },
};

const PANTALLAS = ['compu', 'celular', 'todo'];

/* ── LOS TEXTOS QUE SE PUEDEN CAMBIAR ─────────────────────────────

   Lista blanca, igual que SLOTS y por el mismo motivo: sin esto
   cualquiera con sesión llenaría la tabla de filas que ninguna página
   lee.

   SON DOS Y NO TREINTA, A PROPÓSITO. Lo que se edita seguido va acá; el
   resto del texto vive en el HTML, que es donde se lee junto al diseño
   que lo rodea. Volver editable cada frase suena a favor y termina
   siendo un sitio cuyo contenido no está en ningún lado.

   `tope` es el largo máximo, y no es un capricho de base de datos: son
   los caracteres que entran en ese lugar sin desarmar la maqueta. El
   panel lo muestra como contador mientras se escribe. */
const TEXTOS = {
  'editorial-titulo': {
    tope: 90,
    donde: 'La nota — titular',
    pista: 'Dos renglones como mucho.',
  },
  'editorial-copete': {
    tope: 220,
    donde: 'La nota — bajada',
    pista: 'La frase que va abajo del titular.',
  },
};

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
  return filas.map((a) => ({ ...a, fotos: porAuto.get(a.id) || [] }));
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
  async fetch(peticion, env) {
    const url = new URL(peticion.url);
    const ruta = url.pathname.replace(/\/+$/, '') || '/';
    const metodo = peticion.method;

    try {
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
          (mapa[m.slot] ||= {})[m.variante] = { clave: m.clave, clase: m.clase };
        }
        return json(mapa, 200, { 'cache-control': 'public, max-age=60' });
      }

      /* ── LOS TEXTOS EDITABLES ─────────────────────────────────────
         Mismo trato que las imágenes: sólo los que TIENEN reemplazo. La
         página ya trae los suyos escritos en el HTML; esto le dice
         cuáles cambiar. */
      if (ruta === '/api/textos' && metodo === 'GET') {
        const { results } = await env.DB
          .prepare('SELECT slot, valor FROM textos').all();
        const mapa = {};
        for (const t of results) mapa[t.slot] = t.valor;
        return json(mapa, 200, { 'cache-control': 'public, max-age=60' });
      }

      /* ── CATÁLOGO PÚBLICO ─────────────────────────────────────────
         Sólo lo publicado. Un borrador o un vendido no salen de acá ni
         aunque se pida el id derecho. */
      if (ruta === '/api/autos' && metodo === 'GET') {
        const grupo = url.searchParams.get('grupo');
        if (grupo && !GRUPOS.includes(grupo)) return error('Grupo desconocido');

        const { results } = await env.DB.prepare(
          `SELECT * FROM autos
            WHERE estado = 'publicado' ${grupo ? 'AND grupo = ?' : ''}
            ORDER BY orden, creado DESC`
        ).bind(...(grupo ? [grupo] : [])).all();

        return json({ autos: await conFotos(env, results) }, 200, {
          'cache-control': 'public, max-age=60',
        });
      }

      const unAuto = ruta.match(/^\/api\/autos\/(\d+)$/);
      if (unAuto && metodo === 'GET') {
        const fila = await env.DB
          .prepare(`SELECT * FROM autos WHERE id = ? AND estado = 'publicado'`)
          .bind(unAuto[1]).first();
        if (!fila) return error('No está', 404);
        return json({ auto: (await conFotos(env, [fila]))[0] });
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

async function admin(peticion, env, ruta, metodo) {
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

  /* ── LOS TEXTOS EDITABLES ─────────────────────────────────────── */

  if (ruta === '/api/admin/textos' && metodo === 'GET') {
    const { results } = await env.DB
      .prepare('SELECT slot, valor, editado FROM textos').all();
    const puestos = new Map(results.map((t) => [t.slot, t]));
    /* Van TODOS, tengan reemplazo o no, igual que los slots de imagen:
       el panel necesita mostrar el lugar aunque siga con el original.
       Pero el original NO viaja desde acá — lo trae el HTML, y el panel
       lo lee de la propia página. Duplicarlo en el Worker sería una
       segunda copia que se desincroniza sola. */
    return json({
      textos: Object.entries(TEXTOS).map(([slot, t]) => ({
        slot, donde: t.donde, pista: t.pista, tope: t.tope,
        valor: puestos.get(slot)?.valor ?? null,
        editado: puestos.get(slot)?.editado || null,
      })),
    });
  }

  const texto = ruta.match(/^\/api\/admin\/textos\/([a-z0-9-]+)$/);

  if (texto && metodo === 'PUT') {
    const slot = texto[1];
    const regla = TEXTOS[slot];
    if (!regla) return error('Ese texto no existe', 404);

    const cuerpo = await peticion.json().catch(() => null);
    if (!cuerpo || typeof cuerpo.valor !== 'string') return error('Falta el texto');

    /* SE GUARDA SIN LOS ESPACIOS DE LOS BORDES. Un renglón en blanco al
       final no se ve al escribirlo pero sí se cuenta contra el tope, y
       peor: hace que un campo vacío parezca lleno. */
    const valor = cuerpo.valor.trim();
    if (valor.length > regla.tope) {
      return error(`No puede pasar de ${regla.tope} caracteres`);
    }

    /* VACÍO ES VOLVER AL ORIGINAL, no guardar un texto vacío. Borrar la
       fila deja que valga el que trae el HTML; guardar '' dejaría el
       lugar en blanco en la página, que nunca es lo que alguien quiso
       al borrar el contenido de un campo. */
    if (!valor) {
      await env.DB.prepare('DELETE FROM textos WHERE slot = ?').bind(slot).run();
      return json({ ok: true, valor: null });
    }

    await env.DB.prepare(
      `INSERT INTO textos (slot, valor) VALUES (?, ?)
       ON CONFLICT(slot) DO UPDATE SET valor = excluded.valor,
                                       editado = datetime('now')`
    ).bind(slot, valor).run();
    return json({ ok: true, valor });
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
