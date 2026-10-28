/* LAS PLANTILLAS DE WHATSAPP: LO ÚNICO QUE PODEMOS ESCRIBIR PRIMERO.
   ══════════════════════════════════════════════════════════════════

   WhatsApp deja contestar libremente durante 24 horas desde el último
   mensaje de la persona. Pasadas esas 24 horas no se puede escribir
   cualquier cosa: sólo un texto que Meta aprobó de antemano. Eso es una
   plantilla.

   POR ESO ESTÁN ACÁ Y NO SUELTAS EN EL PANEL. El texto aprobado tiene
   que ser idéntico al que se manda; si alguien lo edita en el camino,
   Meta rechaza el envío. Escritas en el código, el texto que se aprueba
   y el que sale son el mismo y se revisan juntos.

   LAS VARIABLES VAN NUMERADAS, no con nombres: {{1}}, {{2}}. Es lo que
   pide Meta. El `ejemplo` de cada una no es decoración —sin ejemplos la
   revisión rechaza la plantilla— y además deja ver de un vistazo cómo
   queda el mensaje armado.

   LA CATEGORÍA LA DECIDE META AL FINAL. Acá va la que corresponde:
   'UTILITY' cuando el mensaje continúa algo que la persona pidió o
   acordó (una visita, un dato, una cotización) y 'MARKETING' cuando lo
   empezamos nosotros para volver a ofrecerle algo. Meta puede
   recategorizar; si lo hace, cambia el precio del envío, no el texto.

   NADA DE PRECIOS NI CONDICIONES ACÁ. Vale lo que dicen las condiciones
   de uso: lo que se cierra, se cierra con una persona. Estas plantillas
   abren la charla y nada más. */

export const PLANTILLAS = [
  {
    nombre: 'seguimiento_sin_respuesta',
    categoria: 'MARKETING',
    porque: 'No contestó más.',
    texto: 'Hola {{1}}, ¿cómo va? Te escribo de Manna Selected por el {{2}} '
         + 'que estuviste mirando. ¿Lo seguís buscando o ya resolviste?',
    ejemplo: ['Martín', 'BMW 330i'],
  },
  {
    nombre: 'visita_sin_fecha',
    categoria: 'MARKETING',
    porque: 'No eligió día para venir.',
    texto: 'Hola {{1}}! Te escribo por lo que hablamos del {{2}}. '
         + '¿Qué día te quedaría bien para pasar a verlo?',
    ejemplo: ['Martín', 'BMW 330i'],
  },
  {
    nombre: 'visita_recordatorio',
    categoria: 'UTILITY',
    porque: 'Recordatorio de una visita acordada.',
    texto: 'Hola {{1}}, ¿cómo estás? Te recuerdo que {{2}} a las {{3}} te esperamos '
         + 'en Pje. Lanín 154, Barracas, para ver el {{4}}. Cualquier cosa avisame.',
    ejemplo: ['Martín', 'el jueves', '16:00', 'BMW 330i'],
  },
  {
    nombre: 'visita_no_vino',
    categoria: 'UTILITY',
    porque: 'No vino a la visita acordada.',
    texto: 'Hola {{1}}, hoy te estábamos esperando para ver el {{2}}. ¿Te surgió algo? '
         + 'Si querés lo pasamos para otro día, decime cuál te queda mejor.',
    ejemplo: ['Martín', 'BMW 330i'],
  },
  {
    nombre: 'dato_pendiente',
    categoria: 'UTILITY',
    porque: 'Quedó debiendo un dato que la persona pidió.',
    texto: 'Hola {{1}}, perdón la demora. Ya tengo lo que me preguntaste del {{2}}, '
         + '¿te lo paso por acá?',
    ejemplo: ['Martín', 'BMW 330i'],
  },
  {
    nombre: 'cotizacion_lista',
    categoria: 'UTILITY',
    porque: 'Está lista la tasación del auto que entrega.',
    texto: 'Hola {{1}}, ya tengo la cotización aproximada de tu {{2}}. ¿Te la paso por acá?',
    ejemplo: ['Martín', 'Golf 2015'],
  },
  {
    nombre: 'volver_mas_adelante',
    categoria: 'MARKETING',
    porque: 'Había pedido que lo contactemos más adelante.',
    texto: 'Hola {{1}}, ¿cómo estás? Te escribo como habíamos quedado, por el {{2}}. '
         + '¿Pudiste pensarlo?',
    ejemplo: ['Martín', 'BMW 330i'],
  },
  {
    nombre: 'auto_vendido',
    categoria: 'MARKETING',
    porque: 'Se vendió el auto que consultó.',
    texto: 'Hola {{1}}, te quería avisar que el {{2}} que consultaste ya se vendió. '
         + 'Entró un {{3}} bastante parecido, ¿querés que te pase fotos?',
    ejemplo: ['Martín', 'BMW 330i', 'BMW 320i'],
  },
  {
    nombre: 'bajo_de_precio',
    categoria: 'MARKETING',
    porque: 'Bajó de precio el auto que consultó.',
    texto: 'Hola {{1}}, te cuento que el {{2}} que consultaste bajó de precio. '
         + '¿Te paso los detalles?',
    ejemplo: ['Martín', 'BMW 330i'],
  },
];

/* EL IDIOMA ES UNO SOLO Y ES EL DE ACÁ. 'es_AR' y no 'es': el texto está
   escrito en argentino —"avisame", "te queda mejor"— y una plantilla
   aprobada como español neutro invita a que alguien la traduzca mal
   después. */
export const IDIOMA = 'es_AR';

/* Lo que Meta espera recibir por cada plantilla. */
export const comoLasPideMeta = (p) => ({
  name: p.nombre,
  category: p.categoria,
  language: IDIOMA,
  components: [{
    type: 'BODY',
    text: p.texto,
    example: { body_text: [p.ejemplo] },
  }],
});
