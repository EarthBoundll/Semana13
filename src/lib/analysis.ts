import { MUSCLE_ORDER, MUSCLES } from '../data/meta';
import type { AppState, Muscle } from '../types';
import { estimateMinutes } from './generator';
import type { ExMap } from './store';
import { statusOf, targets, volumeOf } from './volume';

export { statusOf, targets } from './volume';

/** Series por músculo en una semana según los días que entrenas */
export function weeklyVolume(s: AppState, exMap: ExMap): { vol: Record<Muscle, number>; factor: number } {
  const factor = s.profile.daysPerWeek / (s.routine.length || 1);
  return { vol: volumeOf(s.routine, exMap, factor), factor };
}

export interface Insight {
  id: string;
  tone: 'warn' | 'info' | 'good';
  text: string;
  action?: { label: string; muscle: Muscle };
}

export function routineInsights(s: AppState, exMap: ExMap): Insight[] {
  const out: Insight[] = [];
  if (!s.routine.length) return out;
  const { vol } = weeklyVolume(s, exMap);
  const t = targets(s.profile.level);
  const empty = s.routine.filter((d) => !d.exercises.length);
  const pending = new Set(empty.flatMap((d) => d.focus));
  if (empty.length) {
    out.push({
      id: 'empty',
      tone: 'info',
      text: `${empty.map((d) => `«${d.name}»`).join(', ')} aún no tiene ejercicios. Cuando los agregues, el análisis los tendrá en cuenta.`,
    });
  }

  for (const m of MUSCLE_ORDER) {
    if (m === 'antebrazos' || pending.has(m)) continue;
    const st = statusOf(vol[m], t[m]);
    if (st === 'bajo') {
      out.push({
        id: `low-${m}`,
        tone: 'warn',
        text: `${MUSCLES[m].label}: ${vol[m]} series/semana. Lo recomendado para tu nivel es ${t[m][0]}–${t[m][1]}.`,
        action: { label: `Añadir ejercicio de ${MUSCLES[m].label.split(' ')[0].toLowerCase()}`, muscle: m },
      });
    } else if (st === 'alto') {
      out.push({
        id: `high-${m}`,
        tone: 'info',
        text: `${MUSCLES[m].label}: ${vol[m]} series/semana, por encima de ${t[m][1]}. Puedes quitar alguna serie para recuperarte mejor.`,
      });
    }
  }

  // Equilibrio empuje / tirón para cuidar los hombros
  if (vol.espalda > 0 && vol.pecho / vol.espalda > 1.5 && !pending.has('espalda') && !pending.has('pecho')) {
    out.push({
      id: 'balance',
      tone: 'warn',
      text: 'Haces bastante más empuje (pecho) que tirón (espalda). Equilibrarlo protege tus hombros y mejora la postura.',
      action: { label: 'Añadir ejercicio de espalda', muscle: 'espalda' },
    });
  }

  // Sesiones demasiado largas
  for (const [i, d] of s.routine.entries()) {
    const mins = estimateMinutes(d.exercises, exMap);
    if (mins > s.profile.sessionMinutes * 1.25) {
      out.push({
        id: `long-${d.id}`,
        tone: 'info',
        text: `El día ${String.fromCharCode(65 + i)} (${d.name}) dura ~${mins} min, más que tus ${s.profile.sessionMinutes} min. Quita un ejercicio o una serie.`,
      });
    }
  }

  if (!out.some((i) => i.tone !== 'good' && i.id !== 'empty') && !empty.length) {
    out.push({ id: 'ok', tone: 'good', text: 'Tu rutina está equilibrada: todos los músculos están en su rango recomendado.' });
  }
  return out;
}
