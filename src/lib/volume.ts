import { MUSCLE_ORDER } from '../data/meta';
import type { Level, Muscle, RoutineDay } from '../types';
import type { ExMap } from './store';

/** Series semanales recomendadas por músculo (rangos habituales para hipertrofia) */
export function targets(level: Level): Record<Muscle, [number, number]> {
  const big: [number, number] = level === 'principiante' ? [6, 12] : level === 'intermedio' ? [10, 20] : [12, 24];
  const arms: [number, number] = level === 'principiante' ? [4, 10] : level === 'intermedio' ? [6, 16] : [8, 18];
  return {
    pecho: big,
    espalda: big,
    hombros: big,
    cuadriceps: big,
    isquios: [Math.max(4, big[0] - 4), big[1] - 4],
    gluteos: [Math.max(4, big[0] - 4), big[1]],
    biceps: arms,
    triceps: arms,
    pantorrillas: [3, 12],
    core: [3, 12],
    antebrazos: [0, 10],
  };
}

/** Series por músculo en una semana: el principal cuenta 1, los secundarios 0,5 */
export function volumeOf(days: RoutineDay[], exMap: ExMap, factor: number): Record<Muscle, number> {
  const vol = Object.fromEntries(MUSCLE_ORDER.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const d of days) {
    for (const re of d.exercises) {
      const ex = exMap.get(re.exerciseId);
      if (!ex) continue;
      vol[ex.primary] += re.sets * factor;
      for (const m of ex.secondary) vol[m] += re.sets * 0.5 * factor;
    }
  }
  for (const m of MUSCLE_ORDER) vol[m] = Math.round(vol[m] * 2) / 2;
  return vol;
}

export type Status = 'bajo' | 'ok' | 'alto';

/** Un 10 % por encima del máximo todavía se considera bien */
export const HIGH_TOLERANCE = 1.1;

export function statusOf(v: number, [min, max]: [number, number]): Status {
  if (v < min) return 'bajo';
  if (v > max * HIGH_TOLERANCE) return 'alto';
  return 'ok';
}
