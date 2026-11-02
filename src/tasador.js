/* Tasador de permutas: cuánto ofrecer por el auto que un cliente quiere entregar.

   CÓMO TASA (como un tasador: lo que más pesa son los km)
     1. Hacen falta marca, modelo, año y km. Si falta la versión (y cambia el precio) o los km,
        se le preguntan al cliente.
     2. Lee de Mercado Libre los autos de ese modelo, del MISMO AÑO, EL ANTERIOR Y EL SIGUIENTE, con km parecidos (±35%).
        Los años vecinos entran solo si son de la MISMA GENERACIÓN (src/generaciones.js). Si el año
        del cliente es de transición (dos generaciones a la venta), se le pregunta cuál tiene, y en
        esos años Sonnet mira la foto de cada publicación para quedarse solo con las de su generación.
        (autos.mercadolibre.com.ar/<marca>/<modelo>/<año>/_KILOMETERS_<min>km-<max>km). Sin login.
     3. Los precios en pesos se pasan a dólares con el dólar blue (venta) del CIERRE DE AYER
        (api.argentinadatos.com). Si ayer no hubo cotización, el último día anterior que tenga.
     4. Haiku elige las publicaciones de la misma versión y caja (si el cliente no dijo la caja, la de la
        mayoría de las publicaciones de esa versión: en alta gama suele ser automática).
     5. Se ordenan por CERCANÍA DE KM al auto del cliente y Haiku lee, en ese orden, la DESCRIPCIÓN y
        la FICHA de cada una, descartando las que tienen un problema (choque, motor, GNC, deudas,
        precio de anticipo, etc.), hasta juntar las 6 limpias más cercanas en km. Ninguna entra sin
        que se haya leído su descripción. El mismo auto publicado dos veces cuenta una vez.
     6. Si no llega a 6, abre el rango de km a ±60% (mismos tres años).
     7. Sonnet hace el control final de esas 6 (versión, caja, fallas, precio de contado, repetidas),
        mirando con lupa la más barata, que es la que va a fijar el precio.
     8. Precio de mercado ("de venta rápida") = la MÁS BARATA de las que quedan con km iguales o
        menores que el auto del cliente (hasta +20%): si un auto igual o con menos km se publica a ese
        precio, el del cliente no vale más. Las que tienen bastantes más km no fijan el precio. Con 1 o 2
        autos alcanza. Si ninguna tiene km parecidos o menores, queda para revisar a mano.
        PROTECCIÓN: si la más barata está más de un 15% por debajo de CUALQUIER otra comparable (aun
        con más km), es un aviso raro (apuro, detalle que no dice, error de carga) y no fija el precio
        sola: se toma la siguiente. Entre la más barata y la segunda es normal un 9% de diferencia.
        Lo calcula el código, no Claude: sin promedios que tiren para arriba.
     9. Oferta = precio de mercado menos un porcentaje (se cambia en el panel): como parte de pago,
        uno hasta cierto valor de mercado y otro más chico por encima, más unos puntos de "riesgo" si el
        auto tiene 10 años o más o bastantes más km que los comparables; si nos vende el auto sin comprar
        uno (compra directa), un porcentaje mayor. Redondeado para abajo a los 100.
    10. Se registra qué porcentaje se usó al mandar cada cotización, si el cliente contestó con un
        número (contraoferta) y en qué terminó la charla, para ajustar los porcentajes con datos.
   No hay apuro: se prioriza que esté bien. Cada resultado se guarda 7 días. Los modelos que más
   ofrecen se recalculan solos una vez por semana.

   CUIDADOS
     - Se lee solo el principio de cada página (lo que hace falta), para no gastar procesamiento.
     - Pocas consultas y con caché: el uso es como el de una persona mirando. Si Mercado Libre
       bloquea, se avisa en el panel (no se reintenta en loop). */

import Anthropic from '@anthropic-ai/sdk';
import { leerEstado, guardarEstado } from './estado.js';
import { contextoDeGeneracion } from './generaciones.js';

// Haiku hace el trabajo de lectura (versiones y descripciones); Sonnet decide el valor
const LECTOR = 'claude-haiku-5-5';
const CONTROL = 'claude-sonnet-5-5';
const DIA_S = 86400;
const SEMANA_S = 7 * DIA_S;
// automatico: la IA le manda sola al cliente la cotización aproximada y la diferencia (si no, la aprueba el equipo)
const POR_TANDA = 5;          // descripciones que se leen juntas
const MAX_DESCRIPCIONES = 18; // tope por tasación (Cloudflare permite 50 consultas por pedido: hasta 12 listados, 18 descripciones, 6 fotos, Claude y el dólar)
const COMPARABLES = 6;        // autos limpios más cercanos en km que se le pasan a Sonnet
/* Bolsa ampliada (31/10/2026): si de la versión exacta quedan menos de MIN_REFERENCIAS, se suman las otras
   versiones de equipamiento del mismo auto (mismo modelo, generación, motor y carrocería) y autos con
   cualquier km, ajustando cada precio por versión (con las medianas de Mercado Libre) y por km (1% cada
   10.000 km). Analizado con CrossFox, Fiesta, 408, Tiggo y Gol Trend: el nivel de equipamiento mueve
   poco el precio y era lo que más muestras dejaba afuera; los km y el año sí lo mueven. */
const MIN_REFERENCIAS = 3;
const COMPARABLES_AMPLIADA = 8;
// Precio de Claude en USD por millón de tokens (entrada, salida), para saber cuánto cuesta cada tasación
const PRECIOS = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10] };
const NAVEGADOR = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  'accept-language': 'es-AR,es;q=0.9',
};

export class BloqueoML extends Error {}

// Porcentajes que se le restan al valor de mercado (el panel los cambia): parte de pago por tramo, y compra directa
export const PORCENTAJES_INICIALES = { bajo: 15, alto: 12, umbral: 30000, directa: 30, riesgo: 3 };
export const leerConfigTasador = async (env) => {
  const { descuento, ...guardada } = (await leerEstado(env, 'tasador_config')) || {};
  return { automatico: true, ...guardada, porcentajes: { ...PORCENTAJES_INICIALES, ...(guardada.porcentajes || {}) } };
};
export const guardarConfigTasador = (env, config) => guardarEstado(env, 'tasador_config', config);

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const sinEntidades = (s) => String(s || '')
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');

/* ── Dólar: cierre de ayer ──────────────────────────────────────── */

const fechaArgentina = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }); // AAAA-MM-DD

export async function dolarDeAyer(env) {
  const ayer = fechaArgentina(Date.now() - DIA_S * 1000);
  const guardado = await leerEstado(env, `dolar:${ayer}`);
  if (guardado) return guardado;
  // Si ayer no hay dato (todavía no se publicó o fue feriado), el último día anterior que tenga
  for (let i = 1; i <= 7; i++) {
    const dia = fechaArgentina(Date.now() - i * DIA_S * 1000);
    const r = await fetch(`https://api.argentinadatos.com/v1/cotizaciones/dolares/blue/${dia.replace(/-/g, '/')}`);
    if (!r.ok) continue;
    const j = await r.json().catch(() => null);
    if (j?.venta > 0) {
      const dolar = { venta: j.venta, fecha: j.fecha || dia, casa: 'blue' };
      await guardarEstado(env, `dolar:${ayer}`, dolar, 2 * DIA_S);
      return dolar;
    }
  }
  throw new Error('No se pudo leer la cotización del dólar');
}

/* ── Leer Mercado Libre ─────────────────────────────────────────── */

// Baja solo los primeros `tope` caracteres de una página y corta la descarga
async function leerPrincipio(url, tope) {
  const r = await fetch(url, { headers: NAVEGADOR, redirect: 'follow' });
  if (!r.ok || !r.body) { await r.body?.cancel(); return { estado: r.status, texto: '' }; }
  const lector = r.body.getReader();
  const decodificador = new TextDecoder();
  let texto = '';
  while (texto.length < tope) {
    const { done, value } = await lector.read();
    if (done) break;
    texto += decodificador.decode(value, { stream: true });
  }
  lector.cancel().catch(() => {});
  const final = r.url;
  if (/account-verification|captcha|suspicious-traffic/i.test(texto.slice(0, 20000))) throw new BloqueoML('Mercado Libre pidió verificación (bloqueo)');
  return { estado: r.status, texto, url: final };
}

// El objeto JSON que empieza en `inicio` (cuenta llaves, respetando los textos entre comillas)
function objetoDesde(texto, inicio) {
  let nivel = 0, enTexto = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (enTexto) { if (c === 92) i++; else if (c === 34) enTexto = false; continue; }
    if (c === 34) enTexto = true;
    else if (c === 123) nivel++;
    else if (c === 125 && --nivel === 0) return texto.slice(inicio, i + 1);
  }
  return null;
}

// Las tarjetas del listado: cada publicación con título, precio, año, km y zona
function leerTarjetas(texto) {
  const vistas = new Map();
  const marca = '{"id":"POLYCARD"';
  for (let i = texto.indexOf(marca); i >= 0; i = texto.indexOf(marca, i + marca.length)) {
    const crudo = objetoDesde(texto, i);
    if (!crudo) break;
    let p;
    try { p = JSON.parse(crudo).polycard; } catch (_) { continue; }
    const id = p?.metadata?.id;
    if (!id || vistas.has(id) || p.metadata.is_pad === 'true') continue;
    const partes = Object.fromEntries((p.components || []).map((c) => [c.type, c[c.type]]));
    const precio = partes.price?.current_price;
    const datos = partes.attributes_list?.texts || [];
    if (!precio?.value) continue;
    vistas.set(id, {
      id,
      titulo: partes.title?.text || '',
      precio: precio.value,
      moneda: precio.currency,
      anio: Number(datos.find((d) => /^\d{4}$/.test(d))) || null,
      km: Number(String(datos.find((d) => /km/i.test(d)) || '').replace(/\D/g, '')) || null,
      lugar: partes.location?.text || '',
      url: `https://${String(p.metadata.url || '').replace(/^https?:\/\//, '')}`,
      foto: p.pictures?.pictures?.[0]?.id || null,
    });
  }
  return [...vistas.values()];
}

/* Listado de un modelo, año y rango de km, ordenado por precio. Mercado Libre muestra 48 por página:
   si la página viene llena se leen las siguientes (hasta `paginas`, y mientras quede presupuesto),
   porque en modelos con muchas versiones las 48 más baratas son casi todas de las versiones baratas.
   `nombres` son los nombres de modelo de Mercado Libre que corresponden (ver nombresEnML). Si ninguno
   trae nada, se prueba el buscador de texto. Cada página se guarda 7 días. */
const POR_PAGINA = 48;

async function listado(env, marca, nombres, anio, rango, paginas, presupuesto) {
  let todas = [];
  const sumar = (ts) => { todas = todas.concat(ts.filter((t) => !todas.some((o) => o.id === t.id))); };
  for (const nombre of nombres) {
    for (let pagina = 0; pagina < paginas && presupuesto.listados > 0; pagina++) {
      presupuesto.listados--;
      const { tarjetas, crudas } = await paginaDeListado(env, marca, nombre, anio, rango, 'modelo', pagina);
      sumar(tarjetas);
      if (crudas < POR_PAGINA - 8) break; // no hay más páginas
    }
  }
  if (!todas.length && presupuesto.listados > 0) {
    presupuesto.listados--;
    sumar((await paginaDeListado(env, marca, nombres[0], anio, rango, 'texto', 0)).tarjetas);
  }
  return todas;
}

/* Los nombres de modelo que usa Mercado Libre para una marca (ej: Toyota tiene "hilux", "hilux-pick-up",
   "hilux-sw4"; Mercedes-Benz "clase-gla"), con cuántas de las publicaciones de la página de la marca usan
   cada uno (para saber cuál es el nombre más usado). Salen de los links de esa página. Se guardan 7 días. */
async function modelosDeLaMarca(env, marca) {
  const clave = `ml_modelos2:${slug(marca)}`;
  const guardado = await leerEstado(env, clave);
  if (guardado) return guardado;
  const { estado, texto } = await leerPrincipio(`https://autos.mercadolibre.com.ar/${slug(marca)}/_NoIndex_True`, 450000);
  if (estado !== 200) return { modelos: [], uso: {} };
  const patron = new RegExp(`autos\\.mercadolibre\\.com\\.ar\\\\u002F${slug(marca)}\\\\u002F([a-z0-9-]+)(?:\\\\u002F|_)`, 'g');
  const modelos = [...new Set([...texto.matchAll(patron)].map((m) => m[1]))];
  // Uso: en la dirección de cada publicación ("...-toyota-hilux-pick-up-28-cd-..."), el nombre más largo que encaja
  const uso = {};
  for (const m of texto.matchAll(new RegExp(`(?:/|\\\\u002F)MLA-\\d+-${slug(marca)}-([a-z0-9-]+)-_JM`, 'g'))) {
    const nombre = modelos.filter((x) => m[1].startsWith(`${x}-`) || m[1] === x).sort((a, b) => b.length - a.length)[0];
    if (nombre) uso[nombre] = (uso[nombre] || 0) + 1;
  }
  const r = { modelos, uso };
  if (modelos.length) await guardarEstado(env, clave, r, SEMANA_S);
  return r;
}

/* Los nombres de Mercado Libre que contienen el modelo del cliente (todas sus palabras): "hilux" → hilux,
   hilux-pick-up, hilux-sw4. Primero los más usados en las publicaciones; a igual uso, el nombre exacto. */
function candidatosEnML({ modelos = [], uso = {} } = {}, modelo) {
  const palabras = slug(modelo).split('-').filter(Boolean);
  const encajan = modelos.filter((m) => { const t = m.split('-'); return palabras.every((w) => t.includes(w)); });
  return encajan.sort((a, b) => (uso[b] || 0) - (uso[a] || 0) || (a === slug(modelo) ? -1 : b === slug(modelo) ? 1 : a.length - b.length));
}

async function paginaDeListado(env, marca, modelo, anio, [kmMin, kmMax], forma, pagina) {
  const filtros = `_${pagina ? `Desde_${pagina * POR_PAGINA + 1}_` : ''}OrderId_PRICE_KILOMETERS_${kmMin}km-${kmMax}km_NoIndex_True`;
  const camino = forma === 'modelo' ? `${slug(marca)}/${slug(modelo)}/${anio}/` : `${anio}/${slug(marca)}-${slug(modelo)}`;
  const clave = `ml_lista:${camino}:${kmMin}-${kmMax}:${pagina}`;
  const guardado = await leerEstado(env, clave);
  if (guardado) return guardado;
  const { estado, texto, url } = await leerPrincipio(`https://autos.mercadolibre.com.ar/${camino}${filtros}`, 320000);
  /* Si Mercado Libre no reconoce el modelo, reescribe la dirección y trae autos de cualquier año:
     en ese caso no sirve. Y siempre, solo publicaciones de ese año. */
  const reconocido = forma === 'modelo' ? String(url || '').includes(`/${slug(modelo)}/${anio}/`) : String(url || '').includes(`/${anio}/`);
  const leidas = estado === 200 && reconocido ? leerTarjetas(texto) : [];
  const resultado = { tarjetas: leidas.filter((t) => t.anio === anio), crudas: leidas.length };
  await guardarEstado(env, clave, resultado, SEMANA_S);
  return resultado;
}

/* Precio de referencia de un auto que el cliente busca y no tenemos: la mediana de lo publicado en
   Mercado Libre (una página, cualquier km). Es solo para ofrecerle autos nuestros de precio parecido,
   no es una tasación. Se guarda 7 días. */
export async function precioDeReferencia(env, marca, modelo, anio) {
  const clave = `referencia:${slug(marca)}/${slug(modelo)}/${anio}`;
  const guardado = await leerEstado(env, clave);
  if (guardado) return guardado;
  const dolar = await dolarDeAyer(env);
  const nombres = candidatosEnML(await modelosDeLaMarca(env, marca), modelo).slice(0, 1);
  const lista = await listado(env, marca, nombres.length ? nombres : [modelo], Number(anio), [1000, 250000], 1, { listados: 2 });
  const usd = lista.map((t) => (t.moneda === 'USD' ? t.precio : Math.round(t.precio / dolar.venta))).filter((n) => n > 1500).sort((a, b) => a - b);
  if (usd.length < 3) return null;
  const r = { usd: Math.round(usd[Math.floor(usd.length / 2)] / 100) * 100, desde: usd[Math.floor(usd.length / 4)], publicaciones: usd.length };
  await guardarEstado(env, clave, r, SEMANA_S);
  return r;
}

/* Descripción, versión y ficha de una publicación (están al principio de la página). No se guardan
   aparte: el plan gratis de D1 permite 50 consultas por tarea, y la tasación entera ya se guarda 7 días. */
async function descripcion(tarjeta) {
  const { estado, texto } = await leerPrincipio(tarjeta.url, 70000);
  if (estado !== 200) return { leida: false, texto: '', version: '' };
  const meta = texto.match(/<meta name="twitter:description" content="([^"]*)"/);
  const version = texto.match(/\{"id":"Versión","text":"([^"]*)"\}/);
  // La ficha técnica (caja, combustible, km, carrocería, etc.): ahí aparece el GNC aunque no lo diga el texto
  const ficha = {};
  for (const m of texto.matchAll(/\{"id":"([^"]{2,40})","text":"([^"]{1,80})"\}/g)) {
    if (Object.keys(ficha).length < 40 && !(m[1] in ficha)) ficha[m[1]] = m[2].replace(/\\u002F/g, '/');
  }
  return { leida: Boolean(meta), texto: sinEntidades(meta?.[1] || '').slice(0, 4000), version: version?.[1] || '', ficha };
}

/* ── Claude ─────────────────────────────────────────────────────── */

async function preguntarClaude(env, system, datos, esquema, modelo = LECTOR, gasto = null) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const r = await client.messages.stream({
    model: modelo,
    max_tokens: 16000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: esquema } },
    system,
    messages: [{ role: 'user', content: Array.isArray(datos) ? datos : JSON.stringify(datos) }],
  }).finalMessage();
  if (gasto) {
    const [entrada, salida] = PRECIOS[modelo] || [0, 0];
    const u = r.usage || {};
    const tokEntrada = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    gasto.usd += (tokEntrada * entrada + (u.output_tokens || 0) * salida) / 1e6;
    gasto.llamadas[modelo] = (gasto.llamadas[modelo] || 0) + 1;
  }
  if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') throw new Error(`Claude no terminó (${r.stop_reason})`);
  const texto = r.content.find((b) => b.type === 'text')?.text || '';
  return JSON.parse(texto);
}

const autoComoTexto = (p) => [p.marca, p.modelo, p.version, p.caja, p.anio, p.km ? `${Number(p.km).toLocaleString('es-AR')} km` : ''].filter(Boolean).join(' ');

const REGLAS_VERSION = `Sos tasador de autos usados en Argentina. Te paso el auto que un cliente quiere entregar y publicaciones de Mercado Libre (id, título, año, km, precio en USD).
Devolvé:
- coinciden: los ids de las publicaciones que son el MISMO auto: misma marca y modelo (un nombre con una palabra más, como Cross, Stepway, Trend, Plus o Sport, es otro modelo; salvo que la palabra solo indique la carrocería, como Sedán, Hatch, Pick-up o Sportback), de alguno de los años aceptados, y de la misma versión que el auto del cliente (motor, caja, carrocería y nivel de equipamiento). Si el título no dice la versión pero todo lo demás coincide, incluila igual (después se revisa con la ficha). La caja: si te paso caja_del_cliente, solo publicaciones con esa caja. Si no, NO supongas manual: usá la caja que tiene la mayoría de las publicaciones de esa versión (si la versión existe con una sola caja, esa), sin mezclar manuales con automáticas. Decí en caja qué caja usaste.
- NO SUPONGAS datos del auto del cliente que no te dieron: si no dijo carrocería (sedán o hatchback), puertas o equipamiento, cualquiera de esa versión sirve y no se descarta por eso. Las variantes menores de equipamiento dentro de la misma versión (un pack, una edición con algún accesorio) cuentan como la misma versión. Pero una versión con "Plus" o "Premium" agregado al nombre es OTRA versión, más equipada y más cara: si el cliente dijo la versión sin ese agregado, no la incluyas.
- Si te paso pista_de_generaciones (datos sin verificar), usala como ayuda para decidir qué años vecinos son el mismo auto; ante la duda, afuera.
- Si te paso generacion_del_cliente, solo valen publicaciones de esa generación; las que por título o datos sean claramente de otra generación, afuera. En los años de anios_con_dos_generaciones, decidí la generación por el título cuando la versión o el motor son exclusivos de una de las dos generaciones (usá cómo distinguirlas que te paso). Si coinciden en versión pero el título NO alcanza para saber la generación, incluilas en coinciden Y TAMBIÉN en dudosas_de_generacion: solo esas se revisan por foto. Los restylings dentro de la misma generación sí valen, pero tenelos en cuenta.
- EXACTAMENTE EL MISMO AUTO: las publicaciones del año anterior o el siguiente entran solo si son la misma generación y el mismo diseño que el del año del cliente. Si ese año el modelo cambió de generación o tuvo un rediseño (facelift, año-modelo con diseño nuevo, "nuevo", otra carrocería u otro motor de línea), aunque se llame igual NO es el mismo auto: dejalo afuera. Si tenés dudas de si es la misma generación, dejalo afuera.
- version_clara: false solo si el cliente no dijo la versión (o lo que dijo no alcanza para distinguir) y en las publicaciones hay versiones que cambian el precio de forma importante (motor distinto, caja automática o manual, básica o full, sedán o hatchback). Si las versiones que aparecen valen parecido, true. También false si dijo la versión pero esa versión se vendió con motores distintos que valen distinto (nafta y diésel, dos cilindradas) y no dijo cuál, o si es una pickup y no dijo si es cabina simple o doble: en versiones poné las opciones (la versión con cada motor, o cabina simple / cabina doble).
- Tracción y nombres equivalentes: 4x4 = AWD = 4WD = integral; 4x2 = FWD = 2WD = delantera; "full" o "tope de gama" = la versión más equipada. Un signo + o un sufijo de potencia no la hacen otra versión.
- version_no_aparece: true solo si el cliente dijo una versión y NINGUNA publicación es esa versión: solo aparecen otras (otro nivel de equipamiento, otro motor u otra potencia, aunque se parezcan o sean de la misma familia). Puede pasar porque el cliente se confundió o porque esa versión no existía ese año. En ese caso coinciden va vacío: no la reemplaces por la más parecida. Si el nombre que dijo es solo otra forma de escribir una versión que aparece, false.
- caja_unica: false solo si caja_del_cliente no la dijo y la versión del cliente se publica con caja manual Y con automática (las dos aparecen); true si aparece con una sola caja o si el cliente ya la dijo.
- versiones: si version_clara es false o version_no_aparece es true, de 2 a 4 versiones que aparecen, con el nombre corto de la versión como aparece en los títulos. Si no, vacío.
- nota: una frase corta para el equipo si hay algo a tener en cuenta, o vacío.`;

const REGLAS_NOMBRES = `Mercado Libre publica un mismo modelo con varios nombres (por ejemplo con una palabra de carrocería agregada o un prefijo de la marca). Te paso el auto del cliente y nombres de modelo de Mercado Libre de esa marca. Devolvé en nombres los que son ESE MISMO modelo (aunque tengan otro nombre en Mercado Libre) y dejá afuera los que son otro vehículo con un nombre parecido (otra carrocería u otro modelo derivado, como un SUV hecho sobre una pickup, o una versión "Cross"). Si dudás, incluilo: después se revisa cada publicación.`;

const REGLAS_GENERACION = `En el año del auto de un cliente se vendieron en Argentina dos generaciones con el mismo nombre. Te paso su auto (versión y motor, como los dijo), lo que contestó cuando le preguntamos cuál tiene, y las generaciones de ese año con cómo distinguirlas. Decidí cuál es: si la versión o el motor existen en una sola de las generaciones, es esa, aunque haya contestado otra cosa (la gente se confunde con "nuevo" y "anterior"). Si la versión y el motor no alcanzan, usá lo que contestó. Si no se puede saber, devolvé -1. Devolvé el número de la generación en la lista, empezando por 0.`;

const ESQUEMA_GENERACION = {
  type: 'object',
  properties: { generacion: { type: 'integer' } },
  required: ['generacion'],
  additionalProperties: false,
};

const ESQUEMA_NOMBRES = {
  type: 'object',
  properties: { nombres: { type: 'array', items: { type: 'string' } } },
  required: ['nombres'],
  additionalProperties: false,
};

const ESQUEMA_VERSION = {
  type: 'object',
  properties: {
    coinciden: { type: 'array', items: { type: 'string' } },
    dudosas_de_generacion: { type: 'array', items: { type: 'string' } },
    caja: { type: 'string', enum: ['manual', 'automatica'] },
    version_clara: { type: 'boolean' },
    version_no_aparece: { type: 'boolean' },
    caja_unica: { type: 'boolean' },
    versiones: { type: 'array', items: { type: 'string' } },
    nota: { type: 'string' },
  },
  required: ['coinciden', 'dudosas_de_generacion', 'caja', 'version_clara', 'version_no_aparece', 'caja_unica', 'versiones', 'nota'],
  additionalProperties: false,
};

const REGLAS_DESCRIPCION = `Sos tasador de autos usados en Argentina. Te paso el auto que un cliente quiere entregar y publicaciones de Mercado Libre del mismo modelo, con la DESCRIPCIÓN que escribió el vendedor y la FICHA técnica (versión, caja, combustible, km, carrocería). Revisá las dos. Las más baratas muchas veces lo son por un problema: leé cada descripción con atención.
Para cada publicación decí si es "limpia" (sirve para comparar precio) o no, con el motivo en pocas palabras.
NO es limpia si:
- Tiene un problema mecánico o de chapa: chocado, siniestro, detalle de motor, caja, embrague o chapa, "a reparar", "para arreglar", "no arranca", "para repuestos", "le falta…", inundado, granizo fuerte.
- Tiene GNC (salvo que el auto del cliente también tenga).
- Tiene un problema de papeles: deuda, prenda, inhibición, sin papeles, dado de baja, de recupero o de aseguradora, "sin transferencia", "solo con poder", importado sin papeles.
- El precio no es el precio real de contado: el precio publicado es un anticipo, "desde", cuotas, "financiado", "tomamos tu usado y te queda…", "plan de ahorro", precio simbólico o consultar.
- Es subasta, remate, ex taxi o remís, o alquiler.
- Por la ficha o la descripción es otra versión, otro motor, otra caja u otra carrocería que el auto del cliente, o directamente otro modelo.
- El precio está más de 25% por debajo de la mediana que te paso y la descripción no lo explica (probable estafa, anticipo encubierto o error de carga o de moneda).
Cómo decidir:
- NO SUPONGAS datos del auto del cliente que no te dieron: si no dijo carrocería, puertas o equipamiento, cualquiera de esa versión sirve. La caja la decide caja_del_cliente; si la versión existe con una sola caja, esa es su caja aunque la ficha diga otra.
- Las variantes menores de equipamiento dentro de la misma versión (un pack, una edición con accesorios o estética distinta) son la misma versión.
- Si la ficha contradice al título o a la descripción (por ejemplo en la caja o el motor), vale lo que dicen el título y la descripción, que escribe el vendedor: la ficha a veces está mal cargada.
- Esto es NORMAL y no es motivo para descartar: precio en dólares (blue, informal o "dólar del día"), que acepte permuta ("aceptamos permutas", "permuto", "vendo o permuto"), financiación ofrecida aparte por la agencia (incluida la prendaria: es crédito para el comprador, no una prenda sobre el auto), que aclare otro precio más alto para permuta o financiado si el publicado es el de contado, "se entrega con la transferencia hecha", "detalles de uso" o "detalles estéticos menores", publicidad de la agencia, descripción corta o genérica.
- Si la descripción no menciona ningún problema, es limpia. Si dice cosas buenas (único dueño, services, VTV), sigue siendo limpia.
- Si una publicación trae version_hermana, es a propósito otro nivel de equipamiento del mismo auto (el precio se ajusta aparte): no la descartes por la versión, la caja ni los km; sí por todo lo demás.`;

const REGLAS_VALOR = `Sos tasador profesional de autos usados en Argentina y trabajás para una concesionaria. Te paso el auto que un cliente quiere entregar y publicaciones de Mercado Libre del mismo modelo y versión, las más cercanas en km, ya revisadas una vez. El precio de mercado del auto del cliente va a ser el de la MÁS BARATA que quede con km iguales o menores que los del cliente, con una tolerancia de hasta 20% más (te paso km_tope), así que tu control es lo que evita un precio irreal.
Controlá cada publicación con su ficha y descripción, y dejá afuera, con el motivo, la que no sea comparable: otra versión, motor, caja o carrocería, alguna falla o choque, GNC, problema de papeles, precio que no es de contado (el precio publicado es un anticipo, cuotas, "desde" o "precio con tu usado"; si aclara otro precio más alto para permuta o financiado y el publicado es el de contado, sirve), precio mal cargado, más de 25% por debajo de las demás sin explicación, o el mismo auto publicado dos veces (dejá una).
Esto es NORMAL y NO es motivo para sacarla: que acepte permuta ("permuto", "permutaría", "vendo o permuto"), que la agencia ofrezca financiación o ponga su publicidad, que el precio esté en dólares (blue, informal o "dólar del día"), que la descripción sea corta o no diga nada, o que se entregue con la transferencia.
Mirá con atención la más barata, porque fija el precio: sacala solo si tiene un problema CONCRETO de los de arriba. Sacarla sin un problema concreto sube el precio y es un error tan grave como dejar una con problemas.
Las variantes menores de equipamiento de la misma versión (un pack, una edición especial con accesorios o estética distinta) son la misma versión; una versión con "Plus" o "Premium" agregado es otra versión más cara y no sirve si el cliente dijo la suya sin ese agregado.
Si la versión del cliente existe con una sola caja, esa es su caja aunque la ficha diga otra.
Si la ficha contradice al título o a la descripción en la caja o el motor, vale lo que dicen el título y la descripción (la ficha a veces está mal cargada).
NO SUPONGAS datos del auto del cliente que no te dieron: si no dijo carrocería, puertas o equipamiento, cualquiera de esa versión sirve.
Si te paso generacion_del_cliente, todas ya son de su generación; si hay un restyling en el medio y la publicación es de otro diseño que el del cliente, dejala afuera.
Devolvé los ids que quedan (usadas), las que dejaste afuera con el motivo, y en "razon" una o dos oraciones cortas para el equipo sobre lo que controlaste.`;

const REGLAS_HERMANAS = `Sos tasador de autos usados en Argentina. Del auto que un cliente quiere entregar hay muy pocas publicaciones de su versión exacta, así que se va a comparar también con las otras versiones de equipamiento del MISMO auto (el precio se ajusta aparte). Te paso el auto del cliente y publicaciones de Mercado Libre (id, título, año, km, usd).
Devolvé en hermanas las que son el mismo modelo, de la misma generación y diseño, con el mismo motor (cilindrada y combustible), la misma carrocería y la misma tracción que el auto del cliente, aunque tengan OTRO nivel de equipamiento (por ejemplo Trendline, Comfortline, Highline; Ambiente, Edge, Titanium; Allure, Feline, Sport; Plus) u otra caja. Para cada una, version: el nombre corto de su nivel de equipamiento tal como aparece en el título.
Afuera: otro modelo o un derivado con otro nombre (Cross, Stepway, Trend si es otro modelo), otra carrocería, otro motor o combustible, otra tracción u otra cabina, otra generación o diseño. Si te paso datos de generación, usalos. Ante la duda, afuera.
version_del_cliente: el nombre corto de la versión del cliente como aparece en los títulos, o vacío si no aparece en ninguno.`;

const ESQUEMA_HERMANAS = {
  type: 'object',
  properties: {
    hermanas: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'string' } }, required: ['id', 'version'], additionalProperties: false } },
    version_del_cliente: { type: 'string' },
  },
  required: ['hermanas', 'version_del_cliente'],
  additionalProperties: false,
};

// Se suma a REGLAS_VALOR cuando la bolsa está ampliada
const REGLAS_VALOR_AMPLIADA = `
ESTA VEZ LA BOLSA ESTÁ AMPLIADA: de la versión exacta del cliente hay muy pocas publicaciones, así que también te paso otras versiones de equipamiento del MISMO auto (las que traen version_hermana) y autos con más o menos km. El código ajusta el precio por versión y por km (usd_ajustado), así que no hay km_tope. No saques ninguna por ser otro nivel de equipamiento, por la caja ni por los km: solo por los demás motivos (falla, choque, GNC, papeles, precio que no es de contado, otro motor, otra carrocería u otro modelo, la misma publicada dos veces). La comparación de "más de 25% por debajo de las demás" hacela con usd_ajustado.`;

const REGLAS_FOTOS = `Sos tasador de autos usados en Argentina. El modelo del cliente tuvo un cambio de generación y en esos años se vendieron dos generaciones con el MISMO NOMBRE, que no valen lo mismo. Te paso la generación del cliente y la otra, con cómo distinguirlas, y publicaciones de Mercado Libre con su foto principal.
Para cada publicación, mirando la foto (frente, faros, parrilla, cola, interior) y el título, decí si es de la MISMA generación que el auto del cliente: "si", "no" o "duda". Si la foto no muestra el auto o no alcanza para estar seguro, "duda". Motivo en pocas palabras.`;

const ESQUEMA_FOTOS = {
  type: 'object',
  properties: {
    publicaciones: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, es_su_generacion: { type: 'string', enum: ['si', 'no', 'duda'] }, motivo: { type: 'string' } },
        required: ['id', 'es_su_generacion', 'motivo'],
        additionalProperties: false,
      },
    },
  },
  required: ['publicaciones'],
  additionalProperties: false,
};

const ESQUEMA_VALOR = {
  type: 'object',
  properties: {
    usadas: { type: 'array', items: { type: 'string' } },
    descartadas: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, motivo: { type: 'string' } }, required: ['id', 'motivo'], additionalProperties: false },
    },
    razon: { type: 'string' },
  },
  required: ['usadas', 'descartadas', 'razon'],
  additionalProperties: false,
};

const ESQUEMA_DESCRIPCION = {
  type: 'object',
  properties: {
    revisadas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, limpia: { type: 'boolean' }, motivo: { type: 'string' } },
        required: ['id', 'limpia', 'motivo'],
        additionalProperties: false,
      },
    },
  },
  required: ['revisadas'],
  additionalProperties: false,
};

/* ── Variantes que cambian el precio ────────────────────────────── */

// Lo que dice un título (o la versión del cliente) sobre el motor, la tracción y la cabina
const RASGOS = {
  motor: (t) => { const m = String(t).match(/\b(\d[.,]\d)\b/); const d = /\b(hdi|tdi|tdci|dci|crdi|cdi|d-?4d|multijet|di[eé]sel|diesel)\b/i.test(t); return m ? `${m[1].replace(',', '.')}${d ? ' diésel' : ''}` : d ? 'diésel' : null; },
  traccion: (t) => (/\b(4x4|awd|4wd|quattro|4motion|integral)\b/i.test(t) ? '4x4' : /\b(4x2|fwd|2wd)\b/i.test(t) ? '4x2' : null),
  cabina: (t) => (/\b(cabina simple|c\/s|cs)\b/i.test(t) ? 'cabina simple' : /\b(cabina doble|doble cabina|c\/d|cd|dc)\b/i.test(t) ? 'cabina doble' : null),
};
const NOMBRE_RASGO = { motor: 'motores', traccion: 'tracciones', cabina: 'cabinas' };

/* Si las comparables tienen dos variantes de un rasgo que el cliente no dijo, devuelve las opciones
   para preguntarle (como versión completa: "Allure 2.0" / "Allure 1.6 diésel") */
export function variantesSinDecir(p, usadas) {
  const dicho = `${p.version} ${p.modelo}`;
  for (const [rasgo, leer] of Object.entries(RASGOS)) {
    if (leer(dicho)) continue;
    const valores = [...new Set(usadas.map((t) => leer(t.titulo)).filter(Boolean))];
    if (valores.length < 2) continue;
    return { tipo: NOMBRE_RASGO[rasgo], opciones: valores.map((v) => `${p.version} ${v}`.trim()) };
  }
  return null;
}

/* ── Tasar ──────────────────────────────────────────────────────── */

export function normalizarPedido(d = {}) {
  const anio = Number(String(d.anio || '').replace(/\D/g, '').slice(0, 4)) || 0;
  // "69 km" o "69k" es 69.000 (nadie entrega un auto usado con menos de 1.000 km)
  const km = ((n) => (n && n < 1000 ? n * 1000 : n))(Number(String(d.km || '').replace(/\D/g, '')) || null);
  return {
    marca: String(d.marca || '').trim().slice(0, 40),
    modelo: String(d.modelo || '').trim().slice(0, 60),
    version: String(d.version || '').trim().slice(0, 60),
    generacion: String(d.generacion || '').trim().slice(0, 60),
    // manual / automatica, o vacío si no lo dijo (ahí se usa la de la mayoría de las publicaciones de esa versión)
    caja: /autom|cvt|tiptronic|s.?tronic|dsg|steptronic/i.test(d.caja || '') ? 'automatica' : /manual|mec/i.test(d.caja || '') ? 'manual' : '',
    anio, km,
    // 'directa' si quiere vendernos el auto sin comprar uno (la oferta es otra); vacío si es parte de pago
    compra: d.compra === 'directa' ? 'directa' : '',
  };
}

// Sin km no se pide la tasación: los km los pregunta la IA en la charla
export const pedidoCompleto = (p) => Boolean(p.marca && p.modelo && p.anio >= 1990 && p.anio <= new Date().getFullYear() + 1 && p.km > 0);
// Los km se redondean a 10.000 para la caché (90.000 y 92.000 km comparten tasación)
export const claveDePedido = (p) => `${slug(p.marca)}/${slug(p.modelo)}/${p.anio}/${slug(p.version) || '-'}/${p.km ? Math.round(p.km / 10000) * 10 : 'x'}k${p.generacion ? `/${slug(p.generacion)}` : ''}${p.caja ? `/${p.caja}` : ''}${p.compra === 'directa' ? '/directa' : ''}`;

// Rango de km para buscar: ±margen, y al menos ±15.000 km para autos con pocos km
const rangoKm = (km, margen) => [
  Math.max(0, Math.round(Math.min(km * (1 - margen), km - 15000) / 1000) * 1000),
  Math.round(Math.max(km * (1 + margen), km + 15000) / 1000) * 1000,
];

/* La oferta se calcula al leer, así un cambio de porcentaje vale también para lo guardado */
export const porcentajeDe = (r, cfg) => {
  const p = { ...PORCENTAJES_INICIALES, ...(cfg?.porcentajes || {}) };
  // Compra directa: su porcentaje. Parte de pago: por tramo, más unos puntos si el auto tiene más riesgo de puesta a punto
  if (r?.pedido?.compra === 'directa') return p.directa;
  return (r?.promedio < p.umbral ? p.bajo : p.alto) + (r?.riesgo ? p.riesgo : 0);
};
export const ofertaDe = (r, cfg) => !r?.promedio ? 0 : Math.max(0, Math.floor((r.promedio * (1 - porcentajeDe(r, cfg) / 100)) / 100) * 100);
export function conOferta(resultado, cfg) {
  if (!resultado?.promedio) return resultado;
  const oferta = ofertaDe(resultado, cfg);
  return { ...resultado, porcentaje: porcentajeDe(resultado, cfg), descuento: resultado.promedio - oferta, oferta };
}

export async function tasar(env, pedido, { forzar = false } = {}) {
  const p = normalizarPedido(pedido);
  if (!pedidoCompleto(p)) throw new Error('Faltan marca, modelo o año');
  if (!env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY');
  const cfg = await leerConfigTasador(env);
  const clave = `tasacion:${claveDePedido(p)}`;
  if (!forzar) {
    const guardada = await leerEstado(env, clave);
    if (guardada) return conOferta({ ...guardada, deCache: true }, cfg);
  }
  // Sin km no se puede comparar bien: se le preguntan al cliente
  if (!p.km) return { estado: 'falta_km', pedido: p, fecha: Date.now() };
  /* Generación: si el año del cliente es de transición, primero se deduce por la versión y el motor
     (son datos duros: un motor que existe en una sola generación la define, aunque el cliente haya
     contestado otra cosa); si no alcanza, vale lo que contestó, y si no contestó, se le pregunta */
  const dudosa = contextoDeGeneracion({ ...p, generacion: '' });
  if (dudosa.falta && (p.version || p.generacion)) {
    const r = await preguntarClaude(env, REGLAS_GENERACION, {
      auto_del_cliente: autoComoTexto(p), lo_que_contesto_de_la_generacion: p.generacion || '(no contestó)', generaciones_de_ese_anio: dudosa.generaciones,
    }, ESQUEMA_GENERACION).catch(() => null);
    const nombre = dudosa.nombres[r?.generacion];
    if (nombre) p.generacion = nombre;
  }
  const gen = contextoDeGeneracion(p);
  if (gen.falta) return { estado: 'falta_generacion', pedido: p, pregunta: gen.pregunta, generaciones: gen.generaciones, fecha: Date.now() };

  // "1.6" o "2.0" es el motor, no la versión: no alcanza para elegir publicaciones (un 1.6 puede ser base o full)
  const soloMotor = /^\s*\d[.,]\d\s*(l|lts?|litros|v|16v|8v|turbo|tdi|hdi)?\s*$/i.test(p.version);
  const versionDicha = soloMotor ? '' : p.version;
  const dolar = await dolarDeAyer(env);
  const enDolares = (t) => ({ ...t, usd: t.moneda === 'USD' ? t.precio : Math.round(t.precio / dolar.venta) });
  const hoy = new Date().getFullYear();
  const notas = [];
  const revisadas = new Map();   // id → { limpia, motivo }
  const tarjetas = new Map();    // id → tarjeta (con usd y descripción)
  const coinciden = new Set();   // ids de la misma versión
  const busquedas = [];          // qué se buscó en Mercado Libre
  if (gen.nota) notas.push(gen.nota);
  if (!gen.enLista) notas.push(gen.pista ? 'El modelo está en la lista de generaciones sin verificar: los años vecinos los decidió Claude con la lista como pista.' : 'El modelo no está en la lista de generaciones: los años vecinos los decidió Claude.');
  // Lo que Claude tiene que saber de la generación del cliente (si el modelo está en la lista)
  const datosGeneracion = gen.enLista ? {
    generacion_del_cliente: gen.gen,
    anios_con_dos_generaciones: gen.transicion,
    restylings_de_su_generacion: gen.restylings,
  } : gen.pista ? { pista_de_generaciones: gen.pista } : {};
  let leidas = 0;
  const gasto = { usd: 0, llamadas: {} };
  // La caja: la que dijo el cliente, o la que eligió Haiku en la primera búsqueda (la de la mayoría)
  let caja = p.caja;
  const conCaja = () => ({ caja_del_cliente: p.caja || (caja ? `(no la dijo; se supuso ${caja} por ser la de la mayoría: una publicación de su versión exacta con la otra caja NO se descarta por eso, la caja cambia poco el precio)` : '(no la dijo: elegí la de la mayoría de las publicaciones de esa versión)') });

  // Cercanía al auto del cliente: cuentan los km (el año anterior y el siguiente entran igual; a igual km, primero el mismo año)
  const distancia = (t) => Math.abs((t.km ?? Infinity) - p.km) + Math.abs((t.anio ?? p.anio) - p.anio);
  const candidatas = () => [...coinciden].map((id) => tarjetas.get(id)).sort((a, b) => distancia(a) - distancia(b));
  // Bolsa ampliada: precio llevado al auto del cliente por km (1% cada 10.000 km, tope ±20%) y por versión
  let ampliada = false;
  const factorKm = (t) => (t.km ? Math.min(1.2, Math.max(0.8, 1 + (0.01 * (t.km - p.km)) / 10000)) : 1);
  const ajustado = (t) => Math.round(t.usd * factorKm(t) * (t.hermana?.factor || 1));
  const precioDe = (t) => (ampliada ? ajustado(t) : t.usd);

  // Trae de Mercado Libre años y rango de km, y Haiku marca cuáles son la misma versión
  // Tope de páginas de listado por tasación (cada una cuenta en las 50 consultas de Cloudflare)
  const presupuesto = { listados: 12 };
  // Los nombres de modelo de Mercado Libre que corresponden al auto del cliente (puede publicarse con varios)
  let nombresML = null;
  async function nombresEnML() {
    if (nombresML) return nombresML;
    const base = gen.modelo || p.modelo; // con el nombre de la lista de generaciones (ej: "208 Feline" → "208")
    const candidatos = candidatosEnML(await modelosDeLaMarca(env, p.marca).catch(() => ({})), base);
    nombresML = [slug(base)];
    if (candidatos.length === 1) nombresML = candidatos;
    else if (candidatos.length > 1) {
      const r = await preguntarClaude(env, REGLAS_NOMBRES, { auto_del_cliente: autoComoTexto(p), nombres_en_mercado_libre: candidatos }, ESQUEMA_NOMBRES, LECTOR, gasto).catch(() => null);
      // En el orden de uso (los más usados primero); como mucho 3 nombres, para no gastar el tope de páginas
      const elegidos = candidatos.filter((n) => (r?.nombres || []).includes(n));
      nombresML = elegidos.length ? elegidos.slice(0, 3) : candidatos.slice(0, 1);
    }
    if (nombresML.length > 1 || nombresML[0] !== slug(base)) notas.push(`En Mercado Libre se buscó como: ${nombresML.join(', ')}.`);
    return nombresML;
  }

  async function buscar(anios, rango, paginas = 1) {
    const nuevas = [];
    const nombres = await nombresEnML();
    for (const [i, anio] of anios.entries()) {
      busquedas.push(`${anio}, ${rango[0].toLocaleString('es-AR')} a ${rango[1].toLocaleString('es-AR')} km`);
      // El tope de páginas se reparte entre los años que faltan (que el primero no se lleve todo)
      const delAnio = { listados: Math.max(1, Math.floor(presupuesto.listados / (anios.length - i))) };
      const antes = delAnio.listados;
      const lista = await listado(env, p.marca, nombres, anio, rango, paginas, delAnio);
      presupuesto.listados -= antes - delAnio.listados;
      for (const t of lista) {
        if (!tarjetas.has(t.id)) { const x = enDolares(t); tarjetas.set(t.id, x); nuevas.push(x); }
      }
    }
    if (!nuevas.length) return { version_clara: true, version_no_aparece: false, caja_unica: true, versiones: [] };
    const r = await preguntarClaude(env, REGLAS_VERSION, {
      auto_del_cliente: autoComoTexto(p), version_dicha_por_el_cliente: versionDicha || (soloMotor ? `(no la dijo: solo el motor ${p.version})` : '(no la dijo)'),
      anios_aceptados: anios, ...datosGeneracion, ...conCaja(),
      publicaciones: nuevas.map((t) => ({ id: t.id, titulo: t.titulo, anio: t.anio, km: t.km, usd: t.usd })),
    }, ESQUEMA_VERSION, LECTOR, gasto);
    if (r.nota) notas.push(r.nota);
    if (!caja && r.caja) { caja = r.caja; notas.push(`El cliente no dijo la caja: se tomó ${r.caja === 'automatica' ? 'automática' : 'manual'}, la de la mayoría de las publicaciones de esa versión. Confirmarla con el cliente.`); }
    for (const id of r.coinciden) if (tarjetas.has(id)) coinciden.add(id);
    // Solo las que por el título no se sabe de qué generación son se miran por foto (más barato y sin tope que deje afuera las claras)
    await separarPorFoto((r.dudosas_de_generacion || []).filter((id) => coinciden.has(id)));
    return r;
  }

  /* Años de transición (dos generaciones con el mismo nombre): Haiku ya decidió por el título las que
     se distinguen (versión, motor). Las dudosas: Sonnet mira la foto principal y se quedan solo las de
     la generación del cliente. Ante la duda, afuera.
     Se miran como mucho las 6 más cercanas en km (cada foto cuenta en el tope de 50 consultas de Cloudflare). */
  async function separarPorFoto(ids) {
    const deTransicion = ids.map((id) => tarjetas.get(id)).filter((t) => gen.transicion?.[t.anio])
      .sort((a, b) => distancia(a) - distancia(b));
    if (!deTransicion.length) return;
    const afuera = (t, motivo) => { coinciden.delete(t.id); revisadas.set(t.id, { limpia: false, motivo }); };
    /* Las fotos las baja el servidor y van adentro del pedido: Claude no puede bajar algunas de
       Mercado Libre por su cuenta. Versión webp liviana (unos 20 a 60 KB). */
    const conFoto = await Promise.all(deTransicion.slice(0, 6).filter((t) => t.foto).map(async (t) => {
      try {
        const r = await fetch(`https://http2.mlstatic.com/D_NQ_NP_${t.foto}-O.webp`, { headers: NAVEGADOR });
        const bytes = r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
        if (!bytes || bytes.length > 400000) return null;
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { t, datos: btoa(bin) };
      } catch (_) { return null; }
    }));
    const mirar = conFoto.filter(Boolean).map((x) => x.t);
    const cercanas = deTransicion.slice(0, 6);
    for (const t of deTransicion) {
      if (mirar.includes(t)) continue;
      afuera(t, cercanas.includes(t) ? 'Año con dos generaciones y no se pudo ver la foto' : 'Año con dos generaciones: no se revisó la foto (se miran las 6 más cercanas en km)');
    }
    if (!mirar.length) return;
    const contenido = [{ type: 'text', text: JSON.stringify({
      auto_del_cliente: autoComoTexto(p), su_generacion: gen.gen,
      otras_generaciones_esos_anios: gen.transicion,
      publicaciones: mirar.map((t, i) => ({ foto: i + 1, id: t.id, titulo: t.titulo, anio: t.anio, km: t.km })),
    }) }];
    conFoto.filter(Boolean).forEach(({ t, datos }, i) => contenido.push(
      { type: 'text', text: `Foto ${i + 1} (${t.id}):` },
      { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: datos } },
    ));
    let r;
    // Si la revisión por foto falla, esas publicaciones quedan afuera y la tasación sigue con el resto
    try { r = await preguntarClaude(env, REGLAS_FOTOS, contenido, ESQUEMA_FOTOS, CONTROL, gasto); }
    catch (e) { for (const t of mirar) afuera(t, `No se pudo revisar la foto (${e.message.slice(0, 60)})`); return; }
    const veredicto = new Map(r.publicaciones.map((v) => [v.id, v]));
    for (const t of mirar) {
      const v = veredicto.get(t.id);
      if (v?.es_su_generacion !== 'si') {
        coinciden.delete(t.id);
        revisadas.set(t.id, { limpia: false, motivo: `Otra generación o dudosa (foto): ${v?.motivo || 'sin respuesta'}` });
      }
    }
  }

  // El mismo auto publicado dos veces (mismos km, precio casi igual, misma descripción) cuenta una sola vez
  const mismoAuto = (a, b) => a.anio === b.anio && a.km === b.km && Math.abs(a.usd - b.usd) <= a.usd * 0.05 &&
    (a.descripcion?.texto || '').slice(0, 60) === (b.descripcion?.texto || '').slice(0, 60);
  const limpias = () => {
    const todas = candidatas().filter((t) => revisadas.get(t.id)?.limpia);
    return todas.filter((t, i) => !todas.slice(0, i).some((o) => mismoAuto(o, t)));
  };

  // Haiku lee descripción y ficha de las más cercanas en km, de a tandas, hasta juntar 6 limpias
  async function revisarHastaJuntar(objetivo = COMPARABLES) {
    while (limpias().length < objetivo && leidas < MAX_DESCRIPCIONES) {
      const tanda = candidatas().filter((t) => !revisadas.has(t.id)).slice(0, Math.min(POR_TANDA, MAX_DESCRIPCIONES - leidas));
      if (!tanda.length) return;
      await Promise.all(tanda.map(async (t) => { t.descripcion = await descripcion(t); }));
      leidas += tanda.length;
      // La que no se pudo leer no entra: sin descripción no se puede saber si tiene un problema
      const legibles = tanda.filter((t) => t.descripcion.leida);
      for (const t of tanda) if (!t.descripcion.leida) revisadas.set(t.id, { limpia: false, motivo: 'No se pudo leer la descripción' });
      if (!legibles.length) continue;
      const precios = candidatas().map(precioDe).sort((a, b) => a - b);
      const r = await preguntarClaude(env, REGLAS_DESCRIPCION, {
        auto_del_cliente: autoComoTexto(p), ...conCaja(),
        mediana_usd_del_listado: precios[Math.floor(precios.length / 2)],
        publicaciones: legibles.map((t) => ({
          id: t.id, titulo: t.titulo, anio: t.anio, km: t.km, usd: t.usd, ...(t.hermana ? { version_hermana: t.hermana.version } : {}),
          ficha: t.descripcion.ficha || { Versión: t.descripcion.version }, descripcion: t.descripcion.texto || '(el vendedor no escribió descripción)',
        })),
      }, ESQUEMA_DESCRIPCION, LECTOR, gasto);
      const veredictos = new Map(r.revisadas.map((v) => [v.id, v]));
      for (const t of legibles) {
        const v = veredictos.get(t.id);
        revisadas.set(t.id, v ? { limpia: Boolean(v.limpia), motivo: String(v.motivo || '') } : { limpia: false, motivo: 'Sin revisar' });
      }
    }
  }

  // Mismo año, el anterior y el siguiente, desde el principio
  const anios = (gen.enLista ? gen.anios : [p.anio - 1, p.anio, p.anio + 1]).filter((a) => a <= hoy + 1);
  // Hasta 3 páginas por año en el rango de km cercano; si hace falta abrir el rango, 1 página más por año
  /* Km muy bajos para la edad (un auto guardado: 10.000 km en un 2013): buscando por km no aparece nada.
     Se busca desde el principio hasta el km normal para esos años y el precio se lleva a sus km, como en la
     bolsa ampliada (1% cada 10.000 km, tope 20%). */
  const kmNormal = (hoy - p.anio + 1) * 15000;
  const kmBajos = p.km < kmNormal * 0.5;
  const rangoAmplio = [0, Math.round(Math.max(p.km * 3, kmNormal) / 1000) * 1000];
  if (kmBajos) notas.push(`Tiene muy pocos km para su edad (${Number(p.km).toLocaleString('es-AR')} km): se compararon publicaciones con más km, con el precio llevado a sus km (1% cada 10.000 km, tope 20%).`);
  const primero = await buscar(anios, kmBajos ? rangoAmplio : rangoKm(p.km, 0.35), 3);
  // Falta la versión si no la dijo y hay versiones con precios distintos, o si la que dijo no aparece (se confundió, o no existía ese año)
  const noAparece = Boolean(versionDicha && primero.version_no_aparece && primero.versiones.length && !coinciden.size);
  if ((!primero.version_clara && !versionDicha) || noAparece) {
    const resultado = { estado: 'falta_version', pedido: p, versiones: primero.versiones.slice(0, 4), no_aparece: noAparece, gasto: { usd: Math.round(gasto.usd * 10000) / 10000, llamadas: gasto.llamadas }, fecha: Date.now() };
    await guardarEstado(env, clave, resultado, DIA_S);
    return resultado;
  }
  /* La caja no se le pregunta al cliente: en Mercado Libre, el mismo modelo y año vale parecido manual o
     automático (mediana +4%, revisado el 29/10/2026 con 16 modelos), y la cotización es aproximada y la
     confirma el tasador. Si no la dijo, se usa la de la mayoría de las publicaciones de esa versión. */
  await revisarHastaJuntar();
  if (limpias().length < COMPARABLES && !kmBajos) {
    await buscar(anios, rangoKm(p.km, 0.6));
    await revisarHastaJuntar();
  }

  // Sonnet controla las limpias más cercanas en km (6; 8 con la bolsa ampliada)
  async function decidir(cuantas) {
    const lista = limpias().slice(0, cuantas);
    if (!lista.length) return { usadas: [], razon: '' };
    const d = await preguntarClaude(env, REGLAS_VALOR + (ampliada ? REGLAS_VALOR_AMPLIADA : ''), {
      auto_del_cliente: autoComoTexto(p), ...datosGeneracion, ...conCaja(), ...(ampliada ? {} : { km_tope: Math.round(p.km * 1.2) }),
      publicaciones: lista.map((t) => ({
        id: t.id, titulo: t.titulo, anio: t.anio, km: t.km, usd: t.usd, lugar: t.lugar,
        ...(ampliada ? { version_hermana: t.hermana?.version || null, usd_ajustado: ajustado(t) } : {}),
        ficha: t.descripcion?.ficha || {}, descripcion: t.descripcion?.texto || '',
      })),
    }, ESQUEMA_VALOR, CONTROL, gasto);
    for (const v of d.descartadas) {
      if (lista.some((t) => t.id === v.id)) revisadas.set(v.id, { limpia: false, motivo: `Sonnet: ${v.motivo}` });
    }
    return { usadas: lista.filter((t) => d.usadas.includes(t.id) && revisadas.get(t.id)?.limpia), razon: d.razon };
  }

  /* Bolsa ampliada: las otras versiones de equipamiento del mismo auto, con el precio llevado a la del
     cliente con datos (mediana de cada versión en todo lo traído, con los km igualados a los del cliente) */
  async function sumarHermanas() {
    if (presupuesto.listados >= anios.length) await buscar(anios, rangoKm(p.km, 1.2));
    const resto = [...tarjetas.values()].filter((t) => !coinciden.has(t.id) && !revisadas.has(t.id));
    if (!resto.length) return [];
    const r = await preguntarClaude(env, REGLAS_HERMANAS, {
      auto_del_cliente: autoComoTexto(p), version_dicha_por_el_cliente: versionDicha || '(no la dijo)', anios_aceptados: anios, ...datosGeneracion,
      publicaciones: resto.map((t) => ({ id: t.id, titulo: t.titulo, anio: t.anio, km: t.km, usd: t.usd })),
    }, ESQUEMA_HERMANAS, LECTOR, gasto).catch(() => null);
    if (!r?.hermanas?.length) return [];
    const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const todas = [...tarjetas.values()];
    // Mediana de una versión (con los km igualados): por el nombre entero y, si no alcanza, por su palabra principal ("Highline Cuero" → "highline")
    const medianaDe = (nombre) => {
      const n = norm(nombre);
      const principal = n.split(' ').filter((w) => w.length >= 4 && !/^\d/.test(w))[0] || '';
      for (const clave of [n, principal]) {
        if (!clave) continue;
        const xs = todas.filter((t) => norm(t.titulo).includes(clave)).map((t) => t.usd * factorKm(t)).sort((a, b) => a - b);
        if (xs.length >= 3) return xs[Math.floor(xs.length / 2)];
      }
      return null;
    };
    const delCliente = medianaDe(r.version_del_cliente) || medianaDe(versionDicha);
    const factores = {};
    const sumadas = [];
    for (const h of r.hermanas) {
      const t = tarjetas.get(h.id);
      if (!t || coinciden.has(h.id)) continue;
      if (!(h.version in factores)) { const m = medianaDe(h.version); factores[h.version] = delCliente && m ? Math.min(1.15, Math.max(0.85, delCliente / m)) : 1; }
      t.hermana = { version: h.version, factor: Math.round(factores[h.version] * 1000) / 1000 };
      coinciden.add(h.id);
      sumadas.push(t);
    }
    const ajustes = Object.entries(factores).map(([v, f]) => `${v} ${f === 1 ? 'sin ajuste' : `${f > 1 ? '+' : ''}${Math.round((f - 1) * 100)}%`}`).join(', ');
    if (sumadas.length) notas.push(`Pocas publicaciones de su versión exacta: se compararon también otras versiones del mismo auto (${ajustes}), con el precio ajustado por versión y por km (1% cada 10.000 km).`);
    return sumadas;
  }

  if (kmBajos) ampliada = true; // sin tope de km: los precios se ajustan a los km del cliente
  let { usadas, razon } = await decidir(COMPARABLES);
  if (usadas.length < MIN_REFERENCIAS && (await sumarHermanas()).length) {
    ampliada = true;
    // Las notas de la primera pasada que dicen que otras versiones quedaron afuera ya no valen
    for (let i = notas.length - 1; i >= 0; i--) if (/quedan? afuera|otra versi[oó]n|ninguna publicaci[oó]n es|solo hay (una|\d) publicaci|publicaciones? de (su|la) versi/i.test(notas[i]) && !/Pocas publicaciones/.test(notas[i])) notas.splice(i, 1);
    await revisarHastaJuntar(COMPARABLES_AMPLIADA);
    ({ usadas, razon } = await decidir(COMPARABLES_AMPLIADA));
  }
  /* Si entre las comparables hay variantes que valen distinto y el cliente no dijo cuál es la suya
     (motor nafta o diésel / cilindrada, 4x2 o 4x4, cabina simple o doble), se le pregunta con las opciones */
  const variantes = variantesSinDecir(p, usadas);
  if (variantes) {
    notas.push(`Las publicaciones mezclan ${variantes.tipo} distintos y el cliente no dijo cuál es el suyo: se le pregunta.`);
    const resultado = { estado: 'falta_version', pedido: p, versiones: variantes.opciones, no_aparece: false, notas, gasto: { usd: Math.round(gasto.usd * 10000) / 10000, llamadas: gasto.llamadas }, fecha: Date.now() };
    await guardarEstado(env, clave, resultado, DIA_S);
    return resultado;
  }
  /* Precio de mercado = la más barata con km iguales o menores (+20% de tolerancia). Si ninguna, la más
     barata de las 2 más cercanas en km, y queda para revisar a mano. */
  // Con la bolsa ampliada los precios ya están llevados a los km del cliente: entran todas
  const conKmParecidos = ampliada ? usadas : usadas.filter((t) => t.km && t.km <= p.km * 1.2);
  const base = conKmParecidos.length ? conKmParecidos : [...usadas].sort((a, b) => distancia(a) - distancia(b)).slice(0, 2);
  const porPrecio = [...base].sort((a, b) => precioDe(a) - precioDe(b));
  let masBarata = porPrecio[0] || null;
  /* Protección contra el aviso raro: si la más barata está más de un 15% abajo de cualquier otra
     comparable (aun con más km: si otra la corrobora, es un precio real), no fija el precio sola */
  const otraMasBarata = [...usadas].filter((t) => t !== masBarata).sort((a, b) => precioDe(a) - precioDe(b))[0] || null;
  const minimoUsd = masBarata ? precioDe(masBarata) : null;
  if (masBarata && otraMasBarata && precioDe(masBarata) < precioDe(otraMasBarata) * 0.85) {
    notas.unshift(`La más barata (${masBarata.titulo}, USD ${masBarata.usd.toLocaleString('es-AR')}) está más de un 15% abajo de todas las demás: no fija el precio sola, se tomó la siguiente.`);
    masBarata = porPrecio[1] || otraMasBarata;
  }
  const promedio = masBarata ? Math.round(precioDe(masBarata) / 100) * 100 : null;
  if (masBarata) notas.unshift(`Precio de mercado: ${masBarata.titulo} (${masBarata.anio}, ${Number(masBarata.km).toLocaleString('es-AR')} km) a USD ${masBarata.usd.toLocaleString('es-AR')}${ampliada ? `, ajustado a su versión y sus km: USD ${precioDe(masBarata).toLocaleString('es-AR')}` : ''}.`);
  if (masBarata && !conKmParecidos.length) notas.push('No hay ninguna con km iguales o menores que el auto del cliente: revisar a mano.');
  // Riesgo de puesta a punto: 10 años o más, o bastantes más km que los comparables
  const kmComparables = usadas.filter((t) => t.km).map((t) => t.km);
  const kmPromedio = kmComparables.length ? kmComparables.reduce((a, b) => a + b, 0) / kmComparables.length : null;
  const riesgoMotivo = hoy - p.anio >= 10 ? `tiene ${hoy - p.anio} años` : kmPromedio && p.km > kmPromedio * 1.15 ? `tiene más km que los comparables (${Math.round(kmPromedio / 1000)}.000 km de promedio)` : '';
  if (riesgoMotivo) notas.push(`Riesgo de puesta a punto: ${riesgoMotivo}; se descuentan unos puntos más.`);
  const quitar = (t) => ({ id: t.id, titulo: t.titulo, anio: t.anio, km: t.km, usd: t.usd, ...(ampliada ? { hermana: t.hermana?.version || null, usd_ajustado: ajustado(t) } : {}), precio: t.precio, moneda: t.moneda, lugar: t.lugar, url: t.url, version: t.descripcion?.version || '', descripcion: t.descripcion?.texto || '' });
  const resultado = {
    estado: !promedio ? 'sin_datos' : conKmParecidos.length ? 'lista' : 'pocos_datos',
    pedido: p,
    busquedas,
    dolar,
    publicaciones: tarjetas.size,
    coincidentes: coinciden.size,
    promedio,
    minimoUsd,
    riesgo: Boolean(riesgoMotivo),
    razon: razon || '',
    ampliada,
    // La que fija el precio va primero
    comparables: [...usadas].sort((a, b) => (a === masBarata ? -1 : b === masBarata ? 1 : precioDe(a) - precioDe(b))).map((t) => ({ ...quitar(t), motivo: revisadas.get(t.id).motivo, fijaPrecio: t === masBarata })),
    descartadas: [...revisadas].filter(([, v]) => !v.limpia).map(([id, v]) => ({ ...quitar(tarjetas.get(id)), motivo: v.motivo }))
      .sort((a, b) => distancia(a) - distancia(b)),
    notas,
    gasto: { usd: Math.round(gasto.usd * 10000) / 10000, llamadas: gasto.llamadas, descripciones: leidas },
    fecha: Date.now(),
  };
  await guardarEstado(env, clave, resultado, SEMANA_S);
  return conOferta(resultado, cfg);
}

/* ── Batería de pruebas del tasador ─────────────────────────────── */

/* Pruebas sin cliente (estado 'tasador_prueba': { pendientes: [pedido...] }): el cron calcula una por
   minuto (una tasación usa casi todo el cupo de consultas) y deja un resumen por prueba en
   'tasador_prueba_resultado', para revisar a mano qué eligió y por qué. */
export async function tasarPrueba(env) {
  const cola = await leerEstado(env, 'tasador_prueba');
  if (!cola?.pendientes?.length) return null;
  const [pedido, ...resto] = cola.pendientes;
  await guardarEstado(env, 'tasador_prueba', { pendientes: resto }, 2 * DIA_S);
  let r;
  try { r = await tasar(env, pedido, { forzar: true }); }
  catch (e) { r = { estado: e instanceof BloqueoML ? 'bloqueado' : 'error', error: e.message, pedido }; }
  const corto = (t) => ({ titulo: t.titulo, anio: t.anio, km: t.km, usd: t.usd, hermana: t.hermana, usd_ajustado: t.usd_ajustado, motivo: t.motivo, fijaPrecio: t.fijaPrecio, url: t.url, descripcion: String(t.descripcion || '').slice(0, 200) });
  const resumen = {
    pedido: r.pedido || pedido, estado: r.estado, error: r.error, ampliada: r.ampliada, promedio: r.promedio, minimoUsd: r.minimoUsd, porcentaje: r.porcentaje, oferta: r.oferta, riesgo: r.riesgo,
    versiones: r.versiones, publicaciones: r.publicaciones, coincidentes: r.coincidentes, busquedas: r.busquedas, razon: r.razon, notas: r.notas,
    comparables: (r.comparables || []).map(corto), descartadas: (r.descartadas || []).slice(0, 14).map(corto), gasto: r.gasto, fecha: Date.now(),
  };
  const hechas = (await leerEstado(env, 'tasador_prueba_resultado')) || [];
  await guardarEstado(env, 'tasador_prueba_resultado', [...hechas, resumen], 2 * DIA_S);
  return { prueba: `${pedido.marca} ${pedido.modelo} ${pedido.anio}`, estado: r.estado, oferta: r.oferta, quedan: resto.length };
}

/* ── Registro de resultados (para ajustar los porcentajes con datos) ── */

/* Si el cliente contesta con un número después de recibir su cotización, queda como contraoferta.
   Se acepta un número entre el 40% y el 250% de lo ofrecido ("11.000", "11 mil", "11k"). */
export async function anotarContraoferta(env, conversacion, textos) {
  const fila = await env.DB.prepare(`SELECT id, monto, contraoferta FROM tasaciones WHERE conversacion = ?1 AND estado IN ('enviada', 'aprobada') AND monto > 0 ORDER BY actualizada DESC LIMIT 1`).bind(conversacion).first();
  if (!fila || fila.contraoferta) return;
  const texto = textos.join(' ').toLowerCase();
  const numeros = [...texto.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{2,6})\s*(mil|k\b)?/g)].map((m) => {
    let n = Number(m[1].replace(/[.,]/g, ''));
    if (m[2] && n < 1000) n *= 1000;
    return n;
  });
  const contra = numeros.find((n) => n >= fila.monto * 0.4 && n <= fila.monto * 2.5 && !(n >= 1950 && n <= 2035));
  if (contra) await env.DB.prepare('UPDATE tasaciones SET contraoferta = ?2 WHERE id = ?1').bind(fila.id, contra).run();
}

/* Cómo terminaron las cotizaciones enviadas, por porcentaje usado: cuántas, cuántas con contraoferta
   (y a qué distancia de la oferta), cuántas terminaron en visita y cuántas en no_interesado */
export async function resultadosDeCotizaciones(env, dias = 60) {
  const { results } = await env.DB.prepare(`SELECT t.monto, t.porcentaje, t.contraoferta, t.actualizada, c.etapa, c.visita, c.videollamada, c.tentativa
     FROM tasaciones t JOIN conversaciones c ON c.id = t.conversacion WHERE t.estado IN ('enviada', 'aprobada') AND t.monto > 0 AND t.actualizada > ?1`).bind(Date.now() - dias * DIA_S * 1000).all();
  const grupos = {};
  for (const r of results) {
    const g = grupos[r.porcentaje ?? 'sin dato'] ||= { porcentaje: r.porcentaje ?? 'sin dato', enviadas: 0, contraofertas: 0, pidioDeMas: [], visitas: 0, noInteresado: 0 };
    g.enviadas++;
    if (r.contraoferta) { g.contraofertas++; g.pidioDeMas.push(r.contraoferta / r.monto - 1); }
    if (r.visita || r.videollamada || r.tentativa || r.etapa === 'visita_agendada' || r.etapa === 'visito') g.visitas++;
    if (r.etapa === 'no_interesado') g.noInteresado++;
  }
  return Object.values(grupos).map((g) => ({ ...g, pidioDeMas: g.pidioDeMas.length ? Math.round((g.pidioDeMas.reduce((a, b) => a + b, 0) / g.pidioDeMas.length) * 100) : null })).sort((a, b) => a.porcentaje - b.porcentaje);
}

/* ── Tasaciones pedidas desde las conversaciones ────────────────── */

// Cuenta qué modelos ofrecen más, para recalcularlos solos cada semana
async function contarPedido(env, p) {
  const modelos = (await leerEstado(env, 'tasador_modelos')) || {};
  const clave = claveDePedido(p);
  modelos[clave] = { pedido: p, veces: (modelos[clave]?.veces || 0) + 1, ultima: Date.now() };
  // Se guardan los 60 más pedidos
  const top = Object.entries(modelos).sort((a, b) => b[1].veces - a[1].veces).slice(0, 60);
  await guardarEstado(env, 'tasador_modelos', Object.fromEntries(top));
}

// La IA pide una tasación: queda pendiente y la calcula la tarea de cada minuto
/* Autos en parte de pago: hasta 100.000 km se toman con seguridad; de 100.000 a 150.000 (con un 5% de
   tolerancia, 157.500) depende de que los apruebe el tasador en persona (igual se cotizan); con más no se toman. */
export const KM_MAXIMO_PERMUTA = 157500;
export const KM_SEGURO_PERMUTA = 100000;

export async function pedirTasacion(env, conversacion, pedido, autoInteres = null) {
  const p = normalizarPedido(pedido);
  /* Lo que ya se sabía de ese mismo auto (versión, caja, generación) no se pierde si la IA lo vuelve a
     mandar sin esos datos: si no, la cotización vuelve a empezar y se le pregunta de nuevo */
  const anterior = await env.DB.prepare('SELECT pedido FROM tasaciones WHERE conversacion = ?1 ORDER BY creada DESC LIMIT 1').bind(conversacion).first().catch(() => null);
  if (anterior) {
    const a = normalizarPedido(JSON.parse(anterior.pedido || '{}'));
    if (a.marca === p.marca && a.modelo === p.modelo && Number(a.anio) === Number(p.anio)) {
      for (const k of ['version', 'caja', 'generacion']) if (!p[k] && a[k]) p[k] = a[k];
      // Si ahora solo dijo lo que distingue ("4x4", "2.0", "cabina doble"), se suma a la versión que ya se sabía
      if (a.version && p.version && !a.version.toLowerCase().includes(p.version.toLowerCase()) && /^(\d[.,]\d|4x[24]|awd|fwd|cabina (simple|doble)|doble|simple|di[eé]sel|gasoil|hdi|tdi|nafta)$/i.test(p.version.trim())) p.version = `${a.version} ${p.version}`.slice(0, 60);
      if (!p.km && a.km) p.km = a.km;
    }
  }
  if (!pedidoCompleto(p)) return null;
  if (p.km > KM_MAXIMO_PERMUTA) return null;
  const clave = claveDePedido(p);
  const ya = await env.DB.prepare(
    `SELECT id FROM tasaciones WHERE conversacion = ?1 AND clave = ?2 AND estado NOT IN ('descartada', 'error', 'bloqueado') AND creada > ?3`,
  ).bind(conversacion, clave, Date.now() - SEMANA_S * 1000).first();
  if (ya) return null;
  // Una sola cotización por conversación: si ya hay una en curso o pasada, no se pide otra
  const otra = await env.DB.prepare(
    `SELECT id FROM tasaciones WHERE conversacion = ?1 AND estado IN ('calculando', 'lista', 'pocos_datos', 'enviada', 'aprobada', 'esperando') LIMIT 1`,
  ).bind(conversacion).first();
  if (otra) return null;
  const ahora = Date.now();
  await env.DB.prepare(
    `INSERT INTO tasaciones (conversacion, clave, pedido, estado, intentos, creada, actualizada, auto_interes) VALUES (?1, ?2, ?3, 'pendiente', 0, ?4, ?4, ?5)`,
  ).bind(conversacion, clave, JSON.stringify(p), ahora, autoInteres || null).run();
  /* Las que esperaban un dato (versión, km o generación) o que todavía no se calcularon quedan
     reemplazadas por esta, que tiene los datos más completos (una sola cotización por auto) */
  await env.DB.prepare(
    `UPDATE tasaciones SET estado = 'descartada', actualizada = ?3 WHERE conversacion = ?1 AND clave != ?2 AND estado IN ('falta_version', 'falta_caja', 'falta_km', 'falta_generacion', 'pendiente')`,
  ).bind(conversacion, clave, ahora).run();
  await contarPedido(env, p);
  return clave;
}

export const hayTasacionPendiente = async (env) => Boolean(await env.DB.prepare(
  `SELECT id FROM tasaciones WHERE (estado = 'pendiente' OR (estado = 'calculando' AND actualizada < ?1)) AND intentos < 3 LIMIT 1`,
).bind(Date.now() - 20 * 60 * 1000).first());

/* Calcula una tasación pendiente y guarda el resultado. El aviso a la conversación va en otro
   minuto (avisarTasacionLista), porque la tasación usa casi todo el cupo de consultas. */
export async function procesarTasacion(env) {
  const fila = await env.DB.prepare(
    `SELECT * FROM tasaciones WHERE (estado = 'pendiente' OR (estado = 'calculando' AND actualizada < ?1)) AND intentos < 3 ORDER BY creada LIMIT 1`,
  ).bind(Date.now() - 20 * 60 * 1000).first();
  if (!fila) return null;
  await env.DB.prepare(`UPDATE tasaciones SET estado = 'calculando', intentos = intentos + 1, actualizada = ?2 WHERE id = ?1`).bind(fila.id, Date.now()).run();
  let resultado;
  try { resultado = await tasar(env, JSON.parse(fila.pedido)); }
  catch (e) {
    resultado = { estado: e instanceof BloqueoML ? 'bloqueado' : 'error', error: e.message, pedido: JSON.parse(fila.pedido), fecha: Date.now() };
    // Errores pasajeros se reintentan (hasta 3 veces); el bloqueo no
    if (!(e instanceof BloqueoML) && fila.intentos + 1 < 3) {
      await env.DB.prepare(`UPDATE tasaciones SET estado = 'pendiente', resultado = ?2, actualizada = ?3 WHERE id = ?1`).bind(fila.id, JSON.stringify(resultado), Date.now()).run();
      return { id: fila.id, estado: 'reintentar' };
    }
  }
  await env.DB.prepare(`UPDATE tasaciones SET estado = ?2, resultado = ?3, actualizada = ?4 WHERE id = ?1`)
    .bind(fila.id, resultado.estado, JSON.stringify(resultado), Date.now()).run();
  return { id: fila.id, estado: resultado.estado };
}

/* Avisa a la conversación de una tasación ya calculada: `avisar(fila, resultado)` le pasa la
   cotización, le pregunta el dato que falta o la deja para el equipo. Si mientras se calculaba el
   cliente dio más datos (hay una más nueva del mismo chat), esta se descarta y se avisa la nueva. */
export async function avisarTasacionLista(env, avisar) {
  const fila = await env.DB.prepare(
    `SELECT * FROM tasaciones WHERE avisada = 0 AND conversacion IS NOT NULL AND estado NOT IN ('pendiente', 'calculando', 'descartada') ORDER BY actualizada LIMIT 1`,
  ).first();
  if (!fila) return null;
  // Se marca antes, para que un error no la repita cada minuto
  await env.DB.prepare('UPDATE tasaciones SET avisada = 1 WHERE id = ?1').bind(fila.id).run();
  const nueva = await env.DB.prepare(
    `SELECT id FROM tasaciones WHERE conversacion = ?1 AND creada > ?2 AND estado != 'descartada' LIMIT 1`,
  ).bind(fila.conversacion, fila.creada).first();
  if (nueva) {
    await env.DB.prepare(`UPDATE tasaciones SET estado = 'descartada', actualizada = ?2 WHERE id = ?1`).bind(fila.id, Date.now()).run();
    return { id: fila.id, estado: 'descartada' };
  }
  await avisar(fila, JSON.parse(fila.resultado || '{}'));
  return { id: fila.id, estado: fila.estado };
}

// Una vez por día: recalcula hasta 2 de los modelos más pedidos (2 o más veces) que tengan más de 6 días
export async function refrescarFrecuentes(env) {
  const modelos = Object.values((await leerEstado(env, 'tasador_modelos')) || {}).filter((m) => m.veces >= 2)
    .sort((a, b) => b.veces - a.veces);
  let hechos = 0;
  for (const m of modelos) {
    if (hechos >= 2) break;
    const guardada = await leerEstado(env, `tasacion:${claveDePedido(m.pedido)}`);
    if (guardada && Date.now() - guardada.fecha < 6 * DIA_S * 1000) continue;
    try { await tasar(env, m.pedido, { forzar: true }); hechos++; }
    catch (e) { console.error('tasador', e.message); if (e instanceof BloqueoML) break; }
  }
  return hechos;
}

export async function leerTasaciones(env, conversacion) {
  const cfg = await leerConfigTasador(env);
  const consulta = conversacion
    ? env.DB.prepare('SELECT * FROM tasaciones WHERE conversacion = ?1 ORDER BY creada DESC LIMIT 10').bind(conversacion)
    : env.DB.prepare('SELECT * FROM tasaciones ORDER BY creada DESC LIMIT 30');
  const { results } = await consulta.all();
  return results.map((f) => ({
    id: f.id, conversacion: f.conversacion, estado: f.estado, creada: f.creada, monto: f.monto, auto_interes: f.auto_interes,
    pedido: JSON.parse(f.pedido || '{}'),
    resultado: f.resultado ? conOferta(JSON.parse(f.resultado), cfg) : null,
  }));
}

/* La cotización para el cliente. `auto` = el auto que quiere (de la web), si se sabe: ahí al cliente
   se le dice solo la diferencia (positiva: la pone él; negativa: se la damos nosotros), no en cuánto
   tomamos su auto. Se redondea a 100 a favor nuestro (hacia arriba si paga, hacia abajo si cobra). */
// `referencias`: cuántas publicaciones se usaron para fijar el precio; con menos de 3 el número es más orientativo
export function calcularCotizacion(p, oferta, auto, dolar, enPesos = false, referencias = null) {
  const precioUSD = !auto?.precio ? 0 : auto.moneda === 'USD' ? auto.precio : auto.precio / (dolar?.venta || Infinity);
  const conAuto = precioUSD > 0;
  return {
    oferta, conAuto, directa: p.compra === 'directa',
    diferencia: conAuto ? Math.ceil((precioUSD - oferta) / 100) * 100 || 0 : 0,
    suAuto: [p.marca, p.modelo, p.anio].filter(Boolean).join(' '),
    elQueQuiere: auto ? `${auto.modelo} ${auto.anio}` : '',
    enPesos: Boolean(enPesos && dolar?.venta), dolar,
    kmAlto: Number(p.km) > KM_SEGURO_PERMUTA,
    pocasReferencias: referencias !== null && referencias < 3,
  };
}

// El número que se le muestra al cliente: en dólares, o en pesos (al dólar del día, redondeado a $100.000) si pidió pesos
export const montoMostrado = (c, usd) => (c.enPesos ? Math.round((Math.abs(usd) * c.dolar.venta) / 100000) * 100000 : Math.abs(usd));

// La cotización en una frase: con el auto que quiere, solo la diferencia; si no, lo que le damos por el suyo
export function fraseDeCotizacion(c) {
  const usd = (n) => `${c.enPesos ? '$' : 'USD '}${montoMostrado(c, n).toLocaleString('es-AR')}`;
  if (!c.conAuto) return c.directa ? `te lo compramos en aprox. ${usd(c.oferta)}` : `te lo tomamos en aprox. ${usd(c.oferta)}`;
  if (c.diferencia > 0) return `para quedarte con el ${c.elQueQuiere} entregando tu ${c.suAuto}, tendrías que poner unos ${usd(c.diferencia)} de diferencia`;
  if (c.diferencia < 0) return `si entregás tu ${c.suAuto} por el ${c.elQueQuiere}, te quedarían a favor unos ${usd(c.diferencia)} que te damos nosotros`;
  return `tu ${c.suAuto} por el ${c.elQueQuiere} quedaría mano a mano, sin diferencia`;
}

// Texto fijo, por si Claude no está disponible
export function mensajesDeCotizacion(p, oferta, auto, dolar, enPesos = false, referencias = null) {
  const c = calcularCotizacion(p, oferta, auto, dolar, enPesos, referencias);
  const frase = fraseDeCotizacion(c);
  return [
    `Ya tengo la cotización de tu ${p.modelo} ${p.anio}`,
    frase[0].toUpperCase() + frase.slice(1),
    c.pocasReferencias ? 'Te aviso que de este modelo encontré muy pocas referencias publicadas, así que el número es orientativo: nuestro tasador lo define bien viendo el auto en persona, y puede moverse un poco para arriba o para abajo'
      : c.kmAlto ? 'Es un valor aproximado: por el kilometraje lo termina de definir nuestro tasador viendo el auto en persona' : 'Es un valor aproximado, lo confirma nuestro tasador viendo tu auto en la concesionaria',
    c.directa ? 'Te gustaría traerlo al salón así lo ve nuestro tasador?' : 'Te gustaría venir a verlo y traer el tuyo así lo ve nuestro tasador?',
  ];
}

// Preguntas fijas por el dato que falta, por si la IA no está disponible (si está, la escribe ella)
export const preguntaDeKm = (p) => `Y más o menos cuántos km tiene tu ${p.modelo}?`;
export const preguntaDeCaja = (p) => `Una consulta así te lo cotizo bien: tu ${p.modelo} es manual o automático?`;

export function preguntaDeVersion(p, versiones, noAparece) {
  const v = versiones.filter(Boolean);
  const opciones = v.length > 1 ? `${v.slice(0, -1).join(', ')} o ${v[v.length - 1]}` : v[0] || '';
  if (noAparece && opciones) return `No encuentro el ${p.modelo} ${p.version} ${p.anio}, puede ser que sea ${opciones}? Fijate en la cédula o en la tapa del baúl`;
  return `Tu ${p.modelo} qué versión es?${opciones ? ` ${opciones}?` : ''}`;
}
