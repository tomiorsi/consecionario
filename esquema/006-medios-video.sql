-- EL LUGAR DEL COLLAGE PUEDE SER UN VIDEO O UNA FOTO.
--
-- Hasta acá `medios` guardaba siempre imágenes, y la página armaba la
-- dirección pegándole el sufijo `-1600.webp` a la clave. Con videos eso
-- deja de servir: hay que saber QUÉ es lo que está guardado para decidir
-- si se dibuja un <video> o un <img>, y la extensión ya no es una sola.
--
-- DOS CAMBIOS, Y LOS DOS ACHICAN CÓDIGO EN VEZ DE AGRANDARLO:
--
--   · `clase` dice 'imagen' o 'video'. Es lo único que la página necesita
--     para elegir qué etiqueta poner.
--
--   · `clave` pasa a ser la dirección COMPLETA dentro del depósito,
--     extensión incluida. Antes era media dirección y cada lugar que la
--     usaba tenía que acordarse de completarla igual — el panel, la
--     home, el borrado—. Cuatro copias de la misma regla.
--
-- SE BORRA LO QUE HAYA. Son las fotos de reemplazo de la home y en este
-- momento no hay ninguna cargada; convertir media docena de claves
-- viejas al formato nuevo sería más código de migración que el que se
-- está agregando. Si la tabla tuviera contenido, esto habría que
-- hacerlo al revés.

DELETE FROM medios;

ALTER TABLE medios ADD COLUMN clase TEXT NOT NULL DEFAULT 'imagen';
