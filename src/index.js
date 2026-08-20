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
const SLOTS = {
  'editorial-principal': { alto: 1600, prop: 3 / 2, donde: 'La nota — foto grande' },
  'editorial-1':         { alto: 800,  prop: 1,     donde: 'La nota — tira, primera' },
  'editorial-2':         { alto: 800,  prop: 1,     donde: 'La nota — tira, segunda' },
  'editorial-3':         { alto: 800,  prop: 1,     donde: 'La nota — tira, tercera' },
  'collage-interior':    { alto: 1600, prop: 4 / 3, donde: 'Collage — interior' },
  'collage-ciudad':      { alto: 1600, prop: 3 / 2, donde: 'Collage — exterior' },
  'social-1':            { alto: 800,  prop: 1,     donde: 'Instagram — 1' },
  'social-2':            { alto: 800,  prop: 1,     donde: 'Instagram — 2' },
  'social-3':            { alto: 800,  prop: 1,     donde: 'Instagram — 3' },
  'social-4':            { alto: 800,  prop: 1,     donde: 'Instagram — 4' },
  'social-5':            { alto: 800,  prop: 1,     donde: 'Instagram — 5' },
  'social-6':            { alto: 800,  prop: 1,     donde: 'Instagram — 6' },
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
        const obj = await env.FOTOS.get(clave);
        if (!obj) return new Response('No está', { status: 404 });
        return new Response(obj.body, {
          headers: {
            'content-type': obj.httpMetadata?.contentType || 'image/webp',
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
          .prepare('SELECT slot, clave FROM medios').all();
        const mapa = {};
        for (const m of results) mapa[m.slot] = m.clave;
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
            ORDER BY destacado DESC, creado DESC`
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
  destacado:   (v) => (v ? 1 : 0),
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
    const { results } = await env.DB
      .prepare('SELECT * FROM autos ORDER BY editado DESC').all();
    return json({ autos: await conFotos(env, results) });
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
      .prepare('SELECT slot, clave, editado FROM medios').all();
    const puestas = new Map(results.map((m) => [m.slot, m]));
    /* Se devuelven LOS DOCE, tengan reemplazo o no: el panel necesita
       mostrar el lugar aunque esté con la foto original, con su medida
       recomendada al lado. */
    return json({
      slots: Object.entries(SLOTS).map(([slot, s]) => ({
        slot, donde: s.donde, alto: s.alto, prop: s.prop,
        clave: puestas.get(slot)?.clave || null,
        editado: puestas.get(slot)?.editado || null,
      })),
    });
  }

  const medio = ruta.match(/^\/api\/admin\/medios\/([a-z0-9-]+)$/);

  if (medio && metodo === 'POST') {
    const slot = medio[1];
    if (!SLOTS[slot]) return error('Ese lugar no existe', 404);

    const form = await peticion.formData();
    const parte = form.get('imagen');
    if (!(parte instanceof File)) return error('Falta la imagen');
    if (parte.size > 3 * 1024 * 1024) return error('Esa foto pesa demasiado');

    const clave = `medios/${slot}/${crypto.randomUUID()}`;
    await env.FOTOS.put(`${clave}-1600.webp`, parte.stream(), {
      httpMetadata: { contentType: 'image/webp' },
    });

    /* La anterior se borra DESPUÉS de que la nueva quedó guardada y la
       fila apunta a ella. Al revés, si algo falla en el medio, el sitio
       queda pidiendo un archivo que ya no está. */
    const antes = await env.DB.prepare('SELECT clave FROM medios WHERE slot = ?')
      .bind(slot).first();

    await env.DB.prepare(
      `INSERT INTO medios (slot, clave) VALUES (?, ?)
       ON CONFLICT(slot) DO UPDATE SET clave = excluded.clave,
                                       editado = datetime('now')`
    ).bind(slot, clave).run();

    if (antes?.clave) await env.FOTOS.delete(`${antes.clave}-1600.webp`);
    return json({ clave }, 201);
  }

  /* Volver a la original: se borra la fila y la página vuelve a usar la
     foto que trae escrita en el HTML. */
  if (medio && metodo === 'DELETE') {
    const slot = medio[1];
    const fila = await env.DB.prepare('SELECT clave FROM medios WHERE slot = ?')
      .bind(slot).first();
    if (!fila) return error('Ese lugar ya está con la original', 404);

    await env.DB.prepare('DELETE FROM medios WHERE slot = ?').bind(slot).run();
    await env.FOTOS.delete(`${fila.clave}-1600.webp`);
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
