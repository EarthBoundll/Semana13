import type { Equipment, Goal, Level, Muscle, SplitStyle } from '../types';

export const MUSCLES: Record<Muscle, { label: string; region: 'superior' | 'inferior' | 'core' | 'cardio' }> = {
  pecho: { label: 'Pecho', region: 'superior' },
  espalda: { label: 'Espalda', region: 'superior' },
  hombros: { label: 'Hombros', region: 'superior' },
  biceps: { label: 'Bíceps', region: 'superior' },
  triceps: { label: 'Tríceps', region: 'superior' },
  antebrazos: { label: 'Antebrazos', region: 'superior' },
  cuadriceps: { label: 'Cuádriceps', region: 'inferior' },
  isquios: { label: 'Isquios (femoral)', region: 'inferior' },
  gluteos: { label: 'Glúteos', region: 'inferior' },
  pantorrillas: { label: 'Pantorrillas', region: 'inferior' },
  core: { label: 'Abdomen / core', region: 'core' },
  cardio: { label: 'Cardio', region: 'cardio' },
};

export const MUSCLE_ORDER: Muscle[] = [
  'pecho',
  'espalda',
  'hombros',
  'biceps',
  'triceps',
  'antebrazos',
  'cuadriceps',
  'isquios',
  'gluteos',
  'pantorrillas',
  'core',
  'cardio',
];

export const UPPER: Muscle[] = ['pecho', 'espalda', 'hombros', 'biceps', 'triceps'];
export const LOWER: Muscle[] = ['cuadriceps', 'isquios', 'gluteos', 'pantorrillas'];

export const EQUIPMENT: Record<Equipment, string> = {
  barra: 'Barra',
  mancuernas: 'Mancuernas',
  maquina: 'Máquina',
  polea: 'Polea',
  corporal: 'Peso corporal',
  kettlebell: 'Kettlebell',
  banda: 'Banda elástica',
};

export const EQUIPMENT_ORDER: Equipment[] = ['barra', 'mancuernas', 'maquina', 'polea', 'corporal', 'kettlebell', 'banda'];

export const GOALS: Record<Goal, { label: string; desc: string }> = {
  hipertrofia: { label: 'Ganar músculo', desc: 'Hipertrofia · 6–15 repeticiones' },
  fuerza: { label: 'Ganar fuerza', desc: 'Pesos altos · 3–6 repeticiones' },
  perder_grasa: { label: 'Bajar grasa', desc: 'Más ritmo y menos descanso' },
  resistencia: { label: 'Resistencia', desc: 'Muchas repeticiones · 12–20' },
};

export const LEVELS: Record<Level, { label: string; desc: string }> = {
  principiante: { label: 'Principiante', desc: 'Menos de 6 meses entrenando' },
  intermedio: { label: 'Intermedio', desc: '6 meses a 2 años' },
  avanzado: { label: 'Avanzado', desc: 'Más de 2 años constante' },
};

export const STYLES: Record<SplitStyle, { label: string; desc: string }> = {
  auto: { label: 'Automático', desc: 'Elijo la mejor división según tus días y tu día propio' },
  full: { label: 'Cuerpo completo', desc: 'Todo el cuerpo en cada sesión' },
  ppl: { label: 'Empuje / Tirón / Pierna', desc: 'Push · Pull · Legs' },
  upperlower: { label: 'Torso / Pierna', desc: 'Alterna parte superior e inferior' },
  classic: { label: 'Por grupo muscular', desc: 'Pecho y tríceps, espalda y bíceps…' },
};

export const REST_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240];

export function fmtRest(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
}

/** Máquinas concretas. `photo` es un ejercicio cuya foto muestra la máquina. */
export const MACHINES: { id: string; label: string; group: 'Pierna' | 'Torso' | 'Cardio'; photo: string }[] = [
  { id: 'prensa', label: 'Prensa de piernas', group: 'Pierna', photo: 'prensa' },
  { id: 'hack', label: 'Sentadilla hack', group: 'Pierna', photo: 'hack' },
  { id: 'extension', label: 'Extensión de cuádriceps (leg extension)', group: 'Pierna', photo: 'extension-cuadriceps' },
  { id: 'curl-tumbado', label: 'Curl femoral acostado (leg curl)', group: 'Pierna', photo: 'curl-femoral-tumbado' },
  { id: 'curl-sentado', label: 'Curl femoral sentado', group: 'Pierna', photo: 'curl-femoral-sentado' },
  { id: 'smith', label: 'Smith (multipower)', group: 'Pierna', photo: 'sentadilla-smith' },
  { id: 'abductor', label: 'Abductor de cadera', group: 'Pierna', photo: 'abduccion-maquina' },
  { id: 'hip-thrust', label: 'Máquina de hip thrust', group: 'Pierna', photo: 'hip-thrust-maquina' },
  { id: 'pantorrilla', label: 'Pantorrilla de pie', group: 'Pierna', photo: 'talones-pie' },
  { id: 'pantorrilla-sentado', label: 'Pantorrilla sentado', group: 'Pierna', photo: 'talones-sentado' },
  { id: 'press-pecho', label: 'Press de pecho', group: 'Torso', photo: 'press-pecho-maquina' },
  { id: 'pec-deck', label: 'Pec deck (contractor)', group: 'Torso', photo: 'pec-deck' },
  { id: 'remo-maquina', label: 'Remo en máquina', group: 'Torso', photo: 'remo-maquina' },
  { id: 'press-hombro', label: 'Press de hombro', group: 'Torso', photo: 'press-hombro-maquina' },
  { id: 'laterales', label: 'Elevaciones laterales', group: 'Torso', photo: 'laterales-maquina' },
  { id: 'asistida', label: 'Dominadas / fondos asistidos', group: 'Torso', photo: 'fondos-maquina' },
  { id: 'scott', label: 'Banco Scott (curl predicador)', group: 'Torso', photo: 'curl-predicador' },
  { id: 'crunch-maquina', label: 'Máquina de abdominales', group: 'Torso', photo: 'crunch-maquina' },
  { id: 'caminadora', label: 'Caminadora', group: 'Cardio', photo: 'caminadora' },
  { id: 'bicicleta', label: 'Bicicleta estática', group: 'Cardio', photo: 'bicicleta' },
  { id: 'eliptica', label: 'Elíptica', group: 'Cardio', photo: 'eliptica' },
  { id: 'escaladora', label: 'Escaladora', group: 'Cardio', photo: 'escaladora' },
  { id: 'remo-ergometro', label: 'Máquina de remo', group: 'Cardio', photo: 'remo-ergometro' },
];

/** Tu equipo: polea, mancuernas, barra, caminadora y las máquinas de pierna que usas */
export const MY_EQUIPMENT: Equipment[] = ['barra', 'mancuernas', 'polea', 'maquina'];
export const MY_MACHINES = ['prensa', 'hack', 'extension', 'curl-tumbado', 'caminadora'];
