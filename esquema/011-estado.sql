-- LO ÚLTIMO QUE SABEMOS, GUARDADO.
--
-- Leer las estadísticas de Instagram tarda: es una consulta por
-- publicación y la API no es rápida. Pedirlas cada vez que se abre la
-- pestaña deja al panel en blanco diez o quince segundos, y un panel en
-- blanco se lee como roto aunque esté trabajando.
--
-- Así que se guarda lo último que vino y la pantalla lo muestra al
-- instante. La actualización corre por detrás y reemplaza lo viejo
-- cuando termina. Dato viejo a la vista le gana a dato nuevo dentro de
-- diez segundos, siempre que se diga de cuándo es.
--
-- UNA TABLA DE CLAVE Y VALOR, Y NO UNA POR COSA. Lo que se guarda acá
-- es estado de la herramienta —la última lectura, por dónde iba una
-- importación—, no datos del negocio. Cada uno es una fila y nada más;
-- darle una tabla propia a cada uno sería inventar estructura para algo
-- que no la tiene.
--
-- NO VA NADA DE PERSONAS ACÁ. Las estadísticas son números agregados de
-- la cuenta propia: cuántos vieron, de qué edades. No hay nombres, ni
-- mensajes, ni nada que identifique a nadie — eso vive en
-- `conversaciones` y `mensajes`, que tienen su plazo y su borrado.

CREATE TABLE IF NOT EXISTS estado (
  clave   TEXT PRIMARY KEY,
  valor   TEXT NOT NULL,
  cuando  TEXT NOT NULL DEFAULT (datetime('now'))
);
