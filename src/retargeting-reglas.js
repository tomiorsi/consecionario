/* RETARGETING: LAS REGLAS FIJAS.
   ══════════════════════════════════════════════════════════════════

   Acá está todo lo que NO decide la IA: el filtro de bajas, a qué lista
   va cada persona, qué se le manda y cómo se arma el texto. Va en un
   archivo aparte, sin nada de Cloudflare, para poder probarlo con
   `node test/retargeting.test.js` (y con jsc en una Mac sin Node).

   REGLA DE ORO (Maxi, 24/11): ANTE LA DUDA, NO SE ESCRIBE. Escribirle a
   alguien que no quiere saber nada de nosotros es peor que perder una
   venta. Por eso la IA propone y estas reglas deciden: un "dudoso" no
   puede terminar en una lista de envío por ningún camino. */

/* ── EL FILTRO DE BAJAS ─────────────────────────────────────────────

   Corre ANTES que la IA y sobre lo que escribió la persona (no lo que le
   escribimos nosotros: "si no te interesa avisame" es nuestro). Si
   matchea, esa persona no recibe nada nunca más, en ninguna campaña.

   Se normaliza antes de buscar: minúsculas, sin tildes, sin signos y con
   las letras repetidas juntadas ("bastaaa" → "basta"). Así las variantes
   de ortografía caen solas sin escribir cada una. */
export function normalizar(t) {
  return String(t ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/(.)\1{2,}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const BAJAS = [
  /\bno me (escriban|escribas|escriban mas|escribas mas|mandes|manden|contacten|contactes|llamen|llames|jodan|jodas|molesten|molestes|hinchen|rompan)\b/,
  /\bno (me )?(quiero|kiero) (que me )?(escriban|escribas|recibir|saber nada|mas mensajes|mensajes)\b/,
  /\bdej(a|en|ame|enme|a de|en de) (de )?(escribir|molestar|joder|mandar)/,
  /\bdejen de\b/, /\bdeja de\b/,
  /\bno molest(en|es|ar)\b/, /\bno me molest/,
  /\bbasta\b/,
  /\bborr(a|en|ame|enme|ar|en mi|a mi) (mi |el |de |me )?(numero|contacto|lista|datos|base)?/,
  /\bborr(ame|enme)\b/, /\bme borr(as|an|en)\b/, /\bsac(ame|enme) de\b/,
  /\bno me interesa mas\b/, /\bya no me interesa\b/, /\bno me interesa nada\b/,
  /\bspam\b/, /\bspamm/,
  /\bdenunci(a|o|ar|are|ando)\b/,
  /\bbloque(ar|o|are|en|ame)\b/,
  /\bdesuscrib|\bdarme de baja\b|\bdame de baja\b|\bdenme de baja\b|\bme doy de baja\b/,
  /\bstop\b/,
  /\bno (vuelvan|vuelvas) a (escribir|escribirme|mandar|contactar)/,
  /\bno insistan\b/, /\bno insistas\b/,
];

/* Devuelve la frase que disparó la baja, o null. */
export function esBaja(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  for (const r of BAJAS) {
    const m = t.match(r);
    if (m) return m[0].trim();
  }
  return null;
}

/* Recorre la charla entera: sólo lo que escribió la persona. */
export function bajaEnCharla(mensajes) {
  for (const m of mensajes ?? []) {
    if (m.direccion !== 'entrante') continue;
    const hit = esBaja(m.texto);
    if (hit) return { frase: hit, texto: String(m.texto).slice(0, 140), creado: m.creado };
  }
  return null;
}

/* ── LAS LISTAS ──────────────────────────────────────────────────── */

export const LISTAS = {
  precio:       { nombre: 'Lista 1 · Precio',        corto: 'Precio',        envia: true,  dia: 'Día 1' },
  charla_caida: { nombre: 'Lista 2 · Charla caída',  corto: 'Charla caída',  envia: true,  dia: 'Día 2 o 3' },
  resto:        { nombre: 'Lista 3 · Resto',         corto: 'Resto',         envia: true,  dia: 'Día 4 o 5' },
  otros:        { nombre: 'Lista 4 · Otros 325',     corto: 'Otros',         envia: false, dia: 'Apagada' },
  dudoso:       { nombre: 'Dudosos',                 corto: 'Dudosos',       envia: false, dia: 'Decidís vos' },
  no_escribir:  { nombre: 'No escribir',             corto: 'No escribir',   envia: false, dia: 'Nunca' },
};
export const LISTAS_DE_ENVIO = ['precio', 'charla_caida', 'resto', 'otros'];

const DIA = 24 * 60 * 60 * 1000;

/* LA DECISIÓN FINAL. La IA trae su lectura (`ia`); esto la cruza con lo
   que se sabe sin IA y decide. El orden importa: lo que bloquea va
   primero, y lo que manda a dudosos va antes que cualquier lista.
   Devuelve { lista, motivo } o null si la persona no tiene nada que ver
   con esta campaña. */
export function decidirLista({ canal, ultimo, ahora = Date.now(), baja = null, noContactar = false,
  esEquipo = false, marketingReciente = false, ia = null } = {}) {
  if (esEquipo) return { lista: 'no_escribir', motivo: 'Es del equipo o un número nuestro.' };
  if (baja) return { lista: 'no_escribir', motivo: `Pidió que no lo contactemos («${baja.frase}»).`, baja: true };
  if (noContactar) return { lista: 'no_escribir', motivo: 'Está marcado para no contactar nunca más.' };
  if (!ia) return { lista: 'dudoso', motivo: 'No se pudo leer la charla con la IA.' };

  const esEste = ia.es_este_auto;
  if (esEste === 'no' && !ia.consulto_similar) return null;

  if (ia.decision === 'no_escribir') {
    return { lista: 'no_escribir', motivo: ia.motivo || MOTIVOS_NO[ia.motivo_no_escribir] || 'La charla no da para escribirle.' };
  }
  if (marketingReciente) return { lista: 'no_escribir', motivo: 'Recibió otro mensaje de Manna hace menos de 30 días.' };

  if (canal !== 'whatsapp') {
    return { lista: 'dudoso', motivo: `Habló solo por ${canal === 'instagram' ? 'Instagram' : 'Messenger'}: no tenemos permiso para escribirle por WhatsApp.` };
  }
  if (esEste === 'no_seguro') return { lista: 'dudoso', motivo: 'No está claro si consultó por este auto o por otro 325i.' };
  const ts = Date.parse(String(ultimo ?? '').replace(' ', 'T') + (String(ultimo ?? '').includes('Z') ? '' : 'Z'));
  if (Number.isFinite(ts) && ahora - ts > 365 * DIA) return { lista: 'dudoso', motivo: 'La charla tiene más de 12 meses.' };
  const conf = Number(ia.confianza);
  if (!Number.isFinite(conf) || conf < 0.8) return { lista: 'dudoso', motivo: `La IA no está segura (confianza ${Number.isFinite(conf) ? conf.toFixed(2) : '?'}). ${ia.motivo ?? ''}`.trim() };
  if (ia.decision !== 'escribir') return { lista: 'dudoso', motivo: ia.motivo || 'Charla corta o ambigua.' };

  if (esEste === 'no' && ia.consulto_similar) return { lista: 'otros', motivo: ia.motivo || 'Consultó por otro 325i que ya se vendió.' };

  const lista = ['precio', 'charla_caida', 'resto'].includes(ia.lista) ? ia.lista : 'resto';
  if (lista !== 'resto' && !lineaValida(ia.linea)) {
    return { lista: 'dudoso', motivo: 'La IA no pudo armar una línea personalizada segura.' };
  }
  return { lista, motivo: ia.motivo || '' };
}

const MOTIVOS_NO = {
  pidio_no_contacto: 'Pidió que no lo contactemos.',
  desinteres: 'Mostró desinterés claro.',
  reclamo: 'Tuvo un reclamo o la relación terminó mal.',
  ya_compro: 'Ya compró otro auto.',
  proveedor_colega_equipo: 'Es proveedor, colega, conocido o del equipo.',
  solo_vende: 'Solo vino a vender su auto, sin interés en comprar.',
  spam_incomprensible: 'La charla es spam o no se entiende.',
};

/* ── LA LÍNEA PERSONALIZADA {{2}} ────────────────────────────────────

   Menos de 60 caracteres, sacada de lo que se habló, y nunca con montos,
   datos personales ni nada sensible. Arranca con "y" porque completa la
   frase de la plantilla ("hablamos del BMW 325i Coupé 2011 {{2}}"). */
export function lineaValida(l) {
  const t = String(l ?? '').trim();
  if (!t || t.length >= 60) return false;
  if (!/^y\s/i.test(t)) return false;
  if (/[\d$€]/.test(t)) return false;                         // nada de números ni montos
  if (/usd|dolar|peso|precio de|lucas|palo|k\b/i.test(t)) return false;
  if (/@|https?:|www\./i.test(t)) return false;              // nada de contactos ni links
  if (/[{}\n]/.test(t)) return false;
  return true;
}

/* EL NOMBRE PARA SALUDAR. Si no hay uno seguro, va la versión de la
   plantilla sin {{1}}. Nunca el usuario de Instagram ni un apodo raro. */
export function nombreSeguro(n) {
  const t = String(n ?? '').trim();
  if (!t || t.length > 20) return null;
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][a-záéíóúüñ]+$/.test(t)) return null;
  return t[0].toUpperCase() + t.slice(1).toLowerCase();
}

/* ── LAS PLANTILLAS ──────────────────────────────────────────────────

   Texto de Maxi (24/11), SIN SIGNOS DE APERTURA (regla de Maxi para todo
   lo que va a clientes). Categoría Marketing, español de Argentina, video
   en el encabezado y tres botones de respuesta rápida.

   LOS BOTONES TIENEN 25 CARACTERES COMO MÁXIMO en una plantilla. Los que
   pidió Maxi tenían 27; quedaron "Coordinar una visita" y "Tengo auto
   para entregar". El payload dice campaña y botón, nunca a la persona.

   Cada plantilla tiene su gemela sin nombre ("_sn"): si no sabemos con
   seguridad cómo se llama, no se inventa. */
export const BOTONES = [
  { clave: 'visita', texto: 'Coordinar una visita' },
  { clave: 'auto',   texto: 'Tengo auto para entregar' },
  { clave: 'baja',   texto: 'No me interesa' },
];
/* En la prueba sin plantilla aprobada se usa un mensaje interactivo, y
   ahí WhatsApp corta a 20 caracteres. */
export const BOTONES_INTERACTIVOS = { visita: 'Coordinar una visita', auto: 'Auto para entregar', baja: 'No me interesa' };

export const RESPUESTA_BAJA = 'Entendido, no te vamos a escribir más. Gracias.';

/* Los cuerpos, por tipo de lista. `[N]` es el nombre, `[L]` la línea. */
const CUERPOS = {
  precio: 'Hola [N], cómo estás? Te escribimos de Manna Selected.\n'
    + 'Hace un tiempo hablamos del [AUTO] [L].\n'
    + 'Te queríamos avisar antes que a nadie: lo bajamos a [PRECIO].\n'
    + 'Te dejamos el video para que lo vuelvas a ver.',
  charla_caida: 'Hola [N], te escribimos de Manna Selected.\n'
    + 'Quedamos hablando del [AUTO] [L].\n'
    + 'Te cuento una novedad: bajó a [PRECIO].\n'
    + 'Te dejamos el video.',
  resto: 'Hola [N], te escribimos de Manna Selected.\n'
    + 'El [AUTO] que consultaste bajó a [PRECIO].\n'
    + '[DESTACADO]\n'
    + 'Te dejamos el video.',
};
const TIPO_DE_LISTA = { precio: 'precio', charla_caida: 'charla_caida', resto: 'resto' };
const SUFIJO = { precio: 'precio', charla_caida: 'charla', resto: 'resto' };

/* Las plantillas de una campaña, listas para ver o para mandar a Meta.
   El texto fijo (auto, precio, destacado) va escrito en la plantilla:
   Meta aprueba el texto entero, y así lo que se aprueba es lo que sale. */
export function plantillasDeCampania(c) {
  /* La campaña guardada trae el auto como `titulo`; nunca puede salir
     un texto con "undefined" o vacío. */
  const auto = c.auto_titulo ?? c.titulo;
  if (!auto || !c.precio_texto || !c.destacado) return [];
  const out = [];
  for (const tipo of ['precio', 'charla_caida', 'resto']) {
    for (const conNombre of [true, false]) {
      let n = 0;
      const vars = [];
      let txt = CUERPOS[tipo]
        .replace('[AUTO]', auto)
        .replace('[PRECIO]', c.precio_texto)
        .replace('[DESTACADO]', c.destacado);
      txt = txt.replace('Hola [N],', conNombre ? 'Hola {{N}},' : 'Hola,');
      txt = txt.replace(/\{\{N\}\}/, () => { vars.push('nombre'); return `{{${++n}}}`; });
      txt = txt.replace('[L]', () => { vars.push('linea'); return `{{${++n}}}`; });
      out.push({
        nombre: `${c.prefijo}_${SUFIJO[tipo]}${conNombre ? '' : '_sn'}`,
        tipo, conNombre, texto: txt, variables: vars,
        ejemplo: vars.map((v) => (v === 'nombre' ? 'Martín' : tipo === 'precio' ? 'y el número no te cerraba' : 'y de coordinar una visita')),
      });
    }
  }
  return out;
}

export function plantillaPara(c, lista, conNombre) {
  const tipo = TIPO_DE_LISTA[lista];
  if (!tipo) return null;
  return plantillasDeCampania(c).find((p) => p.tipo === tipo && p.conNombre === conNombre);
}

/* El mensaje exacto que le llega a una persona. */
export function mensajePara(c, persona) {
  const nombre = nombreSeguro(persona.nombre_saludo);
  const p = plantillaPara(c, persona.lista, Boolean(nombre));
  /* LA LISTA 4 NO TIENE MENSAJE TODAVÍA: consultaron por otro auto, y el
     de "el que consultaste bajó" sería mentira. Se escribe cuando Maxi la
     active. Lo mismo dudosos y no escribir: no se arma nada. */
  if (!p) return { plantilla: null, valores: [], texto: null };
  const valores = p.variables.map((v) => (v === 'nombre' ? nombre : String(persona.linea ?? '').trim()));
  const texto = p.texto.replace(/\{\{(\d+)\}\}/g, (_, i) => valores[i - 1] ?? '');
  return { plantilla: p.nombre, valores, texto };
}

/* Lo que pide Meta para crear la plantilla. `handle` es el video de
   ejemplo ya subido (Meta exige uno para aprobar un encabezado de video). */
export function plantillaParaMeta(p, handle) {
  return {
    name: p.nombre,
    category: 'MARKETING',
    language: 'es_AR',
    components: [
      { type: 'HEADER', format: 'VIDEO', example: { header_handle: [handle] } },
      { type: 'BODY', text: p.texto, ...(p.variables.length ? { example: { body_text: [p.ejemplo] } } : {}) },
      { type: 'BUTTONS', buttons: BOTONES.map((b) => ({ type: 'QUICK_REPLY', text: b.texto })) },
    ],
  };
}

/* El payload de cada botón: campaña y botón, nada de la persona. */
export const payloadDe = (campanaId, clave) => `rt:${campanaId}:${clave}`;
export function leerPayload(p) {
  const m = String(p ?? '').match(/^rt:(\d+):(visita|auto|baja)$/);
  return m ? { campana: Number(m[1]), boton: m[2] } : null;
}
/* Si llegó sólo el texto del botón (pasa con algunos clientes). */
export function botonPorTexto(t) {
  const n = normalizar(t);
  const b = [...BOTONES, ...Object.entries(BOTONES_INTERACTIVOS).map(([clave, texto]) => ({ clave, texto }))]
    .find((x) => normalizar(x.texto) === n);
  return b?.clave ?? null;
}

/* ── EL RITMO DE ENVÍO ───────────────────────────────────────────────
   Uno cada 20 a 30 segundos, de 10 a 20 en Buenos Aires, y nunca más del
   tope del día. Lo que falla no se reintenta solo. */
export function pausaEntreEnvios() { return 20000 + Math.floor(Math.random() * 10000); }
export function enHorarioDeEnvio(ahora = Date.now()) {
  const h = new Date(ahora - 3 * 3600 * 1000).getUTCHours();
  return h >= 10 && h < 20;
}
