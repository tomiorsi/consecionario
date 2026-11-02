/* Valores chicos que cambian seguido (configuración de la IA, cursores de la sincronización,
   candados, intentos de login, caché de publicaciones). Van en D1 y no en KV porque el plan
   gratis de KV permite solo 1.000 escrituras por día, y la sincronización de cada minuto
   las agotaba. La tabla se crea sola (asegurarEsquema en index.js). */

export async function leerEstado(env, clave) {
  const fila = await env.DB.prepare('SELECT valor, vence FROM estado WHERE clave = ?1').bind(clave).first();
  if (!fila || (fila.vence && fila.vence < Date.now())) return null;
  try { return JSON.parse(fila.valor); } catch (_) { return null; }
}

// `ttlSegundos` opcional: después de ese tiempo se lee como si no existiera
export async function guardarEstado(env, clave, valor, ttlSegundos) {
  const vence = ttlSegundos ? Date.now() + ttlSegundos * 1000 : null;
  await env.DB.prepare('INSERT INTO estado (clave, valor, vence) VALUES (?1, ?2, ?3) ON CONFLICT (clave) DO UPDATE SET valor = ?2, vence = ?3')
    .bind(clave, JSON.stringify(valor), vence).run();
}

/* Candado atómico: toma la clave con ese valor solo si no la tenía ya con el mismo valor. Devuelve true si
   la tomó. Una sola sentencia en D1: dos ejecuciones a la vez (dos crons superpuestos, un deploy en el
   medio) no pueden tomarla las dos, que es lo que el 30/10/2026 mandó dos veces la misma respuesta. */
export async function tomarCandado(env, clave, valor, ttlSegundos) {
  const vence = ttlSegundos ? Date.now() + ttlSegundos * 1000 : null;
  const r = await env.DB.prepare(`INSERT INTO estado (clave, valor, vence) VALUES (?1, ?2, ?3)
    ON CONFLICT (clave) DO UPDATE SET valor = ?2, vence = ?3 WHERE estado.valor != ?2 OR (estado.vence IS NOT NULL AND estado.vence < ?4)`)
    .bind(clave, JSON.stringify(valor), vence, Date.now()).run();
  return (r.meta?.changes || 0) > 0;
}

export const borrarEstado = (env, clave) => env.DB.prepare('DELETE FROM estado WHERE clave = ?1').bind(clave).run();

/* Candado exclusivo por un rato: lo toma solo si nadie lo tiene (o ya venció), sin importar el valor.
   Lo usa la IA para que nunca haya dos turnos a la vez en la misma charla (01/11/2026: un reintento y el
   turno normal contestaron juntos y el cliente recibió todo dos veces). */
export async function tomarExclusivo(env, clave, ttlSegundos) {
  const ahora = Date.now();
  const r = await env.DB.prepare(`INSERT INTO estado (clave, valor, vence) VALUES (?1, ?2, ?3)
    ON CONFLICT (clave) DO UPDATE SET valor = ?2, vence = ?3 WHERE estado.vence IS NOT NULL AND estado.vence < ?4`)
    .bind(clave, JSON.stringify(ahora), ahora + ttlSegundos * 1000, ahora).run();
  return (r.meta?.changes || 0) > 0;
}
