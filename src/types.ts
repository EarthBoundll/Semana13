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
  | 'core';

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
  /** 'seg' para ejercicios por tiempo (plancha, etc.) */
  unit?: 'reps' | 'seg';
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
  sessionMinutes: number;
  daysPerWeek: number;
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
}

export interface WorkoutLog {
  id: string;
  date: string;
  dayId: string;
  dayName: string;
  startedAt: number;
  finishedAt: number | null;
  exercises: LoggedExercise[];
}

export interface WeightEntry {
  id: string;
  date: string;
  kg: number;
}

export interface AppState {
  version: 1;
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
}
