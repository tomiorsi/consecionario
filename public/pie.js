/* EL TELÉFONO Y EL MAIL: SE LLAMAN EN EL CELULAR, SE COPIAN EN LA COMPU.

   En el HTML son enlaces `tel:` y `mailto:`, que es lo que corresponde y
   lo que hace que en un teléfono el número se marque de una.

   En una computadora ese mismo enlace no sirve para nada útil: abre —o
   intenta abrir— un programa que muchas veces no está configurado, y el
   usuario se queda sin el dato. Ahí el clic cambia de gesto y copia.

   LA DIFERENCIA SE DECIDE POR EL PUNTERO Y NO POR EL ANCHO. `pointer:
   coarse` es un dedo, y un aparato que se maneja con el dedo es un
   aparato que puede llamar. Una ventana angosta en una computadora
   sigue siendo una computadora, y por ancho habría caído del lado
   equivocado.

   Si el navegador no deja copiar —el portapapeles pide contexto seguro,
   así que en http:// sin más no está— no se hace nada y el enlace sigue
   funcionando como enlace. */
(function(){
  var datos = [].slice.call(document.querySelectorAll('.pie-dato'));
  if (!datos.length) return;
  if (matchMedia('(pointer: coarse)').matches) return;
  if (!navigator.clipboard) return;

  datos.forEach(function(a){
    var reloj = null;
    a.addEventListener('click', function(e){
      e.preventDefault();
      navigator.clipboard.writeText(a.dataset.copiar || a.textContent.trim())
        .then(function(){
          a.classList.add('copiado');
          clearTimeout(reloj);
          reloj = setTimeout(function(){ a.classList.remove('copiado'); }, 1800);
        })
        .catch(function(){
          /* Si falló, que al menos haga lo que dice el href. */
          window.location.href = a.href;
        });
    });
  });
})();
