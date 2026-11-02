import { LOWER, MUSCLE_ORDER, MUSCLES, UPPER } from '../data/meta';
import type { Exercise, Goal, Kind, Level, Muscle, Profile, RoutineDay, RoutineExercise, SplitStyle } from '../types';
import { uid, type ExMap } from './store';
import { isAvailable } from './equipment';
import { blockSec, planningBudget, WARMUP_MIN } from './timing';
import { HIGH_TOLERANCE, targets, volumeOf } from './volume';

// ─────────────────────────── Series, repeticiones y tiempo ───────────────────────────

export function scheme(goal: Goal, ex: Exercise, level: Level, setsPref: number | null) {
  if (ex.unit === 'min') return { sets: 1, repsMin: 15, repsMax: 15, rest: 0 };
  if (ex.unit === 'seg') return { sets: setsPref ?? 3, repsMin: 30, repsMax: 45, rest: 45 };
  const comp = ex.kind === 'compuesto';
  const table: Record<Goal, [number, number, number, number]> = {
    hipertrofia: comp ? [4, 6, 10, 120] : [3, 10, 15, 75],
    fuerza: comp ? [5, 3, 6, 180] : [3, 8, 12, 90],
    perder_grasa: comp ? [3, 10, 12, 75] : [3, 12, 15, 45],
    resistencia: comp ? [3, 12, 15, 60] : [3, 15, 20, 45],
  };
  let [sets, repsMin, repsMax, rest] = table[goal];
  if (level === 'principiante') sets = Math.max(2, sets - 1);
  if (ex.primary === 'core' || ex.primary === 'pantorrillas') {
    repsMin = Math.max(repsMin, 12);
    repsMax = Math.max(repsMax, 20);
    rest = Math.min(rest, 60);
  }
  if (setsPref) sets = setsPref;
  return { sets, repsMin, repsMax, rest };
}

/** Minutos estimados de un día (con calentamiento). `pace` = tu ritmo real (1 = normal). */
export function estimateMinutes(list: RoutineExercise[], exMap: ExMap, pace = 1): number {
  if (!list.length) return 0;
  let sec = WARMUP_MIN * 60;
  for (const re of list) sec += blockSec(exMap.get(re.exerciseId), re.sets, re.rest, re.repsMin, re.repsMax);
  return Math.round((sec * pace) / 60);
}

/** Minutos estimados de un solo ejercicio */
export function exerciseMinutes(re: RoutineExercise, exMap: ExMap, pace = 1): number {
  return Math.max(1, Math.round((blockSec(exMap.get(re.exerciseId), re.sets, re.rest, re.repsMin, re.repsMax) * pace) / 60));
}

export function totalSets(day: RoutineDay): number {
  return day.exercises.reduce((a, e) => a + e.sets, 0);
}

// ─────────────────────────── Músculos de un día ───────────────────────────

export type MuscleVec = Partial<Record<Muscle, number>>;

export function dayMuscleVector(day: RoutineDay, exMap: ExMap, secondaryWeight = 0.5): MuscleVec {
  const v: MuscleVec = {};
  if (!day.exercises.length) {
    for (const m of day.focus) v[m] = 1;
    return v;
  }
  for (const re of day.exercises) {
    const ex = exMap.get(re.exerciseId);
    if (!ex || ex.primary === 'cardio') continue;
    v[ex.primary] = (v[ex.primary] ?? 0) + re.sets;
    for (const s of ex.secondary) v[s] = (v[s] ?? 0) + re.sets * secondaryWeight;
  }
  // El enfoque declarado por el usuario también cuenta
  for (const m of day.focus) v[m] = (v[m] ?? 0) + 1;
  return v;
}

function normalizeVec(v: MuscleVec): MuscleVec {
  const total = Object.values(v).reduce((a, b) => a + (b ?? 0), 0) || 1;
  const out: MuscleVec = {};
  for (const [k, val] of Object.entries(v)) out[k as Muscle] = (val ?? 0) / total;
  return out;
}

/** Intersección de histogramas: 0 (nada en común) a 1 (idénticos) */
function similarity(a: MuscleVec, b: MuscleVec): number {
  const na = normalizeVec(a);
  const nb = normalizeVec(b);
  let s = 0;
  for (const m of MUSCLE_ORDER) s += Math.min(na[m] ?? 0, nb[m] ?? 0);
  return s;
}

/** Músculos principales de un día, ordenados por peso */
export function mainMuscles(day: RoutineDay, exMap: ExMap, threshold = 0.15, secondaryWeight = 0.5): Muscle[] {
  const n = normalizeVec(dayMuscleVector(day, exMap, secondaryWeight));
  return MUSCLE_ORDER.filter((m) => (n[m] ?? 0) >= threshold).sort((x, y) => (n[y] ?? 0) - (n[x] ?? 0));
}

// ─────────────────────────── Plantillas de días ───────────────────────────

interface Slot {
  m: Muscle;
  k?: Kind;
  p?: string[];
}
interface DayTemplate {
  name: string;
  focus: Muscle[];
  slots: Slot[];
}

const S = (m: Muscle, k?: 'c' | 'a', p?: string[]): Slot => ({
  m,
  k: k === 'c' ? 'compuesto' : k === 'a' ? 'aislamiento' : undefined,
  p,
});

const T: Record<string, DayTemplate> = {
  push: {
    name: 'Empuje',
    focus: ['pecho', 'hombros', 'triceps'],
    slots: [
      S('pecho', 'c', ['press-horizontal']),
      S('hombros', 'c', ['press-vertical']),
      S('pecho', 'c', ['press-inclinado']),
      S('hombros', 'a', ['elevacion-lateral']),
      S('triceps', 'a', ['extension-triceps']),
      S('pecho', 'a', ['apertura']),
      S('triceps', undefined, ['fondos-triceps', 'press-cerrado']),
      S('core', 'a'),
    ],
  },
  push2: {
    name: 'Empuje 2',
    focus: ['pecho', 'hombros', 'triceps'],
    slots: [
      S('pecho', 'c', ['press-inclinado']),
      S('pecho', 'c', ['press-horizontal', 'fondos']),
      S('hombros', 'c', ['press-vertical']),
      S('hombros', 'a', ['elevacion-lateral']),
      S('pecho', 'a', ['apertura']),
      S('triceps', 'a', ['extension-triceps']),
      S('triceps', 'a', ['extension-triceps']),
      S('core', 'a'),
    ],
  },
  pull: {
    name: 'Tirón',
    focus: ['espalda', 'biceps'],
    slots: [
      S('espalda', 'c', ['jalon-vertical']),
      S('espalda', 'c', ['remo']),
      S('hombros', 'a', ['deltoide-posterior']),
      S('biceps', 'a', ['curl']),
      S('espalda', 'c', ['remo']),
      S('biceps', 'a', ['curl-martillo']),
      S('espalda', 'a', ['pullover', 'encogimiento']),
      S('core', 'a'),
    ],
  },
  pull2: {
    name: 'Tirón 2',
    focus: ['espalda', 'biceps'],
    slots: [
      S('espalda', 'c', ['remo']),
      S('espalda', 'c', ['jalon-vertical']),
      S('espalda', 'a', ['pullover']),
      S('hombros', 'a', ['deltoide-posterior']),
      S('biceps', 'a', ['curl']),
      S('biceps', 'a', ['curl-martillo']),
      S('espalda', 'a', ['encogimiento', 'hiperextension']),
      S('antebrazos', 'a'),
    ],
  },
  legs: {
    name: 'Pierna',
    focus: ['cuadriceps', 'isquios', 'gluteos', 'pantorrillas'],
    slots: [
      S('cuadriceps', 'c', ['sentadilla']),
      S('isquios', 'c', ['bisagra']),
      S('cuadriceps', 'c', ['prensa', 'zancada']),
      S('gluteos', 'c', ['empuje-cadera']),
      S('isquios', 'a', ['curl-femoral']),
      S('cuadriceps', 'a', ['extension-pierna']),
      S('pantorrillas', 'a'),
      S('core', 'a'),
    ],
  },
  legs2: {
    name: 'Pierna 2',
    focus: ['gluteos', 'isquios', 'cuadriceps', 'pantorrillas'],
    slots: [
      S('isquios', 'c', ['bisagra']),
      S('gluteos', 'c', ['empuje-cadera']),
      S('cuadriceps', 'c', ['zancada', 'prensa']),
      S('isquios', 'a', ['curl-femoral']),
      S('gluteos', 'a', ['abduccion', 'patada']),
      S('cuadriceps', 'a', ['extension-pierna']),
      S('pantorrillas', 'a'),
      S('core', 'a'),
    ],
  },
  upper: {
    name: 'Torso',
    focus: ['pecho', 'espalda', 'hombros', 'biceps', 'triceps'],
    slots: [
      S('pecho', 'c', ['press-horizontal']),
      S('espalda', 'c', ['remo']),
      S('hombros', 'c', ['press-vertical']),
      S('espalda', 'c', ['jalon-vertical']),
      S('hombros', 'a', ['elevacion-lateral']),
      S('biceps', 'a', ['curl']),
      S('triceps', 'a', ['extension-triceps']),
      S('pecho', 'a', ['apertura']),
    ],
  },
  upper2: {
    name: 'Torso 2',
    focus: ['espalda', 'pecho', 'hombros', 'biceps', 'triceps'],
    slots: [
      S('espalda', 'c', ['jalon-vertical']),
      S('pecho', 'c', ['press-inclinado']),
      S('espalda', 'c', ['remo']),
      S('hombros', 'a', ['elevacion-lateral']),
      S('hombros', 'a', ['deltoide-posterior']),
      S('biceps', 'a', ['curl-martillo', 'curl']),
      S('triceps', undefined, ['press-cerrado', 'fondos-triceps', 'extension-triceps']),
      S('pecho', 'a', ['apertura']),
    ],
  },
  lower: {
    name: 'Pierna (cuádriceps)',
    focus: ['cuadriceps', 'gluteos', 'isquios', 'pantorrillas'],
    slots: [
      S('cuadriceps', 'c', ['sentadilla']),
      S('isquios', 'c', ['bisagra']),
      S('cuadriceps', 'c', ['zancada', 'prensa']),
      S('isquios', 'a', ['curl-femoral']),
      S('cuadriceps', 'a', ['extension-pierna']),
      S('pantorrillas', 'a'),
      S('core', 'a'),
      S('gluteos', 'a', ['abduccion']),
    ],
  },
  lower2: {
    name: 'Pierna (femoral y glúteo)',
    focus: ['isquios', 'gluteos', 'cuadriceps', 'pantorrillas'],
    slots: [
      S('isquios', 'c', ['bisagra']),
      S('gluteos', 'c', ['empuje-cadera']),
      S('cuadriceps', 'c', ['prensa', 'sentadilla']),
      S('isquios', 'a', ['curl-femoral']),
      S('gluteos', 'a', ['abduccion', 'patada']),
      S('pantorrillas', 'a'),
      S('core', 'a'),
      S('cuadriceps', 'a', ['extension-pierna']),
    ],
  },
  full: {
    name: 'Cuerpo completo',
    focus: ['cuadriceps', 'pecho', 'espalda', 'isquios', 'hombros'],
    slots: [
      S('cuadriceps', 'c', ['sentadilla']),
      S('pecho', 'c', ['press-horizontal']),
      S('espalda', 'c', ['remo']),
      S('isquios', 'c', ['bisagra']),
      S('hombros', 'c', ['press-vertical']),
      S('biceps', 'a', ['curl']),
      S('triceps', 'a', ['extension-triceps']),
      S('core', 'a'),
    ],
  },
  full2: {
    name: 'Cuerpo completo 2',
    focus: ['isquios', 'pecho', 'espalda', 'cuadriceps', 'hombros'],
    slots: [
      S('isquios', 'c', ['bisagra']),
      S('pecho', 'c', ['press-inclinado']),
      S('espalda', 'c', ['jalon-vertical']),
      S('cuadriceps', 'c', ['prensa', 'zancada']),
      S('hombros', 'a', ['elevacion-lateral']),
      S('core', 'a'),
      S('biceps', 'a', ['curl-martillo']),
      S('triceps', 'a', ['extension-triceps']),
    ],
  },
  full3: {
    name: 'Cuerpo completo 3',
    focus: ['gluteos', 'hombros', 'espalda', 'cuadriceps', 'pecho'],
    slots: [
      S('cuadriceps', 'c', ['prensa', 'sentadilla']),
      S('hombros', 'c', ['press-vertical']),
      S('espalda', 'c', ['remo']),
      S('gluteos', 'c', ['empuje-cadera']),
      S('pecho', 'a', ['apertura']),
      S('hombros', 'a', ['deltoide-posterior']),
      S('isquios', 'a', ['curl-femoral']),
      S('core', 'a'),
    ],
  },
  pechoTri: {
    name: 'Pecho y tríceps',
    focus: ['pecho', 'triceps'],
    slots: [
      S('pecho', 'c', ['press-horizontal']),
      S('pecho', 'c', ['press-inclinado']),
      S('pecho', 'a', ['apertura']),
      S('triceps', 'a', ['extension-triceps']),
      S('pecho', 'c', ['fondos', 'press-declinado']),
      S('triceps', undefined, ['press-cerrado', 'fondos-triceps']),
      S('triceps', 'a', ['extension-triceps']),
      S('core', 'a'),
    ],
  },
  espaldaBi: {
    name: 'Espalda y bíceps',
    focus: ['espalda', 'biceps'],
    slots: [
      S('espalda', 'c', ['jalon-vertical']),
      S('espalda', 'c', ['remo']),
      S('biceps', 'a', ['curl']),
      S('espalda', 'a', ['pullover']),
      S('biceps', 'a', ['curl-martillo']),
      S('espalda', 'c', ['remo']),
      S('espalda', 'a', ['encogimiento', 'hiperextension']),
      S('biceps', 'a', ['curl']),
    ],
  },
  pierna: {
    name: 'Pierna completa',
    focus: ['cuadriceps', 'isquios', 'gluteos', 'pantorrillas'],
    slots: [
      S('cuadriceps', 'c', ['sentadilla']),
      S('isquios', 'c', ['bisagra']),
      S('cuadriceps', 'c', ['prensa']),
      S('gluteos', 'c', ['empuje-cadera']),
      S('isquios', 'a', ['curl-femoral']),
      S('cuadriceps', 'a', ['extension-pierna']),
      S('pantorrillas', 'a'),
      S('gluteos', 'a', ['abduccion']),
    ],
  },
  hombroCore: {
    name: 'Hombro y abdomen',
    focus: ['hombros', 'core'],
    slots: [
      S('hombros', 'c', ['press-vertical']),
      S('hombros', 'a', ['elevacion-lateral']),
      S('hombros', 'a', ['deltoide-posterior']),
      S('hombros', undefined, ['elevacion-frontal', 'remo-alto']),
      S('espalda', 'a', ['encogimiento']),
      S('core', 'a', ['flexion-tronco', 'elevacion-piernas']),
      S('core', 'a', ['anti-extension']),
      S('core', 'a', ['rotacion', 'anti-rotacion']),
    ],
  },
  piernaHombro: {
    name: 'Pierna y hombro',
    focus: ['cuadriceps', 'isquios', 'gluteos', 'hombros'],
    slots: [
      S('cuadriceps', 'c', ['sentadilla']),
      S('hombros', 'c', ['press-vertical']),
      S('isquios', 'c', ['bisagra']),
      S('cuadriceps', 'c', ['prensa', 'zancada']),
      S('hombros', 'a', ['elevacion-lateral']),
      S('isquios', 'a', ['curl-femoral']),
      S('hombros', 'a', ['deltoide-posterior']),
      S('pantorrillas', 'a'),
    ],
  },
  pechoSolo: {
    name: 'Pecho',
    focus: ['pecho'],
    slots: [
      S('pecho', 'c', ['press-horizontal']),
      S('pecho', 'c', ['press-inclinado']),
      S('pecho', 'a', ['apertura']),
      S('pecho', 'c', ['fondos', 'press-declinado']),
      S('pecho', 'a', ['apertura']),
      S('core', 'a'),
      S('core', 'a'),
    ],
  },
  espaldaSolo: {
    name: 'Espalda',
    focus: ['espalda'],
    slots: [
      S('espalda', 'c', ['jalon-vertical']),
      S('espalda', 'c', ['remo']),
      S('espalda', 'c', ['remo']),
      S('espalda', 'a', ['pullover']),
      S('espalda', 'c', ['jalon-vertical']),
      S('espalda', 'a', ['encogimiento']),
      S('espalda', 'a', ['hiperextension']),
    ],
  },
  hombroSolo: {
    name: 'Hombro',
    focus: ['hombros'],
    slots: [
      S('hombros', 'c', ['press-vertical']),
      S('hombros', 'a', ['elevacion-lateral']),
      S('hombros', 'a', ['deltoide-posterior']),
      S('hombros', 'a', ['elevacion-frontal']),
      S('hombros', 'a', ['elevacion-lateral']),
      S('espalda', 'a', ['encogimiento']),
      S('core', 'a'),
    ],
  },
  brazos: {
    name: 'Brazos y abdomen',
    focus: ['biceps', 'triceps', 'core'],
    slots: [
      S('biceps', 'a', ['curl']),
      S('triceps', undefined, ['press-cerrado', 'fondos-triceps']),
      S('biceps', 'a', ['curl-martillo']),
      S('triceps', 'a', ['extension-triceps']),
      S('biceps', 'a', ['curl']),
      S('triceps', 'a', ['extension-triceps']),
      S('core', 'a'),
      S('antebrazos', 'a'),
    ],
  },
};

const SPLITS: Record<Exclude<SplitStyle, 'auto'>, string[][]> = {
  // índice = número de días
  full: [[], ['full'], ['full', 'full2'], ['full', 'full2', 'full3'], ['full', 'full2', 'full3', 'full'], ['full', 'full2', 'full3', 'full', 'full2'], ['full', 'full2', 'full3', 'full', 'full2', 'full3']],
  ppl: [[], ['full'], ['upper', 'lower'], ['push', 'pull', 'legs'], ['push', 'pull', 'legs', 'upper'], ['push', 'pull', 'legs', 'upper', 'lower'], ['push', 'pull', 'legs', 'push2', 'pull2', 'legs2']],
  upperlower: [[], ['full'], ['upper', 'lower'], ['upper', 'lower', 'full'], ['upper', 'lower', 'upper2', 'lower2'], ['upper', 'lower', 'upper2', 'lower2', 'full'], ['upper', 'lower', 'upper2', 'lower2', 'upper', 'lower2']],
  classic: [[], ['full'], ['upper', 'lower'], ['pechoTri', 'espaldaBi', 'piernaHombro'], ['pechoTri', 'espaldaBi', 'pierna', 'hombroCore'], ['pechoSolo', 'espaldaSolo', 'pierna', 'hombroSolo', 'brazos'], ['pechoTri', 'espaldaBi', 'lower', 'hombroCore', 'lower2', 'brazos']],
};

export function autoStyle(days: number, level: Level, compact = false): Exclude<SplitStyle, 'auto'> {
  if (days <= 1) return 'full';
  // Pocos ejercicios por día: cuerpo completo para trabajar cada músculo 2–3 veces por semana
  if (compact && days <= 3) return 'full';
  if (level === 'principiante') return days <= 3 ? 'full' : days === 4 ? 'upperlower' : 'ppl';
  if (days === 2 || days === 4) return 'upperlower';
  return 'ppl';
}

/** Mira el día propio del usuario y deduce qué estilo de rutina encaja mejor con él. */
export function detectStyle(own: RoutineDay | undefined, days: number, level: Level, exMap: ExMap, compact = false): Exclude<SplitStyle, 'auto'> {
  if (!own) return autoStyle(days, level, compact);
  const top = mainMuscles(own, exMap, 0.12, 0);
  const hasUp = top.some((m) => UPPER.includes(m));
  const hasLow = top.some((m) => LOWER.includes(m));
  const has = (m: Muscle) => top.includes(m);
  if (hasUp && hasLow) return has('pecho') && has('espalda') ? 'full' : 'classic';
  if (hasLow) return days === 2 || days === 4 ? 'upperlower' : autoStyle(days, level, compact) === 'full' ? 'full' : 'ppl';
  if (has('pecho') && has('espalda')) return days <= 3 && level === 'principiante' ? 'full' : 'upperlower';
  if (top.length <= 1) return 'classic';
  const pushOnly = top.every((m) => ['pecho', 'hombros', 'triceps', 'core'].includes(m));
  if (pushOnly) return has('pecho') && has('hombros') ? 'ppl' : 'classic';
  const pullOnly = top.every((m) => ['espalda', 'biceps', 'hombros', 'antebrazos', 'core'].includes(m));
  if (pullOnly) return days === 4 || days === 5 ? 'classic' : 'ppl';
  return 'classic';
}

// ─────────────────────────── Elección de ejercicios ───────────────────────────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PickCtx {
  bank: Exercise[];
  profile: Profile;
  favorites: Set<string>;
  disliked: Set<string>;
  /** cuántas veces se usó cada ejercicio en otros días */
  used: Map<string, number>;
  rand: () => number;
  /** ritmo real del usuario (1 = como lo estimado) */
  pace: number;
}

export function makeCtx(
  exMap: ExMap,
  profile: Profile,
  favorites: string[],
  disliked: string[],
  otherDays: RoutineDay[] = [],
  seed = Date.now(),
): PickCtx {
  const used = new Map<string, number>();
  for (const d of otherDays) for (const e of d.exercises) used.set(e.exerciseId, (used.get(e.exerciseId) ?? 0) + 1);
  return {
    bank: [...exMap.values()],
    profile,
    favorites: new Set(favorites),
    disliked: new Set(disliked),
    used,
    rand: rng(seed),
    pace: 1,
  };
}

const MAX_LEVEL: Record<Level, number> = { principiante: 2, intermedio: 3, avanzado: 3 };

function scoreFor(e: Exercise, slot: Slot, ctx: PickCtx, dayPatterns: Set<string>): number {
  const { profile } = ctx;
  let s = 0;
  if (slot.p?.includes(e.pattern)) s += 6;
  if (slot.k && e.kind === slot.k) s += 3;
  if (ctx.favorites.has(e.id)) s += 4;
  s -= (ctx.used.get(e.id) ?? 0) * 4;
  if (dayPatterns.has(e.pattern) && !slot.p?.includes(e.pattern)) s -= 2;
  if (profile.level === 'principiante') {
    if (e.equipment === 'maquina' || e.equipment === 'polea') s += 1;
    if (e.level === 2) s -= 1;
  } else {
    if (e.kind === 'compuesto' && e.equipment === 'barra') s += 1.2;
    if (e.equipment === 'mancuernas') s += 0.6;
    if (e.kind === 'aislamiento' && (e.equipment === 'maquina' || e.equipment === 'polea')) s += 0.8;
    if (e.equipment === 'banda') s -= 1;
    if (e.level === 3) s -= profile.level === 'intermedio' ? 3 : 0.5;
  }
  if (e.equipment === 'kettlebell' && (profile.equipment.includes('barra') || profile.equipment.includes('mancuernas'))) s -= 1;
  // Las máquinas que marcaste como tuyas se usan con gusto
  if (e.machine && profile.machines?.includes(e.machine) && e.unit !== 'min') s += 2;
  // En un gym equipado, los aislados con peso corporal quedan como alternativa
  if (e.kind === 'aislamiento' && e.equipment === 'corporal' && e.primary !== 'core' && (profile.equipment.includes('maquina') || profile.equipment.includes('polea'))) s -= 1;
  if (e.custom) s += 0.5;
  return s + ctx.rand() * 2;
}

export function pickExercise(slot: Slot, ctx: PickCtx, dayIds: Set<string>, dayPatterns: Set<string> = new Set()): Exercise | null {
  const base = ctx.bank.filter((e) => e.primary === slot.m && !dayIds.has(e.id) && !ctx.disliked.has(e.id) && isAvailable(e, ctx.profile));
  const tiers = [base.filter((e) => e.level <= MAX_LEVEL[ctx.profile.level]), base];
  for (const list of tiers) {
    if (!list.length) continue;
    let best: Exercise | null = null;
    let bestScore = -Infinity;
    for (const e of list) {
      const sc = scoreFor(e, slot, ctx, dayPatterns);
      if (sc > bestScore) {
        bestScore = sc;
        best = e;
      }
    }
    return best;
  }
  return null;
}

/** El cardio que va al final de cada día según tus ajustes (o null) */
export function cardioFor(profile: Profile, exMap: ExMap): RoutineExercise | null {
  if (!profile.cardioId || !profile.cardioMin) return null;
  const ex = exMap.get(profile.cardioId);
  if (!ex) return null;
  return { uid: uid(), exerciseId: ex.id, sets: 1, repsMin: profile.cardioMin, repsMax: profile.cardioMin, rest: 0 };
}

export function isCardio(re: RoutineExercise, exMap: ExMap): boolean {
  return exMap.get(re.exerciseId)?.unit === 'min';
}

/** Minutos para pesas: lo que queda después de reservar el cardio */
function strengthBudget(profile: Profile, exMap: ExMap): number {
  const c = cardioFor(profile, exMap);
  return planningBudget(profile) - (c ? c.repsMax + 1 : 0);
}

function buildFromSlots(slots: Slot[], ctx: PickCtx, exMap: ExMap): RoutineExercise[] {
  const { profile } = ctx;
  const out: RoutineExercise[] = [];
  const ids = new Set<string>();
  const patterns = new Set<string>();
  const maxCount = profile.exercisesPerDay ?? (profile.level === 'principiante' ? 6 : 9);
  const budget = strengthBudget(profile, exMap);
  for (const slot of slots) {
    const ex = pickExercise(slot, ctx, ids, patterns);
    if (!ex) continue;
    const re: RoutineExercise = { uid: uid(), exerciseId: ex.id, ...scheme(profile.goal, ex, profile.level, profile.setsPref) };
    if (out.length >= Math.min(3, maxCount) && estimateMinutes([...out, re], exMap, ctx.pace) > budget) break;
    out.push(re);
    ids.add(ex.id);
    patterns.add(ex.pattern);
    ctx.used.set(ex.id, (ctx.used.get(ex.id) ?? 0) + 1);
    if (out.length >= maxCount) break;
  }
  return out;
}

const MUSCLE_SLOTS: Record<Muscle, Slot[]> = {
  pecho: [S('pecho', 'c', ['press-horizontal']), S('pecho', 'c', ['press-inclinado']), S('pecho', 'a', ['apertura']), S('pecho', 'c', ['fondos', 'press-declinado'])],
  espalda: [S('espalda', 'c', ['jalon-vertical']), S('espalda', 'c', ['remo']), S('espalda', 'c', ['remo']), S('espalda', 'a', ['pullover', 'encogimiento'])],
  hombros: [S('hombros', 'c', ['press-vertical']), S('hombros', 'a', ['elevacion-lateral']), S('hombros', 'a', ['deltoide-posterior']), S('hombros', 'a', ['elevacion-frontal', 'remo-alto'])],
  biceps: [S('biceps', 'a', ['curl']), S('biceps', 'a', ['curl-martillo']), S('biceps', 'a', ['curl'])],
  triceps: [S('triceps', 'a', ['extension-triceps']), S('triceps', undefined, ['press-cerrado', 'fondos-triceps']), S('triceps', 'a', ['extension-triceps'])],
  antebrazos: [S('antebrazos', 'a', ['agarre'])],
  cuadriceps: [S('cuadriceps', 'c', ['sentadilla']), S('cuadriceps', 'c', ['prensa', 'zancada']), S('cuadriceps', 'a', ['extension-pierna'])],
  isquios: [S('isquios', 'c', ['bisagra']), S('isquios', 'a', ['curl-femoral'])],
  gluteos: [S('gluteos', 'c', ['empuje-cadera']), S('gluteos', 'a', ['abduccion', 'patada'])],
  pantorrillas: [S('pantorrillas', 'a')],
  core: [S('core', 'a', ['anti-extension']), S('core', 'a', ['flexion-tronco', 'elevacion-piernas']), S('core', 'a', ['rotacion', 'anti-rotacion'])],
  cardio: [],
};

/** Huecos para un día armado a partir de los músculos elegidos (turnándose entre ellos). */
function slotsForFocus(focus: Muscle[]): Slot[] {
  const out: Slot[] = [];
  const lists = focus.map((m) => MUSCLE_SLOTS[m]);
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

/** Arma ejercicios para un día según sus músculos (botón "Rellenar con sugerencia"). */
export function fillDay(day: RoutineDay, others: RoutineDay[], exMap: ExMap, profile: Profile, favorites: string[], disliked: string[], pace = 1): RoutineExercise[] {
  const ctx = makeCtx(exMap, profile, favorites, disliked, others);
  ctx.pace = pace;
  const keep = day.exercises.filter((e) => !isCardio(e, exMap));
  for (const e of keep) ctx.used.set(e.exerciseId, 99);
  const focus = (day.focus.length ? day.focus : (['pecho', 'espalda', 'cuadriceps'] as Muscle[])).filter((m) => m !== 'cardio');
  const cardio = day.exercises.find((e) => isCardio(e, exMap)) ?? cardioFor(profile, exMap);
  return [...keep, ...buildFromSlots(slotsForFocus(focus), ctx, exMap), ...(cardio ? [cardio] : [])];
}

export function dayNameFromFocus(focus: Muscle[]): string {
  if (!focus.length) return 'Mi día';
  const names = focus.map((m) => MUSCLES[m].label.split(' ')[0].toLowerCase());
  const s = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────── Generador principal ───────────────────────────

export interface GenerateOptions {
  days: number;
  style: SplitStyle;
  current: RoutineDay[];
  exMap: ExMap;
  profile: Profile;
  favorites: string[];
  disliked: string[];
  seed?: number;
  /** ritmo real del usuario (ver paceFactor) */
  pace?: number;
}

export interface GenerateResult {
  routine: RoutineDay[];
  style: Exclude<SplitStyle, 'auto'>;
}

export function generateRoutine(o: GenerateOptions): GenerateResult {
  const kept = o.current.filter((d) => d.mine || d.locked);
  const total = Math.max(o.days, kept.length, 1);
  const own = kept.find((d) => d.mine) ?? kept[0];
  const compact = (o.profile.exercisesPerDay ?? 99) <= 5;
  const style = o.style === 'auto' ? detectStyle(own, total, o.profile.level, o.exMap, compact) : o.style;
  const keys = SPLITS[style][Math.min(total, 6)] ?? SPLITS[style][6];
  const templateKeys = Array.from({ length: total }, (_, i) => keys[i % keys.length]);

  // Cada día conservado ocupa el hueco de la plantilla más parecida a él
  const assigned = new Map<number, RoutineDay>();
  const keptSorted = [...kept].sort((a, b) => Number(Boolean(b.mine)) - Number(Boolean(a.mine)));
  for (const day of keptSorted) {
    const vec = dayMuscleVector(day, o.exMap);
    let bestIdx = -1;
    let best = -1;
    templateKeys.forEach((k, i) => {
      if (assigned.has(i)) return;
      const t = T[k];
      const tv: MuscleVec = {};
      t.slots.slice(0, 6).forEach((sl) => (tv[sl.m] = (tv[sl.m] ?? 0) + 1));
      const sim = similarity(vec, tv);
      if (sim > best) {
        best = sim;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) assigned.set(bestIdx, day);
  }

  const ctx = makeCtx(o.exMap, o.profile, o.favorites, o.disliked, kept, o.seed ?? Date.now());
  ctx.pace = o.pace ?? 1;
  const reusable = o.current.filter((d) => !d.mine && !d.locked).map((d) => d.id);
  const keptIds = new Set(kept.map((d) => d.id));
  const routine: RoutineDay[] = templateKeys.map((k, i) => {
    const keptDay = assigned.get(i);
    if (keptDay) return keptDay;
    const t = T[k];
    return {
      id: reusable.shift() ?? uid(),
      name: t.name,
      focus: t.focus,
      templateKey: k,
      exercises: buildFromSlots(t.slots, ctx, o.exMap),
    };
  });
  const generated = new Set(routine.filter((d) => !keptIds.has(d.id)).map((d) => d.id));
  balanceRoutine(routine, generated, o.exMap, { ...o.profile, daysPerWeek: o.days }, ctx);
  // Cardio al final de cada día generado
  for (const d of routine) {
    if (!generated.has(d.id)) continue;
    const c = cardioFor(o.profile, o.exMap);
    if (c) d.exercises.push(c);
  }
  return { routine, style };
}

/**
 * Ajuste fino de la semana completa: quita series donde un músculo se pasa del rango
 * recomendado (contando también lo que hace tu día propio) y añade ejercicios a los que se quedan cortos.
 */
function balanceRoutine(routine: RoutineDay[], editable: Set<string>, exMap: ExMap, profile: Profile, ctx: PickCtx) {
  if (!editable.size) return;
  const t = targets(profile.level);
  const factor = profile.daysPerWeek / routine.length;
  const pending = new Set(routine.filter((d) => !d.exercises.length).flatMap((d) => d.focus));
  const primaryOf = (id: string) => exMap.get(id)?.primary;
  const stuck = new Set<Muscle>();

  // 1) Exceso: recortar series o ejercicios repetidos del músculo que más se pasa
  for (let it = 0; it < 120; it++) {
    const vol = volumeOf(routine, exMap, factor);
    let worst: Muscle | null = null;
    let worstBy = 0;
    for (const m of MUSCLE_ORDER) {
      if (m === 'antebrazos' || m === 'cardio' || stuck.has(m)) continue;
      let limit = t[m][1] * HIGH_TOLERANCE;
      // el pecho no debería superar mucho a la espalda (salud del hombro)
      if (m === 'pecho') limit = Math.min(limit, Math.max(vol.espalda * 1.4, t.pecho[0]));
      if (vol[m] - limit > worstBy) {
        worstBy = vol[m] - limit;
        worst = m;
      }
    }
    if (!worst) break;
    const m = worst;
    const cands: { d: RoutineDay; idx: number; re: RoutineExercise }[] = [];
    for (const d of routine) if (editable.has(d.id)) d.exercises.forEach((re, idx) => primaryOf(re.exerciseId) === m && cands.push({ d, idx, re }));
    if (!cands.length) {
      stuck.add(m);
      continue;
    }
    cands.sort((a, b) => b.re.sets - a.re.sets || b.idx - a.idx);
    if (cands[0].re.sets > 3) {
      cands[0].re.sets--;
      continue;
    }
    const removable = cands
      .filter((c) => c.d.exercises.length > 4 && c.d.exercises.filter((e) => primaryOf(e.exerciseId) === m).length >= 2)
      .sort((a, b) => b.idx - a.idx)[0];
    if (removable) {
      removable.d.exercises.splice(removable.idx, 1);
      continue;
    }
    if (cands[0].re.sets > 2) {
      cands[0].re.sets--;
      continue;
    }
    stuck.add(m);
  }

  // 2) Déficit: añadir un ejercicio al día más corto que encaje
  for (const m of MUSCLE_ORDER) {
    const vol = volumeOf(routine, exMap, factor);
    if (m === 'antebrazos' || m === 'cardio' || pending.has(m) || vol[m] >= t[m][0]) continue;
    const cap = profile.exercisesPerDay ?? 99;
    const days = routine.filter((d) => editable.has(d.id) && d.exercises.filter((e) => !isCardio(e, exMap)).length < cap);
    const withFocus = days.filter((d) => d.focus.includes(m));
    const day = [...(withFocus.length ? withFocus : days)].sort((a, b) => estimateMinutes(a.exercises, exMap) - estimateMinutes(b.exercises, exMap))[0];
    if (!day) continue;
    const ids = new Set(day.exercises.map((e) => e.exerciseId));
    const patterns = new Set(day.exercises.map((e) => exMap.get(e.exerciseId)?.pattern ?? ''));
    const slot = MUSCLE_SLOTS[m].find((sl) => !sl.p || !sl.p.some((p) => patterns.has(p))) ?? MUSCLE_SLOTS[m][0];
    const ex = pickExercise(slot, ctx, ids, patterns);
    if (!ex) continue;
    const re = { uid: uid(), exerciseId: ex.id, ...scheme(profile.goal, ex, profile.level, profile.setsPref) };
    // solo si cabe en tu tiempo (con 2 series como mínimo útil)
    const budget = strengthBudget(profile, exMap);
    if (estimateMinutes([...day.exercises, re], exMap, ctx.pace) > budget) {
      re.sets = Math.min(re.sets, 2);
      if (estimateMinutes([...day.exercises, re], exMap, ctx.pace) > budget) continue;
    }
    day.exercises.push(re);
  }
}

// ─────────────────────────── Alternativas y sugerencias ───────────────────────────

export interface Alternative {
  ex: Exercise;
  reason: string;
  score: number;
}

export function alternativesFor(baseId: string, exMap: ExMap, profile: Profile, favorites: string[], disliked: string[], excludeIds: string[] = []): Alternative[] {
  const base = exMap.get(baseId);
  if (!base) return [];
  const equip = new Set(profile.equipment);
  const fav = new Set(favorites);
  const bad = new Set(disliked);
  const excl = new Set(excludeIds);
  const out: Alternative[] = [];
  for (const e of exMap.values()) {
    if (e.id === base.id || e.primary !== base.primary || bad.has(e.id) || excl.has(e.id)) continue;
    let score = 0;
    const reasons: string[] = [];
    if (e.pattern === base.pattern) {
      score += 6;
      reasons.push('mismo movimiento');
    }
    if (e.kind === base.kind) score += 3;
    score += e.secondary.filter((m) => base.secondary.includes(m)).length;
    if (isAvailable(e, profile)) score += 2;
    else score -= 6;
    const fullGym = equip.has('maquina') || equip.has('barra');
    if (fullGym && e.equipment === 'banda') score -= 2;
    if (fullGym && e.equipment === 'corporal' && e.primary !== 'core') score -= 1;
    if (fav.has(e.id)) {
      score += 3;
      reasons.unshift('favorito');
    }
    if (e.equipment !== base.equipment) reasons.push(`con ${equipLabel(e)}`);
    if (e.pattern !== base.pattern) reasons.push(e.kind === 'compuesto' ? 'otro ángulo, multiarticular' : 'otro ángulo, aislado');
    out.push({ ex: e, reason: capitalize(reasons.join(' · ')), score });
  }
  return out.sort((a, b) => b.score - a.score);
}

function equipLabel(e: Exercise): string {
  return (
    { barra: 'barra', mancuernas: 'mancuernas', maquina: 'máquina', polea: 'polea', corporal: 'peso corporal', kettlebell: 'kettlebell', banda: 'banda' } as const
  )[e.equipment];
}

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Ejercicios recomendados para añadir a un día: variados (músculos y ángulos distintos). */
export function suggestionsForDay(day: RoutineDay, exMap: ExMap, profile: Profile, favorites: string[], disliked: string[]): Exercise[] {
  const focus = day.focus.length ? day.focus : mainMuscles(day, exMap);
  if (!focus.length) return [];
  const ctx = makeCtx(exMap, profile, favorites, disliked, [], 1);
  ctx.rand = () => 0.5;
  const ids = new Set(day.exercises.map((e) => e.exerciseId));
  const patterns = new Set(day.exercises.map((e) => exMap.get(e.exerciseId)?.pattern ?? ''));
  const slots = slotsForFocus(focus);
  // primero los ángulos que el día todavía no tiene, luego el resto
  const fresh = slots.filter((sl) => !sl.p || !sl.p.some((p) => patterns.has(p)));
  const rest = slots.filter((sl) => !fresh.includes(sl));
  const out: Exercise[] = [];
  for (const slot of [...fresh, ...rest, ...slots]) {
    if (out.length >= 8) break;
    const ex = pickExercise(slot, ctx, ids, patterns);
    if (!ex) continue;
    out.push(ex);
    ids.add(ex.id);
    patterns.add(ex.pattern);
  }
  return out;
}

/** Elige el mejor ejercicio para un músculo concreto (para arreglos automáticos). */
export function bestForMuscle(m: Muscle, day: RoutineDay, allDays: RoutineDay[], exMap: ExMap, profile: Profile, favorites: string[], disliked: string[]): Exercise | null {
  const ctx = makeCtx(exMap, profile, favorites, disliked, allDays);
  const ids = new Set(day.exercises.map((e) => e.exerciseId));
  const patterns = new Set(day.exercises.map((e) => exMap.get(e.exerciseId)?.pattern ?? ''));
  for (const slot of MUSCLE_SLOTS[m]) {
    const ex = pickExercise(slot, ctx, ids, patterns);
    if (ex && !patterns.has(ex.pattern)) return ex;
  }
  return pickExercise(MUSCLE_SLOTS[m][0], ctx, ids, patterns);
}

export function styleLabelFor(routine: RoutineDay[]): string {
  return routine.map((d) => d.name).join(' · ');
}
