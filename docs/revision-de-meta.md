# La revisión de Meta: qué falta pedir y con qué texto

App: **Manna Selected Hub** (`901269239533728`). Página: **Manna Selected** (`1292696420590917`).

Este archivo existe para que, el día que se pueda pedir, no haya que volver a
pensarlo. El texto de abajo está escrito para pegarlo tal cual.

## Dónde estamos (10/11/2026)

Hay **una solicitud abierta desde el 27 de octubre**, todavía en revisión
("la mayoría se revisan en un plazo de 20 días"). Pidió ocho permisos:

```
instagram_business_basic            instagram_business_manage_insights
instagram_business_manage_messages  instagram_business_manage_comments
whatsapp_business_messaging         public_profile
whatsapp_business_management        pages_show_list
```

**Facebook quedó afuera de esa solicitud.** No se pidió `pages_messaging` ni
`pages_manage_engagement`, que son los dos que hacen falta para que el bot
atienda Messenger y los comentarios de la página.

**Y hasta que esa solicitud cierre no se pueden agregar.** En la pantalla de
permisos, "Agregar a la revisión de la app" está deshabilitado para los dos
(`aria-disabled="true"`): Meta deja una sola solicitud abierta por vez.

Así que hay dos caminos, y es una decisión de Tomás:

- **Esperar** a que cierre la del 27/10 y recién ahí pedir los dos de
  Facebook. No arriesga nada de lo que hoy funciona. Son dos esperas, una
  atrás de la otra.
- **Cancelar** la del 27/10 (Meta lo ofrece en la alerta del 27 de octubre) y
  mandar una sola con todo junto. Llega antes, pero tira a la basura los días
  que ya esperó Instagram y WhatsApp, que son por donde entra casi todo.

El primero es el prudente. El segundo sólo tiene sentido si la del 27/10 está
por rebotar de todas formas.

## Qué pedir

| Permiso | Para qué | Estado hoy |
|---|---|---|
| `pages_messaging` | Contestar los privados de Messenger y mandar la respuesta privada a quien comenta | Acceso estándar, sin pedir |
| `pages_manage_engagement` | Contestar y dar me gusta abajo del comentario, en la publicación | Acceso estándar, sin pedir |
| `pages_read_engagement` | Leer las publicaciones y sus comentarios | Ya está, acceso estándar |

Nada más que esos. El compromiso del `CLAUDE.md` (punto 12) es pedir sólo lo
que se usa: el caso de uso "Administrar todos los aspectos de tu página" trae
una lista larga —`pages_manage_posts`, `pages_manage_ads`, `Live Video API`—
y **ninguno de esos se pide**, porque el bot no publica, no pauta y no
transmite.

## El texto, para pegar

Meta revisa en inglés. Va en inglés a propósito.

### pages_messaging

> Manna Motors Selected is a used-car dealership in Buenos Aires, Argentina.
> People contact our Facebook Page to ask about the cars we have for sale —
> price, mileage, year, whether we take their car as a trade-in — and to book
> a visit to our showroom.
>
> We use `pages_messaging` for two things, both inside a conversation that the
> person started:
>
> 1. To receive and reply to messages sent to our Page on Messenger. Our
>    assistant answers using our live stock data, and hands the conversation
>    over to a member of our team whenever the person wants to negotiate, book
>    a visit, or asks to speak to a human. From that moment the assistant stops
>    writing in that conversation and a person replies from our own panel.
> 2. To send a single private reply to someone who comments on one of our Page
>    posts, so we can give them the details they asked for instead of posting
>    prices publicly.
>
> We never message people who have not written to us or commented on our posts,
> and we send nothing outside the allowed window. The assistant never closes a
> price, a deposit or any condition on its own: our terms of use say that only
> what is agreed with a person counts.
>
> **How to test:** send a message to the Manna Selected Page on Messenger
> asking about any car in the Page's posts — for example "¿cuántos km tiene?"
> ("how many km does it have?"). The Page answers within a few seconds with the
> real figure from our stock, and asks what else you would like to know.

### pages_manage_engagement

> We use `pages_manage_engagement` only on comments left on our own Page's
> posts, and only for two things:
>
> 1. To post a short public reply under the comment saying that we have
>    answered privately — for example "Hola! Te escribimos por privado así te
>    pasamos toda la info." That sentence is picked from a fixed list written
>    in our code; the model never writes it. This is deliberate: anything under
>    a public post can be read by anyone, so a price or a personal detail must
>    not be able to end up there.
> 2. To like a comment that is friendly about the car or the post.
>
> We never comment on other people's Pages or posts, we never edit or delete
> anyone else's comments, and we never use this to promote anything. There is a
> cap of 40 public replies a day and one per person per post, so it cannot
> behave like spam.
>
> **How to test:** leave a comment asking for information under any post on the
> Manna Selected Page — for example "precio?". You will get a private message
> with the answer, and a short public reply under your comment telling you we
> wrote to you privately.

## El video

Meta pide un video por permiso. Lo que tiene que verse, sin cortes:

1. **`pages_messaging`:** entrar a la página de Facebook desde una cuenta que
   no sea del equipo, mandar un mensaje preguntando por un auto, y que se vea
   llegar la respuesta. Después escribir "quiero hablar con una persona" y que
   se vea que el bot deja de contestar.
2. **`pages_manage_engagement`:** comentar "precio?" abajo de una publicación,
   y que se vean las dos cosas: el privado que llega y el renglón público
   abajo del comentario.

Para grabarlo hace falta que los permisos anden, y con acceso estándar andan
**sólo con cuentas que tengan un rol en la app**. O sea: antes de grabar, hay
que agregar la cuenta que va a comentar como Evaluador en Roles de la app, y
que acepte la invitación.

## Antes de que esto sirva: la suscripción de la página

Aparte de los permisos, la página tiene que estar suscrita al campo `feed`.
Suscribirlo en la pantalla de Webhooks de la app **no alcanza** —eso dice qué
puede recibir la app, no qué manda esta página— y esa parte no tiene pantalla
en Meta. Se pide por la API, desde el panel, ya con la sesión puesta:

```
https://www.mannaselected.com.ar/api/admin/facebook/suscribir?activar=1
```

Tiene que contestar `"llegan_los_comentarios": true`. Sin `?activar=1` sólo
dice cómo está, sin tocar nada.
