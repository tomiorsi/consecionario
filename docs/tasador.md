# El tasador de permutas

Cuánto ofrecer por el auto que un cliente quiere entregar.

## De dónde salió

Es **el tasador de Manna Motors, copiado tal cual**. Estos cuatro archivos
son byte por byte los de `MOTORS/manna-smart-forfour/src/`:

- `src/tasador.js` — el motor
- `src/generaciones.js` y `src/generaciones-datos.js` — qué años son el mismo auto
- `src/estado.js` — guardar con fecha de vencimiento (lo que lee de Mercado Libre)

**No se tocan acá.** Ya está tasando todos los días del otro lado y lo que
vale es que los dos den lo mismo. Si hay que corregir el cálculo, se corrige
en MOTORS y se vuelve a copiar entero:

```bash
cp ../MOTORS/manna-smart-forfour/src/{tasador,generaciones,generaciones-datos,estado}.js src/
```

## Cómo tasa

Resumido (el detalle está arriba de todo en `src/tasador.js`):

1. Hacen falta marca, modelo, año y km.
2. Lee de Mercado Libre los autos de ese modelo —mismo año, el anterior y el
   siguiente, si son de la misma generación— con km parecidos (±35%).
3. Los precios en pesos los pasa a dólares con el blue del cierre de ayer.
4. Haiku se queda con las publicaciones de la misma versión y caja, y lee la
   descripción de cada una descartando las que tienen algún problema
   (choque, GNC, deudas, precio de anticipo).
5. Sonnet controla las 6 que quedaron, mirando con lupa la más barata.
6. **Precio de mercado** = la más barata con km iguales o menores al del
   cliente. Si un auto igual se publica a ese precio, el suyo no vale más.
   Si la más barata está más de 15% por debajo de todas las demás, no la
   toma: es un aviso raro y se usa la siguiente.
7. **Oferta** = ese precio menos un porcentaje, que se cambia en el panel.

## Cómo funciona de punta a punta

1. El cliente cuenta qué auto tiene. El bot completa `auto_para_entregar`
   (marca, modelo, versión, caja, año, km, generación) y `auto_que_quiere`.
2. `pedirTasacion` anota el pedido en la tabla `tasaciones`. No calcula nada
   ahí: Meta espera pocos segundos por el webhook y esto tarda minutos.
3. **El reloj de cada minuto** (`* * * * *` en `wrangler.jsonc`) hace una
   cosa por vuelta: primero avisar una tasación terminada, si no, calcular
   una pendiente. Va solo porque una tasación usa casi las 50 consultas que
   Cloudflare permite por corrida.
4. `avisarTasacion` decide qué hacer: pedir el dato que falta, pasar la
   cotización, mandar la plantilla `cotizacion_lista` si ya pasaron las
   24 h de Meta, o dejarla para una persona si no se pudo.
5. Si quedó esperando, se la manda apenas el cliente vuelve a escribir
   (en `atenderSolo`).
6. Mientras WhatsApp está en cuarentena (hasta el 7/11) no sale la
   plantilla: la cotización queda esperando, igual que en Instagram y
   Messenger, que no tienen plantillas. Sale aunque el chat lo haya
   atendido el equipo, porque la pidió el equipo.

Lo que el cliente recibe es la **diferencia** contra el auto que quiere, no
el valor de su auto. Si nos lo vende sin comprar ninguno
(`vende_sin_comprar`), ahí sí se le dice cuánto le damos.

## El panel

En Bandeja, el botón **El tasador**: los porcentajes que se restan y la
lista de lo cotizado. Cada fila trae los links de las publicaciones con las
que se llegó al número, con ★ en la que fijó el precio. Un número sin su
origen no se puede discutir.

El tilde **"Mandarla sola al cliente"** es el que apaga todo: destildado, las
cotizaciones se calculan igual pero quedan para que las mire una persona.

## Las rutas

- `POST /api/admin/tasador/probar` — tasar un auto a mano, sin mandar nada.
- `GET /api/admin/tasador` — porcentajes y últimas tasaciones.
- `POST /api/admin/tasador/config` — cambiar los porcentajes.
- `PATCH /api/admin/tasaciones/:id` — descartar una.
- `POST /api/admin/tasaciones/pedir` — cotizar una charla de antes del tasador:
  `{chat, pedido: {marca, modelo, version, caja, anio, km}, auto_interes}`.
  Sin `auto_interes` no se pide: la cotización diría cuánto pagamos por su auto.

## Mercado Libre es un tercero desde el 2/11/2026

Un dato que llega por WhatsApp (el auto del cliente) sale hacia Mercado
Libre. Lo decidió Tomás el 2/11. Lo que viaja es un modelo con un rango de
km, sin nombre ni teléfono —la misma consulta que haría una persona del
equipo—, pero igual es un proveedor más y por eso:

- `/privacidad/` ya lo dice (actualizada el 2/11).
- `CLAUDE.md` ya lo dice.
- **Falta actualizar las respuestas en Meta.** Hasta que se haga, lo
  declarado y lo que hace el código no coinciden.

## La tabla

`esquema/013-tasador.sql`. La crea sola `asegurarTasaciones` en
`src/index.js` la primera vez que se usa el tasador.

`tasaciones.conversacion` **borra en cascada**: la tasación cuelga de la
charla, así que se va con ella cuando alguien pide que borremos sus datos o
cuando la limpieza anual se lleva la conversación. Es la misma regla que
`mensajes` y lo pide el punto 4 de `CLAUDE.md`.

Lo que lee de Mercado Libre se guarda en `estado` (claves `ml_lista:`,
`ml_modelos2:`, `dolar:`) con vencimiento de una semana. Son listados
públicos y la cotización del dólar: **ahí no va nada de ninguna persona**.
