# Manna Motors Selected — sitio y panel

Sitio estático + Worker de Cloudflare (`src/index.js`), D1 para los autos, R2 para las fotos. Se publica con `npx wrangler deploy` desde esta carpeta.

## Compromisos legales y de datos — NO ROMPER

Lo que sigue fue **declarado ante Meta** (revisión de la app "Manna Selected Hub", 16/09/2026) y está **publicado** en `/privacidad/`. Cualquier cambio de código que lo contradiga pone en riesgo la app de Meta y es un incumplimiento de la Ley 25.326 (Protección de Datos Personales, Argentina).

**Antes de tocar algo que maneje datos de personas, revisá esta lista.** Si un cambio necesita romper uno de estos puntos, se frena y se avisa: primero se actualizan `/privacidad/` y las respuestas en Meta, y recién después se programa.

### Qué declaramos

- **Encargados del tratamiento de los datos que llegan de Meta: solo Cloudflare, Inc. y Anthropic, PBC.** Países: Estados Unidos y Argentina.
- **Responsable de los datos:** Manna Motors Selected (razón social de AFIP), Argentina. Equipo en Argentina.
- **Pedidos de autoridades:** revisión de legalidad, impugnación de pedidos ilegítimos, minimización y registro. El proceso está en `docs/solicitudes-de-autoridades.md`. No se entregaron datos por pedidos de seguridad nacional.
- **Google** solo mide visitas a la web (GTM). **Nunca** recibe datos que lleguen de Meta.

### Reglas para el código

1. **Ningún proveedor nuevo sin avisar.** Si un dato de WhatsApp, Instagram o Messenger va a pasar por un servicio que no sea Cloudflare o Anthropic (otro modelo de IA, un CRM, una planilla, un servicio de mails, analítica), primero se agrega a `/privacidad/` y a las respuestas de Meta.
2. **Nunca vender, alquilar ni compartir datos** con terceros para fines propios de ellos. No se usan para publicidad fuera de las herramientas de Meta.
3. **Guardar lo mínimo.** Solo lo necesario para atender la consulta: nombre, usuario o teléfono, y los mensajes. Nada de datos bancarios, contraseñas ni documentos por estos canales.
4. **Borrado a pedido en 10 días hábiles.** Todo lo que se guarde de una persona tiene que poder borrarse entero (conversaciones y datos de contacto), buscándolo por teléfono o usuario. Cuando se programe el bot, el borrado se construye junto con el guardado, no después.
5. **Conservación limitada.** Las conversaciones se borran cuando dejan de servir para una consulta u operación en curso. Al guardarlas en D1, definir y programar el plazo.
6. **La IA se identifica y siempre hay una persona.** Las respuestas automáticas las supervisa alguien del equipo, y el cliente puede pedir hablar con una persona en cualquier momento. El bot tiene que reconocer ese pedido y pasar la conversación.
7. **Pedido de borrado por chat.** Si alguien escribe "quiero que borren mis datos" (o algo equivalente) por WhatsApp, Instagram o Messenger, el bot no lo contesta como una consulta: lo deriva a una persona y queda registrado.
8. **Logs.** El webhook hoy anota cada aviso completo en el log de Cloudflare (se borra solo a los pocos días). Cuando el bot guarde las conversaciones en D1, sacar el contenido de los mensajes del log.
9. **Nada de datos personales en URLs** ni en parámetros de consulta.
10. **Secretos solo con `wrangler secret put`.** Tokens, claves y la API key de Anthropic nunca van en el código, en el repo ni en el chat. Si alguno aparece en el chat, se considera expuesto y se reemplaza.
11. **Verificar la firma de Meta** (`META_APP_SECRET`) antes de usar un aviso para contestar. Lo que llega sin verificar solo se anota.
12. **Permisos de Meta: solo los que se usan.** Cada permiso pedido hay que justificarlo en la revisión.

### Dónde está cada cosa

- Política pública: `public/privacidad/index.html` (borrado de datos en `/privacidad/#eliminar-datos`).
- Condiciones de uso: `public/terminos/index.html`. Dicen que las respuestas de la IA son orientativas y que vale lo acordado con una persona: el bot nunca debe cerrar precios, reservas ni condiciones por su cuenta.
- Pedidos de autoridades: `docs/solicitudes-de-autoridades.md`.
- Webhook de Meta: `/api/meta/webhook` en `src/index.js`.

Si cambia cualquiera de estos compromisos, se actualizan los tres lugares (este archivo, `/privacidad/` y Meta) el mismo día, y se cambia la fecha de "Última actualización" de la política.
