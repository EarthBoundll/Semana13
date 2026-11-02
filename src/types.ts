export type Muscle =
  | 'pecho'
  | 'espalda'
  | 'hombros'
  | 'biceps'
  | 'triceps'
  | 'antebrazos'
  | 'cuadriceps'
  | 'isquios'
  | 'gluteos'
  | 'pantorrillas'
  | 'core'
  | 'cardio';

export type Equipment = 'barra' | 'mancuernas' | 'maquina' | 'polea' | 'corporal' | 'kettlebell' | 'banda';
export type Kind = 'compuesto' | 'aislamiento';
export type Goal = 'hipertrofia' | 'fuerza' | 'perder_grasa' | 'resistencia';
export type Level = 'principiante' | 'intermedio' | 'avanzado';
export type SplitStyle = 'auto' | 'full' | 'ppl' | 'upperlower' | 'classic';
export type Theme = 'system' | 'light' | 'dark';

export interface Exercise {
  id: string;
  name: string;
  primary: Muscle;
  secondary: Muscle[];
  equipment: Equipment;
  kind: Kind;
  /** 1 = fácil, 2 = medio, 3 = técnico/avanzado */
  level: 1 | 2 | 3;
  /** Patrón de movimiento: sirve para encontrar sustitutos parecidos */
  pattern: string;
  tip: string;
  /** 'seg' para ejercicios por tiempo (plancha…), 'min' para cardio (caminadora…) */
  unit?: 'reps' | 'seg' | 'min';
  /** Máquina concreta (solo si equipment = 'maquina'): prensa, hack, extension… */
  machine?: string;
  custom?: boolean;
}

export interface RoutineExercise {
  uid: string;
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  /** descanso en segundos */
  rest: number;
}

export interface RoutineDay {
  id: string;
  name: string;
  focus: Muscle[];
  exercises: RoutineExercise[];
  /** El día que el usuario ya tenía armado */
  mine?: boolean;
  /** Se conserva al volver a generar la rutina */
  locked?: boolean;
  templateKey?: string;
}

export interface Profile {
  name: string;
  heightCm: number | null;
  goalWeight: number | null;
  goal: Goal;
  level: Level;
  equipment: Equipment[];
  /** Máquinas que hay en tu gym; null = todas */
  machines: string[] | null;
  sessionMinutes: number;
  /** Hora de llegada al gym "HH:MM" (opcional) */
  gymStart: string | null;
  /** Hora límite para terminar "HH:MM" (opcional) */
  gymEnd: string | null;
  daysPerWeek: number;
  /** Días habituales de gym (0 = lunes … 6 = domingo); null = automático */
  weekDays: number[] | null;
  /** Ejercicios por día (sin contar el cardio); null = según el tiempo */
  exercisesPerDay: number | null;
  /** Cardio al final de cada día */
  cardioId: string | null;
  cardioMin: number;
  /** null = automático según objetivo */
  setsPref: number | null;
  style: SplitStyle;
  theme: Theme;
}

export interface LoggedSet {
  weight: number | null;
  reps: number | null;
  done: boolean;
}

export interface LoggedExercise {
  uid: string;
  exerciseId: string;
  target: { sets: number; repsMin: number; repsMax: number; rest: number };
  sets: LoggedSet[];
  /** Tiempo medido en este ejercicio (ms) */
  elapsedMs?: number;
  /** Tiempo asignado al empezarlo (s) */
  budgetSec?: number | null;
  startedAt?: number | null;
}

export interface WorkoutLog {
  id: string;
  date: string;
  dayId: string;
  dayName: string;
  startedAt: number;
  finishedAt: number | null;
  exercises: LoggedExercise[];
  /** Hora límite para terminar (ms) */
  deadline?: number | null;
  /** Ejercicio que se está cronometrando */
  currentUid?: string | null;
  currentSince?: number | null;
  /** Avisos ya mostrados (para no repetirlos) */
  alerts?: string[];
}

export interface WeightEntry {
  id: string;
  date: string;
  kg: number;
}

export interface AppState {
  version: 1;
  /** Revisión de los datos guardados (para ajustes de una sola vez) */
  rev?: number;
  onboarded: boolean;
  profile: Profile;
  routine: RoutineDay[];
  /** fecha (YYYY-MM-DD) -> id del día de rutina planificado */
  plan: Record<string, string>;
  logs: WorkoutLog[];
  active: WorkoutLog | null;
  weights: WeightEntry[];
  customExercises: Exercise[];
  favorites: string[];
  disliked: string[];
  /** Enlaces de video elegidos por el usuario (id de ejercicio -> URL) */
  videos: Record<string, string>;
  /** Semanas (lunes) que ya se planificaron solas con la semana habitual */
  autoWeeks: string[];
  /** Avisos de la pantalla de inicio que el usuario ya cerró */
  dismissed: string[];
}
