-- DE QUÉ ANUNCIO VINO LA CONVERSACIÓN.
--
-- Mucha gente escribe desde un anuncio de Meta con un mensaje armado
-- ("Quiero información sobre la GLA 200 - 2018"). El aviso que manda Meta
-- trae de qué anuncio vino: su id, el título y el texto. Con eso el bot
-- entiende por qué le escriben aunque el mensaje no diga nada.
--
-- SE GUARDA EL ANUNCIO, NO A LA PERSONA. Es contenido nuestro: título,
-- texto e id del anuncio, como JSON. El identificador de clic que también
-- manda Meta (ctwa_clid) no se guarda: no hace falta para atender.
--
-- Si la persona vuelve a escribir desde otro anuncio, queda el último.
-- Se borra con la conversación, como todo lo demás.

ALTER TABLE conversaciones ADD COLUMN anuncio TEXT;
