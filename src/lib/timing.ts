import type { Exercise, LoggedExercise, Profile, WorkoutLog } from '../types';
import type { ExMap } from './store';

/** Cambio de máquina, preparar discos, etc. */
export const TRANSITION_SEC = 60;
export const WARMUP_MIN = 5;
/** Margen de seguridad antes de la hora límite al planificar */
export const SAFETY_MIN = 5;

// ─────────────────────────── Horario ───────────────────────────

export function parseHHMM(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 24 * 60 ? v : null;
}

export function fmtHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Minutos entre la hora de llegada y la hora límite (null si no hay horario) */
export function scheduleMinutes(p: Profile): number | null {
  const a = parseHHMM(p.gymStart);
  const b = parseHHMM(p.gymEnd);
  if (a == null || b == null) return null;
  const d = b - a;
  return d >= 15 ? d : null;
}

export function hasSchedule(p: Profile): boolean {
  return scheduleMinutes(p) != null;
}

/** Tiempo real disponible por sesión */
export function availableMinutes(p: Profile): number {
  return scheduleMinutes(p) ?? p.sessionMinutes;
}

/** Minutos con los que se arma la rutina: con horario fijo deja margen y nunca se pasa */
export function planningBudget(p: Profile): number {
  const s = scheduleMinutes(p);
  return s != null ? s - SAFETY_MIN : Math.round(p.sessionMinutes * 1.05);
}

export function atTime(hhmm: string, base: Date): number {
  const m = parseHHMM(hhmm) ?? 0;
  const d = new Date(base);
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}

/** Hora en la que debes terminar el entrenamiento que empieza ahora */
export function deadlineFor(p: Profile, now = Date.now()): number {
  if (hasSchedule(p) && p.gymEnd && p.gymStart) {
    const end = atTime(p.gymEnd, new Date(now));
    const start = atTime(p.gymStart, new Date(now));
    // Si estás dentro de tu franja (o llegaste un poco antes), manda la hora límite real
    if (now >= start - 90 * 60000 && now < end - 10 * 60000) return end;
  }
  return now + availableMinutes(p) * 60000;
}

// ─────────────────────────── Estimaciones ───────────────────────────

export function workSec(ex: Exercise | undefined, repsMin: number, repsMax: number): number {
  return ex?.unit === 'seg' ? repsMax : Math.round(((repsMin + repsMax) / 2) * 3.5);
}

/** Segundos de un ejercicio completo: series × (trabajo + descanso) + cambio de máquina */
export function blockSec(ex: Exercise | undefined, sets: number, rest: number, repsMin: number, repsMax: number): number {
  if (sets <= 0) return 0;
  return sets * (workSec(ex, repsMin, repsMax) + rest) + TRANSITION_SEC;
}

/**
 * Tu ritmo real: cuánto tardas de verdad frente a lo estimado (mediana de tus últimos
 * entrenamientos). 1 = como lo estimado, 1.15 = tardas un 15 % más.
 */
export function paceFactor(logs: WorkoutLog[], exMap: ExMap): number {
  const ratios: number[] = [];
  for (const l of logs.slice(-6)) {
    if (!l.finishedAt) continue;
    const actual = (l.finishedAt - l.startedAt) / 1000;
    let est = 0;
    for (const e of l.exercises) est += blockSec(exMap.get(e.exerciseId), e.sets.length, e.target.rest, e.target.repsMin, e.target.repsMax);
    if (est < 600 || actual < 300) continue;
    ratios.push(actual / est);
  }
  if (ratios.length < 2) return 1;
  ratios.sort((a, b) => a - b);
  const med = ratios[Math.floor(ratios.length / 2)];
  return Math.min(1.4, Math.max(0.8, Math.round(med * 100) / 100));
}

// ─────────────────────────── Ajustar al tiempo ───────────────────────────

export interface FitItem {
  key: string;
  name: string;
  ex?: Exercise;
  sets: number;
  minSets: number;
  rest: number;
  repsMin: number;
  repsMax: number;
  removable: boolean;
}

/**
 * Recorta un plan hasta que quepa en el tiempo: primero acorta descansos largos,
 * luego quita series (aislados antes que multiarticulares, del final hacia el inicio)
 * y por último quita ejercicios aislados del final.
 */
export function fitPlan(items: FitItem[], targetSec: number, pace = 1): { items: FitItem[]; changes: string[]; fits: boolean } {
  const it = items.map((x) => ({ ...x }));
  const total = () => it.reduce((a, x) => a + blockSec(x.ex, x.sets, x.rest, x.repsMin, x.repsMax), 0) * pace;
  const changes: string[] = [];
  if (total() <= targetSec) return { items: it, changes, fits: true };

  let shortened = false;
  for (const x of it) {
    const cap = x.ex?.kind === 'compuesto' ? 90 : 60;
    if (x.sets > 0 && x.rest > cap) {
      x.rest = cap;
      shortened = true;
    }
  }
  if (shortened) changes.push('Descansos más cortos (1:30 en multiarticulares, 1:00 en aislados)');

  const iso = (x: FitItem) => x.ex?.kind !== 'compuesto';
  for (let guard = 0; guard < 200 && total() > targetSec; guard++) {
    const order = [...it].reverse();
    const alive = it.filter((x) => x.sets > 0).length;
    const cut =
      order.find((x) => iso(x) && x.sets > Math.max(x.minSets, 2)) ??
      order.find((x) => !iso(x) && x.sets > Math.max(x.minSets, 3));
    if (cut) {
      cut.sets--;
      continue;
    }
    const drop = order.find((x) => x.removable && x.sets > 0 && iso(x) && alive > 3) ?? order.find((x) => x.removable && x.sets > 0 && alive > 3);
    if (drop) {
      drop.sets = 0;
      continue;
    }
    const last = order.find((x) => x.sets > Math.max(x.minSets, 2));
    if (last) {
      last.sets--;
      continue;
    }
    break;
  }

  for (const x of it) {
    const orig = items.find((o) => o.key === x.key)!;
    if (x.sets === 0 && orig.sets > 0) changes.push(`Quité «${x.name}»`);
    else if (x.sets < orig.sets) changes.push(`${x.name}: ${orig.sets} → ${x.sets} series`);
  }
  return { items: it, changes, fits: total() <= targetSec };
}

// ─────────────────────────── Durante el entrenamiento ───────────────────────────

/** Segundos que le faltan a un ejercicio (series sin marcar) */
export function remainingSec(le: LoggedExercise, ex: Exercise | undefined): number {
  const left = le.sets.filter((s) => !s.done).length;
  if (!left) return 0;
  const started = le.sets.some((s) => s.done);
  return left * (workSec(ex, le.target.repsMin, le.target.repsMax) + le.target.rest) + (started ? 0 : TRANSITION_SEC);
}

export function fullSec(le: LoggedExercise, ex: Exercise | undefined): number {
  return blockSec(ex, le.sets.length, le.target.rest, le.target.repsMin, le.target.repsMax);
}

export function exerciseElapsed(le: LoggedExercise, a: WorkoutLog, now: number): number {
  return (le.elapsedMs ?? 0) + (a.currentUid === le.uid && a.currentSince ? now - a.currentSince : 0);
}

export function deadlineOf(a: WorkoutLog): number {
  return a.deadline ?? a.startedAt + 60 * 60000;
}

/** Hora estimada de término al ritmo actual y margen frente a la hora límite */
export function projection(a: WorkoutLog, exMap: ExMap, now: number, pace: number) {
  let sec = 0;
  for (const le of a.exercises) sec += remainingSec(le, exMap.get(le.exerciseId));
  const end = now + sec * pace * 1000;
  const deadline = deadlineOf(a);
  return { end, deadline, slackMs: deadline - end, remainingMs: deadline - now };
}

/**
 * Tiempo que le toca a un ejercicio: reparte lo que queda hasta la hora límite
 * entre lo que falta (nunca más de un 25 % extra de lo estimado).
 */
export function budgetFor(le: LoggedExercise, a: WorkoutLog, exMap: ExMap, now: number, pace: number): number {
  let need = 0;
  for (const e of a.exercises) need += remainingSec(e, exMap.get(e.exerciseId));
  need *= pace;
  const ex = exMap.get(le.exerciseId);
  const avail = (deadlineOf(a) - now) / 1000;
  const scale = need > 0 ? Math.min(1.25, Math.max(0.5, avail / need)) : 1;
  return Math.round(fullSec(le, ex) * pace * scale);
}

/** Recorta un día de rutina para que quepa en los minutos dados */
export function fitRoutineDay(
  exercises: { uid: string; exerciseId: string; sets: number; repsMin: number; repsMax: number; rest: number }[],
  exMap: ExMap,
  budgetMin: number,
  pace = 1,
) {
  const items: FitItem[] = exercises.map((re) => ({
    key: re.uid,
    name: exMap.get(re.exerciseId)?.name ?? 'Ejercicio',
    ex: exMap.get(re.exerciseId),
    sets: re.sets,
    minSets: 1,
    rest: re.rest,
    repsMin: re.repsMin,
    repsMax: re.repsMax,
    removable: true,
  }));
  const res = fitPlan(items, (budgetMin - WARMUP_MIN) * 60, pace);
  const out = exercises
    .map((re) => {
      const it = res.items.find((x) => x.key === re.uid)!;
      return { ...re, sets: it.sets, rest: it.rest };
    })
    .filter((re) => re.sets > 0);
  return { exercises: out, changes: res.changes, fits: res.fits };
}
