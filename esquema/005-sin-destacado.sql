-- SE VA `destacado`.
--
-- Lo reemplazó la posición manual de 004: un sí/no que sólo sabía poner
-- uno arriba de todo no agrega nada cuando se puede arrastrar la lista
-- al orden que se quiera, y dejarlo era una segunda forma de decir lo
-- mismo que podía contradecir a la primera.
--
-- VA DESPUÉS Y NO ADENTRO DE 004 porque SQLite no deja soltar una
-- columna que esté en un índice, y el índice viejo la usaba. 004 lo
-- rehace sin ella; recién entonces se puede soltar.

ALTER TABLE autos DROP COLUMN destacado;
