const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(k: string, n: number): string {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Lunes de la semana de esa fecha */
export function weekStart(k: string): string {
  const d = fromKey(k);
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return toKey(d);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function dayDiff(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);
}

export const DOW_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DOW_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function dowIndex(k: string): number {
  return (fromKey(k).getDay() + 6) % 7;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function fmtDate(k: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Intl.DateTimeFormat('es', opts).format(fromKey(k)).replace('.', '');
}

export function fmtLong(k: string): string {
  return cap(fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' }));
}

export function monthKey(k: string): string {
  return k.slice(0, 7);
}

export function fmtMonth(mk: string, long = false): string {
  const d = fromKey(`${mk}-01`);
  const s = new Intl.DateTimeFormat('es', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' }).format(d);
  return cap(s.replace('.', ''));
}

export function fmtWeekRange(start: string): string {
  const end = addDays(start, 6);
  const a = fromKey(start);
  const b = fromKey(end);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${fmtDate(end)}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** "Nov 2026" */
export function fmtMonthYear(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return `${cap(MONTHS[m - 1])} ${y}`;
}

/** Etiqueta corta para ejes: "May ’26" */
export function fmtMonthTick(mk: string): string {
  const [y, m] = mk.split('-').map(Number);
  return `${cap(MONTHS[m - 1])} ’${String(y).slice(2)}`;
}

/** "14/9" */
export function fmtDayMonth(k: string): string {
  const d = fromKey(k);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
