import type { Exercise, Profile } from '../types';

/** ¿Puedes hacer este ejercicio con el equipo de tu gym? */
export function isAvailable(ex: Exercise, p: Profile): boolean {
  if (ex.custom) return true;
  if (!p.equipment.includes(ex.equipment)) return false;
  if (ex.equipment === 'maquina' && ex.machine && p.machines) return p.machines.includes(ex.machine);
  return true;
}
