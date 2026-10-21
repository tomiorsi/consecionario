-- LOS COMENTARIOS ENTRAN A LA MISMA BANDEJA QUE LOS MENSAJES.
--
-- Un comentario en un reel y un privado son la misma cosa para el
-- negocio: alguien preguntando. Separarlos en dos pantallas obliga a
-- mirar dos lugares y a decidir en cuál contestar primero sin verlos
-- juntos. Van a la misma lista, ordenados por cuándo pasaron.
--
-- PERO HAY QUE PODER DISTINGUIRLOS, y por dos motivos. Uno es de
-- lectura: contestar un comentario en público no es lo mismo que
-- contestar un privado. El otro es legal: un comentario es público y un
-- DM no, así que lo que la IA pueda decir en cada uno es distinto.
--
-- `clase` NO REEMPLAZA A `tipo`. `tipo` dice de qué está hecho el
-- mensaje (texto, foto, audio); `clase` dice por dónde llegó. Un
-- comentario con una foto tiene las dos cosas.

ALTER TABLE mensajes ADD COLUMN clase TEXT NOT NULL DEFAULT 'mensaje'
  CHECK (clase IN ('mensaje','comentario'));

-- DE QUÉ PUBLICACIÓN VINO.
--
-- Es la pieza que le falta a la IA para no contestar a ciegas. Alguien
-- que comenta "¿cuánto sale?" debajo del reel de la Hilux está
-- preguntando por la Hilux, y el comentario solo no lo dice. Sin esto,
-- el bot tendría que adivinar o preguntar de nuevo algo que la persona
-- ya dejó claro al elegir dónde comentar.
--
-- Se guarda el identificador y no el texto del posteo: el texto puede
-- editarse y lo que importa es poder ir a buscarlo cuando haga falta.
ALTER TABLE mensajes ADD COLUMN media_id TEXT;

-- Para encontrar rápido todo lo que pasó debajo de una publicación
-- cuando se arme la vista de un reel.
CREATE INDEX IF NOT EXISTS mensajes_por_media ON mensajes (media_id);

-- El identificador que da Meta al comentario. Ya existe `externo_id` en
-- la tabla y es único, así que un comentario reenviado no se duplica
-- igual que no se duplica un mensaje: se reusa esa columna.
