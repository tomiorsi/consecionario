/* TESTS DEL RETARGETING: el filtro de bajas y que un dudoso nunca salga.
   Corre con `node test/retargeting.test.js` (y en una Mac sin Node, con
   el jsc del sistema: `jsc -m test/retargeting.test.js`). Si algo falla,
   el proceso termina con error y la publicación se frena. */
import {
  esBaja, bajaEnCharla, decidirLista, lineaValida, nombreSeguro,
  mensajePara, plantillasDeCampania, BOTONES, LISTAS_DE_ENVIO, leerPayload, payloadDe, botonPorTexto,
} from '../src/retargeting-reglas.js';

const imprimir = typeof console !== 'undefined' ? (...a) => console.log(...a) : (...a) => print(...a);
let fallas = 0, total = 0;
function ok(cond, nombre) {
  total++;
  if (!cond) { fallas++; imprimir('FALLA: ' + nombre); }
}

/* ── 1. El filtro de bajas ── */
const bajas = [
  'no me escriban más', 'NO ME ESCRIBAN', 'No me molesten por favor', 'no me molestes',
  'Bastaaaa', 'basta!!', 'dejá de escribirme', 'deja de escribirme', 'dejen de mandarme mensajes',
  'borrame de la lista', 'Bórrenme', 'no me interesa más', 'Ya no me interesa', 'esto es spam',
  'SPAM', 'te voy a denunciar', 'Denuncia', 'te voy a bloquear', 'los bloqueo', 'no me contacten',
  'no quiero que me escriban', 'sacame de esta lista', 'dame de baja', 'STOP', 'no vuelvan a escribirme',
  'No me jodan más', 'nO mE eScRiBaN', 'no me escriban mas!!!', 'Dejá de molestar',
];
for (const t of bajas) ok(esBaja(t), `baja: «${t}»`);

const noBajas = [
  'Hola, me interesa el 325', 'cuánto sale?', 'tengo un auto para entregar', 'me interesa',
  'no me cierra el precio', 'no puedo esta semana, te escribo el lunes', 'basado en lo que me dijiste',
  'no me interesa el sedán, el coupé sí', 'lo puedo ver el sábado?', 'gracias!', 'escribime mañana',
  'no tengo auto para entregar', 'está bloqueado el baúl?',
];
for (const t of noBajas) ok(!esBaja(t), `no es baja: «${t}»`);

/* Sólo cuenta lo que escribió la persona, no lo nuestro. */
ok(!bajaEnCharla([{ direccion: 'saliente', texto: 'Si no te interesa más, avisame y no te escribimos' }]),
  'lo que escribimos nosotros no es una baja');
ok(bajaEnCharla([{ direccion: 'entrante', texto: 'hola' }, { direccion: 'entrante', texto: 'basta de mensajes' }]),
  'una baja en el medio de la charla cuenta');

/* ── 2. Dudoso nunca se envía ── */
const iaBuena = { es_este_auto: 'si', consulto_similar: false, decision: 'escribir', lista: 'precio',
  motivo: 'Pidió rebaja', linea: 'y el número no te cerraba', confianza: 0.95 };
const base = { canal: 'whatsapp', ultimo: new Date(Date.now() - 30 * 864e5).toISOString() };

const casosDudosos = [
  ['confianza baja', { ...base, ia: { ...iaBuena, confianza: 0.79 } }],
  ['confianza sin número', { ...base, ia: { ...iaBuena, confianza: undefined } }],
  ['la IA dice dudoso', { ...base, ia: { ...iaBuena, decision: 'dudoso' } }],
  ['solo Instagram', { ...base, canal: 'instagram', ia: iaBuena }],
  ['solo Messenger', { ...base, canal: 'messenger', ia: iaBuena }],
  ['más de 12 meses', { ...base, ultimo: new Date(Date.now() - 400 * 864e5).toISOString(), ia: iaBuena }],
  ['no se sabe qué auto', { ...base, ia: { ...iaBuena, es_este_auto: 'no_seguro' } }],
  ['sin IA', { ...base, ia: null }],
  ['línea con monto', { ...base, ia: { ...iaBuena, linea: 'y los USD 25.000 que ofreciste' } }],
  ['línea muy larga', { ...base, ia: { ...iaBuena, linea: 'y de todo lo que charlamos sobre el auto, la permuta y la visita' } }],
];
for (const [nombre, entrada] of casosDudosos) {
  const d = decidirLista(entrada);
  ok(d && d.lista === 'dudoso', `dudoso: ${nombre} (salió ${d?.lista})`);
  ok(d && !LISTAS_DE_ENVIO.includes(d.lista), `dudoso no está en una lista de envío: ${nombre}`);
}

/* Lo que bloquea gana siempre, aunque la IA diga "escribir". */
const bloqueos = [
  ['baja', { ...base, ia: iaBuena, baja: { frase: 'basta' } }],
  ['no contactar', { ...base, ia: iaBuena, noContactar: true }],
  ['equipo', { ...base, ia: iaBuena, esEquipo: true }],
  ['marketing reciente', { ...base, ia: iaBuena, marketingReciente: true }],
  ['la IA dice no', { ...base, ia: { ...iaBuena, decision: 'no_escribir', motivo_no_escribir: 'ya_compro' } }],
];
for (const [nombre, entrada] of bloqueos) {
  const d = decidirLista(entrada);
  ok(d && d.lista === 'no_escribir', `no escribir: ${nombre} (salió ${d?.lista})`);
}

/* El caso bueno sí entra a su lista. */
ok(decidirLista({ ...base, ia: iaBuena }).lista === 'precio', 'caso bueno va a precio');
ok(decidirLista({ ...base, ia: { ...iaBuena, lista: 'resto', linea: '' } }).lista === 'resto', 'resto no necesita línea');
ok(decidirLista({ ...base, ia: { ...iaBuena, es_este_auto: 'no', consulto_similar: false } }) === null,
  'si no consultó por este ni por otro 325, no entra');
ok(decidirLista({ ...base, ia: { ...iaBuena, es_este_auto: 'no', consulto_similar: true } }).lista === 'otros',
  'consultó por un 325 vendido: lista 4');

/* ── 3. La línea y el nombre ── */
ok(lineaValida('y de coordinar una visita'), 'línea buena');
ok(!lineaValida('de coordinar una visita'), 'línea sin "y"');
ok(!lineaValida('y te ofrecí 25.900'), 'línea con número');
ok(nombreSeguro('martín') === 'Martín', 'nombre normal');
ok(nombreSeguro('catainaki_ok') === null, 'usuario no es nombre');
ok(nombreSeguro('🔥Juan') === null, 'nombre con emoji no');
ok(nombreSeguro('Juan Pablo') === null, 'nombre compuesto no se arriesga');

/* ── 4. Las plantillas y el mensaje armado ── */
const camp = { prefijo: 'retarget_325i', auto_titulo: 'BMW 325i Coupé 2011', precio_texto: 'USD 25.900',
  destacado: 'Seis cilindros, 68.000 km, original de fábrica y con historial de services.' };
const pls = plantillasDeCampania(camp);
ok(pls.length === 6, 'seis plantillas');
for (const p of pls) {
  ok(!/[¿¡]/.test(p.texto), `sin signos de apertura: ${p.nombre}`);
  ok(!/^\{\{|\}\}$/.test(p.texto.trim()), `no empieza ni termina con variable: ${p.nombre}`);
  ok(p.texto.length <= 1024, `cuerpo dentro del límite: ${p.nombre}`);
}
ok(BOTONES.every((b) => b.texto.length <= 25), 'botones de hasta 25 caracteres');
const m1 = mensajePara(camp, { lista: 'precio', nombre_saludo: 'martín', linea: 'y el número no te cerraba' });
ok(m1.texto.startsWith('Hola Martín, cómo estás?') && m1.plantilla === 'retarget_325i_precio', 'mensaje con nombre');
const m2 = mensajePara(camp, { lista: 'charla_caida', nombre_saludo: null, linea: 'y de coordinar una visita' });
ok(m2.texto.startsWith('Hola, te escribimos') && m2.plantilla === 'retarget_325i_charla_sn', 'mensaje sin nombre');
ok(mensajePara(camp, { lista: 'dudoso' }).texto === null, 'un dudoso no tiene mensaje armado');
ok(mensajePara(camp, { lista: 'otros' }).texto === null, 'la lista 4 no tiene mensaje hasta activarla');

/* ── 5. Botones ── */
ok(leerPayload(payloadDe(3, 'baja'))?.boton === 'baja', 'payload de baja');
ok(leerPayload('cualquier cosa') === null, 'payload ajeno');
ok(botonPorTexto('No me interesa') === 'baja', 'botón por texto');

imprimir(`${total - fallas}/${total} pruebas bien`);
if (fallas) { if (typeof process !== 'undefined') process.exit(1); else throw new Error(`${fallas} pruebas fallaron`); }
