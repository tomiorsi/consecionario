/* RETARGETING POR WHATSAPP (Maxi, 24/11).
   ══════════════════════════════════════════════════════════════════

   Lee las charlas de quienes consultaron por un auto, las entiende con
   Claude, arma listas y —sólo cuando Maxi aprueba cada lista— le manda a
   cada uno UNA plantilla con el video del auto y tres botones.

   CADA AUTO ES UNA CAMPAÑA. La primera es la del BMW 325i Coupé 2011.

   LO QUE DECIDE NO ES LA IA. La IA lee y propone; las reglas fijas de
   `retargeting-reglas.js` deciden, y un "dudoso" no llega a una lista de
   envío por ningún camino. Ante la duda, no se escribe.

   SIMULACRO DE FÁBRICA. Una campaña nace en simulacro: se ve todo, no
   sale nada. Para mandar hacen falta tres cosas a la vez: que Maxi apague
   el simulacro, que apruebe la lista y que la plantilla esté aprobada por
   Meta. Lo que falla no se reintenta solo.

   DATOS: sólo Cloudflare (D1, R2) y Anthropic, como en el resto del bot.
   Todo lo que se guarda de una persona cuelga de su conversación con
   ON DELETE CASCADE: si pide que la borremos, se va todo junto. */

import Anthropic from '@anthropic-ai/sdk';
import * as R from './retargeting-reglas.js';

const DIA = 24 * 3600 * 1000;
const MODELO = 'claude-sonnet-5-5';

/* ── LAS TABLAS ─────────────────────────────────────────────────────
   Se crean solas la primera vez (IF NOT EXISTS): no hace falta correr
   nada a mano. El mismo SQL está en esquema/013-retargeting.sql. */
let tablasListas = false;
export async function asegurarTablas(env) {
  if (tablasListas) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS rt_campanas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auto_id INTEGER, titulo TEXT NOT NULL, prefijo TEXT NOT NULL,
      precio_texto TEXT NOT NULL, destacado TEXT NOT NULL, ficha TEXT,
      similares TEXT, video_clave TEXT,
      estado TEXT NOT NULL DEFAULT 'simulacro',
      simulacro INTEGER NOT NULL DEFAULT 1,
      tope_diario INTEGER NOT NULL DEFAULT 50,
      progreso TEXT,
      creado TEXT NOT NULL DEFAULT (datetime('now')), terminada TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS rt_listas (
      campana_id INTEGER NOT NULL REFERENCES rt_campanas(id) ON DELETE CASCADE,
      lista TEXT NOT NULL, aprobada INTEGER NOT NULL DEFAULT 0, aprobada_en TEXT,
      PRIMARY KEY (campana_id, lista))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS rt_candidatos (
      campana_id INTEGER NOT NULL REFERENCES rt_campanas(id) ON DELETE CASCADE,
      conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
      hecho INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (campana_id, conversacion_id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS rt_personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campana_id INTEGER NOT NULL REFERENCES rt_campanas(id) ON DELETE CASCADE,
      conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
      lista TEXT NOT NULL, lista_original TEXT, motivo TEXT, evidencia TEXT, linea TEXT,
      tono TEXT, confianza REAL, nombre_saludo TEXT, auto_ofrecido TEXT,
      auto_completo INTEGER NOT NULL DEFAULT 0, charla_avanzada INTEGER NOT NULL DEFAULT 0,
      ultima_charla TEXT, sacado INTEGER NOT NULL DEFAULT 0, editado INTEGER NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'pendiente', wa_id TEXT, enviado_en TEXT, actualizado TEXT,
      respuesta TEXT, baja_contestada INTEGER NOT NULL DEFAULT 0, error TEXT,
      UNIQUE (campana_id, conversacion_id))`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS rt_personas_wa ON rt_personas (wa_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS rt_personas_conv ON rt_personas (conversacion_id)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS rt_no_contactar (
      conversacion_id INTEGER PRIMARY KEY REFERENCES conversaciones(id) ON DELETE CASCADE,
      motivo TEXT, creado TEXT NOT NULL DEFAULT (datetime('now')))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS rt_marketing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
      campana_id INTEGER, plantilla TEXT, creado TEXT NOT NULL DEFAULT (datetime('now')))`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS rt_marketing_conv ON rt_marketing (conversacion_id, creado)'),
  ]);
  tablasListas = true;
}

/* ── LA CAMPAÑA DE UN AUTO ──────────────────────────────────────────── */

const ESTADOS = {
  simulacro: 'Simulacro',
  esperando_meta: 'Esperando aprobación de Meta',
  enviando: 'Enviando',
  terminada: 'Terminada',
};

/* Los datos fijos de la campaña salen del auto del stock. El "destacado"
   es la frase de la plantilla del resto; para el 325i es la de Maxi. */
async function armarCampania(env, autoId, h) {
  const a = await env.DB.prepare('SELECT * FROM autos WHERE id = ?').bind(autoId).first();
  if (!a) throw new Error('Ese auto no está en el stock');
  const titulo = [a.marca, a.modelo, a.anio].filter(Boolean).join(' ');
  const base = String(a.modelo ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
  const prefijo = `retarget_${base || 'auto'}`.slice(0, 40);
  const km = a.km ? `${Number(a.km).toLocaleString('es-AR')} km` : null;
  const destacado = a.id === 16
    ? 'Seis cilindros, 68.000 km, original de fábrica y con historial de services.'
    : [a.motor, km].filter(Boolean).join(', ') + '.';
  /* LOS PARECIDOS: mismo modelo base, otro auto (para el 325i, el sedán
     2010 y el Coupé 2007). Sirven para no confundirlos y para la lista 4. */
  const { results: otros } = await env.DB.prepare('SELECT id, marca, modelo, anio, color, km, estado FROM autos WHERE id != ?')
    .bind(a.id).all();
  const similares = (otros ?? []).filter((o) => base && String(o.modelo ?? '').toLowerCase().includes(base))
    .map((o) => ({ id: o.id, titulo: [o.marca, o.modelo, o.anio].filter(Boolean).join(' '), color: o.color, km: o.km, estado: o.estado }));
  return {
    auto_id: a.id, titulo, prefijo,
    precio_texto: `${a.moneda || 'USD'} ${Number(a.precio).toLocaleString('es-AR')}`,
    destacado, ficha: `${h.SITIO}${h.enlaceDe(a)}`,
    similares: JSON.stringify(similares),
    auto: { color: a.color, km: a.km, motor: a.motor, transmision: a.transmision },
  };
}

/* LOS CANDIDATOS: toda charla que nombra el modelo (o vino de un anuncio
   que lo nombra). Es una lista ancha a propósito: después la IA lee cada
   una entera y descarta las que eran por otro auto. Una sola consulta,
   acotada a las conversaciones vivas. */
async function buscarCandidatos(env, camp) {
  const base = camp.prefijo.split('_')[1];
  const claves = [base];
  if (base === '325i') claves.push('325', 'e92', 'e 92');
  const cond = claves.map(() => 'm.texto LIKE ?').join(' OR ');
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT m.conversacion_id id FROM mensajes m WHERE ${cond}
     UNION SELECT id FROM conversaciones WHERE anuncio LIKE ?`
  ).bind(...claves.map((c) => `%${c}%`), `%${claves[claves.length > 1 ? 1 : 0]}%`).all();
  const ids = (results ?? []).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 50) {
    await env.DB.batch(ids.slice(i, i + 50).map((id) => env.DB.prepare(
      'INSERT OR IGNORE INTO rt_candidatos (campana_id, conversacion_id) VALUES (?, ?)').bind(camp.id, id)));
  }
  return ids.length;
}

/* ── LEER UNA CHARLA CON CLAUDE ─────────────────────────────────────── */

const FORMA = {
  type: 'object', additionalProperties: false,
  required: ['es_este_auto', 'consulto_similar', 'decision', 'motivo_no_escribir', 'lista', 'motivo', 'evidencia',
    'linea', 'tono', 'confianza', 'nombre', 'charla_avanzada', 'auto_ofrecido', 'auto_ofrecido_completo'],
  properties: {
    es_este_auto: { type: 'string', enum: ['si', 'no', 'no_seguro'] },
    consulto_similar: { type: 'boolean' },
    decision: { type: 'string', enum: ['escribir', 'no_escribir', 'dudoso'] },
    motivo_no_escribir: { type: 'string', enum: ['', 'pidio_no_contacto', 'desinteres', 'reclamo', 'ya_compro',
      'proveedor_colega_equipo', 'solo_vende', 'spam_incomprensible', 'otro'] },
    lista: { type: 'string', enum: ['precio', 'charla_caida', 'resto'] },
    motivo: { type: 'string' },
    evidencia: { type: 'string' },
    linea: { type: 'string' },
    tono: { type: 'string', enum: ['cordial', 'neutro', 'frio', 'tenso'] },
    confianza: { type: 'number' },
    nombre: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    charla_avanzada: { type: 'boolean' },
    auto_ofrecido: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    auto_ofrecido_completo: { type: 'boolean' },
  },
};

function instrucciones(camp) {
  const sim = JSON.parse(camp.similares || '[]');
  return `Sos el analista de Manna Selected, una concesionaria de autos premium usados de Barracas (CABA).
Vas a leer UNA charla completa entre un cliente y Manna (el bot "Claudio" o una persona del equipo) y decidir si a ese cliente le podemos escribir para avisarle que bajó de precio un auto.

EL AUTO DE ESTA CAMPAÑA: ${camp.titulo} (${camp.color ?? ''} ${camp.km ? `${camp.km} km` : ''}). Precio nuevo: ${camp.precio_texto}. Ficha: ${camp.ficha}.
${sim.length ? `OJO, NO LO CONFUNDAS CON ESTOS OTROS (ya vendidos o distintos):\n${sim.map((s) => `- ${s.titulo}${s.color ? `, ${s.color}` : ''}${s.km ? `, ${s.km} km` : ''}${s.estado === 'vendido' ? ' (vendido)' : ''}`).join('\n')}` : ''}
Pistas: el 325i Coupé 2011 es BLANCO, 68.000 km, automático, coupé de 2 puertas. Si el cliente habla de un sedán, de 4 puertas, de un auto negro o gris, de 2007 o 2010, o de caja manual, es OTRO auto.

QUÉ DEVOLVÉS (en JSON, todo en español simple):
- es_este_auto: "si" si consultó por ESTE auto; "no" si la charla es por otro auto o por otra cosa; "no_seguro" si no se puede saber.
- consulto_similar: true si consultó por alguno de los otros autos de la lista de arriba.
- decision: "escribir", "no_escribir" o "dudoso". Ante la duda, "dudoso". Nunca inventes.
  "no_escribir" si: pidió que no lo contacten o mostró desinterés claro; tuvo un reclamo o terminó mal; ya compró otro auto (con nosotros o en otro lado); es proveedor, colega, otra agencia, conocido o del equipo; solo vino a VENDER o dejar en consignación su auto sin interés en comprar; la charla es spam o no se entiende.
  "dudoso" si: la charla es muy corta o ambigua, o no estás seguro de algo importante.
- motivo_no_escribir: el código del motivo si decision es "no_escribir"; si no, "".
- lista (si decision es "escribir"):
  "precio": no avanzó POR EL PRECIO (pidió rebaja, dijo que se le iba de presupuesto, ofreció menos, "es mucho").
  "charla_caida": la charla se desarrolló (preguntó detalles, pidió fotos o videos, habló de permuta o de una visita) y se cortó sin un motivo claro, no por precio.
  "resto": consultó por este auto y no entra en las otras dos (por ejemplo, un solo mensaje del anuncio y nada más).
- motivo: una frase corta y simple para Maxi, el dueño, que explique por qué.
- evidencia: una cita CORTA y textual de lo que escribió el CLIENTE (máximo 120 caracteres) que respalde el motivo.
- linea: una frase de MENOS DE 60 caracteres que empiece con "y " y complete la frase "Quedamos hablando del ${camp.titulo} ___". Sacada de lo que realmente se habló. Ejemplos: "y el número no te cerraba", "y de coordinar una visita", "y de tu auto como parte de pago". NUNCA montos, números, nombres, teléfonos ni nada sensible. Si no hay nada concreto, "".
- tono: cómo era la relación: "cordial", "neutro", "frio" o "tenso".
- confianza: de 0 a 1, qué tan seguro estás de TODO lo anterior.
- nombre: el nombre de pila del cliente para saludarlo, SOLO si es seguro (lo dijo él, o el nombre de perfil es claramente un nombre real de persona). Nunca un usuario, apodo, emoji o nombre de empresa. Si no es seguro, null.
- charla_avanzada: true si la charla había avanzado (pidió fotos o datos, habló de permuta, de verlo, de financiación, de una visita).
- auto_ofrecido: si en la charla el cliente ofreció un auto para entregar o en permuta, describilo con lo que él dijo (marca, modelo, versión, año, km) y si mandó fotos, en una línea. Si no ofreció ninguno, null.
- auto_ofrecido_completo: true si de ese auto ya sabemos marca, modelo, año y km.

Leé la charla ENTERA y con mucho cuidado. Interpretá bien: es muy importante no equivocarse.`;
}

function transcribir(chat, mensajes) {
  const lineas = [];
  for (const m of mensajes) {
    const quien = m.direccion === 'entrante' ? 'CLIENTE' : (m.autor === 'persona' ? 'MANNA (persona)' : 'MANNA (bot)');
    let t = String(m.texto ?? '').replace(/\s+/g, ' ').trim();
    if (!t) t = m.tipo === 'imagen' ? '[mandó una foto]' : m.tipo === 'audio' ? '[audio]' : m.tipo === 'video' ? '[video]' : `[${m.tipo}]`;
    else if (m.tipo === 'imagen') t = `[foto] ${t}`;
    else if (m.tipo === 'audio') t = `[audio, transcripto] ${t}`;
    lineas.push(`[${String(m.creado).slice(0, 16)}] ${quien}: ${t.slice(0, 700)}`);
  }
  let anuncio = '';
  try { const a = chat.anuncio ? JSON.parse(chat.anuncio) : null; if (a) anuncio = `Vino de un anuncio: ${[a.titulo, a.texto].filter(Boolean).join(' — ').slice(0, 300)}\n`; } catch { /* viejo */ }
  /* Las charlas muy largas: el principio y el final, que es donde está
     de qué auto se habló y cómo terminó. */
  const cuerpo = lineas.length > 260 ? [...lineas.slice(0, 60), '[... charla larga, se saltean mensajes del medio ...]', ...lineas.slice(-180)] : lineas;
  return `Canal: ${chat.canal}. Nombre de perfil: ${chat.nombre ?? '(sin nombre)'}.\n${anuncio}\nCHARLA:\n${cuerpo.join('\n')}`;
}

async function leerConClaude(env, camp, chat, mensajes) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model: MODELO,
    max_tokens: 4000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: FORMA } },
    system: instrucciones(camp),
    messages: [{ role: 'user', content: transcribir(chat, mensajes) }],
  });
  const txt = (r.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(txt);
}

/* ¿Le llegó otro mensaje de marketing en los últimos 30 días? Cuenta lo
   de esta herramienta y las plantillas de marketing que el bot ya manda
   (seguimientos, "bajó de precio"), reconocidas por su texto fijo. */
async function marketingReciente(env, convId, h) {
  const r = await env.DB.prepare(
    `SELECT 1 FROM rt_marketing WHERE conversacion_id = ? AND creado > datetime('now','-30 days') LIMIT 1`).bind(convId).first();
  if (r) return true;
  const frags = h.fragmentosMarketing;
  if (!frags.length) return false;
  const { results } = await env.DB.prepare(
    `SELECT texto FROM mensajes WHERE conversacion_id = ? AND direccion = 'saliente' AND creado > datetime('now','-30 days')`
  ).bind(convId).all();
  return (results ?? []).some((m) => frags.some((f) => String(m.texto ?? '').includes(f)));
}

async function clasificarUno(env, camp, convId, h) {
  const chat = await env.DB.prepare('SELECT * FROM conversaciones WHERE id = ?').bind(convId).first();
  if (!chat) return;
  const { results: mensajes } = await env.DB.prepare(
    `SELECT direccion, autor, tipo, texto, creado FROM mensajes WHERE conversacion_id = ? ORDER BY creado, id`
  ).bind(convId).all();
  const esEquipo = await h.esDelEquipo(chat);
  const baja = R.bajaEnCharla(mensajes);
  const noContactar = Boolean(await env.DB.prepare('SELECT 1 FROM rt_no_contactar WHERE conversacion_id = ?').bind(convId).first());
  const mkt = await marketingReciente(env, convId, h);
  if (baja && !noContactar) {
    await env.DB.prepare('INSERT OR IGNORE INTO rt_no_contactar (conversacion_id, motivo) VALUES (?, ?)')
      .bind(convId, `Filtro de bajas: «${baja.frase}»`).run();
  }
  /* A los que ya están bloqueados no se los lee con la IA: no hace falta
     gastar en decidir algo que ya está decidido. */
  let ia = null;
  if (!esEquipo && !baja && !noContactar && (mensajes ?? []).some((m) => m.direccion === 'entrante')) {
    try { ia = await leerConClaude(env, camp, chat, mensajes ?? []); }
    catch (e) { console.error('Retargeting, no se pudo leer la charla:', e?.message ?? e); }
  }
  const d = R.decidirLista({ canal: chat.canal, ultimo: chat.ultimo, baja, noContactar, esEquipo, marketingReciente: mkt, ia });
  const lista = d ? d.lista : 'fuera';
  await env.DB.prepare(
    `INSERT INTO rt_personas (campana_id, conversacion_id, lista, lista_original, motivo, evidencia, linea, tono, confianza,
       nombre_saludo, auto_ofrecido, auto_completo, charla_avanzada, ultima_charla, actualizado)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
     ON CONFLICT (campana_id, conversacion_id) DO UPDATE SET lista = excluded.lista, lista_original = excluded.lista_original,
       motivo = excluded.motivo, evidencia = excluded.evidencia, linea = excluded.linea, tono = excluded.tono,
       confianza = excluded.confianza, nombre_saludo = excluded.nombre_saludo, auto_ofrecido = excluded.auto_ofrecido,
       auto_completo = excluded.auto_completo, charla_avanzada = excluded.charla_avanzada,
       ultima_charla = excluded.ultima_charla, actualizado = excluded.actualizado
     WHERE rt_personas.editado = 0 AND rt_personas.estado = 'pendiente'`
  ).bind(camp.id, convId, lista, lista, d?.motivo ?? ia?.motivo ?? 'No consultó por este auto.',
    baja ? baja.texto : String(ia?.evidencia ?? '').slice(0, 160), R.lineaValida(ia?.linea) ? ia.linea.trim() : '',
    ia?.tono ?? null, ia?.confianza ?? null, R.nombreSeguro(ia?.nombre),
    ia?.auto_ofrecido ?? null, ia?.auto_ofrecido_completo ? 1 : 0, ia?.charla_avanzada ? 1 : 0, chat.ultimo).run();
}

/* De a poco: cada llamada lee unas pocas charlas. El panel la repite
   hasta terminar y muestra el avance. */
export async function clasificarTanda(env, campId, h, cuantas = 4) {
  const camp = await leerCampania(env, campId);
  const { results } = await env.DB.prepare(
    'SELECT conversacion_id FROM rt_candidatos WHERE campana_id = ? AND hecho = 0 LIMIT ?').bind(campId, cuantas).all();
  await Promise.all((results ?? []).map(async ({ conversacion_id: id }) => {
    try { await clasificarUno(env, camp, id, h); }
    catch (e) { console.error('Retargeting, falló una charla:', e?.message ?? e); }
    await env.DB.prepare('UPDATE rt_candidatos SET hecho = 1 WHERE campana_id = ? AND conversacion_id = ?').bind(campId, id).run();
  }));
  const p = await env.DB.prepare(
    'SELECT COUNT(*) total, SUM(hecho) hechos FROM rt_candidatos WHERE campana_id = ?').bind(campId).first();
  return { total: p?.total ?? 0, hechos: p?.hechos ?? 0 };
}

async function leerCampania(env, id) {
  const c = await env.DB.prepare('SELECT * FROM rt_campanas WHERE id = ?').bind(id).first();
  if (!c) throw new Error('Esa campaña no está');
  const a = c.auto_id ? await env.DB.prepare('SELECT color, km, estado FROM autos WHERE id = ?').bind(c.auto_id).first() : null;
  return { ...c, color: a?.color ?? null, km: a?.km ?? null };
}

/* ── LO QUE VE EL PANEL ─────────────────────────────────────────────── */

async function resumenDe(env, c) {
  const { results } = await env.DB.prepare(
    `SELECT lista, sacado, estado, respuesta FROM rt_personas WHERE campana_id = ?`).bind(c.id).all();
  const r = { listas: {}, enviados: 0, respondidos: 0, visitas: 0, bajas: 0, fallidos: 0 };
  for (const k of Object.keys(R.LISTAS)) r.listas[k] = 0;
  for (const p of results ?? []) {
    if (p.lista === 'fuera') continue;
    if (!p.sacado) r.listas[p.lista] = (r.listas[p.lista] ?? 0) + 1;
    if (['enviado', 'entregado', 'leido', 'respondido'].includes(p.estado)) r.enviados++;
    if (p.estado === 'respondido') r.respondidos++;
    if (p.estado === 'fallido') r.fallidos++;
    if (p.respuesta === 'visita') r.visitas++;
    if (p.respuesta === 'baja') r.bajas++;
  }
  const prog = await env.DB.prepare('SELECT COUNT(*) total, SUM(hecho) hechos FROM rt_candidatos WHERE campana_id = ?').bind(c.id).first();
  r.clasificacion = { total: prog?.total ?? 0, hechos: prog?.hechos ?? 0 };
  return r;
}

async function detalleDe(env, id, h) {
  const c = await leerCampania(env, id);
  const { results: personas } = await env.DB.prepare(
    `SELECT p.*, cv.nombre perfil, cv.canal FROM rt_personas p JOIN conversaciones cv ON cv.id = p.conversacion_id
      WHERE p.campana_id = ? AND p.lista != 'fuera' ORDER BY p.ultima_charla DESC`).bind(id).all();
  const { results: listas } = await env.DB.prepare('SELECT lista, aprobada, aprobada_en FROM rt_listas WHERE campana_id = ?').bind(id).all();
  const fuera = await env.DB.prepare(`SELECT COUNT(*) n FROM rt_personas WHERE campana_id = ? AND lista = 'fuera'`).bind(id).first();
  return {
    campana: { ...c, estado_texto: ESTADOS[c.estado] ?? c.estado, video: c.video_clave ? `/fotos/${c.video_clave}` : null },
    resumen: await resumenDe(env, c),
    fuera: fuera?.n ?? 0,
    listas: Object.fromEntries((listas ?? []).map((l) => [l.lista, l])),
    definicion_listas: R.LISTAS,
    plantillas: R.plantillasDeCampania(c),
    botones: R.BOTONES,
    /* El teléfono no viaja al panel: con el nombre y la charla alcanza
       para reconocerlo, y para abrirla está el id de la conversación. */
    personas: (personas ?? []).map((p) => ({
      id: p.id, conversacion: p.conversacion_id, nombre: p.nombre_saludo || p.perfil || 'Sin nombre',
      perfil: p.perfil, canal: p.canal, lista: p.lista, lista_original: p.lista_original, motivo: p.motivo,
      evidencia: p.evidencia, linea: p.linea, tono: p.tono, confianza: p.confianza, ultima_charla: p.ultima_charla,
      auto_ofrecido: p.auto_ofrecido, charla_avanzada: Boolean(p.charla_avanzada), sacado: Boolean(p.sacado),
      editado: Boolean(p.editado), estado: p.estado, enviado_en: p.enviado_en, respuesta: p.respuesta, error: p.error,
      mensaje: R.mensajePara(c, p),
    })),
  };
}

/* ── MANDAR ─────────────────────────────────────────────────────────── */

function cuerpoDePlantilla(c, persona, h) {
  const m = R.mensajePara(c, persona);
  if (!m.plantilla) return null;
  return {
    m,
    template: {
      name: m.plantilla,
      language: { code: 'es_AR' },
      components: [
        { type: 'header', parameters: [{ type: 'video', video: { link: `${h.SITIO}/fotos/${c.video_clave}` } }] },
        ...(m.valores.length ? [{ type: 'body', parameters: m.valores.map((t) => ({ type: 'text', text: String(t) })) }] : []),
        ...R.BOTONES.map((b, i) => ({ type: 'button', sub_type: 'quick_reply', index: String(i),
          parameters: [{ type: 'payload', payload: R.payloadDe(c.id, b.clave) }] })),
      ],
    },
  };
}

async function estadoDePlantillas(env, c, h) {
  const r = await fetch(`${h.GRAPH}/${env.WHATSAPP_CUENTA_ID}/message_templates?fields=name,status,rejected_reason&limit=200`,
    { headers: { authorization: `Bearer ${env.WHATSAPP_TOKEN}` } });
  const d = await r.json().catch(() => ({}));
  const nuestras = new Set(R.plantillasDeCampania(c).map((p) => p.nombre));
  return Object.fromEntries((d?.data ?? []).filter((t) => nuestras.has(t.name)).map((t) => [t.name, { estado: t.status, motivo: t.rejected_reason || null }]));
}

/* LA PRUEBA, SÓLO A MAXI. Si la plantilla ya está aprobada sale la
   plantilla tal cual; si no, un mensaje con el mismo video, el mismo
   texto y los mismos botones (eso sólo llega si Maxi le escribió al
   número del negocio en las últimas 24 horas: es la regla de WhatsApp). */
async function mandarPrueba(env, personaId, h) {
  const p = await env.DB.prepare('SELECT * FROM rt_personas WHERE id = ?').bind(personaId).first();
  if (!p) throw new Error('Esa persona no está');
  const c = await leerCampania(env, p.campana_id);
  if (!c.video_clave) throw new Error('Falta subir el video de la campaña');
  const a = h.soloDigitos(env.SUPERVISOR_WHATSAPP);
  if (!a) throw new Error('Falta el WhatsApp de Maxi');
  const armado = cuerpoDePlantilla(c, p, h);
  if (!armado) throw new Error('Esta persona no tiene mensaje (está en una lista que no envía)');
  const aprobadas = await estadoDePlantillas(env, c, h).catch(() => ({}));
  if (aprobadas[armado.m.plantilla]?.estado === 'APPROVED') {
    await h.graphMandar(env.WHATSAPP_TOKEN, 'WHATSAPP_TOKEN', `/${env.WHATSAPP_PHONE_ID}/messages`,
      { messaging_product: 'whatsapp', to: a, type: 'template', template: armado.template });
    return { como: 'plantilla' };
  }
  await h.graphMandar(env.WHATSAPP_TOKEN, 'WHATSAPP_TOKEN', `/${env.WHATSAPP_PHONE_ID}/messages`, {
    messaging_product: 'whatsapp', to: a, type: 'interactive',
    interactive: {
      type: 'button',
      header: { type: 'video', video: { link: `${h.SITIO}/fotos/${c.video_clave}` } },
      body: { text: armado.m.texto },
      footer: { text: 'Prueba (así le llegaría)' },
      action: { buttons: R.BOTONES.map((b) => ({ type: 'reply', reply: { id: `prueba:${b.clave}`, title: R.BOTONES_INTERACTIVOS[b.clave] } })) },
    },
  });
  return { como: 'interactivo' };
}

/* LA TANDA DE ENVÍO, desde el reloj de cada media hora. */
export async function enviarTanda(env, h, { hasta = Date.now() + 11 * 60 * 1000 } = {}) {
  await asegurarTablas(env);
  if (!R.enHorarioDeEnvio()) return;
  const { results: camps } = await env.DB.prepare(
    `SELECT * FROM rt_campanas WHERE estado = 'enviando' AND simulacro = 0 AND video_clave IS NOT NULL`).all();
  for (const c of camps ?? []) {
    const aprobadas = await estadoDePlantillas(env, c, h).catch(() => ({}));
    const hoy = await env.DB.prepare(
      `SELECT COUNT(*) n FROM rt_personas WHERE enviado_en > datetime('now','-3 hours','start of day','+3 hours')`).first();
    let quedan = Math.max(0, (c.tope_diario ?? 50) - (hoy?.n ?? 0));
    while (quedan > 0 && Date.now() < hasta) {
      const p = await env.DB.prepare(
        `SELECT p.* FROM rt_personas p JOIN rt_listas l ON l.campana_id = p.campana_id AND l.lista = p.lista AND l.aprobada = 1
          WHERE p.campana_id = ? AND p.estado = 'pendiente' AND p.sacado = 0 AND p.lista IN ('precio','charla_caida','resto')
          ORDER BY CASE p.lista WHEN 'precio' THEN 1 WHEN 'charla_caida' THEN 2 ELSE 3 END, p.id LIMIT 1`).bind(c.id).first();
      if (!p) break;
      const chat = await env.DB.prepare('SELECT * FROM conversaciones WHERE id = ?').bind(p.conversacion_id).first();
      /* SE REVISA OTRA VEZ ANTES DE MANDAR: pudo haber pedido la baja o
         recibido otra cosa desde que se armó la lista. */
      const bloqueado = !chat || chat.canal !== 'whatsapp'
        || await env.DB.prepare('SELECT 1 FROM rt_no_contactar WHERE conversacion_id = ?').bind(p.conversacion_id).first()
        || await marketingReciente(env, p.conversacion_id, h)
        || await env.DB.prepare(`SELECT 1 FROM rt_personas WHERE conversacion_id = ? AND id != ? AND enviado_en > datetime('now','-30 days')`)
          .bind(p.conversacion_id, p.id).first();
      if (bloqueado) {
        await env.DB.prepare(`UPDATE rt_personas SET estado = 'salteado', error = 'Bloqueado al momento de enviar', actualizado = datetime('now') WHERE id = ?`).bind(p.id).run();
        continue;
      }
      const armado = cuerpoDePlantilla(c, p, h);
      if (!armado || aprobadas[armado.m.plantilla]?.estado !== 'APPROVED') {
        await env.DB.prepare(`UPDATE rt_personas SET estado = 'fallido', error = ?, actualizado = datetime('now') WHERE id = ?`)
          .bind('La plantilla no está aprobada por Meta', p.id).run();
        continue;
      }
      try {
        const r = await h.graphMandar(env.WHATSAPP_TOKEN, 'WHATSAPP_TOKEN', `/${env.WHATSAPP_PHONE_ID}/messages`,
          { messaging_product: 'whatsapp', to: chat.externo_id, type: 'template', template: armado.template });
        const wa = r?.messages?.[0]?.id ?? null;
        await env.DB.batch([
          env.DB.prepare(`UPDATE rt_personas SET estado = 'enviado', wa_id = ?, enviado_en = datetime('now'), actualizado = datetime('now'), error = NULL WHERE id = ?`).bind(wa, p.id),
          env.DB.prepare('INSERT INTO rt_marketing (conversacion_id, campana_id, plantilla) VALUES (?,?,?)').bind(p.conversacion_id, c.id, armado.m.plantilla),
          /* Queda en la charla, igual a lo que le llegó: el bot y el panel lo ven. */
          env.DB.prepare(`INSERT OR IGNORE INTO mensajes (conversacion_id, externo_id, direccion, autor, tipo, texto) VALUES (?,?, 'saliente', 'ia', 'video', ?)`)
            .bind(p.conversacion_id, wa, armado.m.texto),
        ]);
      } catch (e) {
        /* NO SE REINTENTA SOLO (Maxi): queda como fallido con el motivo. */
        await env.DB.prepare(`UPDATE rt_personas SET estado = 'fallido', error = ?, actualizado = datetime('now') WHERE id = ?`)
          .bind(String(e?.message ?? e).slice(0, 300), p.id).run();
      }
      quedan--;
      await new Promise((ok) => setTimeout(ok, R.pausaEntreEnvios()));
    }
  }
}

/* ── LO QUE VUELVE DE META ──────────────────────────────────────────── */

const ORDEN_ESTADO = { pendiente: 0, enviado: 1, entregado: 2, leido: 3, respondido: 4 };
const DE_META = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' };

export async function estadosDelAviso(env, aviso) {
  if (aviso?.object !== 'whatsapp_business_account') return;
  const estados = [];
  for (const e of aviso.entry ?? []) for (const c of e.changes ?? []) for (const s of c.value?.statuses ?? []) estados.push(s);
  if (!estados.length) return;
  await asegurarTablas(env);
  for (const s of estados) {
    const nuevo = DE_META[s.status];
    if (!nuevo || !s.id) continue;
    const p = await env.DB.prepare('SELECT id, estado FROM rt_personas WHERE wa_id = ?').bind(s.id).first();
    if (!p) continue;
    if (nuevo === 'fallido') {
      await env.DB.prepare(`UPDATE rt_personas SET estado = 'fallido', error = ?, actualizado = datetime('now') WHERE id = ?`)
        .bind(String(s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? 'Falló').slice(0, 300), p.id).run();
    } else if ((ORDEN_ESTADO[nuevo] ?? 0) > (ORDEN_ESTADO[p.estado] ?? 0)) {
      await env.DB.prepare(`UPDATE rt_personas SET estado = ?, actualizado = datetime('now') WHERE id = ?`).bind(nuevo, p.id).run();
    }
  }
}

/* CUANDO ESCRIBE ALGUIEN QUE RECIBIÓ UNA CAMPAÑA. Devuelve 'baja' si ya
   quedó contestado y el bot no tiene que decir nada más. */
export async function alEntrarMensaje(env, chat, mensajeId, h) {
  if (!chat || chat.canal !== 'whatsapp') return null;
  await asegurarTablas(env);
  const msj = await env.DB.prepare('SELECT texto FROM mensajes WHERE id = ?').bind(mensajeId).first();
  const texto = msj?.texto ?? '';
  const boton = R.botonPorTexto(texto);
  const baja = boton === 'baja' || Boolean(R.esBaja(texto));
  const p = await env.DB.prepare(
    `SELECT * FROM rt_personas WHERE conversacion_id = ? AND enviado_en IS NOT NULL AND enviado_en > datetime('now','-30 days')
      ORDER BY enviado_en DESC LIMIT 1`).bind(chat.id).first();
  if (baja) {
    await env.DB.prepare('INSERT OR IGNORE INTO rt_no_contactar (conversacion_id, motivo) VALUES (?, ?)')
      .bind(chat.id, boton === 'baja' ? 'Tocó "No me interesa"' : `Escribió: «${String(texto).slice(0, 80)}»`).run();
  }
  if (!p) return null;
  await env.DB.prepare(`UPDATE rt_personas SET estado = 'respondido', respuesta = COALESCE(?, respuesta, 'texto'), actualizado = datetime('now') WHERE id = ?`)
    .bind(baja ? 'baja' : boton, p.id).run();
  if (baja) {
    /* UNA SOLA VEZ, y nada más (Maxi). */
    if (!p.baja_contestada && !chat.humano) {
      await env.DB.prepare('UPDATE rt_personas SET baja_contestada = 1 WHERE id = ?').bind(p.id).run();
      await h.mandarYGuardar(env, chat, R.RESPUESTA_BAJA);
    }
    return 'baja';
  }
  return null;
}

/* LO QUE EL BOT TIENE QUE SABER SI LA CHARLA VIENE DE UNA CAMPAÑA. Se
   suma a sus instrucciones: qué se le mandó, qué botón tocó y qué hacer. */
export async function contextoParaElBot(env, conversacionId) {
  try { await asegurarTablas(env); } catch { return ''; }
  const p = await env.DB.prepare(
    `SELECT p.*, c.titulo, c.precio_texto, c.ficha FROM rt_personas p JOIN rt_campanas c ON c.id = p.campana_id
      WHERE p.conversacion_id = ? AND p.enviado_en IS NOT NULL AND p.enviado_en > datetime('now','-14 days')
      ORDER BY p.enviado_en DESC LIMIT 1`).bind(conversacionId).first();
  if (!p) return '';
  const ult = await env.DB.prepare(
    `SELECT texto FROM mensajes WHERE conversacion_id = ? AND direccion = 'entrante' ORDER BY creado DESC, id DESC LIMIT 1`).bind(conversacionId).first();
  const boton = R.botonPorTexto(ult?.texto);
  let que = '';
  if (boton === 'visita') {
    /* SIN PROPONER DÍAS NI HORARIOS (Maxi, 24/11): "no todos pueden en los
       horarios que nosotros le ofrezcamos y no quiero perder una visita por
       eso. Nos adaptamos". Se le pregunta a él qué le queda cómodo. */
    que = `Tocó "Coordinar una visita". ${p.charla_avanzada ? 'La charla anterior ya estaba avanzada: retomala desde ahí, sin repreguntar lo que ya se habló. ' : ''}Invitalo a venir a ver el ${p.titulo} y preguntale qué día y horario le queda cómodo a él. NO le propongas días ni horarios nuestros ni le des opciones cerradas: nos adaptamos a lo que pueda. El salón atiende con cita, así que una vez que diga cuándo, se coordina con él.`;
  } else if (boton === 'auto') {
    que = p.auto_ofrecido
      ? `Tocó "Tengo auto para entregar". En la charla anterior YA habló de un auto: ${p.auto_ofrecido}. NO le vuelvas a pedir los datos: preguntale si el auto que tiene para entregar es el mismo que hablaron antes (nombralo). ${p.auto_completo ? 'De ese auto ya tenemos marca, modelo, año y km.' : 'Si es el mismo, pedile solo lo que falte de marca, modelo, año y km.'} Si es otro, ahí sí pedile marca, modelo, año y km.`
      : `Tocó "Tengo auto para entregar". En la charla anterior NO se habló de ningún auto suyo: pedile marca, modelo, año y km (y fotos si puede). No digas "el que hablamos antes".`;
    que += ' NUNCA des un valor de tasación, una diferencia ni un número por su auto: eso lo da solo Maxi.';
  } else {
    que = 'Contestó al aviso con un mensaje propio: seguí la charla normal.';
  }
  return `\n\nCONTEXTO DE ESTA CHARLA (campaña de WhatsApp): hace poco le mandamos un aviso de que el ${p.titulo} bajó a ${p.precio_texto}, con el video y tres botones. ${que}`;
}

/* ── LAS RUTAS DEL PANEL ─────────────────────────────────────────────── */

export async function rutas(peticion, env, ruta, metodo, h) {
  await asegurarTablas(env);
  const cuerpo = async () => (metodo === 'POST' ? await peticion.json().catch(() => ({})) : {});

  if (ruta === '/api/admin/retargeting/campanas' && metodo === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM rt_campanas ORDER BY creado DESC').all();
    const camps = [];
    for (const c of results ?? []) {
      const foto = c.auto_id ? await env.DB.prepare('SELECT clave FROM fotos WHERE auto_id = ? ORDER BY orden LIMIT 1').bind(c.auto_id).first().catch(() => null) : null;
      camps.push({ ...c, estado_texto: ESTADOS[c.estado] ?? c.estado, foto: foto?.clave ? `/fotos/${foto.clave}-1600.webp` : null, resumen: await resumenDe(env, c) });
    }
    const { results: autos } = await env.DB.prepare(
      `SELECT id, marca, modelo, anio, precio, moneda FROM autos WHERE COALESCE(estado,'') != 'vendido' ORDER BY id DESC`).all();
    return h.json({ campanas: camps, autos: autos ?? [] });
  }

  if (ruta === '/api/admin/retargeting/campanas' && metodo === 'POST') {
    const { auto_id } = await cuerpo();
    const datos = await armarCampania(env, Number(auto_id), h);
    const ya = await env.DB.prepare(`SELECT id FROM rt_campanas WHERE auto_id = ? AND estado != 'terminada'`).bind(datos.auto_id).first();
    if (ya) return h.json({ id: ya.id, existia: true });
    const r = await env.DB.prepare(
      `INSERT INTO rt_campanas (auto_id, titulo, prefijo, precio_texto, destacado, ficha, similares) VALUES (?,?,?,?,?,?,?)`)
      .bind(datos.auto_id, datos.titulo, datos.prefijo, datos.precio_texto, datos.destacado, datos.ficha, datos.similares).run();
    const id = r.meta?.last_row_id;
    await env.DB.batch(Object.keys(R.LISTAS).map((l) => env.DB.prepare('INSERT OR IGNORE INTO rt_listas (campana_id, lista) VALUES (?,?)').bind(id, l)));
    const candidatos = await buscarCandidatos(env, { id, prefijo: datos.prefijo });
    return h.json({ id, candidatos });
  }

  let m = ruta.match(/^\/api\/admin\/retargeting\/campanas\/(\d+)$/);
  if (m && metodo === 'GET') return h.json(await detalleDe(env, Number(m[1]), h));

  m = ruta.match(/^\/api\/admin\/retargeting\/campanas\/(\d+)\/clasificar$/);
  if (m && metodo === 'POST') return h.json(await clasificarTanda(env, Number(m[1]), h));

  m = ruta.match(/^\/api\/admin\/retargeting\/campanas\/(\d+)\/listas\/(\w+)$/);
  if (m && metodo === 'POST') {
    const { aprobada } = await cuerpo();
    if (!R.LISTAS[m[2]]?.envia) return h.error('Esa lista no se envía');
    if (m[2] === 'otros' && aprobada) return h.error('La lista 4 está apagada: primero hay que escribir su mensaje');
    await env.DB.prepare(`INSERT INTO rt_listas (campana_id, lista, aprobada, aprobada_en) VALUES (?,?,?, CASE WHEN ? THEN datetime('now') END)
      ON CONFLICT (campana_id, lista) DO UPDATE SET aprobada = excluded.aprobada, aprobada_en = excluded.aprobada_en`)
      .bind(Number(m[1]), m[2], aprobada ? 1 : 0, aprobada ? 1 : 0).run();
    return h.json({ ok: true });
  }

  m = ruta.match(/^\/api\/admin\/retargeting\/campanas\/(\d+)\/ajustes$/);
  if (m && metodo === 'POST') {
    const b = await cuerpo();
    const sets = [], vals = [];
    if (b.tope_diario !== undefined) { sets.push('tope_diario = ?'); vals.push(Math.max(1, Math.min(500, Number(b.tope_diario) || 50))); }
    /* SALIR DEL SIMULACRO PIDE ESCRIBIR "ENVIAR". Es el único botón que
       hace que salgan mensajes de verdad. */
    if (b.simulacro === false) {
      if (b.confirmo !== 'ENVIAR') return h.error('Para enviar de verdad hay que escribir ENVIAR');
      sets.push("simulacro = 0, estado = 'enviando'");
    }
    if (b.simulacro === true) sets.push("simulacro = 1, estado = 'simulacro'");
    if (b.terminar) sets.push("estado = 'terminada', simulacro = 1, terminada = datetime('now')");
    if (!sets.length) return h.error('Nada para cambiar');
    await env.DB.prepare(`UPDATE rt_campanas SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, Number(m[1])).run();
    return h.json({ ok: true });
  }

  m = ruta.match(/^\/api\/admin\/retargeting\/campanas\/(\d+)\/video$/);
  if (m && metodo === 'POST') {
    const tipo = peticion.headers.get('content-type') || '';
    if (!/^video\/mp4/.test(tipo)) return h.error('El video tiene que ser MP4');
    const largo = Number(peticion.headers.get('content-length') || 0);
    if (largo > 16 * 1048576) return h.error('WhatsApp acepta hasta 16 MB: hace falta una copia más liviana');
    const clave = `retargeting/${m[1]}/${crypto.randomUUID()}.mp4`;
    await env.FOTOS.put(clave, peticion.body, { httpMetadata: { contentType: 'video/mp4' } });
    await env.DB.prepare('UPDATE rt_campanas SET video_clave = ? WHERE id = ?').bind(clave, Number(m[1])).run();
    return h.json({ ok: true, video: `/fotos/${clave}` });
  }

  m = ruta.match(/^\/api\/admin\/retargeting\/campanas\/(\d+)\/plantillas$/);
  if (m && metodo === 'GET') {
    const c = await leerCampania(env, Number(m[1]));
    return h.json({ plantillas: R.plantillasDeCampania(c), en_meta: await estadoDePlantillas(env, c, h).catch(() => ({})) });
  }

  m = ruta.match(/^\/api\/admin\/retargeting\/personas\/(\d+)$/);
  if (m && metodo === 'POST') {
    const b = await cuerpo();
    const p = await env.DB.prepare('SELECT * FROM rt_personas WHERE id = ?').bind(Number(m[1])).first();
    if (!p) return h.error('Esa persona no está');
    if (p.estado !== 'pendiente') return h.error('A esa persona ya se le mandó');
    const sets = ['editado = 1', "actualizado = datetime('now')"], vals = [];
    if (b.sacado !== undefined) { sets.push('sacado = ?'); vals.push(b.sacado ? 1 : 0); }
    if (b.linea !== undefined) {
      const l = String(b.linea).trim();
      if (l && !R.lineaValida(l)) return h.error('La línea tiene que empezar con "y", tener menos de 60 letras y no llevar números ni montos');
      sets.push('linea = ?'); vals.push(l);
    }
    if (b.lista !== undefined) {
      if (!R.LISTAS[b.lista]) return h.error('Esa lista no existe');
      /* PASAR UN NO ESCRIBIR A UNA LISTA NO SE PUEDE si está bloqueado
         por una baja: eso es para siempre. */
      const bloq = await env.DB.prepare('SELECT 1 FROM rt_no_contactar WHERE conversacion_id = ?').bind(p.conversacion_id).first();
      if (bloq && R.LISTAS[b.lista].envia) return h.error('Esa persona pidió que no la contactemos: no se le puede escribir');
      const ch = await env.DB.prepare('SELECT canal FROM conversaciones WHERE id = ?').bind(p.conversacion_id).first();
      if (ch?.canal !== 'whatsapp' && R.LISTAS[b.lista].envia) return h.error('Solo habló por Instagram o Messenger: no tenemos permiso para escribirle por WhatsApp');
      if (['precio', 'charla_caida'].includes(b.lista) && !R.lineaValida(b.linea ?? p.linea)) {
        return h.error('Para esa lista hace falta una línea personalizada: escribila primero');
      }
      sets.push('lista = ?'); vals.push(b.lista);
    }
    await env.DB.prepare(`UPDATE rt_personas SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, p.id).run();
    return h.json({ ok: true });
  }

  m = ruta.match(/^\/api\/admin\/retargeting\/personas\/(\d+)\/prueba$/);
  if (m && metodo === 'POST') return h.json(await mandarPrueba(env, Number(m[1]), h));

  return null;
}
