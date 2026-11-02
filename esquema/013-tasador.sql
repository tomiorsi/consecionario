-- EL TASADOR DE PERMUTAS: cuánto ofrecer por el auto que entrega un cliente.
--
-- El motor es el mismo de Manna Motors, copiado tal cual (src/tasador.js).
-- Acá va lo único que necesita de la base: una cola de tasaciones y un
-- lugar donde guardar lo que ya leyó de Mercado Libre.
--
-- ─────────────────────────────────────────────────────────────────────
-- `vence` EN `estado`: EL TASADOR GUARDA CON FECHA DE VENCIMIENTO.
--
-- Cada página de Mercado Libre que lee se guarda una semana y cada
-- cotización del dólar dos días. Sin eso, tasar dos autos parecidos el
-- mismo día son cuarenta lecturas repetidas a Mercado Libre, que es
-- justo la forma de que nos bloqueen.
--
-- La tabla `estado` ya existía (011-estado.sql) pero guardaba para
-- siempre. La columna se agrega y queda en NULL para todo lo que ya
-- está: NULL quiere decir "no vence", que es como se venía leyendo.
--
-- SIGUE SIN IR NADA DE PERSONAS ACÁ. Lo que se guarda son listados
-- públicos de Mercado Libre y el valor del dólar: nada de nadie.
ALTER TABLE estado ADD COLUMN vence INTEGER;

-- ─────────────────────────────────────────────────────────────────────
-- LA COLA DE TASACIONES.
--
-- Tasar bien tarda: son varias lecturas de Mercado Libre y dos pasadas
-- de Claude. No entra en el tiempo que Meta da para contestar un
-- webhook, así que el pedido se anota acá y lo resuelve la vuelta del
-- reloj. `estado` cuenta en qué anda cada una y `resultado` guarda con
-- qué publicaciones se llegó al número, para poder revisarlo a mano.
--
-- `conversacion` VA CON BORRADO EN CASCADA, y es a propósito: una
-- tasación cuelga de la charla donde se pidió. Si alguien pide que
-- borremos sus datos (Ley 25.326, y lo que declaramos ante Meta), o si
-- la limpieza anual se lleva la conversación, la tasación se va con
-- ella sin que haya que acordarse de borrarla aparte. Es la misma regla
-- que ya tiene `mensajes`.
--
-- QUÉ GUARDA Y QUÉ NO: el auto que entrega (marca, modelo, año, km,
-- versión) y el número que dio el cálculo. Ni nombre, ni teléfono, ni
-- patente, ni dominio: eso vive en `conversaciones` y se borra igual.
CREATE TABLE IF NOT EXISTS tasaciones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion INTEGER REFERENCES conversaciones(id) ON DELETE CASCADE,
  clave        TEXT,                        -- el mismo auto pedido dos veces es una sola tasación
  pedido       TEXT    NOT NULL,            -- JSON: marca, modelo, año, km, versión, caja
  estado       TEXT    NOT NULL,            -- pendiente, calculando, lista, falta_version, error...
  resultado    TEXT,                        -- JSON: las publicaciones con las que se llegó al número
  monto        INTEGER,                     -- lo que se ofrece, en dólares
  porcentaje   REAL,                        -- con qué porcentaje salió (para medir y ajustar)
  contraoferta INTEGER,                     -- si el cliente contestó con un número
  auto_interes TEXT,                        -- cuál de los nuestros estaba mirando
  avisada      INTEGER NOT NULL DEFAULT 0,  -- ya se le avisó a la charla
  intentos     INTEGER NOT NULL DEFAULT 0,
  creada       INTEGER NOT NULL,
  actualizada  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tasaciones_conv ON tasaciones (conversacion, creada);
