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
