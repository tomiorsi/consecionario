# El bot de mensajes

Contesta por WhatsApp, Instagram y Messenger como Manna Selected, con la voz de Maxi. Arranca en **borrador**: escribe la respuesta en el panel y la manda una persona. Cada canal se puede pasar a **automático** desde el panel (pestaña Mensajes), con un horario opcional.

## Qué hace

- Si la persona escribió desde un anuncio de Meta, sabe de qué anuncio vino (título y texto, que Meta manda con el mensaje) y lo usa para entender por qué escribe. El panel lo muestra arriba del chat.
- Lee la conversación entera, incluidas las fotos y los audios que mandó el cliente (sabe que llegaron, aunque no los ve).
- Conoce todo el stock publicado: precio, km, motor, caja, color, descripción y cuántas fotos tiene cada auto.
- Contesta en varios mensajes cortos, con 10 segundos entre uno y otro, como una persona. Si va el link de un auto del garage, entra antes del último mensaje y se espera 12 segundos para que el chat muestre la foto. No repite un link que ya mandó en esa conversación.
- La primera parte sale en el momento; el resto lo manda una cola de envíos por conversación (`Envios` en `src/index.js`, un Durable Object de Cloudflare). Se crea sola la primera vez que se publica: está en `wrangler.jsonc`.
- Si alguien quiere entregar su auto, pide solo los datos y las fotos que faltan.
- Pasa la conversación a una persona si piden hablar con alguien, si piden borrar sus datos, si quieren negociar, señar o pagar, o si hay un reclamo. En automático lo hace solo y deja de contestar ese chat.
- Qué dice y cómo lo dice está en `src/instrucciones.js`. Para cambiar el bot, se cambia ese archivo.

## Para publicarlo (Tomás)

**La web se publica sola al subir a `main`** (`.github/workflows/publicar.yml`). Por eso el orden importa: la columna de la base va antes.

0. La columna nueva del anuncio de Meta del que vino cada conversación:
   ```
   npx wrangler d1 execute manna-autos --remote --file=esquema/012-anuncio.sql
   ```
1. Las llaves que faltan, con `wrangler secret put` (nunca en el código ni en un chat):
   - `WHATSAPP_TOKEN`: token del usuario del sistema de la cuenta de WhatsApp Business, con `whatsapp_business_messaging`.
   - `META_PAGE_TOKEN`: token de la página de Facebook, con `pages_messaging`.
   - `META_IG_TOKEN` ya está. Para mandar hace falta `instagram_business_manage_messages`.
   - En la consola de Anthropic (console.anthropic.com → Settings → Privacy), habilitar la **búsqueda web** para la organización. El bot la usa para averiguar si el auto que ofrece el cliente es manual o automático. Si no está habilitada, contesta igual sin buscar.
2. Subir a `main` (se publica solo). La cola de envíos (Durable Object `Envios`) se crea sola con esa publicación. Si el código llega antes que la columna del anuncio, funciona igual y empieza a guardar el anuncio cuando la columna esté.

## Para probar sin la revisión de Meta

Con la app en modo desarrollo, Meta deja mandar mensajes solo a quienes tienen un rol en la app. Para probar con las cuentas personales de Maxi:

- **WhatsApp:** en la app, WhatsApp → Configuración de la API, agregar su número en la lista de destinatarios ("To") y confirmarlo con el código que llega.
- **Instagram:** en Roles de la app, agregar su cuenta personal como Probador de Instagram y aceptar la invitación desde Instagram (Configuración → Apps y sitios web → Invitaciones de evaluadores).
- **Messenger:** agregar su perfil de Facebook como Evaluador en Roles de la app, aceptar, y suscribir la página a los eventos `messages` del webhook.

Después le escribe al negocio desde esas cuentas y prueba los borradores en el panel.

## Antes del modo automático

- Hay un interruptor general en el código: `CONTESTA_SOLA` en `src/index.js`. Hoy está en `false` (lo decidió Tomás): no sale ningún mensaje solo, elija lo que elija el panel. Para prenderlo se cambia esa palabra, y después se elige canal por canal en el panel.
- El bot no se anuncia como asistente, pero si le preguntan dice la verdad (decisión de Tomás del 21/10). **Ojo:** `CLAUDE.md` (regla 6) y `/privacidad/` todavía dicen que la IA se identifica. Antes de prender el automático hay que poner de acuerdo las tres cosas: la política, las respuestas en Meta y el código.
- Los comentarios de Instagram: el bot decide si escribirle por privado (casi nunca, ante la duda no) y si poner me gusta. Un privado por publicación, y un aviso público abajo del comentario una vez que salió.
- Frenos: espera 8 segundos a que la persona termine de escribir, nunca se contesta a sí mismo, máximo 5 mensajes en 10 minutos por chat, y se calla en los chats que pasaron a una persona.
- Para clientes reales hace falta que Meta apruebe los permisos de envío (revisión de la app).
