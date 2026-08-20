-- LA TABLA DE AUTOS.
--
-- UN AUTO ES UNA FILA Y SUS FOTOS SON OTRA TABLA, no una columna con una
-- lista adentro. Las fotos tienen orden —la primera es la portada— y se
-- borran de a una desde el admin; metidas en un JSON dentro de la fila
-- habría que leer, editar y reescribir todo el campo por cada cambio.
--
-- EL GRUPO ES TEXTO Y NO UNA TABLA APARTE. Son cuatro, están fijos en la
-- página desde antes que esto exista y no se crean desde el admin: una
-- tabla de cuatro filas que nadie edita es una junta más en cada
-- consulta a cambio de nada. La restriccion vive en el CHECK de abajo,
-- que es lo que evita que entre un grupo inventado.

CREATE TABLE IF NOT EXISTS autos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo        TEXT    NOT NULL CHECK (grupo IN ('alta-gama','evolution','deportivos','urbanos')),

  marca        TEXT    NOT NULL,
  modelo       TEXT    NOT NULL,
  anio         INTEGER,
  km           INTEGER,
  -- El precio va en ENTEROS, sin decimales: guardar plata en coma
  -- flotante es como se pierde un peso cada tanto sin que nadie sepa por
  -- que. NULL significa "consultar", que no es lo mismo que cero.
  precio       INTEGER,
  moneda       TEXT    NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD','ARS')),

  motor        TEXT,
  transmision  TEXT,
  combustible  TEXT,
  color        TEXT,
  descripcion  TEXT,

  -- `borrador` deja cargar un auto a medias sin que salga publicado, y
  -- `vendido` lo saca de la lista sin perder la ficha ni las fotos.
  estado       TEXT    NOT NULL DEFAULT 'borrador'
                       CHECK (estado IN ('borrador','publicado','vendido')),
  -- El orden lo pone la persona arrastrando la lista en el panel. Ver
  -- 004-orden.sql: reemplazó a un `destacado` de si/no.
  orden        INTEGER NOT NULL DEFAULT 0,

  creado       TEXT    NOT NULL DEFAULT (datetime('now')),
  editado      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- El listado publico siempre filtra por estado y ordena por estos dos
-- campos; sin el indice, cada visita recorre la tabla entera.
CREATE INDEX IF NOT EXISTS autos_publicados
  ON autos (estado, orden, creado DESC);

CREATE INDEX IF NOT EXISTS autos_por_grupo
  ON autos (grupo, estado);


-- LAS FOTOS.
--
-- El archivo vive en R2 y acá queda solo la llave con la que se lo pide.
-- Guardar el binario en la base seria pagar lectura de base por cada
-- imagen y perder el cache del borde.
--
-- ON DELETE CASCADE: borrar el auto borra sus filas de fotos solo. Los
-- objetos de R2 los borra el Worker aparte, porque eso la base no lo
-- puede hacer.

CREATE TABLE IF NOT EXISTS fotos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  auto_id  INTEGER NOT NULL REFERENCES autos(id) ON DELETE CASCADE,
  clave    TEXT    NOT NULL UNIQUE,
  orden    INTEGER NOT NULL DEFAULT 0,
  ancho    INTEGER,
  alto     INTEGER,
  creado   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS fotos_por_auto ON fotos (auto_id, orden);
