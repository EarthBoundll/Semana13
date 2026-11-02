import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { PageHeader, Sheet, Tile } from '../components/ui';
import { MUSCLES } from '../data/meta';
import { routineInsights } from '../lib/analysis';
import { addDays, DOW_LONG, DOW_SHORT, dowIndex, fmtDate, fmtDuration, fmtLong, fromKey, monthKey, todayKey, weekDays, weekStart } from '../lib/dates';
import { estimateMinutes, mainMuscles } from '../lib/generator';
import { atTime, fmtClock, hasSchedule, paceFactor } from '../lib/timing';
import { dayById, dayLetter, nextDayIdFor, streak, weekStats } from '../lib/plan';
import { fmtKg, logSetsDone, logVolume } from '../lib/progression';
import { mutate, useAppState, useExMap } from '../lib/store';
import { startWorkout } from '../lib/workout';
import { Thumb } from '../components/media';
import { habitualDays } from '../lib/plan';
import { isIOS, isStandalone, promptInstall, useCanInstall } from '../lib/install';
import { fmtHHMM, parseHHMM } from '../lib/timing';
import { setPendingDay, useNav, type Route } from '../nav';
import type { WorkoutLog } from '../types';

export function Home() {
  const s = useAppState();
  const exMap = useExMap();
  const { go } = useNav();
  const today = todayKey();
  const [chooseDay, setChooseDay] = useState(false);
  const [openLog, setOpenLog] = useState<WorkoutLog | null>(null);

  const plannedDay = dayById(s, s.plan[today]);
  const doneToday = s.logs.filter((l) => l.date === today);
  const week = weekDays(weekStart(today));
  const nextPlanned = useMemo(() => {
    for (let i = 1; i <= 14; i++) {
      const d = addDays(today, i);
      if (s.plan[d] && dayById(s, s.plan[d])) return d;
    }
    return null;
  }, [s, today]);

  const start = (id: string) => {
    startWorkout(id);
    go('entrenar');
  };
  const pace = useMemo(() => paceFactor(s.logs, exMap), [s.logs, exMap]);

  /** "Si empiezas a las 6:00 terminas ~6:58 (límite 7:10)" */
  const finishLine = (mins: number) => {
    if (!hasSchedule(s.profile) || !s.profile.gymStart || !s.profile.gymEnd) return null;
    const now = Date.now();
    const st = atTime(s.profile.gymStart, new Date());
    const end = atTime(s.profile.gymEnd, new Date());
    const base = now > st && now < end ? now : st;
    const fin = base + mins * 60000;
    const ok = fin <= end;
    return (
      <p className={`pace-line ${ok ? 'ok' : 'late'}`}>
        <Icon name={ok ? 'timer' : 'alert'} size={16} />
        <span>
          {base === now ? 'Si empiezas ahora' : `Si empiezas a las ${fmtClock(base)}`} terminas ~{fmtClock(fin)} (límite {fmtClock(end)}).
          {!ok && ' No te alcanza: ajusta este día en Rutina.'}
        </span>
      </p>
    );
  };

  // ── Estadísticas
  const monthCount = s.logs.filter((l) => monthKey(l.date) === monthKey(today)).length;
  const thisWeek = weekStats(s, 1)[0];
  const sortedW = [...s.weights].sort((a, b) => a.date.localeCompare(b.date));
  const lastW = sortedW[sortedW.length - 1];
  const monthAgo = addDays(today, -30);
  const refW = [...sortedW].reverse().find((w) => w.date <= monthAgo) ?? sortedW[0];
  const wDelta = lastW && refW && refW !== lastW ? Math.round((lastW.kg - refW.kg) * 10) / 10 : null;
  const st = streak(s);

  // ── Consejos inteligentes
  const tips = useMemo(() => {
    const out: { text: string; route: Route; cta: string; icon: 'alert' | 'spark' | 'scale' | 'calendar' | 'timer' }[] = [];
    if (!hasSchedule(s.profile)) out.push({ text: '¿Tienes una hora límite para irte? Configura tu horario y te mido el tiempo de cada ejercicio.', route: 'ajustes', cta: 'Poner mi horario', icon: 'timer' });
    const mine = s.routine.find((d) => d.mine && !d.exercises.length);
    if (mine) out.push({ text: `Agrega los ejercicios de tu día «${mine.name}» para que lo registre y lo tenga en cuenta.`, route: 'rutina', cta: 'Ir a mi rutina', icon: 'spark' });
    const plannedThisWeek = week.some((d) => s.plan[d]);
    if (!plannedThisWeek) out.push({ text: 'Aún no planificas qué días vas al gym esta semana.', route: 'semana', cta: 'Planificar semana', icon: 'calendar' });
    if (!lastW || lastW.date < addDays(today, -30)) out.push({ text: 'Registra tu peso de este mes para ver tu progreso en el gráfico.', route: 'peso', cta: 'Registrar peso', icon: 'scale' });
    const warn = routineInsights(s, exMap).find((i) => i.tone === 'warn');
    if (warn) out.push({ text: warn.text, route: 'rutina', cta: 'Ver análisis', icon: 'alert' });
    return out.slice(0, 3);
  }, [s, exMap, week, lastW, today]);

  const recent = [...s.logs].reverse().slice(0, 5);
  const hello = s.profile.name ? `Hola, ${s.profile.name.split(' ')[0]}` : 'Hola';

  return (
    <div className="page">
      <PageHeader title={hello} subtitle={fmtLong(today)} />

      {!s.dismissed.includes('welcome') && <WelcomeCard />}
      <InstallCard />

      {s.active && (
        <button className="banner" onClick={() => go('entrenar')}>
          <Icon name="timer" />
          <span>
            <strong>Entrenamiento en curso</strong>
            <small>{s.active.dayName} · toca para continuar</small>
          </span>
          <Icon name="right" />
        </button>
      )}

      {/* ── Hoy ── */}
      <section className="card hero">
        {doneToday.length ? (
          <>
            <span className="eyebrow good">
              <Icon name="check" size={16} /> Hecho hoy
            </span>
            <h2>{doneToday.map((l) => l.dayName).join(' + ')}</h2>
            <p className="muted">
              {doneToday.reduce((a, l) => a + logSetsDone(l), 0)} series · {doneToday.reduce((a, l) => a + logVolume(l), 0).toLocaleString('es')} kg levantados. ¡Buen trabajo!
            </p>
            {nextPlanned && <NextLine date={nextPlanned} />}
          </>
        ) : plannedDay ? (
          <>
            <span className="eyebrow">Hoy toca</span>
            <h2>
              <span className="day-badge" style={{ background: `var(--d${(s.routine.indexOf(plannedDay) % 6) + 1})` }}>{dayLetter(s, plannedDay.id)}</span>
              {plannedDay.name}
            </h2>
            <p className="muted">
              {mainMuscles(plannedDay, exMap)
                .slice(0, 4)
                .map((m) => MUSCLES[m].label.split(' ')[0])
                .join(' · ')}
              {plannedDay.exercises.length > 0 && ` — ${dayCountText(plannedDay.exercises.map((e) => ({ ex: exMap.get(e.exerciseId), min: e.repsMax })))} · ~${estimateMinutes(plannedDay.exercises, exMap, pace)} min`}
            </p>
            {plannedDay.exercises.length > 0 && finishLine(estimateMinutes(plannedDay.exercises, exMap, pace))}
            {plannedDay.exercises.length ? (
              <ol className="mini-list">
                {plannedDay.exercises.map((e) => {
                  const ex = exMap.get(e.exerciseId);
                  return (
                    <li key={e.uid}>
                      <Thumb id={e.exerciseId} size={40} />
                      <span className="mini-name">{ex?.name ?? 'Ejercicio'}</span>
                      <span className="muted">{ex?.unit === 'min' ? `${e.repsMax} min` : `${e.sets}×${e.repsMin}–${e.repsMax}`}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="muted small">Este día aún no tiene ejercicios.</p>
            )}
            <div className="btn-row">
              <button className="btn primary grow" disabled={!plannedDay.exercises.length || Boolean(s.active)} onClick={() => start(plannedDay.id)}>
                <Icon name="play" size={18} /> Empezar entrenamiento
              </button>
              <button className="btn secondary" onClick={() => setChooseDay(true)}>
                Otro día
              </button>
            </div>
            <button
              className="btn ghost sm edit-day"
              onClick={() => {
                setPendingDay(plannedDay.id);
                go('rutina');
              }}
            >
              <Icon name="edit" size={14} /> Cambiar ejercicios o series de este día
            </button>
          </>
        ) : (
          <>
            <span className="eyebrow">Hoy</span>
            <h2>Día de descanso</h2>
            <p className="muted">Descansar también es progresar: el músculo crece mientras te recuperas.</p>
            {nextPlanned && <NextLine date={nextPlanned} />}
            {s.routine.length > 0 && (
              <button className="btn secondary" onClick={() => setChooseDay(true)} disabled={Boolean(s.active)}>
                <Icon name="dumbbell" size={18} /> Entrenar igual
              </button>
            )}
          </>
        )}
      </section>

      {/* ── Semana ── */}
      <button className="card week-strip" onClick={() => go('semana')} aria-label="Ver planificación de la semana">
        {week.map((d, i) => {
          const done = s.logs.some((l) => l.date === d);
          const planned = Boolean(s.plan[d]);
          return (
            <span key={d} className={`ws-day ${d === today ? 'today' : ''}`}>
              <small>{DOW_SHORT[i].charAt(0)}</small>
              <span className={`ws-dot ${done ? 'done' : planned ? (d < today ? 'missed' : 'planned') : ''}`}>{done ? <Icon name="check" size={14} /> : planned ? dayLetter(s, s.plan[d]) : fromKey(d).getDate()}</span>
            </span>
          );
        })}
      </button>

      {/* ── Números ── */}
      <div className="tiles">
        <Tile label="Este mes" value={monthCount} hint={monthCount === 1 ? 'entrenamiento' : 'entrenamientos'} />
        <Tile label="Esta semana" value={`${thisWeek.done}/${thisWeek.planned || s.profile.daysPerWeek}`} hint="días cumplidos" />
        <Tile
          label="Peso"
          value={lastW ? `${fmtKg(lastW.kg)} kg` : '—'}
          delta={wDelta != null ? `${wDelta > 0 ? '+' : ''}${fmtKg(wDelta)} kg en 30 días` : undefined}
          deltaTone="neutral"
          hint={!lastW ? 'sin registros' : undefined}
        />
        <Tile label="Racha" value={st} hint={st === 1 ? 'semana cumplida' : 'semanas cumplidas'} />
      </div>

      {tips.length > 0 && (
        <section className="card">
          <h3 className="card-title">
            <Icon name="spark" size={18} /> Sugerencias para ti
          </h3>
          <ul className="tips">
            {tips.map((t) => (
              <li key={t.text}>
                <Icon name={t.icon} size={18} />
                <span>{t.text}</span>
                <button className="btn ghost sm" onClick={() => go(t.route)}>
                  {t.cta}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3 className="card-title">Historial reciente</h3>
        {recent.length ? (
          <ul className="log-list">
            {recent.map((l) => (
              <li key={l.id}>
                <button onClick={() => setOpenLog(l)}>
                  <span>
                    <strong>{l.dayName}</strong>
                    <small className="muted">
                      {fmtDate(l.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {logSetsDone(l)} series
                      {l.finishedAt ? ` · ${Math.round((l.finishedAt - l.startedAt) / 60000)} min` : ''}
                    </small>
                  </span>
                  <span className="muted">{logVolume(l).toLocaleString('es')} kg</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Cuando termines tu primer entrenamiento aparecerá aquí.</p>
        )}
      </section>

      <Sheet open={chooseDay} onClose={() => setChooseDay(false)} title="¿Qué día quieres entrenar?">
        <div className="ex-list">
          {s.routine.map((d, i) => {
            const isNext = d.id === nextDayIdFor(s, today);
            return (
              <button
                key={d.id}
                className="ex-row"
                disabled={!d.exercises.length}
                onClick={() => {
                  setChooseDay(false);
                  start(d.id);
                }}
              >
                <span className="ex-row-main">
                  <span className="ex-row-name">
                    <span className="day-badge sm" style={{ background: `var(--d${(i % 6) + 1})` }}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    {d.name}
                    {isNext && <span className="badge">Te toca</span>}
                  </span>
                  <span className="ex-row-meta">{d.exercises.length ? `${d.exercises.length} ejercicios · ~${estimateMinutes(d.exercises, exMap, pace)} min` : 'Sin ejercicios'}</span>
                </span>
                <Icon name="play" size={18} />
              </button>
            );
          })}
        </div>
      </Sheet>

      <LogDetail log={openLog} onClose={() => setOpenLog(null)} />
    </div>
  );
}

function NextLine({ date }: { date: string }) {
  const s = useAppState();
  const d = dayById(s, s.plan[date]);
  if (!d) return null;
  return (
    <p className="next-line">
      <Icon name="calendar" size={16} /> Próximo: <strong>{DOW_LONG[dowIndex(date)].toLowerCase()}</strong> · Día {dayLetter(s, d.id)} {d.name}
    </p>
  );
}

export function LogDetail({ log, onClose }: { log: WorkoutLog | null; onClose: () => void }) {
  const exMap = useExMap();
  if (!log) return null;
  return (
    <Sheet open onClose={onClose} title={log.dayName}>
      <p className="muted">
        {fmtLong(log.date)}
        {log.finishedAt ? ` · ${fmtDuration(log.finishedAt - log.startedAt)}` : ''} · {logVolume(log).toLocaleString('es')} kg en total
      </p>
      <ul className="log-detail">
        {log.exercises.map((e) => {
          const ex = exMap.get(e.exerciseId);
          return (
            <li key={e.uid}>
              <strong>
                {ex?.name ?? 'Ejercicio eliminado'}
                {e.elapsedMs ? <span className="muted"> · {fmtDuration(e.elapsedMs)}</span> : null}
              </strong>
              <span className="muted">{e.sets.map((x) => (x.weight ? `${fmtKg(x.weight)} kg × ${x.reps}` : `${x.reps}${ex?.unit === 'seg' ? ' s' : ' reps'}`)).join(' · ')}</span>
            </li>
          );
        })}
      </ul>
      <button
        className="btn danger ghost block"
        onClick={() => {
          if (!window.confirm('¿Borrar este entrenamiento del historial?')) return;
          mutate((s) => {
            s.logs = s.logs.filter((l) => l.id !== log.id);
          });
          onClose();
        }}
      >
        <Icon name="trash" size={16} /> Borrar entrenamiento
      </button>
    </Sheet>
  );
}

function WelcomeCard() {
  const s = useAppState();
  const { go } = useNav();
  const p = s.profile;
  const days = habitualDays(p)
    .map((i) => DOW_LONG[i].toLowerCase())
    .join(' y ')
    .replace(/ y (?=.* y )/g, ', ');
  const exMap = useExMap();
  const cardio = p.cardioId && p.cardioMin ? (exMap.get(p.cardioId)?.name ?? 'cardio') : null;
  return (
    <section className="card welcome">
      <h3 className="card-title">
        <Icon name="spark" size={18} /> Tu plan ya está listo
      </h3>
      <ul className="welcome-list">
        <li>
          <Icon name="calendar" size={16} />
          <span>
            Vas los <strong>{days}</strong>. Cada semana se planifica sola y aquí te muestro lo que toca hoy.
          </span>
        </li>
        <li>
          <Icon name="dumbbell" size={16} />
          <span>
            {p.exercisesPerDay ?? 'Varios'} ejercicios por día{cardio ? ` y al final ${p.cardioMin} min de ${cardio.toLowerCase()}` : ''}. Toca la foto de cada ejercicio para ver cómo se hace.
          </span>
        </li>
        {p.gymStart && p.gymEnd && (
          <li>
            <Icon name="timer" size={16} />
            <span>
              De {fmtHHMM(parseHHMM(p.gymStart) ?? 0)} a {fmtHHMM(parseHHMM(p.gymEnd) ?? 0)}: te mido el tiempo de cada ejercicio.
            </span>
          </li>
        )}
        <li>
          <Icon name="lock" size={16} />
          <span>Sin cuentas ni contraseñas: todo se guarda solo en este celular.</span>
        </li>
      </ul>
      <div className="btn-row wrap">
        <button className="btn secondary" onClick={() => go('ajustes')}>
          Cambiar mis días, ejercicios u horario
        </button>
        <button
          className="btn ghost"
          onClick={() =>
            mutate((st) => {
              st.dismissed.push('welcome');
            })
          }
        >
          Entendido
        </button>
      </div>
    </section>
  );
}

function InstallCard() {
  const s = useAppState();
  const canInstall = useCanInstall();
  if (isStandalone() || s.dismissed.includes('install')) return null;
  const ios = isIOS();
  if (!canInstall && !ios) return null;
  return (
    <section className="card install">
      <div className="install-row">
        <span className="brand-mark">
          <Icon name="download" size={20} />
        </span>
        <p>
          <strong>Instala GymPlan en tu celular.</strong> Se abre como una app, funciona sin internet en el gym y tus datos quedan guardados para siempre.
          {ios && !canInstall && ' En iPhone: toca Compartir y luego "Agregar a inicio".'}
        </p>
      </div>
      <div className="btn-row">
        {canInstall && (
          <button className="btn primary" onClick={() => void promptInstall()}>
            Instalar
          </button>
        )}
        <button
          className="btn ghost"
          onClick={() =>
            mutate((st) => {
              st.dismissed.push('install');
            })
          }
        >
          Ahora no
        </button>
      </div>
    </section>
  );
}

/** "4 ejercicios + 15 min de caminadora" */
function dayCountText(items: { ex?: { unit?: string; name: string }; min: number }[]): string {
  const strength = items.filter((i) => i.ex?.unit !== 'min').length;
  const cardio = items.find((i) => i.ex?.unit === 'min');
  return `${strength} ejercicio${strength === 1 ? '' : 's'}${cardio ? ` + ${cardio.min} min de ${cardio.ex!.name.split(' (')[0].toLowerCase()}` : ''}`;
}
