-- UNA COPIA EN JPG DE CADA FOTO, PARA MANDARLA POR CHAT.
--
-- Las fotos se guardan en WebP porque pesan la mitad y el sitio las
-- muestra igual. WhatsApp no las acepta: para mandar una imagen pide JPG
-- o PNG, y con Instagram y Messenger WebP tampoco está garantizado. Así
-- que el bot manda una copia en JPG de 1600 px, y esta columna dice si
-- esa copia ya existe.
--
-- Las fotos nuevas la traen desde que se suben. Las que ya estaban se
-- convierten desde el panel, con el botón de la pestaña de mensajes:
-- el navegador abre la WebP, la pasa a JPG y la sube.
--
-- Mientras una foto no tenga su JPG, el bot no la manda: en su lugar va
-- el link a la ficha del auto, que muestra todas.

ALTER TABLE fotos ADD COLUMN jpg INTEGER NOT NULL DEFAULT 0
  CHECK (jpg IN (0,1));
