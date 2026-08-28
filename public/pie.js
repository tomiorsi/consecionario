/* EL MAIL SE COPIA. EN TODOS LADOS, NO SOLO EN LA COMPU.

   Antes era un enlace `mailto:` y esto solo interceptaba el clic cuando
   el puntero era fino: en la compu copiaba, en el telefono abria el
   correo. La idea era que un aparato con dedo puede escribir un mail de
   una — pero abrir el cliente de correo es sacar a alguien del sitio
   para meterlo en un programa que capaz no tiene configurado, y en el
   camino se pierde el dato que vino a buscar. Copiarlo se lo deja en la
   mano, y de ahi lo pega donde quiera.

   YA NO HAY `mailto:` NI ENLACE. En el HTML es un <button>: sin destino,
   un <a> se queda sin foco de teclado y sin anunciarse como accionable.
   Por eso tampoco hay respaldo a `href` si el copiado falla — no hay a
   donde ir.

   SI EL NAVEGADOR NO DEJA COPIAR no se engancha nada y el boton se
   queda quieto. El portapapeles pide contexto seguro, asi que sobre
   http:// pelado no esta; el mail igual se lee en pantalla, que es el
   piso del que esto no puede bajar. */
(function(){
  var datos = [].slice.call(document.querySelectorAll('.pie-dato'));
  if (!datos.length) return;
  if (!navigator.clipboard) return;

  datos.forEach(function(b){
    var reloj = null;
    b.addEventListener('click', function(){
      navigator.clipboard.writeText(b.dataset.copiar || b.textContent.trim())
        .then(function(){
          b.classList.add('copiado');
          clearTimeout(reloj);
          reloj = setTimeout(function(){ b.classList.remove('copiado'); }, 1800);
        })
        .catch(function(){ /* el mail se sigue leyendo en pantalla */ });
    });
  });
})();
