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

## Qué está conectado y qué no

Conectado:

- `POST /api/admin/tasador/probar` — tasar un auto a mano. **No manda nada.**
  Devuelve el número y con qué publicaciones llegó.
- `GET /api/admin/tasador` — los porcentajes y las últimas tasaciones.
- `POST /api/admin/tasador/config` — cambiar los porcentajes.
- `PATCH /api/admin/tasaciones/:id` — descartar una.

**No conectado todavía: que el bot cotice solo.** Falta y es una decisión, no
un olvido:

- Hoy `src/instrucciones.js` dice lo contrario —"en permuta no le ponemos
  precio a su auto", la diferencia la pasa Maxi (29/10)— y el bot marca el
  chat "Para tasar". Conectarlo cambia lo que el bot dice.
- La cola (`pedirTasacion` / `procesarTasacion`) necesita **su propia vuelta
  de reloj**: una tasación usa casi las 50 consultas que Cloudflare permite
  por corrida, así que no puede compartir el minuto con el repaso de chats.
  En MOTORS el cron corre cada minuto y la tasación se lleva el minuto entero.
- `leerConfigTasador` viene con `automatico: true`: apenas se enganche, le
  manda la cotización al cliente solo. Decidir eso antes.

### Y antes de engancharlo: Mercado Libre pasa a ser un tercero

Hoy el tasador **no toca datos de clientes**: es una herramienta del panel
donde una persona escribe un auto a mano. Nada de WhatsApp entra ahí solo.

El día que el bot le pase el auto del cliente al tasador, un dato que llegó
por WhatsApp (marca, modelo, año y km de su auto) sale hacia
**Mercado Libre**, que no está en la lista de encargados del punto 1 de
`CLAUDE.md` (hoy: sólo Cloudflare y Anthropic).

A favor de que no sea un problema: lo que viaja es un modelo de auto con un
rango de km, sin nombre, sin teléfono y sin nada que identifique a nadie —
es la misma consulta que haría una persona del equipo abriendo Mercado Libre
en su navegador. Igual **no lo decidimos solos**: antes de conectarlo hay que
mirarlo y, si corresponde, sumarlo a `/privacidad/` y a las respuestas de
Meta el mismo día, como dice el final de `CLAUDE.md`.

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
