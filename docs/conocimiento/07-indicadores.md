# Sistema de indicadores

Versión 1 · 29/10/2026

Sin estos datos no se puede saber qué técnica funciona. Hoy el sistema registra las charlas, pero no lo que pasó después.

| Indicador | Fórmula | De dónde sale | ¿Existe hoy? |
|---|---|---|---|
| Tiempo de primera respuesta | Primer mensaje nuestro menos primer mensaje del cliente | Tabla `mensajes` | Sí |
| Consulta → charla | Chats con 3 o más mensajes del cliente ÷ chats nuevos | Tabla `mensajes` | Sí |
| Consulta → visita agendada | Visitas agendadas ÷ chats nuevos de compradores | Agenda del bot (`estado.agenda`) | En parte: solo las que agenda el bot |
| Visita → visita concretada | Visitas que vinieron ÷ visitas agendadas | — | **No.** Hace falta que alguien marque "vino" o "no vino" |
| Visita → operación | Operaciones ÷ visitas concretadas | — | **No** |
| Tiempo de cierre | Fecha de la operación menos fecha del primer contacto | — | **No** |
| Margen bruto por operación | Precio de venta menos costo (o lo que se paga al consignante) menos gastos | — | **No**. Es un dato sensible que solo maneja Maxi |
| Motivo de pérdida | Precio, km, financiación, se enfrió, compró en otro lado | — | **No** |
| Para tasar → propuesta enviada | Propuestas ÷ chats para tasar | Notas del panel | En parte |

## Qué falta para medir

Un botón en el panel, o un mensaje a la IA por WhatsApp, que diga por cada cliente: **vino / no vino / compró / perdido (motivo)**. Con eso se cierra el círculo y el repaso de las 21 puede comparar técnicas con resultados.
