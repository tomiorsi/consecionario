-- CADA LUGAR PUEDE TENER UN ARCHIVO POR PANTALLA.
--
-- El motivo son las medidas, que ya estaban medidas y anotadas: el fondo
-- del collage se ve 16:9 apaisado en la compu y 4:5 VERTICAL en el
-- celular; la ciudad pasa de 3:2 a 3:4. No son variaciones de la misma
-- forma, son formas opuestas. Un solo archivo para las dos obliga a
-- elegir cuál se ve bien y a resignar la otra.
--
-- LA LLAVE PASA A SER LUGAR + PANTALLA. Antes era el lugar solo. Los
-- valores de `variante` son 'compu', 'celular' o 'todo':
--
--   · 'compu' y 'celular' para los lugares que cambian de forma.
--   · 'todo' para los que no. La tira de tres de la nota se ve casi
--     cuadrada en las dos, y partirla en dos sería pedir dos veces el
--     mismo archivo.
--
-- SI FALTA UNA, SE USA LA OTRA. No hace falta subir las dos para que un
-- lugar funcione: la página busca la de su pantalla y, si no está,
-- recae en la que haya. Obligar a subir dos archivos para cambiar uno
-- convertiría cada cambio chico en una tarea.
--
-- SE RECREA LA TABLA en vez de agregarle la columna: SQLite no deja
-- cambiar una llave primaria con ALTER. Está vacía —no hay ninguna
-- imagen propia cargada— así que no hay nada que convertir.

DROP TABLE IF EXISTS medios;

CREATE TABLE medios (
  slot     TEXT NOT NULL,
  variante TEXT NOT NULL,
  clave    TEXT NOT NULL,
  clase    TEXT NOT NULL DEFAULT 'imagen',
  editado  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slot, variante)
);
