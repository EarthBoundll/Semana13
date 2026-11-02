import type { AppState, Profile, SplitStyle } from '../types';
import { todayKey } from './dates';
import { isAvailable } from './equipment';
import { alternativesFor, cardioFor, generateRoutine } from './generator';
import { assignRotation, autoPlanCurrentWeek } from './plan';
import { buildExMap, mutate } from './store';
import { paceFactor } from './timing';

/** Tras cambiar los días de la rutina, reasigna en orden los días futuros ya planificados. */
export function remapFuturePlanIn(s: AppState) {
  const today = todayKey();
  const future = Object.keys(s.plan).filter((d) => d >= today);
  for (const d of future) delete s.plan[d];
  Object.assign(s.plan, assignRotation(s, future));
}

export function remapFuturePlan() {
  mutate(remapFuturePlanIn);
}

/** Primera vez que se abre la app: arma todo con los ajustes por defecto, sin preguntar nada. */
export function firstRun() {
  mutate((s) => {
    if (s.onboarded) return;
    const exMap = buildExMap(s.customExercises);
    const { routine } = generateRoutine({
      days: s.profile.daysPerWeek,
      style: s.profile.style,
      current: s.routine,
      exMap,
      profile: s.profile,
      favorites: s.favorites,
      disliked: s.disliked,
    });
    s.routine = routine;
    s.onboarded = true;
    autoPlanCurrentWeek(s);
  });
}

/** Rehace la rutina con el perfil actual (conserva tu día propio y los días bloqueados). */
export function regenerate(overrides: Partial<Profile> = {}, style?: SplitStyle): Exclude<SplitStyle, 'auto'> {
  let result: Exclude<SplitStyle, 'auto'> = 'full';
  mutate((s) => {
    const exMap = buildExMap(s.customExercises);
    const profile = { ...s.profile, ...overrides };
    const res = generateRoutine({
      days: profile.daysPerWeek,
      style: style ?? profile.style,
      current: s.routine,
      exMap,
      profile,
      favorites: s.favorites,
      disliked: s.disliked,
      seed: Date.now(),
      pace: paceFactor(s.logs, exMap),
    });
    s.profile = profile;
    s.routine = res.routine;
    remapFuturePlanIn(s);
    result = res.style;
  });
  return result;
}

/** Pone (o quita) el cardio al final de cada día según los ajustes. */
export function applyCardioToRoutine() {
  mutate((s) => {
    const exMap = buildExMap(s.customExercises);
    for (const d of s.routine) {
      while (d.exercises.length && exMap.get(d.exercises[d.exercises.length - 1].exerciseId)?.unit === 'min') d.exercises.pop();
      const c = cardioFor(s.profile, exMap);
      if (c) d.exercises.push(c);
    }
  });
}

/** Pide al navegador que no borre los datos (almacenamiento persistente). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Cambia los ejercicios de tu rutina que no puedes hacer con tu equipo por el mejor reemplazo. */
export function replaceUnavailable(): number {
  let changed = 0;
  mutate((s) => {
    const exMap = buildExMap(s.customExercises);
    for (const d of s.routine) {
      const used = new Set(d.exercises.map((e) => e.exerciseId));
      for (const re of d.exercises) {
        const ex = exMap.get(re.exerciseId);
        if (!ex || isAvailable(ex, s.profile)) continue;
        const alt = alternativesFor(ex.id, exMap, s.profile, s.favorites, s.disliked, [...used]).find((a) => isAvailable(a.ex, s.profile));
        if (!alt) continue;
        used.delete(re.exerciseId);
        re.exerciseId = alt.ex.id;
        used.add(alt.ex.id);
        if (alt.ex.unit === 'min' && ex.unit !== 'min') Object.assign(re, { sets: 1, repsMin: s.profile.cardioMin || 15, repsMax: s.profile.cardioMin || 15, rest: 0 });
        changed++;
      }
    }
    if (s.profile.cardioId) {
      const c = exMap.get(s.profile.cardioId);
      if (c && !isAvailable(c, s.profile)) s.profile.cardioId = 'caminadora';
    }
  });
  return changed;
}

export function countUnavailable(s: AppState): number {
  const exMap = buildExMap(s.customExercises);
  return s.routine.reduce((n, d) => n + d.exercises.filter((re) => {
    const e = exMap.get(re.exerciseId);
    return e && !isAvailable(e, s.profile);
  }).length, 0);
}
