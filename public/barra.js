/* LA BARRA DE ARRIBA, PARA LAS PAGINAS NEGRAS.
   ══════════════════════════════════════════════════════════════════

   Estaba adentro de garage/garage.js. Salio de ahi cuando la misma
   barra paso a estar tambien en /por-que-elegirnos: son dos cosas
   chicas pero delicadas —un alto que hay que medir y un umbral de
   scroll— y dos copias se desincronizan a la primera correccion.

   La home NO usa esto: alla la barra es el HUD, que ademas se compacta
   y cambia de color sobre la portada clara. */

/* EL ALTO DE LA BARRA, MEDIDO Y NO SUPUESTO.

   La barra es fija, asi que el resto de la pagina tiene que dejarle el
   lugar. Ese alto depende del logo, del relleno y del corte de pantalla
   —o sea que cambia— y puesto a mano deja el contenido tapado o
   flotando. Se mide y se escribe en --barra-h. */
(function(){
  function medir(){
    var b = document.querySelector('.barra');
    if (b) document.documentElement.style.setProperty('--barra-h', b.offsetHeight + 'px');
  }
  addEventListener('resize', medir);
  addEventListener('load', medir);
  medir();

  /* EL VIDRIO APARECE AL BAJAR. Mismo umbral que la home (24 px) para
     que las paginas se sientan la misma. Solo se escribe cuando el
     estado CAMBIA, asi el oyente no toca el DOM en cada pixel. */
  var barra = document.querySelector('.barra');
  if (!barra) return;
  var puesto = null;
  function mirar(){
    var si = scrollY > 24;
    if (si === puesto) return;
    puesto = si;
    barra.classList.toggle('con-vidrio', si);
  }
  addEventListener('scroll', mirar, { passive:true });
  mirar();
})();
