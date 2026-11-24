-- RETARGETING POR WHATSAPP (Maxi, 24/11).
--
-- No hace falta correrlo a mano: src/retargeting.js crea estas tablas
-- solas la primera vez (CREATE TABLE IF NOT EXISTS). Queda escrito acá
-- para que se vea qué se guarda y por qué.
--
-- TODO LO DE UNA PERSONA CUELGA DE SU CONVERSACIÓN CON ON DELETE CASCADE:
-- si pide que la borremos (o pasan los 12 meses), se va todo junto, como
-- prometimos en /privacidad/. No se guarda ningún dato nuevo de la
-- persona: sólo a qué lista fue, por qué y qué se le mandó.

CREATE TABLE IF NOT EXISTS rt_campanas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  auto_id INTEGER, titulo TEXT NOT NULL, prefijo TEXT NOT NULL,
  precio_texto TEXT NOT NULL, destacado TEXT NOT NULL, ficha TEXT,
  similares TEXT, video_clave TEXT,
  estado TEXT NOT NULL DEFAULT 'simulacro',      -- simulacro / esperando_meta / enviando / terminada
  simulacro INTEGER NOT NULL DEFAULT 1,          -- 1 = no sale nada
  tope_diario INTEGER NOT NULL DEFAULT 50,
  progreso TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now')), terminada TEXT);

-- Qué listas aprobó Maxi. Sin aprobación, esa lista no sale.
CREATE TABLE IF NOT EXISTS rt_listas (
  campana_id INTEGER NOT NULL REFERENCES rt_campanas(id) ON DELETE CASCADE,
  lista TEXT NOT NULL, aprobada INTEGER NOT NULL DEFAULT 0, aprobada_en TEXT,
  PRIMARY KEY (campana_id, lista));

-- Las charlas que hay que leer con la IA, y cuáles ya se leyeron.
CREATE TABLE IF NOT EXISTS rt_candidatos (
  campana_id INTEGER NOT NULL REFERENCES rt_campanas(id) ON DELETE CASCADE,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  hecho INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (campana_id, conversacion_id));

-- Cada persona, su lista, el motivo y el estado de su envío.
CREATE TABLE IF NOT EXISTS rt_personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campana_id INTEGER NOT NULL REFERENCES rt_campanas(id) ON DELETE CASCADE,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  lista TEXT NOT NULL, lista_original TEXT, motivo TEXT, evidencia TEXT, linea TEXT,
  tono TEXT, confianza REAL, nombre_saludo TEXT, auto_ofrecido TEXT,
  auto_completo INTEGER NOT NULL DEFAULT 0, charla_avanzada INTEGER NOT NULL DEFAULT 0,
  ultima_charla TEXT, sacado INTEGER NOT NULL DEFAULT 0, editado INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente', wa_id TEXT, enviado_en TEXT, actualizado TEXT,
  respuesta TEXT, baja_contestada INTEGER NOT NULL DEFAULT 0, error TEXT,
  UNIQUE (campana_id, conversacion_id));
CREATE INDEX IF NOT EXISTS rt_personas_wa ON rt_personas (wa_id);
CREATE INDEX IF NOT EXISTS rt_personas_conv ON rt_personas (conversacion_id);

-- NO CONTACTAR NUNCA MÁS, en ninguna campaña.
CREATE TABLE IF NOT EXISTS rt_no_contactar (
  conversacion_id INTEGER PRIMARY KEY REFERENCES conversaciones(id) ON DELETE CASCADE,
  motivo TEXT, creado TEXT NOT NULL DEFAULT (datetime('now')));

-- Cada mensaje de marketing que salió: es lo que hace cumplir "uno cada 30 días".
CREATE TABLE IF NOT EXISTS rt_marketing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  campana_id INTEGER, plantilla TEXT, creado TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS rt_marketing_conv ON rt_marketing (conversacion_id, creado);
