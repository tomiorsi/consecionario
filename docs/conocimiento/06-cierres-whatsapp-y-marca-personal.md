# Cierres, ventas por WhatsApp y marca personal (tres videos)

Vistos a pedido de Maxi el 2/11/2026. Resumen propio, no transcripción.

1. **Alex Dey, "12 cierres de ventas más poderosos"** (58 min) — https://youtu.be/ahi1QO0s_YE
2. **Escuela de Negocios, "El sistema para vender todos los días por WhatsApp e Instagram"** (68 min) — https://youtu.be/0-C0mPbpAh0
3. **Foro de Crecimiento con Renzo Martos, "Estrategias para conseguir más seguidores y más ventas en redes sociales"** (1 h 44 min) — https://youtu.be/oq9sxQyrpUM

## 1. Alex Dey: los cierres

- Cerrar es ayudar a la gente a tomar una decisión que le conviene.
- Dos oídos y una boca: escuchar el doble de lo que se habla. El que no escucha no sabe qué tipo de cliente tiene enfrente.
- **No digas, preguntá.** Lo que dice el vendedor se duda; lo que concluye el cliente, se lo cree. Las frases huecas ("es el mejor del mercado", "aprovechá que suben los precios", "hay otro interesado") enfrían.
- Los cierres que da: por conclusión (dar por hecho que le interesa, aunque esté serio), doble alternativa (dos opciones, nunca "sí o no"), amarre ("¿no te parece?" al final), amarre invertido, puercoespín (contestar una pregunta con otra que la convierta en compromiso: "¿lo tenés en azul?" → "¿lo querés en azul?"), envolvente (hablar como si ya lo tuviera), por equivocación, por compromiso ("si te demuestro X, ¿lo comprás?"), por eliminación (buscar la razón real), rebote y Benjamin Franklin (lista de razones a favor y en contra).
- **El silencio:** después de la pregunta de cierre, callarse.
- **"Lo quiero pensar"** es la madre de las objeciones. Hay objeciones reflejo y objeciones reales; sólo vale la pena contestar la real.

## 2. Ventas por WhatsApp e Instagram

- **Se pierden ventas por hablar de más.** Cuando el cliente está listo, hay que pedir el cierre y callarse.
- Venta (el enamoramiento) y cierre (el pago) son cosas distintas. El "pasaporte" para pasar de una a otra es una pregunta: "¿hay algo que te impida arrancar hoy?".
- Seis pasos: conexión con un comentario casual, aclarar la intención (qué resultado le da), perfilar con preguntas (situación actual, deseos, dolor y urgencia, plata, y si es el cliente indicado), aportar valor resolviendo las objeciones antes de que aparezcan, pasaporte y cierre.
- **Justificar las preguntas incómodas:** "te pregunto para ver cómo ayudarte mejor".
- **Que el cliente se dé cuenta solo** de que está en buenas manos. "Con nosotros no te va a pasar" no genera confianza; un caso parecido o un hecho, sí. Mejor todavía es la prueba social: que lo diga otro cliente.
- **Seguimiento "levanta muertos":** retomar algo personal que contó el cliente, no el producto.
- Por WhatsApp proponen dar un rango de precio y preguntar. **No lo pasamos al bot:** nuestros precios son de un auto puntual y Maxi decidió darlo claro y solo.
- Si no puede pagar todo, conseguir una seña chica (en Manna eso lo maneja una persona).

## 3. Renzo Martos: marca personal y redes

- La gente le confía más a una persona que a una marca. Una marca personal especialista en una sola cosa cobra más que una "todista".
- **Lo único que no se puede copiar es la historia:** los momentos difíciles conectan más que los logros. Documentar el proceso desde hoy.
- Para arrancar alcanza un teléfono: la cantidad trae la calidad.
- **Las historias venden y los reels traen gente nueva** (mitad carruseles, mitad videos).
  - Historias para vender, con foto y texto: el peor momento, el proceso, el logro y un llamado a escribir una palabra.
  - Reel: un gancho de 3 segundos (los temas que más enganchan son plata, salud, pareja y superación), un cuerpo de 20 a 30 segundos con 3 pasos y un llamado a escribir una palabra.
- Voz, dicción y gestos son la mayor parte de que un video funcione.
- **Prometé uno y entregá dos:** sorprender con algo que no se prometió fideliza y hace que te recomienden.
- Prueba de manejo: "el vendedor tonto te muestra el auto, el inteligente te da la llave".
- Colaborar con cuentas más grandes, y ganarse primero la confianza de quien está al lado del famoso, sin interés.
- La gente ama comprar, pero odia que le vendan.

## Qué pasó al bot (`src/instrucciones.js`, PR del 2/11)

- **HECHOS, NO ADJETIVOS:** fuera las frases de vendedor; el hecho, y que el cliente saque la conclusión.
- **DESCUBRÍ ANTES DE VENDER:** justificar las preguntas que pueden sonar invasivas.
- **OBJECIONES:** la primera excusa casi nunca es la real; buscar la real y contestar sólo a esa.
- **CUANDO DICE QUE SÍ, NO SIGAS VENDIENDO:** confirmar corto, sin más datos ni preguntas.
- **SEGUIMIENTO:** si contó algo suyo, retomar eso y no el auto.

Lo que ya estaba: dos opciones de día, la regla de los sí, la pregunta al final, no presionar con mentiras.

## Qué no pasó, y por qué

- **Cierres que manipulan** (por equivocación, compromiso, rebote, "solo por hoy"): chocan con "nunca presiones con mentiras", y el bot no cierra precios ni reservas.
- **Garantías tipo "si no te convence, te devuelvo la plata":** el bot no promete nada que no dependa de él.
- **Memes como seguimiento:** no van con el tono de Manna.
- **Lo de redes es para Maxi y el equipo, no para el bot.** Ideas para Manna:
  1. Historias que cuenten la historia de un auto: cómo llegó, el detailing, la entrega.
  2. Reels con gancho y tres datos: "3 cosas que tenés que mirar antes de comprar un usado".
  3. Testimonios de clientes en la entrega.
  4. Algo de regalo que no se prometió en cada entrega.
  5. Ofrecer la prueba de manejo en la visita, si Maxi la habilita.
