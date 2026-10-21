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
/* El par compu / celular. Son pastillas y no otra fila de pestañas a
   proposito: las pestañas de arriba cambian de que se esta hablando
   —autos, imagenes, textos— y estas cambian el punto de vista sobre lo
   mismo. Dos filas de pestañas iguales se leerian como cuatro secciones
   sueltas. */
/* Envuelve: con dos pastillas entran siempre, pero los cuatro canales
   de la bandeja no entran en un celular y se salían de la pantalla. */
.pastillas{ display:flex; flex-wrap:wrap; gap:.4rem; margin:0 0 2rem }
.pastilla{
  border:1px solid var(--linea); border-radius:100px; background:transparent;
  color:var(--apagado); padding:.5em 1.2em; font-family:inherit; font-size:.56rem;
  font-weight:600; letter-spacing:.14em; text-transform:uppercase; cursor:pointer;
  transition:background .3s var(--ease), color .3s var(--ease), border-color .3s var(--ease);
}
.pastilla[aria-pressed="true"]{
  background:var(--chrome); color:var(--void); border-color:var(--chrome);
}

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
/* El aviso de "esta es una sola para las dos". Va con el borde a la
   izquierda y no en cursiva ni en otro color: es una advertencia sobre
   el alcance de lo que estas por hacer, no una nota al pie. */
.medio .compartida{
  border-left:2px solid var(--linea); padding-left:.6rem;
  font-size:.66rem; line-height:1.5; color:var(--apagado);
}
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

/* ── la bandeja ──
   Las conversaciones de WhatsApp, Instagram y Messenger.

   ACÁ SE VEN DATOS DE PERSONAS, así que la pantalla muestra lo mínimo
   que declaramos en /privacidad/: con quién se habla, por qué canal y
   qué se dijo. No hay lugar para nada más, y si alguna vez hiciera
   falta un dato de más, primero se cambia la política.

   El teléfono y el usuario se muestran —hay que poder reconocer a quien
   escribió— pero no viajan en ninguna dirección: la lista y el chat se
   navegan por el id interno. */
.bandeja{ display:grid; gap:.5rem; max-width:52rem }
/* Es un <button> y no un <div> con click: se abre con el teclado y el
   lector de pantalla lo anuncia como algo que se puede abrir. */
/* EL min-width:0 NO ES DECORATIVO: adentro de una grilla, una pieza no
   se achica por debajo de lo que mide su contenido, así que un nombre
   largo más la marca de "espera a una persona" empujaban la tarjeta
   fuera de la pantalla del celular en vez de cortarse. */
.chat{
  appearance:none; width:100%; min-width:0; font-family:inherit; color:inherit;
  border:1px solid var(--linea); border-radius:3px; background:var(--panel);
  padding:.8rem .95rem; display:grid; gap:.3rem; text-align:left; cursor:pointer;
  transition:border-color .3s var(--ease);
}
.chat:hover{ border-color:var(--chrome) }
.chat .arriba{ display:flex; align-items:baseline; gap:.6rem; min-width:0 }
/* Un span y no un h3: adentro de un <button> sólo entra texto, y un
   título ahí es HTML inválido aunque el navegador lo dibuje igual.

   Se corta en un renglón en vez de partirse en dos: en el celular, al
   lado de la marca de "espera a una persona", un nombre largo empujaba
   la fila al doble de alto y la lista se leía despareja. */
.chat .nombre{
  font-size:.82rem; font-weight:600; margin-right:auto; min-width:0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
/* El adelanto es una línea y se corta: la bandeja sirve para elegir a
   quién contestar, no para leer la conversación por encima. */
.chat .adelanto{
  font-size:.74rem; line-height:1.5; color:var(--apagado);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
/* COMENTARIO O PRIVADO. Va al lado del canal porque responde a lo
   mismo —por dónde llegó esto— pero es la distinción que más cambia
   qué hacer: un comentario lo lee cualquiera. */
.clase{
  font-size:.46rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
  border-radius:100px; padding:.3em .6em; white-space:nowrap;
  border:1px solid var(--linea); color:var(--apagado);
}
/* El público va marcado y el privado no: lo que necesita un cuidado
   extra es lo que se ve, y marcar los dos es no marcar ninguno. */
.clase--comentario{
  border-color:rgba(255,255,255,.4); color:var(--chrome);
}

/* De qué canal vino. Va en texto y no en un logo de colores porque son
   tres marcas ajenas y el panel es en blanco y negro. */
.canal{
  font-size:.46rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
  border:1px solid var(--linea); border-radius:100px; padding:.3em .6em;
  color:var(--apagado); white-space:nowrap;
}
.cuando{
  font-size:.56rem; letter-spacing:.1em; color:var(--apagado);
  font-variant-numeric:tabular-nums; white-space:nowrap;
}
/* LA MARCA DE "ACÁ CONTESTA UNA PERSONA". Va llena y no apagada a
   propósito: mientras está prendida la IA no responde, y eso es algo
   que tiene que saltar a la vista en la lista sin abrir el chat. */
.espera{
  background:var(--chrome); color:var(--void);
  font-size:.46rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
  padding:.3em .6em; border-radius:100px; white-space:nowrap;
}

/* ── un chat abierto ── */
.hilo{ display:grid; gap:.5rem; max-width:44rem; margin:1.8rem 0 0 }
.globo{
  border:1px solid var(--linea); border-radius:3px; background:var(--panel);
  padding:.65rem .8rem; display:grid; gap:.3rem; max-width:min(31rem,88%);
}
/* Lo que mandamos nosotros va a la derecha. Es la única señal de
   dirección que hay: no hay color que distinga, así que la posición
   tiene que alcanzar. */
.globo--saliente{ margin-left:auto; background:#101014 }
.globo p{ font-size:.82rem; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere }
/* Un mensaje que no es texto. No guardamos el archivo —solo que llegó y
   de qué tipo— así que esto dice exactamente eso y no finge una vista
   previa que no tenemos. */
.globo .adjunto{ font-size:.78rem; line-height:1.5; color:var(--apagado) }
/* QUIÉN ESCRIBIÓ Y CUÁNDO. Que diga "IA" cuando contestó la IA no es un
   detalle: nos comprometimos a que se pueda ver después quién respondió
   cada cosa. */
.globo .firma{
  display:flex; gap:.5rem; align-items:baseline;
  font-size:.46rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
  color:rgba(255,255,255,.34);
}
/* DE QUIÉN ES ESTA CONVERSACIÓN: el canal y el teléfono o usuario.
   Tiene el tamaño de un .rotulo pero NO va en mayúsculas: un usuario de
   Instagram en mayúsculas es otro texto del que escribió la persona, y
   un dato de contacto hay que poder leerlo tal como es para reconocerlo
   y para buscarlo cuando pide que lo borremos. */
.quien{
  font-size:.62rem; letter-spacing:.06em; color:var(--apagado);
  font-variant-numeric:tabular-nums;
}
.nota{
  border-left:2px solid var(--linea); padding-left:.7rem; margin:1.2rem 0 0;
  max-width:44rem; font-size:.74rem; line-height:1.6; color:var(--apagado);
}

/* ── contestar ──
   Va pegado abajo del hilo y no flotando: la conversación se lee de
   arriba abajo y el cuadro para escribir es el final de esa lectura,
   no un elemento aparte. */
.responder{
  display:grid; gap:.6rem; max-width:44rem; margin:1.4rem 0 0;
}
.responder textarea{
  width:100%; resize:vertical; min-height:4.4rem;
  background:var(--void); border:1px solid var(--linea); border-radius:3px;
  color:inherit; font:inherit; font-size:.85rem; line-height:1.6; padding:.7rem .8rem;
}
.responder textarea:focus{ outline:0; border-color:var(--chrome) }
.responder .pie{ display:flex; align-items:center; gap:.8rem; flex-wrap:wrap }
/* El aviso de las 24 horas. No es decorativo: pasado ese plazo Instagram
   rechaza el mensaje, y conviene saberlo ANTES de escribir tres
   renglones, no después de que falle el envío. */
.responder .plazo{
  font-size:.66rem; line-height:1.5; color:var(--apagado); margin-right:auto;
}

/* ── el embudo ──
   Hasta dónde llega la gente, por mes. Es una tabla y no un gráfico:
   son pocos números, y lo que importa es poder leer "de 40 visitas, 6
   cerraron" sin interpretar barras. */
.embudo{ max-width:52rem; margin:0 0 2.4rem; overflow-x:auto }
.embudo-cabeza{ display:flex; align-items:center; gap:.8rem; flex-wrap:wrap; margin-bottom:.9rem }
.embudo-cabeza input{ font:inherit; font-size:.74rem; padding:.35em .6em;
  background:var(--panel); color:var(--chrome); border:1px solid var(--linea); border-radius:3px }
.embudo table{ width:100%; border-collapse:collapse; font-size:.74rem; font-variant-numeric:tabular-nums }
.embudo th, .embudo td{ padding:.5rem .6rem; border-bottom:1px solid var(--linea); text-align:right; white-space:nowrap }
.embudo th:first-child, .embudo td:first-child{ text-align:left }
.embudo th{ font-size:.5rem; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--apagado) }
/* El porcentaje es contra el paso anterior, que es donde se ve la fuga. */
.embudo .pct{ display:block; font-size:.6rem; color:var(--apagado) }

/* LA MARCA DE LA ETAPA EN LA LISTA. Apagada a propósito: la que tiene
   que saltar a la vista es la de "espera a una persona". */
.etapa-marca{
  font-size:.46rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
  color:var(--apagado); white-space:nowrap;
}
.etapa-marca--perdido{ text-decoration:line-through }

/* Los mandos del embudo adentro de un chat. */
.marcar{ display:flex; gap:1rem 1.4rem; flex-wrap:wrap; align-items:end; margin:1.4rem 0 0; max-width:44rem }
.marcar select{ font:inherit; font-size:.78rem; padding:.4em .6em;
  background:var(--panel); color:var(--chrome); border:1px solid var(--linea); border-radius:3px }
.marcar label.tilde{ display:flex; gap:.45rem; align-items:center; font-size:.78rem }

/* ── los números de Instagram ──
   ══════════════════════════════════════════════════════════════════

   Tres bloques y en este orden: la cuenta, el público, las
   publicaciones. Es el orden en el que se pregunta —cómo vengo, a quién
   le llego, qué funcionó— y no el orden en el que la API los devuelve. */

.seccion-rotulo{
  font-family:var(--display); font-size:.72rem; font-weight:700;
  letter-spacing:.14em; text-transform:uppercase; color:var(--chrome);
  margin:2.6rem 0 1rem;
}
.seccion-rotulo:first-of-type{ margin-top:1.4rem }
.seccion-nota{
  margin:-.6rem 0 1.2rem; max-width:44rem;
  font-size:.72rem; line-height:1.6; color:var(--apagado);
}

/* LOS NÚMEROS GRANDES. Pocos y grandes: son los que se miran de reojo
   para saber si la semana viene bien. */
.cifras{
  display:grid; gap:.6rem;
  grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));
}
.cifra{
  border:1px solid var(--linea); border-radius:3px; background:var(--panel);
  padding:1rem 1.1rem; display:grid; gap:.3rem;
}
.cifra .n{
  font-family:var(--display); font-size:1.5rem; font-weight:700;
  letter-spacing:.02em; color:var(--chrome); font-variant-numeric:tabular-nums;
}
.cifra .q{
  font-size:.5rem; font-weight:700; letter-spacing:.16em;
  text-transform:uppercase; color:var(--apagado);
}

/* EL PÚBLICO, EN BARRAS Y NO EN TORTA. Lo que importa es comparar
   tramos entre sí —cuánto pesa 45-54 contra 25-34— y una barra se
   compara de un vistazo; una torta hay que descifrarla. */
.publico{ display:grid; gap:2rem; grid-template-columns:repeat(auto-fit,minmax(16rem,1fr)) }

/* LOS RANKINGS. Misma barra que el público: una sola serie, un solo
   color. Pintar cada barra de un tono distinto segun su largo seria
   decir dos veces lo mismo y gastar el unico canal libre que queda.

   DOS GRAFICOS Y NO UNO CON DOS ESCALAS. Envios y alcance se miden en
   ordenes distintos —decenas contra decenas de miles— y meterlos en un
   mismo eje inventa una relacion que no esta en los datos. */
.rankings{ display:grid; gap:2.4rem; grid-template-columns:repeat(auto-fit,minmax(18rem,1fr)) }
.ranking .barra-fila .arriba span:first-child{
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:14rem;
}
.publico h3{
  font-size:.5rem; font-weight:700; letter-spacing:.16em;
  text-transform:uppercase; color:var(--apagado); margin:0 0 .8rem;
}
.barra-fila{ display:grid; gap:.35rem; margin-bottom:.6rem }
.barra-fila .arriba{
  display:flex; justify-content:space-between; gap:.8rem;
  font-size:.72rem; color:var(--chrome);
}
.barra-fila .arriba b{ font-weight:600; font-variant-numeric:tabular-nums; color:var(--apagado) }
/* EL display:block EN LOS DOS NO ES DECORATIVO. Son <span>, o sea
   elementos en línea, y a un elemento en línea el alto y el ancho no le
   aplican: la barra existía en el marcado y no se dibujaba. El riel se
   salvaba por ser hijo de una grilla; el relleno no. */
.barra-riel{
  display:block; height:4px; background:rgba(255,255,255,.07);
  border-radius:100px; overflow:hidden;
}
.barra-fill{ display:block; height:100%; background:var(--chrome); border-radius:100px }

/* LA TABLA DE PUBLICACIONES.
   Tabla y no tarjetas: son veinte filas de los mismos siete números, y
   lo que se hace con eso es COMPARAR. En tarjetas, comparar la columna
   de envíos entre dos reels obliga a buscarla en cada una. */
.tabla-envoltura{ overflow-x:auto; margin-top:.4rem }
.tabla{ width:100%; border-collapse:collapse; min-width:46rem }
.tabla th{
  text-align:right; padding:.5rem .6rem; border-bottom:1px solid var(--linea);
  font-size:.46rem; font-weight:700; letter-spacing:.14em;
  text-transform:uppercase; color:var(--apagado); white-space:nowrap;
}
.tabla th:first-child{ text-align:left }
/* La tabla se ordena por la columna que toques. Viene por fecha, que es
   como uno la lee, pero la pregunta real suele ser "cual anduvo mejor"
   y eso es ordenar por envios. */
.tabla th[data-orden]{ cursor:pointer; user-select:none }
.tabla th[data-orden]:hover{ color:var(--chrome) }
.tabla th[aria-sort]{ color:var(--chrome) }
.tabla td{
  padding:.7rem .6rem; border-bottom:1px solid rgba(255,255,255,.06);
  text-align:right; font-size:.8rem; font-variant-numeric:tabular-nums;
  color:var(--chrome); white-space:nowrap;
}
.tabla td:first-child{ text-align:left; white-space:normal }
.tabla tr:hover td{ background:rgba(255,255,255,.025) }
/* Un número que no vino no es un cero: es que Instagram no lo da para
   ese tipo de publicación. Se dibuja distinto para no leerlo mal. */
.tabla .nada{ color:rgba(255,255,255,.2) }

/* LOS ENVÍOS VAN DESTACADOS. De todas las columnas, es la que decide a
   quién le llega el reel — y es la que nadie mira. */
.tabla .envios{ color:var(--chrome); font-weight:600 }
.tabla th.envios{ color:var(--chrome) }

.pieza{ display:flex; align-items:center; gap:.7rem; min-width:16rem }
.pieza img,
.pieza .sinfoto{
  width:3rem; height:3rem; object-fit:cover; border-radius:3px;
  background:#08080a; flex:none; border:1px solid var(--linea);
}
.pieza .texto{ display:grid; gap:.2rem; min-width:0 }
.pieza .texto a{
  color:var(--chrome); text-decoration:none; font-size:.76rem; line-height:1.35;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
  overflow:hidden;
}
.pieza .texto a:hover{ text-decoration:underline }
.pieza .texto small{ font-size:.56rem; letter-spacing:.1em; color:var(--apagado) }

/* ── la barra de progreso ──
   Lo que tarda tiene que decir que esta trabajando y cuanto falta. Una
   pantalla quieta diez segundos se lee como rota, y el que mira
   recarga o aprieta de nuevo — que es justo lo que no hay que hacer. */
.barra-estado{ display:grid; gap:.45rem; max-width:30rem; margin:0 0 1.4rem }
.barra-estado-texto{
  font-size:.56rem; font-weight:600; letter-spacing:.14em;
  text-transform:uppercase; color:var(--apagado);
}
.barra-estado .barra-fill{ transition:width .4s var(--ease) }
/* De cuando es lo que se esta viendo. Un dato viejo a la vista le gana
   a uno nuevo dentro de quince segundos, pero solo si dice su fecha. */
.leido{
  font-size:.56rem; letter-spacing:.1em; color:var(--apagado);
  margin:-.6rem 0 1.4rem;
}

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
        <button class="pestania" type="button" id="pesBandeja" aria-pressed="false">Mensajes</button>
        <button class="pestania" type="button" id="pesNumeros" aria-pressed="false">Instagram</button>
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
        aparecen. Casi todas se ven con una forma distinta en la compu y
        en el celular —el fondo del collage es apaisado en una y vertical
        en la otra— así que cada pantalla lleva su propio archivo:
        elegí cuál estás cambiando acá abajo. Debajo de cada una dice qué
        forma le queda mejor. El video del collage además admite .mp4.
      </p>

      <div class="pastillas" id="pantallas">
        <button class="pastilla" type="button" data-pantalla="compu" aria-pressed="true">Computadora</button>
        <button class="pastilla" type="button" data-pantalla="celular" aria-pressed="false">Celular</button>
      </div>
      <div class="medios" id="medios"></div>
      <input type="file" id="archivoMedio" accept="image/*" hidden>
    </section>

    <!-- LOS NUMEROS DE INSTAGRAM.
         Tres bloques, en el orden en que uno pregunta: como vengo, a
         quien le llego, que funciono. No en el orden en que la API los
         devuelve. -->
    <section id="zonaNumeros" class="oculto">
      <p class="aclara">
        Lo que Instagram sabe de la cuenta, leido directo de su API.
        Tarda unos segundos: son muchas consultas, una por publicacion.
      </p>

      <div class="barra-estado oculto" id="progresoNum">
        <span class="barra-estado-texto" id="progresoNumTexto"></span>
        <span class="barra-riel"><span class="barra-fill" id="progresoNumFill" style="width:0%"></span></span>
      </div>
      <p class="leido oculto" id="leidoNum"></p>

      <h2 class="seccion-rotulo">La cuenta</h2>
      <div class="cifras" id="cifras"></div>

      <h2 class="seccion-rotulo">Tu publico</h2>
      <p class="seccion-nota">
        Quienes te siguen. Es contra esto que se mide si un reel le llego
        a quien tenia que llegarle.
      </p>
      <div class="publico" id="publico"></div>

      <h2 class="seccion-rotulo">Que anduvo mejor</h2>
      <p class="seccion-nota">
        Las diez mejores de cada cosa. Son dos graficos y no uno porque
        envios y alcance se cuentan en ordenes distintos: juntarlos en un
        mismo eje inventaria una relacion que no existe.
      </p>
      <div class="rankings" id="rankings"></div>

      <h2 class="seccion-rotulo">Las publicaciones</h2>
      <p class="seccion-nota">
        De todas las columnas, mira <strong>envios</strong>: es la que
        decide a quien le llega el reel, y es la que nadie mira. Las
        celdas apagadas son metricas que Instagram no da para ese tipo de
        publicacion, no ceros.
      </p>
      <div class="tabla-envoltura">
        <table class="tabla" id="tablaMedia"></table>
      </div>
      <div class="vacio oculto" id="sinNumeros">No se pudieron leer las estadisticas.</div>
    </section>

    <!-- LOS MENSAJES DE WHATSAPP, INSTAGRAM Y MESSENGER -->
    <section id="zonaBandeja" class="oculto">
      <!-- SIN EXPLICACION NI FILTROS NI EMBUDO.
           Esto era una parrafada, cuatro pastillas de canal y una tabla
           de embudo. Se fue todo: lo unico que se hace en esta pantalla
           es leer lo que entro y contestarlo, y cada cosa de mas en el
           camino es una cosa de mas que leer antes de llegar ahi.

           El embudo se saco porque medía un pedazo: las ventas se
           cierran por WhatsApp, asi que contar etapas sobre lo que pasa
           en Instagram daba un numero que parecia el embudo y no lo era.
           Un dato parcial leido como total confunde mas que no tenerlo.

           Y el boton de traer el historial tambien: lo nuevo entra solo
           por el webhook y lo viejo se trae por detras sin que nadie
           apriete nada. -->

      <div class="barra-estado oculto" id="progreso">
        <span class="barra-estado-texto" id="progresoTexto"></span>
        <span class="barra-riel"><span class="barra-fill" id="progresoFill" style="width:0%"></span></span>
      </div>

      <div class="bandeja" id="chats"></div>
      <div class="vacio oculto" id="sinChats">Todavía no entró ningún mensaje.</div>

      <!-- EL BORRADO A PEDIDO.
           Está acá y no escondido en la ficha de cada chat porque el
           pedido llega por afuera —alguien escribe pidiendo que borremos
           sus datos— y hay que poder cumplirlo buscando por telefono o
           usuario, sin tener que encontrar primero la conversación. -->
      <p class="nota">
        Si alguien pide que borremos sus datos, hay diez días hábiles
        para hacerlo. Se borra todo lo que tengamos de esa persona en los
        tres canales, y no se puede deshacer.
      </p>
      <div style="margin-top:.9rem">
        <button class="btn btn--peligro" id="olvidar" type="button">Borrar los datos de una persona</button>
      </div>
    </section>
  </main>

  <!-- FICHA -->
  <main class="hoja oculto" id="vistaFicha">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <h1 class="titulo" id="tituloFicha">Auto nuevo</h1>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn" id="volver" type="button">Volver</button>
        <!-- LA DIRECCION DE ESTE AUTO, PARA MANDARLA POR WHATSAPP. Solo
             aparece cuando el auto ya existe y esta publicado o vendido:
             la de un borrador no lleva a ningun lado todavia. -->
        <button class="btn oculto" id="copiarLink" type="button">Copiar link</button>
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

  <!-- UNA CONVERSACIÓN -->
  <main class="hoja oculto" id="vistaChat">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <div>
        <h1 class="titulo" id="tituloChat">Conversación</h1>
        <!-- El canal y el teléfono o usuario. Van acá, en el cuerpo de la
             página, y nunca en la dirección: la URL de este chat es su
             id interno y nada más. -->
        <p class="quien" id="quienChat" style="margin-top:.5rem"></p>
      </div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn" id="volverChat" type="button">Volver</button>
        <button class="btn" id="aHumano" type="button">Que siga una persona</button>
        <button class="btn btn--peligro" id="borrarChat" type="button">Borrar</button>
      </div>
    </div>

    <!-- HASTA DÓNDE LLEGÓ. La etapa es la más alta que alcanzó y no se
         baja si después se enfría: para eso está "se perdió". -->
    <div class="marcar">
      <label class="campo"><span class="rotulo">Qué vino a hacer</span>
        <select id="tipoChat">
          <option value="">Sin marcar</option>
          <option value="comprador">Comprar</option>
          <option value="vendedor">Vender su auto</option>
          <option value="permuta">Cambiar el suyo</option>
          <option value="ruido">Ruido</option>
        </select></label>
      <label class="campo"><span class="rotulo">Hasta dónde llegó</span>
        <select id="etapaChat">
          <option value="">Sin marcar</option>
          <option value="consulta">Consultó</option>
          <option value="charla">Charla real</option>
          <option value="precio">Tiene el número por escrito</option>
          <option value="visita">Visita agendada</option>
          <option value="vino">Vino al salón</option>
          <option value="cerrado">Cerró (seña o consignación)</option>
        </select></label>
      <label class="tilde"><input type="checkbox" id="perdidoChat"> Se perdió</label>
    </div>

    <p class="nota oculto" id="notaChat"></p>
    <div class="hilo" id="hilo"></div>

    <!-- CONTESTAR. Sólo aparece en Instagram: es el único canal con el
         envío programado. En WhatsApp y Messenger el cuadro no se
         muestra, en vez de mostrarlo y fallar al apretar. -->
    <form class="responder oculto" id="responder" autocomplete="off">
      <textarea id="respuesta" rows="3"
                placeholder="Escribí tu respuesta"></textarea>
      <div class="pie">
        <span class="plazo" id="plazo"></span>
        <button class="btn btn--fuerte" type="submit" id="enviar">Enviar</button>
      </div>
    </form>
  </main>
</div>

<div class="aviso" id="aviso"></div>
<script src="/admin/panel.js"></script>
</body>
</html>`;
