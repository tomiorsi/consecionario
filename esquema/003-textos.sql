-- LOS TEXTOS QUE SE CAMBIAN SIN TOCAR CÓDIGO.
--
-- Hoy son dos: el titular y el copete de la nota. No es "todo el texto
-- del sitio" y no debería serlo: convertir cada frase en una fila la
-- saca del HTML, donde se lee junto al diseño que la rodea, y la manda a
-- una base donde nadie la encuentra. Acá entra lo que cambia seguido.
--
-- MISMA FORMA QUE `medios`, Y A PROPÓSITO. La llave primaria es el
-- lugar, no un número: cada fila ES un lugar de la página. No se crean
-- ni se borran desde el panel, sólo se reemplaza lo que hay adentro.
--
-- LO QUE NO ESTÁ ACÁ SIGUE SALIENDO DEL HTML. La página trae sus textos
-- escritos y este script sólo reemplaza los que tengan fila. Con la
-- tabla vacía el sitio se lee igual que antes de que esto existiera, y
-- "volver al original" es borrar la fila — no volver a escribirlo.

CREATE TABLE IF NOT EXISTS textos (
  slot     TEXT PRIMARY KEY,
  valor    TEXT NOT NULL,
  editado  TEXT NOT NULL DEFAULT (datetime('now'))
);
