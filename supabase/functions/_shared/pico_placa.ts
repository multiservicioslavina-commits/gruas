// ─────────────────────────────────────────────────────────────────
// Pico y placa de motos (y carros) — Medellin y Area Metropolitana.
//
// Una sola tabla de rotacion para todo el repo. Antes habia tres copias
// (alerta-pico-placa, consultar_pico_placa en rita-v2/tools.ts y el bloque
// del system prompt en rita-v2/index.ts), y una tabla desactualizada ya
// causo alertas en el dia equivocado. Cuando salga el decreto de la
// siguiente rotacion, se actualiza aca y nada mas.
//
// Sin dependencias ni acceso a red o a la base, para que cualquier funcion
// lo pueda importar (y probar) sin credenciales.
// ─────────────────────────────────────────────────────────────────

const INICIO_SEGUNDO_SEMESTRE_2026 = new Date("2026-08-03T00:00:00-05:00");

// Clave: getDay() de Colombia (1 = lunes ... 5 = viernes). Sabado y domingo
// no tienen entrada: no aplica pico y placa.
export function digitosPorDia(ahora: Date): Record<number, number[]> {
  return ahora >= INICIO_SEGUNDO_SEMESTRE_2026
    ? { 1: [5, 8], 2: [1, 4], 3: [0, 2], 4: [3, 6], 5: [7, 9] }
    : { 1: [1, 7], 2: [0, 3], 3: [4, 6], 4: [5, 9], 5: [2, 8] };
}

// La rotacion del segundo semestre no trae fecha de fin: se usa hasta que
// alguien cargue la siguiente. Por eso cada respuesta dice de que rotacion
// sale el dato, en vez de presentarlo como vigente sin mas.
export function vigenciaRotacion(ahora: Date): string {
  return ahora >= INICIO_SEGUNDO_SEMESTRE_2026
    ? "Rotacion del segundo semestre de 2026 (vigente desde el 3 de agosto de 2026)"
    : "Rotacion del primer semestre de 2026 (del 2 de febrero al 31 de julio de 2026)";
}

export const HORARIO_PICO_PLACA = "5:00 a.m. a 8:00 p.m.";

export const NOMBRE_DIA: Record<number, string> = {
  0: "domingo", 1: "lunes", 2: "martes", 3: "miercoles", 4: "jueves", 5: "viernes", 6: "sabado",
};

// Fecha (YYYY-MM-DD) y dia de la semana en hora Colombia, sin depender de la
// zona horaria del runtime (las edge functions corren en UTC).
export function hoyEnBogota(ahora: Date = new Date()): { fecha: string; weekday: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(ahora);

  const get = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const fecha = `${get("year")}-${get("month")}-${get("day")}`;
  const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = DIAS[get("weekday")] ?? new Date(fecha).getDay();
  return { fecha, weekday };
}

// Dia de la semana (nombre) en que le toca pico y placa a un digito, o null
// si ese digito no esta en la rotacion (no deberia pasar: la rotacion cubre
// del 0 al 9).
export function diaParaDigito(digito: number, ahora: Date): string | null {
  const tabla = digitosPorDia(ahora);
  const weekday = Object.entries(tabla).find(([, ds]) => ds.includes(digito))?.[0];
  return weekday ? NOMBRE_DIA[Number(weekday)] : null;
}
