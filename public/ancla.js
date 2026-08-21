/* Compartido por las tres paginas. Estuvo adentro del <script> de
   index.html hasta que /garage y /por-que-elegirnos tambien empezaron a
   apuntar a un ancla —el pie— y hubieran hecho falta tres copias.

   Funciona igual en las tres porque no sabe nada de ninguna: mira los
   enlaces que empiezan con # y busca el destino por id. */

/* ══════════════════════════════════════════════════════════════
   IR A UNA SECCION SIN SALTAR
   ══════════════════════════════════════════════════════════════

   Un enlace a un ancla te deja en destino en el mismo cuadro. En una
   pagina de una pantalla eso esta bien; en esta, que mide ocho, es
   desorientador: se aprieta "Contacto" arriba de todo y sin ninguna
   transicion aparece un formulario, sin haber visto que hay en el
   medio ni entender cuanto se bajo.

   POR QUE NO ALCANZA `scroll-behavior:smooth`. Se probo y el problema
   es la duracion: el navegador la calcula sola y para siete pantallas
   sale un barrido rapidisimo que se lee como un tiron largo en vez de
   como un salto corto. Aca la duracion crece con la distancia pero
   con un tope, asi que un tramo corto es rapido y uno largo no se
   hace eterno.

   SE CANCELA APENAS EL VISITANTE TOCA ALGO. Una animacion de scroll
   que le pelea a la rueda del mouse es de las cosas mas molestas que
   puede hacer una pagina: si alguien mueve la rueda, toca la pantalla
   o aprieta una tecla, esto se aparta y le devuelve el control.

   CON MOVIMIENTO REDUCIDO NO ANIMA, salta — que es exactamente lo que
   esa preferencia pide. */
(function(){
  var quieto = window.matchMedia &&
               matchMedia('(prefers-reduced-motion: reduce)').matches;

  var animando = null;

  function frenar(){ animando = null; }
  ['wheel','touchstart','keydown'].forEach(function(ev){
    addEventListener(ev, frenar, { passive:true });
  });

  /* Suave al arrancar y al llegar, plano en el medio. */
  function curva(u){
    return u < .5 ? 4*u*u*u : 1 - Math.pow(-2*u + 2, 3) / 2;
  }

  function llevar(destino){
    var desde = window.scrollY || window.pageYOffset;
    var tope  = document.documentElement.scrollHeight - window.innerHeight;
    var hasta = Math.max(0, Math.min(tope, destino));
    var tramo = hasta - desde;
    if (!tramo) return;

    /* Entre medio segundo y segundo y medio, segun cuanto haya que
       recorrer: unos 0,55 ms por pixel. */
    var dura = Math.max(500, Math.min(1500, Math.abs(tramo) * 0.55));
    var yo = animando = {};
    var t0 = null;

    requestAnimationFrame(function paso(ts){
      if (animando !== yo) return;          /* alguien tomo el control */
      if (t0 === null) t0 = ts;
      var u = (ts - t0) / dura;
      if (u > 1) u = 1;
      window.scrollTo(0, desde + tramo * curva(u));
      if (u < 1) requestAnimationFrame(paso);
      else animando = null;
    });
  }

  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank') return;

    var href = a.getAttribute('href');
    /* Vale "#seccion" y tambien "/#seccion", que es como lo escriben
       el pie y el garage para poder apuntar aca desde otra pagina. */
    var m = /^\/?#(.+)$/.exec(href || '');
    if (!m) return;

    var destino = document.getElementById(m[1]);
    if (!destino) return;

    e.preventDefault();
    var y = destino.getBoundingClientRect().top + (window.scrollY || 0);

    if (quieto){ window.scrollTo(0, y); }
    else { llevar(y); }

    /* La direccion queda con el ancla, como en un salto normal, para
       que se pueda compartir y para que el boton de volver funcione.
       `replaceState` y no el hash directo: escribir location.hash
       provoca el salto instantaneo que estamos evitando. */
    if (history.replaceState) history.replaceState(null, '', '#' + m[1]);
  });
})();
