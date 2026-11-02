import type { Exercise, LoggedExercise, WorkoutLog } from '../types';

/** 1RM estimado (fórmula de Epley) */
export function e1rm(weight: number, reps: number): number {
  if (!weight || !reps) return 0;
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

export function round(n: number, step = 0.5): number {
  return Math.round(n / step) * step;
}

export function fmtKg(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** Cuánto subir cuando toca progresar */
export function increment(ex: Exercise): number {
  const lower = ['cuadriceps', 'isquios', 'gluteos'].includes(ex.primary);
  switch (ex.equipment) {
    case 'barra':
      return ex.kind === 'compuesto' && lower ? 5 : 2.5;
    case 'mancuernas':
      return 2;
    case 'maquina':
    case 'polea':
      return ex.kind === 'compuesto' ? 5 : 2.5;
    case 'kettlebell':
      return 4;
    default:
      return 2.5;
  }
}

export interface PastPerformance {
  date: string;
  sets: { weight: number; reps: number }[];
}

/** Las últimas veces que se hizo un ejercicio (más reciente primero) */
export function history(logs: WorkoutLog[], exerciseId: string, limit = 3): PastPerformance[] {
  const out: PastPerformance[] = [];
  for (let i = logs.length - 1; i >= 0 && out.length < limit; i--) {
    const log = logs[i];
    const le = log.exercises.find((e) => e.exerciseId === exerciseId);
    if (!le) continue;
    const sets = le.sets.filter((s) => s.done && s.reps).map((s) => ({ weight: s.weight ?? 0, reps: s.reps ?? 0 }));
    if (sets.length) out.push({ date: log.date, sets });
  }
  return out;
}

export interface Suggestion {
  tone: 'new' | 'up' | 'keep' | 'down';
  weight: number | null;
  /** reps objetivo por serie (para pre-rellenar) */
  reps: number[];
  text: string;
}

/**
 * Doble progresión: si la última vez llegaste al tope de repeticiones en todas las series,
 * sube el peso; si te quedaste corto dos veces, baja un poco; si no, mantén y suma reps.
 */
export function suggest(ex: Exercise, target: LoggedExercise['target'], logs: WorkoutLog[]): Suggestion {
  if (ex.unit === 'min') {
    return {
      tone: 'keep',
      weight: null,
      reps: Array(target.sets).fill(target.repsMax),
      text: `${target.repsMax} min a ritmo constante. Si terminas con energía, la próxima vez sube un poco la velocidad o la inclinación.`,
    };
  }
  const past = history(logs, ex.id, 2);
  const n = target.sets;
  const unit = ex.unit === 'seg' ? 's' : '';
  if (!past.length) {
    return {
      tone: 'new',
      weight: null,
      reps: Array(n).fill(target.repsMax),
      text:
        ex.unit === 'seg'
          ? `Primera vez: aguanta ${target.repsMin}–${target.repsMax} s por serie.`
          : `Primera vez: elige un peso con el que llegues a ${target.repsMax} reps dejando 1–2 en reserva.`,
    };
  }
  const last = past[0];
  const topWeight = Math.max(...last.sets.map((s) => s.weight));
  const work = last.sets.filter((s) => s.weight === topWeight);
  const allTop = work.length >= Math.min(n, last.sets.length) && work.every((s) => s.reps >= target.repsMax) && last.sets.length >= n;
  const avgReps = work.reduce((a, s) => a + s.reps, 0) / (work.length || 1);
  const bodyweight = !topWeight;

  if (allTop) {
    if (bodyweight || ex.unit === 'seg') {
      return {
        tone: 'up',
        weight: topWeight || null,
        reps: Array(n).fill(target.repsMax + (ex.unit === 'seg' ? 5 : 1)),
        text: ex.unit === 'seg' ? `¡Dominado! Intenta ${target.repsMax + 5}${unit} por serie.` : '¡Llegaste al tope! Suma 1 rep, añade lastre o pasa a una variante más difícil.',
      };
    }
    const w = round(topWeight + increment(ex), 0.5);
    return {
      tone: 'up',
      weight: w,
      reps: Array(n).fill(target.repsMin),
      text: `Completaste todas las reps con ${topWeight} kg. Sube a ${w} kg y busca ${target.repsMin}+ reps.`,
    };
  }

  const prev = past[1];
  const prevTop = prev ? Math.max(...prev.sets.map((s) => s.weight)) : null;
  const prevFailed = prev && prevTop === topWeight && prev.sets.filter((s) => s.weight === prevTop).every((s) => s.reps < target.repsMin);
  if (avgReps < target.repsMin && prevFailed && topWeight > 0) {
    const w = round(topWeight * 0.9, 0.5);
    return {
      tone: 'down',
      weight: w,
      reps: Array(n).fill(target.repsMin),
      text: `Dos sesiones por debajo de ${target.repsMin} reps. Baja a ${w} kg para volver a progresar con buena técnica.`,
    };
  }

  const reps = Array.from({ length: n }, (_, i) => {
    const r = last.sets[i]?.reps ?? target.repsMin;
    return Math.min(target.repsMax, Math.max(target.repsMin, r + 1));
  });
  return {
    tone: 'keep',
    weight: topWeight || null,
    reps,
    text: bodyweight
      ? `Mantén y suma 1 ${ex.unit === 'seg' ? 'segundo' : 'rep'} por serie hasta llegar a ${target.repsMax}${unit}.`
      : `Mantén ${topWeight} kg y suma 1 rep por serie hasta llegar a ${target.repsMax}.`,
  };
}

/** Mejor 1RM estimado por sesión, para el gráfico de progreso de un ejercicio */
export function e1rmSeries(logs: WorkoutLog[], exerciseId: string): { date: string; value: number; best: string }[] {
  const out: { date: string; value: number; best: string }[] = [];
  for (const log of logs) {
    const le = log.exercises.find((e) => e.exerciseId === exerciseId);
    if (!le) continue;
    let best = 0;
    let label = '';
    for (const s of le.sets) {
      if (!s.done || !s.reps || !s.weight) continue;
      const v = e1rm(s.weight, s.reps);
      if (v > best) {
        best = v;
        label = `${fmtKg(s.weight)} kg × ${s.reps}`;
      }
    }
    if (best) out.push({ date: log.date, value: Math.round(best * 10) / 10, best: label });
  }
  return out;
}

export function logVolume(log: WorkoutLog): number {
  let v = 0;
  for (const e of log.exercises) for (const s of e.sets) if (s.done && s.weight && s.reps) v += s.weight * s.reps;
  return Math.round(v);
}

export function logSetsDone(log: WorkoutLog): number {
  return log.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
}

/** Récords nuevos de una sesión comparada con todas las anteriores */
export function findPRs(log: WorkoutLog, previous: WorkoutLog[]): { exerciseId: string; value: number; label: string }[] {
  const out: { exerciseId: string; value: number; label: string }[] = [];
  for (const le of log.exercises) {
    let best = 0;
    let label = '';
    for (const s of le.sets) {
      if (!s.done || !s.weight || !s.reps) continue;
      const v = e1rm(s.weight, s.reps);
      if (v > best) {
        best = v;
        label = `${fmtKg(s.weight)} kg × ${s.reps}`;
      }
    }
    if (!best) continue;
    const prevBest = Math.max(0, ...e1rmSeries(previous, le.exerciseId).map((x) => x.value));
    if (prevBest > 0 && best > prevBest + 0.01) out.push({ exerciseId: le.exerciseId, value: best, label });
  }
  return out;
}
