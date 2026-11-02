import { useMemo, useSyncExternalStore } from 'react';
import { BANK } from '../data/exercises';
import { EQUIPMENT_ORDER } from '../data/meta';
import type { AppState, Exercise, Profile } from '../types';

const KEY = 'gymplan:v1';

export const defaultProfile: Profile = {
  name: '',
  heightCm: null,
  goalWeight: null,
  goal: 'hipertrofia',
  level: 'intermedio',
  equipment: [...EQUIPMENT_ORDER],
  sessionMinutes: 60,
  daysPerWeek: 4,
  setsPref: null,
  style: 'auto',
  theme: 'system',
};

export function initialState(): AppState {
  return {
    version: 1,
    onboarded: false,
    profile: { ...defaultProfile },
    routine: [],
    plan: {},
    logs: [],
    active: null,
    weights: [],
    customExercises: [],
    favorites: [],
    disliked: [],
  };
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Acepta datos guardados o importados y los normaliza al formato actual. */
export function normalize(raw: unknown): AppState {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  const x = raw as Partial<AppState>;
  return {
    ...base,
    onboarded: Boolean(x.onboarded),
    profile: { ...base.profile, ...(x.profile ?? {}) },
    routine: arr(x.routine),
    plan: x.plan && typeof x.plan === 'object' ? (x.plan as Record<string, string>) : {},
    logs: arr(x.logs),
    active: x.active ?? null,
    weights: arr(x.weights),
    customExercises: arr(x.customExercises),
    favorites: arr(x.favorites),
    disliked: arr(x.disliked),
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : initialState();
  } catch {
    return initialState();
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

function flush() {
  window.clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

export function getState(): AppState {
  return state;
}

export function setState(next: AppState) {
  state = next;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flush, 120);
  listeners.forEach((l) => l());
}

/** Copia el estado, aplica cambios y guarda. */
export function mutate(fn: (draft: AppState) => void) {
  const draft = structuredClone(state);
  fn(draft);
  setState(draft);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState);
}

export type ExMap = Map<string, Exercise>;

export function buildExMap(custom: Exercise[]): ExMap {
  const m = new Map<string, Exercise>();
  for (const e of BANK) m.set(e.id, e);
  for (const e of custom) m.set(e.id, e);
  return m;
}

export function useExMap(): ExMap {
  const s = useAppState();
  return useMemo(() => buildExMap(s.customExercises), [s.customExercises]);
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 12);
  return Math.random().toString(36).slice(2, 14);
}

export function applyTheme(theme: Profile['theme']) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('gymplan:theme', theme);
  } catch {
    /* sin almacenamiento */
  }
}
