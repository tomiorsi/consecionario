/* EL PANEL.
   ══════════════════════════════════════════════════════════════════

   Va acá adentro y no en public/ por un motivo concreto: todo lo que
   cae en public/ es un archivo estático que Cloudflare sirve sin pasar
   por código, así que no habría forma de exigirle sesión ni de avisar
   cuando faltan los secretos. Desde el Worker, /admin es una respuesta
   como cualquier otra.

   No usa ningún framework. Son tres pantallas —entrar, la lista y la
   ficha— y meter un framework para eso sería sumar un paso de build a un
   proyecto que hoy no tiene ninguno. */

export const PANEL = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Panel · Manna Motors Selected</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Syncopate:wght@400;700&family=Montserrat:wght@300..800&display=swap" rel="stylesheet">
<style>
:root{
  --void:#000; --chrome:#fff;
  --linea:rgba(255,255,255,.14);
  --apagado:rgba(255,255,255,.55);
  --panel:#0a0a0c;
  --ease:cubic-bezier(.22,1,.36,1);
  --display:"Syncopate",ui-sans-serif,system-ui,sans-serif;
  --texto:"Montserrat",ui-sans-serif,system-ui,sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box}
body{
  background:var(--void); color:var(--chrome);
  font-family:var(--texto); -webkit-font-smoothing:antialiased;
  min-height:100svh;
}
a{color:inherit}
.rotulo{
  font-size:.55rem; font-weight:600; letter-spacing:.26em;
  text-transform:uppercase; color:var(--apagado);
}

/* ── barra ── */
.barra{
  position:sticky; top:0; z-index:10;
  display:flex; align-items:center; justify-content:space-between; gap:1rem;
  padding:1rem clamp(1rem,4vw,2.5rem);
  background:rgba(0,0,0,.86); backdrop-filter:blur(14px);
  border-bottom:1px solid var(--linea);
}
.barra img{ height:34px; width:auto; display:block }
.barra .der{ display:flex; align-items:center; gap:.6rem }

/* ── botones ── */
button{ font-family:inherit; cursor:pointer }
.btn{
  appearance:none; border:1px solid var(--linea); border-radius:2px;
  background:transparent; color:var(--chrome);
  padding:.7em 1.3em; font-size:.58rem; font-weight:600;
  letter-spacing:.18em; text-transform:uppercase;
  transition:border-color .3s var(--ease), background .3s var(--ease);
}
.btn:hover{ border-color:rgba(255,255,255,.5); background:rgba(255,255,255,.05) }
.btn--fuerte{ background:var(--chrome); color:var(--void); border-color:var(--chrome) }
.btn--fuerte:hover{ background:rgba(255,255,255,.85) }
.btn--peligro:hover{ border-color:#ff6b6b; color:#ff8a8a; background:rgba(255,80,80,.08) }
.btn[disabled]{ opacity:.4; cursor:not-allowed }

/* ── entrar ── */
.entrar{
  min-height:100svh; display:grid; place-content:center;
  gap:1.1rem; padding:2rem; text-align:center;
}
.entrar img{ width:132px; margin:0 auto 1rem }

input,select,textarea{
  width:100%; font-family:inherit; font-size:.9rem; color:var(--chrome);
  background:transparent; border:0; border-bottom:1px solid var(--linea);
  padding:.65rem .1rem; transition:border-color .3s var(--ease);
}
input:focus,select:focus,textarea:focus{ outline:none; border-bottom-color:var(--chrome) }
input::placeholder,textarea::placeholder{ color:rgba(255,255,255,.28) }
select option{ background:#111; color:#fff }
textarea{ resize:vertical; min-height:6rem; line-height:1.6 }

/* ── contenido ── */
.hoja{ padding:clamp(1.2rem,4vw,2.5rem); max-width:74rem; margin:0 auto }
.titulo{
  font-family:var(--display); font-size:clamp(.9rem,2vw,1.15rem);
  font-weight:700; letter-spacing:.06em; text-transform:uppercase;
}

/* ── pestañas ── */
.pestanias{ display:flex; gap:.3rem }
.pestania{
  appearance:none; border:0; border-bottom:1px solid transparent; background:transparent;
  color:var(--apagado); padding:.4em .2em; margin-right:1rem;
  font-family:var(--display); font-size:.72rem; font-weight:700;
  letter-spacing:.06em; text-transform:uppercase;
  transition:color .3s var(--ease), border-color .3s var(--ease);
}
.pestania[aria-pressed="true"]{ color:var(--chrome); border-bottom-color:var(--chrome) }
.pestania:hover{ color:var(--chrome) }

.aclara{
  margin:1.4rem 0 1.2rem; max-width:44rem;
  font-size:.8rem; line-height:1.7; color:var(--apagado);
}

/* ── las imágenes fijas ── */
.medios{ display:grid; gap:2.6rem }
.grupo-titulo{
  font-family:var(--display); font-size:.72rem; font-weight:700;
  letter-spacing:.14em; text-transform:uppercase; color:var(--chrome);
}
.grupo-nota{
  margin:.45rem 0 1rem; max-width:40rem;
  font-size:.72rem; line-height:1.6; color:var(--apagado);
}
.grupo-fotos{ display:grid; gap:.9rem; grid-template-columns:repeat(auto-fill,minmax(14rem,1fr)) }
.medio{
  border:1px solid var(--linea); border-radius:3px; overflow:hidden;
  background:var(--panel); display:flex; flex-direction:column;
}
/* Alto fijo y no aspect-ratio del lugar: como los lugares cambian de
   forma según la pantalla, la miniatura acá es sólo para reconocer la
   foto, no para prometer cómo se va a recortar. */
.medio .marco{ position:relative; height:9rem; background:#08080a; overflow:hidden }
.medio .marco img,
.medio .marco video{ width:100%; height:100%; object-fit:cover; display:block }
/* La pieza estira y los botones se van al fondo: las guías tienen
   largos distintos y sin esto cada "Cambiar" queda a una altura
   distinta, que se lee como si las tarjetas estuvieran desalineadas. */
.medio .pieza{
  padding:.75rem .85rem .9rem; display:flex; flex-direction:column; gap:.5rem;
  flex:1;
}
.medio h3{ font-size:.8rem; font-weight:600; line-height:1.3 }
/* La guía de qué forma entra mejor. Es una frase y no unos números
   porque ninguno de estos lugares tiene una sola forma: el fondo del
   collage es apaisado en la compu y vertical en el celular, y decir
   "3:2" ahí sería mentir. */
.medio .formato{
  font-size:.68rem; line-height:1.5; color:var(--apagado);
}
.medio .mandos{ display:flex; gap:.4rem; margin-top:auto; padding-top:.35rem }
.medio .btn{ padding:.55em .9em; font-size:.5rem; flex:1 }
.propia{
  position:absolute; left:.4rem; top:.4rem;
  background:var(--chrome); color:var(--void);
  font-size:.44rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
  padding:.3em .6em; border-radius:100px;
}

/* ── MODO ORDENAR ──
   El temblor del iPhone. Es un giro de menos de un grado: mas que eso
   marea y se lee como un error de la pagina en vez de como "esto se
   puede mover".

   El desfase entre tarjetas lo pone el JS con animation-delay negativo,
   que arranca la animacion ya empezada en vez de esperar. */
@keyframes tiembla{
  0%,100%{ transform:rotate(-.5deg) }
  50%    { transform:rotate(.5deg) }
}
.grilla.ordenando .ficha{
  animation:tiembla .32s var(--ease) infinite;
  cursor:grab;
}
.grilla.ordenando .ficha.viajando{ opacity:.3; animation:none }
.grilla.ordenando .ficha.destino{
  outline:2px solid var(--chrome); outline-offset:3px; animation:none;
}
/* Mientras se ordena no se abre nada: la foto y el texto no deben
   tragarse el arrastre ni mostrar el cursor de mano. */
.grilla.ordenando .ficha *{ pointer-events:none }

@media (prefers-reduced-motion:reduce){
  .grilla.ordenando .ficha{ animation:none; outline:1px dashed var(--linea) }
}

/* ── los textos editables ── */
.textos{ display:grid; gap:1.4rem; max-width:44rem }
.texto{
  border:1px solid var(--linea); border-radius:3px;
  background:var(--panel); padding:1rem 1.1rem 1.1rem; display:grid; gap:.55rem;
}
.texto h3{ font-size:.8rem; font-weight:600 }
.texto .pista{ font-size:.7rem; color:var(--apagado); line-height:1.5 }
.texto textarea{
  width:100%; resize:vertical; min-height:4.2rem;
  background:var(--void); border:1px solid var(--linea); border-radius:3px;
  color:inherit; font:inherit; font-size:.82rem; line-height:1.6; padding:.6rem .7rem;
}
.texto textarea:focus{ outline:0; border-color:var(--chrome) }
.texto .pie{ display:flex; align-items:center; gap:.6rem; flex-wrap:wrap }
/* El contador va con tabular-nums porque cambia con cada tecla: sin
   eso el número baila de ancho y se lee como un parpadeo. */
.texto .cuenta{
  font-family:var(--mono); font-size:.56rem; letter-spacing:.1em;
  color:var(--apagado); font-variant-numeric:tabular-nums; margin-right:auto;
}
.texto .cuenta[data-pasado="si"]{ color:var(--alerta) }
.texto .btn{ padding:.55em 1.1em; font-size:.5rem }

/* ── lista ── */
.filtros{ display:flex; flex-wrap:wrap; gap:.4rem; margin:1.4rem 0 }
.chip{
  border:1px solid var(--linea); border-radius:100px; background:transparent;
  color:var(--apagado); padding:.45em 1em; font-size:.56rem;
  font-weight:600; letter-spacing:.14em; text-transform:uppercase;
}
.chip[aria-pressed="true"]{ background:var(--chrome); color:var(--void); border-color:var(--chrome) }

.grilla{ display:grid; gap:.8rem; grid-template-columns:repeat(auto-fill,minmax(15rem,1fr)) }
.ficha{
  border:1px solid var(--linea); border-radius:3px; overflow:hidden;
  background:var(--panel); display:flex; flex-direction:column;
  transition:border-color .3s var(--ease);
}
.ficha:hover{ border-color:rgba(255,255,255,.32) }
.ficha .foto{ aspect-ratio:16/10; background:#08080a; position:relative }
.ficha .foto img{ width:100%; height:100%; object-fit:cover; display:block }
.ficha .foto .vacia{
  position:absolute; inset:0; display:grid; place-content:center;
  color:rgba(255,255,255,.2); font-size:.6rem; letter-spacing:.2em; text-transform:uppercase;
}
.ficha .cuerpo{ padding:.9rem 1rem 1rem; display:grid; gap:.35rem }
.ficha h3{ font-size:.92rem; font-weight:600; line-height:1.35 }
.ficha .dato{ font-size:.74rem; color:var(--apagado) }
.ficha .pie{ display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-top:.5rem }

.estado{
  font-size:.5rem; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
  padding:.32em .7em; border-radius:100px; border:1px solid;
}
.estado--publicado{ color:#7ee39b; border-color:rgba(126,227,155,.4) }
.estado--borrador{ color:#e3c97e; border-color:rgba(227,201,126,.4) }
.estado--vendido{ color:rgba(255,255,255,.45); border-color:var(--linea) }

/* ── ficha de edición ── */
.campos{ display:grid; gap:1.4rem 1.6rem; grid-template-columns:repeat(auto-fit,minmax(11rem,1fr)); margin-top:1.6rem }
.campo{ display:grid; gap:.4rem }
.ancho{ grid-column:1 / -1 }

.fotos{ display:grid; gap:.7rem; grid-template-columns:repeat(auto-fill,minmax(9rem,1fr)); margin-top:1rem }
.miniatura{ position:relative; aspect-ratio:16/10; border:1px solid var(--linea); border-radius:3px; overflow:hidden; background:#08080a }
.miniatura img{ width:100%; height:100%; object-fit:cover; display:block }
.miniatura .portada{
  position:absolute; left:.4rem; top:.4rem; background:var(--chrome); color:var(--void);
  font-size:.46rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
  padding:.28em .6em; border-radius:100px;
}
.miniatura .mandos{ position:absolute; right:.4rem; bottom:.4rem; display:flex; gap:.3rem }
.mini-btn{
  width:1.7rem; height:1.7rem; display:grid; place-content:center;
  border:0; border-radius:3px; background:rgba(0,0,0,.7); color:#fff; font-size:.8rem;
}
.mini-btn:hover{ background:rgba(0,0,0,.9) }

/* EL MAS ES UNA BALDOSA MAS DE LA GRILLA, no una caja aparte debajo.
   Asi el lugar donde se agregan fotos es el mismo lugar donde estan las
   fotos, y la grilla no cambia de forma cuando se sube la primera. */
.mas{
  display:grid; place-content:center; gap:.4rem;
  aspect-ratio:16/10; border:1px dashed var(--linea); border-radius:3px;
  background:transparent; color:var(--apagado); cursor:pointer;
  font-family:inherit; font-size:.58rem; letter-spacing:.14em; text-transform:uppercase;
  transition:border-color .3s var(--ease), color .3s var(--ease), background .3s var(--ease);
}
.mas span{ font-size:1.6rem; line-height:1; font-weight:300 }
.mas:hover,.mas.encima{ border-color:var(--chrome); color:var(--chrome); background:rgba(255,255,255,.04) }

/* Mientras se arrastra: la que viaja se apaga y la de destino marca el
   borde, que es lo que dice donde va a caer. */
.miniatura{ cursor:grab }
.miniatura.viajando{ opacity:.3 }
.miniatura.destino{ outline:2px solid var(--chrome); outline-offset:2px }

/* LA QUE TODAVIA NO SUBIO NO SE MARCA. Tenia un cartel "Sin subir"
   encima y sobraba: la foto se ve, se puede arrastrar y se puede quitar
   igual que las demas, y el unico momento en que no esta subida es el
   rato entre elegirla y apretar Guardar. El cartel no pedia hacer nada
   —la subida ya pasa sola al guardar— y quedaba tapando la foto. */

/* LA BALDOSA QUE TODAVIA ESTA TRABAJANDO.

   Aparece en el instante en que se eligen los archivos, una por foto y
   antes de procesar ninguna. Eso es lo que contesta la pregunta de
   "¿agarro o no agarro?": se ven seis huecos apenas se sueltan seis
   fotos, aunque la primera tarde un segundo en aparecer.

   El giro es un borde con un solo lado claro. No hay imagen ni SVG: es
   la unica forma de que no sume un pedido mas justo cuando la conexion
   esta ocupada subiendo. */
.miniatura.cargando{
  display:grid; place-content:center; gap:.5rem;
  background:#0c0c0f; cursor:default;
}
.giro{
  width:1.5rem; height:1.5rem; border-radius:50%;
  border:2px solid rgba(255,255,255,.16);
  border-top-color:var(--chrome);
  animation:girar .8s linear infinite;
  margin:0 auto;
}
@keyframes girar{ to{ transform:rotate(360deg) } }
.miniatura .archivo{
  max-width:100%; padding:0 .5rem; text-align:center;
  font-size:.5rem; letter-spacing:.08em; color:var(--apagado);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
@media (prefers-reduced-motion:reduce){ .giro{ animation-duration:2.4s } }

/* El mas se apaga mientras hay fotos en curso: elegir otra tanda arriba
   de una que todavia no termino confunde la cuenta. */
.mas[disabled]{ opacity:.35; cursor:not-allowed }

.aviso{
  position:fixed; left:50%; bottom:1.4rem; transform:translateX(-50%);
  background:var(--chrome); color:var(--void); border-radius:3px;
  padding:.7em 1.3em; font-size:.62rem; font-weight:600;
  letter-spacing:.1em; text-transform:uppercase; z-index:50;
  opacity:0; pointer-events:none; transition:opacity .3s var(--ease);
}
.aviso.se-ve{ opacity:1 }
.aviso.mal{ background:#ff6b6b; color:#fff }

.oculto{ display:none !important }
.vacio{ padding:4rem 1rem; text-align:center; color:var(--apagado); font-size:.85rem }
</style>
</head>
<body>

<!-- ENTRAR -->
<section class="entrar" id="pantallaEntrar">
  <img src="/assets/logo/logo-apilado-blanco.svg" alt="Manna Motors Selected">
  <p class="rotulo">Panel de administración</p>
  <form id="formEntrar" style="display:grid;gap:1.2rem;width:min(20rem,84vw);margin:0 auto">
    <input type="password" id="clave" placeholder="Contraseña" autocomplete="current-password" required>
    <button class="btn btn--fuerte" type="submit">Entrar</button>
  </form>
</section>

<!-- PANEL -->
<div id="pantallaPanel" class="oculto">
  <header class="barra">
    <img src="/assets/logo/logo-horizontal-blanco.svg" alt="Manna Motors Selected">
    <div class="der">
      <button class="btn" id="verSitio" type="button">Ver el sitio</button>
      <button class="btn" id="salir" type="button">Salir</button>
    </div>
  </header>

  <!-- LISTA -->
  <main class="hoja" id="vistaLista">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <div class="pestanias">
        <button class="pestania" type="button" id="pesAutos" aria-pressed="true">Autos</button>
        <button class="pestania" type="button" id="pesMedios" aria-pressed="false">Imágenes del sitio</button>
        <button class="pestania" type="button" id="pesTextos" aria-pressed="false">Textos</button>
      </div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn" id="ordenar" type="button">Ordenar</button>
        <button class="btn oculto" id="cancelarOrden" type="button">Cancelar</button>
        <button class="btn btn--fuerte oculto" id="guardarOrden" type="button">Guardar orden</button>
        <button class="btn btn--fuerte" id="nuevo" type="button">Cargar un auto</button>
      </div>
    </div>
    <div class="filtros" id="filtros"></div>
    <div class="grilla" id="grilla"></div>
    <div class="vacio oculto" id="sinAutos">Todavía no hay autos cargados.</div>

    <!-- LAS IMÁGENES FIJAS DE LA HOME -->
    <section id="zonaMedios" class="oculto">
      <p class="aclara">
        Las fotos fijas de la página de inicio, en el orden en el que
        aparecen. Se suben enteras y la página recorta lo que le sobra en
        cada pantalla, así que entra cualquier formato — 16:9 incluido.
        Debajo de cada una dice qué forma le queda mejor.
        El fondo del collage además admite un video .mp4.
      </p>
      <div class="medios" id="medios"></div>
      <input type="file" id="archivoMedio" accept="image/*" hidden>
    </section>

    <!-- LOS TEXTOS EDITABLES -->
    <section id="zonaTextos" class="oculto">
      <p class="aclara">
        El titular y la bajada de la nota de la página de inicio. Si
        dejás un campo vacío y guardás, vuelve al texto original.
      </p>
      <div class="textos" id="textos"></div>
    </section>
  </main>

  <!-- FICHA -->
  <main class="hoja oculto" id="vistaFicha">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <h1 class="titulo" id="tituloFicha">Auto nuevo</h1>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn" id="volver" type="button">Volver</button>
        <button class="btn btn--peligro oculto" id="borrar" type="button">Borrar</button>
        <button class="btn btn--fuerte" id="guardar" type="button">Guardar</button>
      </div>
    </div>

    <form id="formAuto" class="campos" autocomplete="off">
      <label class="campo"><span class="rotulo">Grupo</span>
        <select name="grupo" required>
          <option value="alta-gama">Alta Gama</option>
          <option value="evolution">Línea Evolution</option>
          <option value="deportivos">Deportivos</option>
          <option value="urbanos">Urbanos</option>
        </select></label>
      <label class="campo"><span class="rotulo">Estado</span>
        <select name="estado">
          <option value="borrador">Borrador</option>
          <option value="publicado">Publicado</option>
          <option value="vendido">Vendido</option>
        </select></label>
      <label class="campo"><span class="rotulo">Marca</span>
        <input name="marca" placeholder="Mercedes-Benz" required></label>
      <label class="campo"><span class="rotulo">Modelo</span>
        <input name="modelo" placeholder="AMG GLE 63 Coupé" required></label>
      <label class="campo"><span class="rotulo">Año</span>
        <input name="anio" type="number" inputmode="numeric" placeholder="2023"></label>
      <label class="campo"><span class="rotulo">Kilómetros</span>
        <input name="km" type="number" inputmode="numeric" placeholder="18000"></label>
      <label class="campo"><span class="rotulo">Precio</span>
        <input name="precio" type="number" inputmode="numeric" placeholder="95000"></label>
      <label class="campo"><span class="rotulo">Moneda</span>
        <select name="moneda"><option value="USD">USD</option><option value="ARS">ARS</option></select></label>
      <label class="campo"><span class="rotulo">Motor</span>
        <input name="motor" placeholder="4.0 V8 biturbo"></label>
      <label class="campo"><span class="rotulo">Transmisión</span>
        <input name="transmision" placeholder="Automática 9G"></label>
      <label class="campo"><span class="rotulo">Combustible</span>
        <input name="combustible" placeholder="Nafta"></label>
      <label class="campo"><span class="rotulo">Color</span>
        <input name="color" placeholder="Blanco"></label>
      <label class="campo ancho"><span class="rotulo">Descripción</span>
        <textarea name="descripcion" placeholder="Historia, service, detalles."></textarea></label>
    </form>

    <section style="margin-top:2.4rem" id="zonaFotos">
      <div style="display:flex;align-items:baseline;gap:.8rem;flex-wrap:wrap">
        <h2 class="rotulo">Fotos</h2>
        <span class="rotulo" style="color:rgba(255,255,255,.32);letter-spacing:.1em">
          Arrastralas para cambiar el orden · la primera es la portada
        </span>
      </div>
      <div class="fotos" id="fotos"></div>
      <input type="file" id="archivo" accept="image/*" multiple hidden>
    </section>
  </main>
</div>

<div class="aviso" id="aviso"></div>
<script src="/admin/panel.js"></script>
</body>
</html>`;
