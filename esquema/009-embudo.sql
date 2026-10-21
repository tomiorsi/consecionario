-- EL EMBUDO: HASTA DÓNDE LLEGÓ CADA CONSULTA.
--
-- Sin esto, cada venta que se cae parece mala suerte: no hay forma de
-- saber si se perdió antes del precio, después de la visita o en la
-- seña. Con tres datos por conversación se ve en qué paso se escapa la
-- gente, mes a mes.
--
-- ¿ES UN DATO NUEVO DE LA PERSONA? No en el sentido de /privacidad/. No
-- es un dato de contacto ni algo que nos haya dado: es una marca nuestra
-- sobre el estado de SU CONSULTA, sacada de los mismos mensajes. Entra
-- en los usos declarados ("hacer seguimiento de una consulta que
-- dejaste abierta", "mejorar nuestra atención") y se va con el borrado
-- a pedido y con la limpieza de los 12 meses, porque vive en la misma
-- fila. Por eso NO hay texto libre acá: solo valores de una lista
-- cerrada. Opiniones sobre la persona no se anotan, ni acá ni en `nota`.
--
-- TRES COLUMNAS Y NO UNA:
--
--   tipo     Qué vino a hacer. Un comprador y un dueño que quiere
--            vender son dos embudos distintos y mezclarlos esconde los
--            dos. 'ruido' existe para poder sacarlo de la cuenta.
--
--   etapa    LA MÁS ALTA A LA QUE LLEGÓ, y nunca vuelve atrás. Si
--            alguien vino al salón y después se enfrió, sigue diciendo
--            'vino': lo que se mide es cuántos llegan a cada paso.
--
--   perdido  Aparte de la etapa, justamente para no perderla. "Perdido
--            después de la visita" y "perdido antes del precio" son
--            problemas distintos con arreglos distintos.
--
-- NULL QUIERE DECIR SIN MARCAR, y el panel lo cuenta como tal. No se
-- inventa una etapa por defecto: una conversación sin mirar no es una
-- 'consulta' hasta que alguien la mire.

ALTER TABLE conversaciones ADD COLUMN tipo TEXT
  CHECK (tipo IN ('comprador','vendedor','permuta','ruido'));

ALTER TABLE conversaciones ADD COLUMN etapa TEXT
  CHECK (etapa IN ('consulta','charla','precio','visita','vino','cerrado'));

ALTER TABLE conversaciones ADD COLUMN perdido INTEGER NOT NULL DEFAULT 0
  CHECK (perdido IN (0,1));

-- Cuándo se tocó el embudo por última vez. No reemplaza a `ultimo`, que
-- es el reloj de la conservación y lo mueve cada mensaje.
ALTER TABLE conversaciones ADD COLUMN etapa_cambio TEXT;
