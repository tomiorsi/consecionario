-- LAS CONVERSACIONES DE WHATSAPP, INSTAGRAM Y MESSENGER.
--
-- Esto guarda datos de personas, así que el esquema está atado a lo que
-- declaramos ante Meta y está publicado en /privacidad/. Lo importante
-- de cada decisión está anotado acá abajo; si algo de esto cambia, hay
-- que cambiar también la política y las respuestas en Meta el mismo día.
--
-- SE GUARDA LO MÍNIMO Y NADA MÁS: con quién hablamos, por qué canal, y
-- qué se dijo. No hay columna para documento, domicilio, datos
-- bancarios ni nada parecido, y no se agrega: si algún día hace falta
-- un dato más, primero se actualiza /privacidad/.
--
-- DOS TABLAS Y NO UNA. La conversación es la persona en un canal; los
-- mensajes son muchos y crecen. Separadas, borrar a alguien es borrar
-- una fila y que el CASCADE se lleve el resto, que es exactamente lo
-- que pide el compromiso de borrado en 10 días hábiles.


-- ── LA CONVERSACIÓN ──────────────────────────────────────────────
--
-- UNA POR PERSONA Y POR CANAL. El mismo humano puede escribir por
-- WhatsApp y por Instagram y para Meta son dos identidades distintas:
-- no hay forma honesta de unirlas, y tratar de adivinar que son la
-- misma persona sería inventar un dato que no tenemos.
--
-- `externo_id` ES EL IDENTIFICADOR QUE DA META, y cambia según el canal:
-- en WhatsApp es el teléfono, en Instagram el IGSID y en Messenger el
-- PSID. Los tres son datos personales. Por eso nunca viajan en una URL
-- —ni del sitio ni de la API—: para eso está el `id` de acá, que no
-- dice nada de nadie.
--
-- `ultimo` ES EL RELOJ DE LA CONSERVACIÓN. Se pisa con cada mensaje y
-- es lo que mira la limpieza automática. Ver el bloque del final.

CREATE TABLE IF NOT EXISTS conversaciones (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,

  canal       TEXT    NOT NULL CHECK (canal IN ('whatsapp','instagram','messenger')),
  externo_id  TEXT    NOT NULL,

  -- El nombre que muestra Meta. Puede no venir, y no se le pide a nadie:
  -- si falta, la bandeja muestra el canal y listo.
  nombre      TEXT,

  -- CUANDO ESTÁ EN 1, LA IA NO CONTESTA Y RESPONDE UNA PERSONA.
  --
  -- Cubre los dos casos que nos comprometimos a atender: alguien que
  -- pide hablar con una persona, y alguien que pide que borremos sus
  -- datos. En los dos, el bot se corre y queda registrado por qué.
  humano      INTEGER NOT NULL DEFAULT 0 CHECK (humano IN (0,1)),
  nota        TEXT,

  creado      TEXT    NOT NULL DEFAULT (datetime('now')),
  ultimo      TEXT    NOT NULL DEFAULT (datetime('now')),

  UNIQUE (canal, externo_id)
);

-- La bandeja ordena por actividad: el último que escribió va primero.
CREATE INDEX IF NOT EXISTS conversaciones_recientes
  ON conversaciones (ultimo DESC);

-- EL BORRADO A PEDIDO SE BUSCA POR TELÉFONO O USUARIO, que es como
-- llega el pedido. Sin este índice habría que recorrer la tabla entera,
-- y eso con el tiempo se vuelve lento justo cuando hay que cumplir un
-- plazo legal.
CREATE INDEX IF NOT EXISTS conversaciones_por_externo
  ON conversaciones (externo_id);


-- ── LOS MENSAJES ─────────────────────────────────────────────────
--
-- `externo_id` ES ÚNICO Y ES LO QUE EVITA LOS DUPLICADOS. Meta reintenta
-- el mismo aviso si no recibe un 200 a tiempo, y reintentar es lo normal,
-- no la excepción. Sin esta restricción, un reintento guarda el mensaje
-- dos veces y la conversación queda con todo repetido.
--
-- `autor` SOLO TIENE SENTIDO EN LOS SALIENTES, y existe por el
-- compromiso de que la IA se identifica y siempre hay una persona
-- detrás: tiene que poder verse después quién escribió cada cosa.
--
-- NO SE GUARDA EL ARCHIVO de una foto o un audio, solo que llegó y de
-- qué tipo. Bajar y almacenar media de terceros es guardar más de lo
-- necesario para atender una consulta.

CREATE TABLE IF NOT EXISTS mensajes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,

  externo_id      TEXT    UNIQUE,

  direccion       TEXT    NOT NULL CHECK (direccion IN ('entrante','saliente')),
  autor           TEXT             CHECK (autor IN ('persona','ia')),

  tipo            TEXT    NOT NULL DEFAULT 'texto'
                          CHECK (tipo IN ('texto','imagen','audio','video','documento','ubicacion','otro')),
  texto           TEXT,

  creado          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Abrir un chat es traer sus mensajes en orden. Es la consulta que más
-- se va a repetir en el panel.
CREATE INDEX IF NOT EXISTS mensajes_por_conversacion
  ON mensajes (conversacion_id, creado);


-- ── LA CONSERVACIÓN: 12 MESES ────────────────────────────────────
--
-- El compromiso publicado dice que las conversaciones se borran cuando
-- dejan de servir para una consulta u operación en curso. DOCE MESES
-- DESDE EL ÚLTIMO MENSAJE es el plazo que se eligió: cubre la compra y
-- el posventa de un auto, que es el ciclo real del negocio.
--
-- LA CUENTA ARRANCA EN EL ÚLTIMO MENSAJE Y NO EN EL PRIMERO. Una
-- conversación que sigue viva sigue sirviendo; una que murió hace un año
-- no le sirve a nadie.
--
-- ESTO NO SE EJECUTA SOLO. Es la consulta que corre el Worker en su
-- disparador programado (ver `scheduled` en src/index.js). Queda escrita
-- acá para que el plazo viva junto al esquema y no escondido en el
-- código.
--
--   DELETE FROM conversaciones WHERE ultimo < datetime('now','-12 months');
--
-- El CASCADE se lleva los mensajes. No hace falta borrarlos aparte.
