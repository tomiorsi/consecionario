/* CUÁNTO GASTA LA IA (Maxi, 24/11: "un contador de cuánto gasta la IA por
   día, así lo ves antes de que se corte").

   Cada consulta a Claude pasa por acá y se suma, por día y por tarea, lo
   que la propia API dice que usó. El costo es una ESTIMACIÓN con los
   precios publicados por Anthropic; la cifra oficial es la de su consola.
   No se guarda nada de la charla ni de la persona: sólo cantidades. */
import Anthropic from '@anthropic-ai/sdk';

/* Dólares por millón: entrada, escritura de caché (5 min y 1 h), lectura de
   caché, salida. platform.claude.com/docs/en/about-claude/pricing, 24/11/2026. */
const PRECIOS = {
  'claude-sonnet-5-5': [2, 2.5, 4, 0.1, 10],
  'claude-haiku-5-5': [0.1, 0.125, 0.2, 0.01, 0.5],
};
const HAIKU_LARGO = [0.5, 0.625, 1, 0.05, 2.5];   // pedidos de más de 100.000
const BUSQUEDA = 0.01;                            // cada búsqueda web

export function costoDe(modelo, u = {}) {
  const base = Object.keys(PRECIOS).find((k) => String(modelo).startsWith(k));
  if (!base) return null;
  const e = u.input_tokens ?? 0, l = u.cache_read_input_tokens ?? 0, w = u.cache_creation_input_tokens ?? 0;
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const p = base === 'claude-haiku-5-5' && e + l + w > 100000 ? HAIKU_LARGO : PRECIOS[base];
  return (e * p[0] + (w - w1h) * p[1] + w1h * p[2] + l * p[3] + (u.output_tokens ?? 0) * p[4]) / 1e6
    + (u.server_tool_use?.web_search_requests ?? 0) * BUSQUEDA;
}

export const diaBA = (ms = Date.now()) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);

let lista = false;
async function tabla(env) {
  if (lista) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS ia_gasto (
      dia TEXT NOT NULL, hora TEXT NOT NULL, tarea TEXT NOT NULL, modelo TEXT NOT NULL,
      llamadas INTEGER NOT NULL DEFAULT 0, entrada INTEGER NOT NULL DEFAULT 0, salida INTEGER NOT NULL DEFAULT 0,
      busquedas INTEGER NOT NULL DEFAULT 0, costo REAL NOT NULL DEFAULT 0, sin_precio INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, hora, tarea, modelo))`),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS ia_saldo (id INTEGER PRIMARY KEY CHECK (id = 1), monto REAL, desde INTEGER, gastado REAL, corte INTEGER)'),
    env.DB.prepare('INSERT OR IGNORE INTO ia_saldo (id) VALUES (1)'),
  ]);
  lista = true;
}

async function anotar(env, tarea, modelo, u) {
  await tabla(env);
  const c = costoDe(modelo, u);
  const b = u?.server_tool_use?.web_search_requests ?? 0;
  const entrada = (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);
  const ms = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ia_gasto (dia, hora, tarea, modelo, llamadas, entrada, salida, busquedas, costo, sin_precio)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
       ON CONFLICT (dia, hora, tarea, modelo) DO UPDATE SET llamadas = llamadas + 1, entrada = entrada + excluded.entrada,
         salida = salida + excluded.salida, busquedas = busquedas + excluded.busquedas, costo = costo + excluded.costo,
         sin_precio = sin_precio + excluded.sin_precio`
    ).bind(diaBA(ms), new Date(ms - 3 * 3600e3).toISOString().slice(11, 13), tarea, String(modelo), entrada,
      u?.output_tokens ?? 0, b, c ?? 0, c === null ? 1 : 0),
    /* Lo gastado desde que Maxi cargó el saldo; y si contesta, hay saldo. */
    env.DB.prepare('UPDATE ia_saldo SET gastado = COALESCE(gastado, 0) + ?, corte = NULL WHERE id = 1').bind(c ?? 0),
  ]);
}

/* El mismo cliente de siempre, con el contador puesto. Si el contador
   falla, la respuesta sale igual. */
export function clienteIA(env, tarea) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const crear = client.messages.create.bind(client.messages);
  return { messages: { async create(pedido) {
    let r;
    try { r = await crear(pedido); }
    catch (e) {
      if (/credit balance is too low/i.test(String(e?.message))) {
        try { await tabla(env); await env.DB.prepare('UPDATE ia_saldo SET corte = ? WHERE id = 1').bind(Date.now()).run(); }
        catch { /* no tapa el error de verdad */ }
      }
      throw e;
    }
    try { await anotar(env, tarea, r.model ?? pedido.model, r.usage ?? {}); }
    catch (e) { console.error('Contador de IA:', e?.message ?? e); }
    return r;
  } } };
}

export async function rutaGasto(peticion, env, metodo) {
  const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  await tabla(env);
  if (metodo === 'POST') {
    const c = await peticion.json().catch(() => ({}));
    const m = Number(c.saldo);
    if (c.saldo === '' || c.saldo == null || !Number.isFinite(m) || m < 0 || m > 100000) return json({ error: 'Poné el saldo en dólares' }, 400);
    await env.DB.prepare('UPDATE ia_saldo SET monto = ?, desde = ?, gastado = 0, corte = NULL WHERE id = 1').bind(m, Date.now()).run();
  } else if (metodo !== 'GET') return json({ error: 'Método no permitido' }, 405);
  const desde = diaBA(Date.now() - 29 * 864e5);
  const [dias, tareas, saldo, inicio] = await env.DB.batch([
    env.DB.prepare('SELECT dia, SUM(costo) AS costo, SUM(llamadas) AS llamadas FROM ia_gasto WHERE dia >= ? GROUP BY dia ORDER BY dia').bind(desde),
    env.DB.prepare('SELECT dia, tarea, SUM(costo) AS costo, SUM(llamadas) AS llamadas, SUM(sin_precio) AS sin_precio FROM ia_gasto WHERE dia >= ? GROUP BY dia, tarea').bind(desde),
    env.DB.prepare('SELECT monto, desde, gastado, corte FROM ia_saldo WHERE id = 1'),
    env.DB.prepare('SELECT MIN(dia) AS dia FROM ia_gasto'),
  ]);
  return json({ hoy: diaBA(), dias: dias.results, tareas: tareas.results, saldo: saldo.results[0] ?? null, inicio: inicio.results[0]?.dia ?? null });
}
