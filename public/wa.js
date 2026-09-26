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
  a.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96' +
    '-.27-.1-.47-.15-.67.15-.2.29-.77.95-.94 1.15-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47' +
    '-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.29.3-.49' +
    '.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37' +
    '-.27.3-1.04 1.01-1.04 2.470 1.45 1.06 2.86 1.21 3.06.15.2 2.09 3.2 5.08 4.48.71.31 1.26.49 ' +
    '1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2' +
    '-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.79-1.32l-.34-.2-3.56.93.95-3.47-.22-.36a9.38 9.38 ' +
    '0 0 1-1.44-5 9.44 9.44 0 0 1 16.12-6.67 9.36 9.36 0 0 1 2.76 6.68c0 5.2-4.24 9.41-9.47 9.41z' +
    'M20.52 3.49A11.78 11.78 0 0 0 12.05 0C5.5 0 .17 5.31.17 11.84c0 2.09.55 4.13 1.6 5.93L.07 24l' +
    '6.37-1.66a11.9 11.9 0 0 0 5.6 1.42h.01c6.54 0 11.87-5.31 11.87-11.84 0-3.16-1.24-6.13-3.4-8.43z"/></svg>';

  document.body.appendChild(a);
})();
