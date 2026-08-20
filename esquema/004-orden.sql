-- EL ORDEN LO PONE LA PERSONA, NO LA FECHA.
--
-- Antes había un `destacado` de sí/no: servía para fijar uno arriba y
-- nada más. Todo lo demás salía por fecha de carga, que es el orden en
-- que se cargaron los autos y no tiene por qué ser el orden en que
-- conviene mostrarlos. Se reemplaza por una posición.
--
-- UNA SOLA POSICIÓN GLOBAL, Y NO UNA POR GRUPO. El panel deja reordenar
-- dentro de "Todos" y dentro de cada línea, pero guarda siempre sobre la
-- misma columna: al reordenar dentro de un grupo se permutan únicamente
-- los lugares que ese grupo ya ocupaba en la lista general. Así las dos
-- vistas no pueden contradecirse — con una posición por grupo, "Todos"
-- tendría que inventar un desempate entre grupos y el orden que se ve
-- ahí no sería ninguno de los que alguien guardó.
--
-- EMPATE EN 0 PARA LO YA CARGADO. Los autos que existían no tienen
-- posición asignada, así que quedan todos en 0 y entre ellos sigue
-- desempatando la fecha, igual que antes. En cuanto se guarda un orden,
-- pasan a tener el suyo.

DROP INDEX IF EXISTS autos_publicados;

ALTER TABLE autos ADD COLUMN orden INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS autos_publicados
  ON autos (estado, orden, creado DESC);
