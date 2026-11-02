import type { AppState, Exercise, LoggedExercise } from '../types';
import { addDays, todayKey, weekStart } from './dates';
import { assignRotation } from './plan';
import { suggest } from './progression';
import { buildExMap, mutate, uid } from './store';

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
    s.active = {
      id: uid(),
      date,
      dayId,
      dayName: day.name,
      startedAt: Date.now(),
      finishedAt: null,
      exercises: day.exercises.flatMap((re) => {
        const ex = exMap.get(re.exerciseId);
        return ex ? [makeLoggedExercise(ex, { sets: re.sets, repsMin: re.repsMin, repsMax: re.repsMax, rest: re.rest }, s.logs)] : [];
      }),
    };
  });
}

export function finishWorkout() {
  mutate((s) => {
    const a = s.active;
    if (!a) return;
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
