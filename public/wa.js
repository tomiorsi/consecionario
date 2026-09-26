/* EL BOTÓN DE WHATSAPP, FIJO ABAJO A LA DERECHA.
   ══════════════════════════════════════════════════════════════════

   Está en todas las páginas del sitio. El motivo es simple: la persona
   decide escribir en cualquier momento —mirando una foto, leyendo la
   ficha, a mitad de la home— y hasta ahora, para hacerlo, tenía que
   llegar hasta el pie o abrir la ficha de un auto. El que decide y no
   encuentra dónde, se va.

   SE DIBUJA DESDE ACÁ Y NO EN CADA HTML. Son cinco páginas; el botón
   escrito cinco veces son cinco lugares donde corregir el número el día
   que cambie. Un archivo, una línea por página.

   ESTA SIEMPRE, TAMBIEN CON LA FICHA DE UN AUTO ABIERTA (z-index 70
   contra los 60 de la ficha). La ficha ya tiene su "Consultar por esta
   unidad", que manda el mensaje con la unidad escrita; este sigue
   estando igual, porque el que decide escribir no tiene que buscar donde
   hacerlo.

   LA UNICA CAPA QUE SI LO TAPA ES EL ZOOM DE LAS FOTOS (80). Ahi la
   pantalla es negra de punta a punta, con sus flechas y su cruz, y un
   circulo verde encima seria un boton mas para errarle al cerrar.

   EL TEXTO DEL MENSAJE DICE DE DÓNDE VIENE. "Hola, los encontré en la
   web" no es decoración: del otro lado, saber si la consulta llegó por
   la web, por un anuncio o por el perfil de Instagram cambia cómo se
   contesta y permite medir qué canal trae gente. El de la ficha del
   auto ya nombra la unidad; este nombra el canal.

   `encodeURIComponent` alcanza para meterlo en el href y no hace falta
   escapar nada más: no se arma HTML con datos de nadie. */
(function () {
  var NUMERO = '5491176703813';
  var TEXTO = 'Hola, los encontré en la web. Quería hacerles una consulta.';

  /* En el panel no va: es una puerta de servicio, no una página para
     clientes. */
  if (location.pathname.indexOf('/admin') === 0) return;

  var estilo = document.createElement('style');
  estilo.textContent =
    '.wa-flotante{' +
      'position:fixed; z-index:70;' +
      /* `env(safe-area-inset-*)` es el borde que se come el iPhone con la
         barra de gestos. Sin esto, en pantalla completa el botón queda
         pegado al borde y medio tapado. */
      'right:calc(1rem + env(safe-area-inset-right,0px));' +
      'bottom:calc(1rem + env(safe-area-inset-bottom,0px));' +
      'width:3.5rem; height:3.5rem; border-radius:50%;' +
      'display:flex; align-items:center; justify-content:center;' +
      'background:#25D366; color:#fff;' +
      /* La sombra es lo que lo despega del fondo: el sitio tiene fotos
         claras y oscuras, y sin ella el círculo verde se pierde sobre
         algunas. */
      'box-shadow:0 4px 14px rgba(0,0,0,.28);' +
      'transition:transform .25s ease, box-shadow .25s ease;' +
      '-webkit-tap-highlight-color:transparent;' +
    '}' +
    '.wa-flotante:hover{ transform:translateY(-2px); box-shadow:0 8px 20px rgba(0,0,0,.34) }' +
    '.wa-flotante:focus-visible{ outline:3px solid #fff; outline-offset:3px }' +
    '.wa-flotante svg{ width:1.9rem; height:1.9rem; display:block; fill:currentColor }' +
    /* Quien pidió menos movimiento no recibe el salto al pasar por
       encima. */
    '@media (prefers-reduced-motion:reduce){ .wa-flotante{ transition:none } ' +
      '.wa-flotante:hover{ transform:none } }';
  document.head.appendChild(estilo);

  var a = document.createElement('a');
  a.className = 'wa-flotante';
  a.href = 'https://wa.me/' + NUMERO + '?text=' + encodeURIComponent(TEXTO);
  a.target = '_blank';
  a.rel = 'noopener';
  /* El texto para quien no ve el ícono. El SVG va con aria-hidden
     porque ya lo dice el aria-label: anunciado dos veces, un lector de
     pantalla lo repite. */
  a.setAttribute('aria-label', 'Escribinos por WhatsApp');
  /* El glifo oficial de WhatsApp, en una sola curva. Antes habia un
     path escrito a mano que dibujaba cualquier cosa. */
  a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
    'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.465 3.488' +
    '"/></svg>';

  document.body.appendChild(a);
})();
