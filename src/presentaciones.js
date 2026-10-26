/* LAS RESPUESTAS RÁPIDAS DE WHATSAPP BUSINESS, TAL CUAL.
   ══════════════════════════════════════════════════════════════════

   Son los primeros mensajes que el equipo ya usa con cada auto, sacados
   de WhatsApp Business → Herramientas → Respuestas rápidas (26/10/2026).
   El bot los usa como primer mensaje sobre ese auto, casi textuales: es
   la voz que ya funciona.

   VAN SIN EL LINK. El link de la ficha lo manda el Worker solo, en su
   propio mensaje y antes del texto (ver mandarRespuesta en index.js).

   LA CLAVE ES EL ID DEL AUTO EN LA BASE, el número del final de su
   dirección: /auto/bmw-430i-coupe-2018-8 es el 8. Un auto sin presentación
   acá se presenta igual, con los datos de su ficha.

   CUANDO CAMBIA UNA RESPUESTA RÁPIDA, SE CAMBIA ACÁ TAMBIÉN. Si un auto se
   vende, su línea puede quedar: el bot sólo la usa si el auto está
   publicado. */

export const PRESENTACIONES = {
  // BMW 430i Coupé 2018
  8: `Gracias por escribirnos! Cómo estás? El 430i tiene 22.000 km, único dueño, motor 2.0 Turbo, caja de 8 velocidades y tracción trasera. La verdad, es una unidad bastante especial por los kilómetros y esa combinación entre un sedán y la configuración de un deportivo. Estabas buscando un 430i puntualmente o este te llamó la atención?`,

  // Mercedes-Benz C300 Coupé Cabrio 2020
  7: `Hola! Gracias por escribirnos. Tiene 32.000 km, motor 2.0 Turbo de 258 CV, caja automática de 9 velocidades y tracción trasera. Se entrega con todos los papeles al día, listo para transferir. Conocemos al dueño anterior, es un auto que se usó muy poco porque el dueño colecciona autos y los usa muy poco. Venías buscando un cabrio o este C300 te llamó la atención cuando lo viste?`,

  // RAM 1500 Rebel Mild-Hybrid 2024
  10: `Hola! Gracias por escribirnos. ¿Cómo estás? La RAM Rebel tiene 48.000 km, motor HEMI V8 5.7 con sistema híbrido eTorque, 395 CV, caja automática de 8 velocidades y tracción 4x4. Es una camioneta que impresiona cuando la ves, pero cuando te subís entendés por qué tanta gente termina usándola todos los días. Tenés el V8, el tamaño y la presencia de una RAM, pero con muchísimo confort y el sistema híbrido acompañando el uso cotidiano. ¿Ya venías buscando una Rebel o fue esta la que te gustó?`,

  // Ford Mustang Mach-E 2024
  6: `Gracias por escribirnos! ¿Cómo estás? El Mustang Mach-E es 100% eléctrico, tiene doble motor, tracción integral eAWD. Va de 0 a 100 km/h en 3,7 segundos. Tenés un auto tecnológico, deportivo y para todos los días. ¿Ya estabas pensando en un eléctrico o este Mach-E te llamó la atención por otra cosa?`,

  // Fiat 500C Lounge 2015
  13: `Hola, cómo estás? te cuento Es 2015, tiene 90.000 km, fue de único dueño, tiene todos los services y mantiene su configuración 100% original. Lo estás evaluando para compra directa o tenés un vehículo para entregar?`,

  // Toyota Hilux GR-Sport III 2022
  12: `Hola, cómo estás? es 2022. Tiene 70.000 km, tiene todos los servicios hechos en Toyota, 4 neumáticos nuevos y un auxilio sin rodar. Viene con Motor 2.8 turbodiesel de 224 CV y 550 Nm, caja automática de 6 velocidades y una puesta a punto específica GR-Sport. La estás evaluando para compra directa o tenés un vehículo para entregar?`,

  // BMW X1 sDrive20i 2022
  14: `Hola, cómo estás? la BMW X1 es sDrive20i - 2022. Tiene 80.000 km, todos los services realizados oficialmente en BMW y motor 2.0 Turbo de 192 CV. Esta configuración viene con techo panorámico, portón trasero eléctrico, cámara de retroceso, sensores de estacionamiento traseros, faros LED, climatizador y preparación para Apple CarPlay. La estás evaluando para compra directa o tenés un vehículo para entregar?`,

  // BMW 118i 2013
  15: `Hola! Cómo estás? Gracias por tu consulta. El 118 es 2013, lo mejor de todo es que tiene 68.000 km y cuenta con todos los services oficiales. Además, es manual de 6 velocidades y tiene 170 CV con tracción trasera, divertido de manejar. Lo estás evaluando para compra directa o tenés un vehículo para entregar?`,

  // Mercedes-Benz GLA 200 2018
  9: `Hola! como estas? Es una Mercedes-Benz GLA 200 Plus 2018, con motor 1.6 Turbo de 156 CV y caja automática de 7 velocidades, 125 mil km y tracción delantera. Es una SUV cómoda, una posición de manejo más alta. Está nueva, sin un detalle por afuera ni adentro. La clase y el confort de Mercedes, sin irte a un vehículo demasiado grande. La estás evaluando para compra directa o tenés un vehiculo para entregar?`,
};

/* La respuesta rápida "Consigna": el primer mensaje a un dueño que
   quiere vender su auto con nosotros. */
export const PRESENTACION_CONSIGNACION = `Hola! Cómo estás? Gracias por contactarte con Manna Selected. Nos especializamos en la venta de autos seleccionados mediante consignación. No compramos vehículos, sino que trabajamos para encontrar al comprador indicado lo mas rápido posible. Ocupándonos de la presentación, afrontando los gastos de difusión y gestión de las consultas. Para conocer tu auto y evaluar si podemos trabajar juntos, contame qué vehículo tenés: marca, modelo, año y kilómetros. También, qué precio tenés pensado? Gracias!`;
