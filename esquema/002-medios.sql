-- LAS IMÁGENES FIJAS DEL SITIO.
--
-- No son autos: son los doce lugares de la home que siempre existen —la
-- foto de la nota, su tira de tres, las dos del collage y las seis de la
-- grilla de Instagram—. Se pueden reemplazar desde el panel sin tocar
-- código.
--
-- LA LLAVE PRIMARIA ES EL LUGAR, NO UN NÚMERO. Cada fila ES un lugar de
-- la página, no un elemento de una lista: no se crean ni se borran desde
-- el panel, sólo se reemplaza lo que hay adentro. Con un id
-- autoincremental habría que llevar aparte a qué lugar corresponde cada
-- fila y nada impediría cargar dos para el mismo.
--
-- LO QUE NO ESTÁ ACÁ SIGUE SALIENDO DEL REPO. La página trae sus fotos
-- de siempre escritas en el HTML y este script sólo reemplaza las que
-- tengan fila. Así el sitio funciona igual con la tabla vacía, y borrar
-- una fila es volver a la original — no romper un hueco.

CREATE TABLE IF NOT EXISTS medios (
  slot     TEXT PRIMARY KEY,
  clave    TEXT NOT NULL,
  ancho    INTEGER,
  alto     INTEGER,
  editado  TEXT NOT NULL DEFAULT (datetime('now'))
);
