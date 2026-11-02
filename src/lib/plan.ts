import { MUSCLES } from '../data/meta';
import type { AppState, Muscle, Profile, RoutineDay } from '../types';
import { addDays, DOW_LONG, dowIndex, todayKey, weekDays, weekStart } from './dates';
import { mainMuscles } from './generator';
import type { ExMap } from './store';

/** Patrones de días sugeridos (0 = lunes) para que haya descanso entre sesiones */
export const PATTERNS: Record<number, number[]> = {
  1: [2],
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export function logDates(s: AppState): Set<string> {
  return new Set(s.logs.map((l) => l.date));
}

/** Último día de rutina usado antes de una fecha (por entrenamientos hechos o planificados) */
function lastDayIdBefore(s: AppState, date: string): string | null {
  let bestDate = '';
  let id: string | null = null;
  for (const l of s.logs) {
    if (l.date < date && l.date >= bestDate && s.routine.some((d) => d.id === l.dayId)) {
      bestDate = l.date;
      id = l.dayId;
    }
  }
  for (const [d, dayId] of Object.entries(s.plan)) {
    if (d < date && d > bestDate && s.routine.some((r) => r.id === dayId)) {
      bestDate = d;
      id = dayId;
    }
  }
  return id;
}

/** Asigna días de rutina en orden de rotación (sigue donde te quedaste). */
export function assignRotation(s: AppState, dates: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s.routine.length || !dates.length) return out;
  const sorted = [...dates].sort();
  const last = lastDayIdBefore(s, sorted[0]);
  let idx = last ? s.routine.findIndex((d) => d.id === last) : -1;
  for (const d of sorted) {
    idx = (idx + 1) % s.routine.length;
    out[d] = s.routine[idx].id;
  }
  return out;
}

export function nextDayIdFor(s: AppState, date: string): string | null {
  return assignRotation(s, [date])[date] ?? null;
}

/** Elige qué días de la semana ir, respetando lo ya hecho y sin tocar días pasados. */
export function suggestWeekDates(s: AppState, start: string, count: number): string[] {
  const today = todayKey();
  const days = weekDays(start);
  const done = days.filter((d) => d < today && s.logs.some((l) => l.date === d));
  const remaining = Math.max(0, count - done.length);
  const available = days.filter((d) => d >= today);
  if (!remaining || !available.length) return [];
  if (available.length === 7) return (PATTERNS[Math.min(count, 7)] ?? []).map((i) => days[i]);
  if (remaining >= available.length) return available;
  if (remaining === 1) return [available[0]];
  // repartir de forma pareja en los días que quedan
  const picked = new Set<string>();
  for (let i = 0; i < remaining; i++) picked.add(available[Math.round((i * (available.length - 1)) / (remaining - 1))]);
  return [...picked];
}

export function applyWeekPlan(s: AppState, start: string, dates: string[]) {
  const today = todayKey();
  for (const d of weekDays(start)) if (d >= today) delete s.plan[d];
  Object.assign(s.plan, assignRotation(s, dates));
}

export interface WeekWarning {
  text: string;
}

/** Avisos: mismo músculo grande en días seguidos (necesita ~48 h de descanso). */
export function weekWarnings(s: AppState, start: string, exMap: ExMap): WeekWarning[] {
  const out: WeekWarning[] = [];
  const days = weekDays(start);
  const byId = new Map(s.routine.map((d) => [d.id, d]));
  const big: Muscle[] = ['pecho', 'espalda', 'cuadriceps', 'isquios', 'gluteos', 'hombros'];
  for (let i = 0; i < days.length - 1; i++) {
    const a = byId.get(s.plan[days[i]]);
    const b = byId.get(s.plan[days[i + 1]]);
    if (!a || !b) continue;
    const ma = mainMuscles(a, exMap, 0.18);
    const mb = mainMuscles(b, exMap, 0.18);
    const shared = ma.filter((m) => mb.includes(m) && big.includes(m));
    if (shared.length) {
      out.push({
        text: `${DOW_LONG[dowIndex(days[i])]} y ${DOW_LONG[dowIndex(days[i + 1])].toLowerCase()} trabajas ${shared
          .map((m) => MUSCLES[m].label.toLowerCase())
          .join(' y ')} seguido. Mejor deja 48 h entre ellos o cambia el orden.`,
      });
    }
  }
  return out;
}

export interface WeekStat {
  start: string;
  planned: number;
  done: number;
}

export function weekStats(s: AppState, weeks = 8): WeekStat[] {
  const cur = weekStart(todayKey());
  const out: WeekStat[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(cur, -7 * i);
    const days = weekDays(start);
    const doneDates = new Set(s.logs.filter((l) => days.includes(l.date)).map((l) => l.date));
    const plannedDates = new Set(days.filter((d) => s.plan[d]));
    const done = doneDates.size;
    const planned = new Set([...plannedDates, ...doneDates]).size;
    out.push({ start, planned, done });
  }
  return out;
}

/** Semanas seguidas (hasta la anterior) cumpliendo lo planificado */
export function streak(s: AppState): number {
  const stats = weekStats(s, 52).slice(0, -1).reverse();
  let n = 0;
  for (const w of stats) {
    if (w.planned > 0 && w.done >= w.planned) n++;
    else break;
  }
  // la semana actual suma si ya se cumplió
  const cur = weekStats(s, 1)[0];
  if (cur.planned > 0 && cur.done >= cur.planned) n++;
  return n;
}

export function dayById(s: AppState, id: string | undefined): RoutineDay | undefined {
  return id ? s.routine.find((d) => d.id === id) : undefined;
}

export function dayLetter(s: AppState, id: string): string {
  const i = s.routine.findIndex((d) => d.id === id);
  return i >= 0 ? String.fromCharCode(65 + i) : '?';
}

// ─────────────────────────── Semana habitual ───────────────────────────

/** Días de la semana a los que sueles ir (0 = lunes) */
export function habitualDays(p: Profile): number[] {
  if (p.weekDays && p.weekDays.length) return [...p.weekDays].sort((a, b) => a - b);
  return PATTERNS[Math.min(7, Math.max(1, p.daysPerWeek))] ?? [0, 3];
}

/** Planifica una semana con tus días habituales (desde hoy en adelante) */
export function applyHabitualWeek(s: AppState, start: string) {
  const today = todayKey();
  const days = weekDays(start);
  const dates = habitualDays(s.profile)
    .map((i) => days[i])
    .filter((d) => d >= today && !s.logs.some((l) => l.date === d));
  applyWeekPlan(s, start, dates);
  if (!s.autoWeeks.includes(start)) s.autoWeeks.push(start);
}

/** ¿Hay que planificar sola la semana actual? (solo una vez por semana y si está vacía) */
export function needsAutoPlan(s: AppState): boolean {
  const start = weekStart(todayKey());
  if (s.autoWeeks.includes(start) || !s.routine.length) return false;
  return true;
}

export function autoPlanCurrentWeek(s: AppState) {
  const start = weekStart(todayKey());
  if (s.autoWeeks.includes(start)) return;
  const hasPlan = weekDays(start).some((d) => s.plan[d]);
  if (hasPlan) s.autoWeeks.push(start);
  else applyHabitualWeek(s, start);
}
