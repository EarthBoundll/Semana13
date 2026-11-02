import type { AppState, Exercise, LoggedExercise, WorkoutLog } from '../types';
import { addDays, todayKey, weekStart } from './dates';
import { assignRotation } from './plan';
import { suggest } from './progression';
import { buildExMap, mutate, uid, type ExMap } from './store';
import { budgetFor, deadlineFor, deadlineOf, fitPlan, paceFactor, remainingSec, type FitItem } from './timing';

export function makeLoggedExercise(ex: Exercise, target: LoggedExercise['target'], logs: AppState['logs']): LoggedExercise {
  const sug = suggest(ex, target, logs);
  return {
    uid: uid(),
    exerciseId: ex.id,
    target,
    sets: Array.from({ length: target.sets }, () => ({ weight: sug.weight, reps: null, done: false })),
  };
}

export function startWorkout(dayId: string, date = todayKey()) {
  mutate((s) => {
    const day = s.routine.find((d) => d.id === dayId);
    if (!day) return;
    const exMap = buildExMap(s.customExercises);
    const now = Date.now();
    s.active = {
      id: uid(),
      date,
      dayId,
      dayName: day.name,
      startedAt: now,
      finishedAt: null,
      deadline: deadlineFor(s.profile, now),
      currentUid: null,
      currentSince: null,
      alerts: [],
      exercises: day.exercises.flatMap((re) => {
        const ex = exMap.get(re.exerciseId);
        return ex ? [makeLoggedExercise(ex, { sets: re.sets, repsMin: re.repsMin, repsMax: re.repsMax, rest: re.rest }, s.logs)] : [];
      }),
    };
  });
}

// ─────────────────────────── Cronómetro por ejercicio ───────────────────────────

/** Detiene el cronómetro del ejercicio actual y suma su tiempo */
export function stopCurrentIn(a: WorkoutLog, now: number) {
  if (a.currentUid && a.currentSince) {
    const cur = a.exercises.find((e) => e.uid === a.currentUid);
    if (cur) cur.elapsedMs = (cur.elapsedMs ?? 0) + (now - a.currentSince);
  }
  a.currentUid = null;
  a.currentSince = null;
}

/** Empieza a cronometrar un ejercicio y le asigna su tiempo según lo que queda */
export function startExerciseIn(a: WorkoutLog, exUid: string, now: number, exMap: ExMap, pace: number) {
  if (a.currentUid === exUid) return;
  stopCurrentIn(a, now);
  const le = a.exercises.find((e) => e.uid === exUid);
  if (!le) return;
  le.budgetSec = budgetFor(le, a, exMap, now, pace);
  le.startedAt ??= now;
  a.currentUid = exUid;
  a.currentSince = now;
}

export function startExercise(exUid: string) {
  mutate((s) => {
    if (!s.active) return;
    const exMap = buildExMap(s.customExercises);
    startExerciseIn(s.active, exUid, Date.now(), exMap, paceFactor(s.logs, exMap));
  });
}

export function pauseExercise() {
  mutate((s) => {
    if (s.active) stopCurrentIn(s.active, Date.now());
  });
}

export function setDeadline(ms: number) {
  mutate((s) => {
    if (s.active) {
      s.active.deadline = ms;
      s.active.alerts = (s.active.alerts ?? []).filter((x) => !x.startsWith('deadline'));
    }
  });
}

/**
 * Recorta lo que falta del entrenamiento para terminar a tiempo.
 * Devuelve la lista de cambios hechos.
 */
export function fitActiveToDeadline(): { changes: string[]; fits: boolean } {
  let result = { changes: [] as string[], fits: true };
  mutate((s) => {
    const a = s.active;
    if (!a) return;
    const exMap = buildExMap(s.customExercises);
    const pace = paceFactor(s.logs, exMap);
    const now = Date.now();
    const items: FitItem[] = [];
    for (const le of a.exercises) {
      const left = le.sets.filter((x) => !x.done).length;
      if (!left) continue;
      const ex = exMap.get(le.exerciseId);
      const started = le.sets.some((x) => x.done) || le.uid === a.currentUid;
      items.push({
        key: le.uid,
        name: ex?.name ?? 'Ejercicio',
        ex,
        sets: left,
        minSets: started ? 1 : 0,
        rest: le.target.rest,
        repsMin: le.target.repsMin,
        repsMax: le.target.repsMax,
        removable: !started,
      });
    }
    const target = (deadlineOf(a) - now) / 1000;
    const res = fitPlan(items, target, pace);
    for (const it of res.items) {
      const le = a.exercises.find((e) => e.uid === it.key);
      if (!le) continue;
      le.target.rest = it.rest;
      le.target.repsMin = it.repsMin;
      le.target.repsMax = it.repsMax;
      let left = le.sets.filter((x) => !x.done).length;
      while (left > it.sets) {
        const idx = le.sets.map((x) => x.done).lastIndexOf(false);
        if (idx < 0) break;
        le.sets.splice(idx, 1);
        left--;
      }
    }
    a.exercises = a.exercises.filter((e) => e.sets.length > 0);
    result = { changes: res.changes, fits: res.fits };
  });
  return result;
}

export function remainingWorkSec(a: WorkoutLog, exMap: ExMap): number {
  return a.exercises.reduce((n, le) => n + remainingSec(le, exMap.get(le.exerciseId)), 0);
}

export function finishWorkout() {
  mutate((s) => {
    const a = s.active;
    if (!a) return;
    stopCurrentIn(a, Date.now());
    a.finishedAt = Date.now();
    a.exercises = a.exercises.map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) })).filter((e) => e.sets.length);
    s.active = null;
    if (!a.exercises.length) return;
    s.logs.push(a);
    s.logs.sort((x, y) => x.date.localeCompare(y.date) || x.startedAt - y.startedAt);
    const planned = s.plan[a.date];
    s.plan[a.date] = a.dayId;
    // Si hiciste otro día distinto al planificado, reordena los siguientes de la semana
    if (planned && planned !== a.dayId) {
      const end = addDays(weekStart(a.date), 6);
      const future = Object.keys(s.plan).filter((d) => d > a.date && d <= end);
      Object.assign(s.plan, assignRotation(s, future));
    }
  });
}

export function discardWorkout() {
  mutate((s) => {
    s.active = null;
  });
}

let audio: AudioContext | null = null;

/** Prepara el audio (debe llamarse desde un toque del usuario) */
export function primeAudio() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audio && Ctx) audio = new Ctx();
    if (audio?.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

export function beep() {
  try {
    navigator.vibrate?.([200, 100, 200]);
    if (!audio) return;
    const t0 = audio.currentTime;
    [0, 0.25].forEach((off) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + off);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + off + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.18);
      o.connect(g).connect(audio!.destination);
      o.start(t0 + off);
      o.stop(t0 + off + 0.2);
    });
  } catch {
    /* sin sonido */
  }
}
