/* Generaciones de cada modelo en Argentina (2005 a hoy), para no mezclar autos que se llaman
   igual pero son otro auto (ej: Peugeot 208 primera generación hasta agosto 2020, segunda desde ahí).

   De dónde sale: src/generaciones-datos.js, armado con prensa automotriz argentina y sitios de las
   marcas (no Mercado Libre). La lista legible con fuentes está en generaciones-argentina.md.

   Cómo lo usa el tasador:
     - El año anterior y el siguiente entran solo si son de la MISMA generación que el auto del cliente.
     - Si en el año del cliente se vendieron dos generaciones (año de transición) y no sabemos cuál
       tiene, se le pregunta ("es el nuevo, el que salió en agosto de 2020, o el anterior?").
     - En los años de transición, Sonnet mira la foto de cada publicación para quedarse solo con las
       de la generación del cliente.
     - Si el modelo no está en la lista, o su dato es de confianza "baja" (sin verificar con fuente
       argentina), no se le pregunta nada al cliente: Claude decide con la lista como pista.
     - Familias: el mismo auto con distinto nombre en Mercado Libre (Gol / Gol Trend, Fiesta / Fiesta
       Kinetic Design) va junto; cada generación dice con qué nombre buscarla (modelo_ml).
     - Generaciones "paralelas" (autos distintos con el mismo nombre a la vez, ej: Serie 2 Coupé y Gran
       Coupé): no se pregunta "nuevo o anterior"; se distinguen por la versión. */

import lista from './generaciones-datos.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/mercedes[\s-]*benz/, 'mercedes').replace(/[^a-z0-9]+/g, '');

const nombres = (x) => [x.modelo, ...(x.alias || [])].map(slug);

// El modelo en la lista: primero exacto (nombre o alias); si no, el nombre más largo que sea el principio del que dijo el cliente
export function buscarModelo(marca, modelo) {
  const m = slug(marca), mo = slug(modelo);
  const deLaMarca = lista.filter((x) => slug(x.marca) === m);
  return deLaMarca.find((x) => nombres(x).includes(mo))
    || deLaMarca.map((x) => ({ x, largo: Math.max(...nombres(x).filter((n) => mo.startsWith(n)).map((n) => n.length), 0) }))
      .filter((c) => c.largo).sort((a, b) => b.largo - a.largo)[0]?.x
    || null;
}

const cubre = (g, anio) => g.desde <= anio && anio <= (g.hasta ?? 9999);

// Para mostrar y para que la IA entienda: "Segunda generación (desde agosto 2020)"
export const describir = (g) =>
  `${g.nombre} (${g.desde_mes ? `${MESES[g.desde_mes - 1]} ` : ''}${g.desde} a ${g.hasta ? `${g.hasta_mes ? `${MESES[g.hasta_mes - 1]} ` : ''}${g.hasta}` : 'hoy'})${g.como_distinguirla ? `: ${g.como_distinguirla}` : ''}`;

// Qué generación eligió el cliente, según lo que contestó ("el nuevo", "el anterior" o el nombre)
function elegida(gens, texto) {
  const t = slug(texto);
  if (!t) return null;
  const exacta = gens.find((g) => slug(g.nombre) === t);
  if (exacta) return exacta;
  const ordenadas = [...gens].sort((a, b) => a.desde - b.desde || (a.desde_mes || 0) - (b.desde_mes || 0));
  if (/nuev|ultim|actual|segund|tercer|cuart/.test(t) && !/anterior|viej/.test(t)) return ordenadas[ordenadas.length - 1];
  if (/anterior|viej|primer|previ/.test(t)) return ordenadas[0];
  return gens.find((g) => g.modelo_ml && t === slug(g.modelo_ml))
    || gens.find((g) => slug(g.nombre).includes(t) || t.includes(slug(g.nombre))) || null;
}

/* Lo que necesita el tasador para un pedido { marca, modelo, anio, generacion? }:
   { enLista, falta, pregunta, gen, anios: [años que entran], transicion: { año: [otras generaciones] }, restylings } */
export function contextoDeGeneracion(p) {
  const modelo = buscarModelo(p.marca, p.modelo);
  if (!modelo) return { enLista: false };
  const pista = `Lista de generaciones (sin verificar, usar solo como pista): ${(modelo.generaciones || []).map(describir).join(' | ')}`;
  if (modelo.confianza === 'baja') return { enLista: false, pista };
  // Autos distintos vendidos a la vez con el mismo nombre: se distinguen por versión, no por la lista
  const gens = (modelo.generaciones || []).filter((g) => !g.paralela);
  if ((modelo.generaciones || []).some((g) => g.paralela && cubre(g, p.anio))) {
    return { enLista: false, pista: `${pista}. Ese año se venden en paralelo autos distintos con el mismo nombre: distinguir por versión.` };
  }
  let delAnio = gens.filter((g) => cubre(g, p.anio));
  if (!delAnio.length) return { enLista: false, pista, nota: `${p.marca} ${p.modelo} ${p.anio} no figura en la lista de generaciones` };
  /* Familias: si el cliente nombró el modelo como lo publica Mercado Libre y no con el nombre de la
     familia (ej: "Gol Trend" y no "Gol", que la gente usa para los dos), ya se sabe cuál es */
  if (slug(p.modelo) !== slug(modelo.modelo)) {
    const porNombre = delAnio.filter((g) => slug(g.modelo_ml) === slug(p.modelo));
    if (porNombre.length) delAnio = porNombre;
  }

  let gen = delAnio.length === 1 ? delAnio[0] : elegida(delAnio, p.generacion);
  if (!gen) {
    const nueva = [...delAnio].sort((a, b) => b.desde - a.desde || (b.desde_mes || 0) - (a.desde_mes || 0))[0];
    const cuando = `${nueva.desde_mes ? `en ${MESES[nueva.desde_mes - 1]} de ` : 'en '}${nueva.desde}`;
    // Si se publican con nombres distintos (Gol Trend / Gol), se pregunta por el nombre
    const nombresML = [...new Set(delAnio.map((g) => g.modelo_ml).filter(Boolean))];
    return {
      enLista: true, falta: true, generaciones: delAnio.map(describir), nombres: delAnio.map((g) => g.nombre),
      pregunta: nombresML.length === delAnio.length && nombresML.length > 1
        ? `Una consulta: tu ${p.modelo} ${p.anio} es ${[...nombresML].reverse().join(' o ')}?`
        : `Una consulta: tu ${p.modelo} ${p.anio} es el modelo nuevo, el que salió ${cuando}, o el anterior?`,
    };
  }

  // Años que entran: el del cliente y los vecinos, solo si son de su misma generación
  const anios = [p.anio - 1, p.anio, p.anio + 1].filter((a) => cubre(gen, a));
  const transicion = {};
  for (const a of anios) {
    // Solo cuentan las que Mercado Libre publica con el mismo nombre (Gol y Gol Trend ya vienen separados)
    const otras = gens.filter((g) => g !== gen && cubre(g, a) && (g.modelo_ml || '') === (gen.modelo_ml || ''));
    if (otras.length) transicion[a] = otras.map(describir);
  }
  return {
    enLista: true, falta: false, gen: describir(gen), anios, transicion, modelo: gen.modelo_ml || modelo.modelo,
    restylings: (modelo.restylings || []).filter((r) => cubre(gen, r.anio)).map((r) => `${r.mes ? `${MESES[r.mes - 1]} ` : ''}${r.anio}: ${r.detalle}`),
  };
}
