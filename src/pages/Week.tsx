import { useState } from 'react';
import { ColumnChart } from '../components/charts';
import { Icon } from '../components/Icon';
import { PageHeader, Segmented, Sheet, toast } from '../components/ui';
import { addDays, DOW_SHORT, fmtDate, fmtDayMonth, fmtWeekRange, fromKey, todayKey, weekDays, weekStart } from '../lib/dates';
import { estimateMinutes } from '../lib/generator';
import { paceFactor } from '../lib/timing';
import { applyWeekPlan, dayById, nextDayIdFor, suggestWeekDates, weekStats, weekWarnings } from '../lib/plan';
import { mutate, useAppState, useExMap } from '../lib/store';
import { startWorkout } from '../lib/workout';
import { useNav } from '../nav';
import type { WorkoutLog } from '../types';
import { LogDetail } from './Home';

export function Week() {
  const s = useAppState();
  const exMap = useExMap();
  const { go } = useNav();
  const today = todayKey();
  const [start, setStart] = useState(weekStart(today));
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [count, setCount] = useState(s.profile.daysPerWeek);
  const [openLog, setOpenLog] = useState<WorkoutLog | null>(null);
  const days = weekDays(start);
  const isCurrent = start === weekStart(today);
  const isPast = addDays(start, 6) < today;

  const planned = days.filter((d) => s.plan[d] || s.logs.some((l) => l.date === d)).length;
  const done = new Set(s.logs.filter((l) => days.includes(l.date)).map((l) => l.date)).size;
  const warnings = weekWarnings(s, start, exMap);
  const stats = weekStats(s, 8);

  const toggle = (d: string) =>
    mutate((st) => {
      if (st.plan[d]) delete st.plan[d];
      else {
        const id = nextDayIdFor(st, d);
        if (id) st.plan[d] = id;
      }
    });

  const copyPrev = () => {
    const prev = weekDays(addDays(start, -7));
    const dates = prev.map((d, i) => (s.plan[d] || s.logs.some((l) => l.date === d) ? days[i] : null)).filter((d): d is string => Boolean(d) && d! >= today);
    if (!dates.length) {
      toast('La semana pasada no tenía días planificados');
      return;
    }
    mutate((st) => applyWeekPlan(st, start, dates));
    toast('Copié los días de la semana pasada');
  };

  return (
    <div className="page">
      <PageHeader title="Mi semana" subtitle="Elige qué días vas al gym y qué entrenas cada día" />

      <div className="week-nav card">
        <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Semana anterior">
          <Icon name="left" />
        </button>
        <div className="center">
          <strong>{fmtWeekRange(start)}</strong>
          <small className="muted">{isCurrent ? 'Esta semana' : isPast ? 'Semana pasada' : 'Próxima semana'}</small>
        </div>
        <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Semana siguiente">
          <Icon name="right" />
        </button>
      </div>

      <div className="progress-line">
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={planned || 1} aria-valuenow={done} aria-label="Entrenamientos cumplidos">
          <span style={{ width: `${planned ? (done / planned) * 100 : 0}%` }} />
        </div>
        <span>
          <strong>{done}</strong> de {planned} {planned === 1 ? 'día' : 'días'} cumplidos
        </span>
      </div>

      {!isPast && (
        <div className="btn-row wrap">
          <button className="btn primary" onClick={() => setSuggestOpen(true)} disabled={!s.routine.length}>
            <Icon name="spark" size={18} /> Planificar automático
          </button>
          <button className="btn secondary" onClick={copyPrev}>
            <Icon name="copy" size={18} /> Repetir semana pasada
          </button>
          <button
            className="btn ghost"
            onClick={() =>
              mutate((st) => {
                for (const d of days) if (d >= today) delete st.plan[d];
              })
            }
          >
            Limpiar
          </button>
        </div>
      )}

      <ul className="week-list">
        {days.map((d, i) => {
          const log = s.logs.find((l) => l.date === d);
          const plannedId = s.plan[d];
          const day = dayById(s, plannedId);
          const past = d < today;
          const status = log ? 'done' : !plannedId ? 'rest' : past ? 'missed' : d === today ? 'today' : 'planned';
          const idx = day ? s.routine.indexOf(day) : -1;
          return (
            <li key={d} className={`week-row st-${status} ${d === today ? 'is-today' : ''}`}>
              <div className="wr-date">
                <small>{DOW_SHORT[i]}</small>
                <strong>{fromKey(d).getDate()}</strong>
              </div>
              <div className="wr-body">
                {log ? (
                  <button className="link-btn" onClick={() => setOpenLog(log)}>
                    <span className="status-pill good">
                      <Icon name="check" size={14} /> Hecho
                    </span>
                    {log.dayName}
                  </button>
                ) : plannedId ? (
                  <>
                    <div className="wr-select">
                      <span className="day-badge sm" style={{ background: idx >= 0 ? `var(--d${(idx % 6) + 1})` : 'var(--muted)' }}>
                        {idx >= 0 ? String.fromCharCode(65 + idx) : '?'}
                      </span>
                      <select
                        value={plannedId}
                        aria-label={`Día de rutina para ${fmtDate(d, { weekday: 'long' })}`}
                        onChange={(e) =>
                          mutate((st) => {
                            st.plan[d] = e.target.value;
                          })
                        }
                        disabled={past}
                      >
                        {!day && <option value={plannedId}>Día eliminado</option>}
                        {s.routine.map((r, j) => (
                          <option key={r.id} value={r.id}>
                            {String.fromCharCode(65 + j)} · {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    {status === 'missed' && <span className="status-pill bad">No fuiste</span>}
                    {day && !past && <small className="muted">{day.exercises.length} ejercicios · ~{estimateMinutes(day.exercises, exMap, paceFactor(s.logs, exMap))} min</small>}
                    {status === 'today' && day && day.exercises.length > 0 && !s.active && (
                      <button
                        className="btn primary sm start-btn"
                        onClick={() => {
                          startWorkout(day.id);
                          go('entrenar');
                        }}
                      >
                        <Icon name="play" size={14} /> Empezar hoy
                      </button>
                    )}
                  </>
                ) : (
                  <span className="muted">Descanso</span>
                )}
              </div>
              <div className="wr-actions">
                {!log && !past && (
                  <button
                    role="switch"
                    aria-checked={Boolean(plannedId)}
                    aria-label={`Ir al gym el ${fmtDate(d, { weekday: 'long' })}`}
                    className={`switch ${plannedId ? 'on' : ''}`}
                    onClick={() => toggle(d)}
                    disabled={!s.routine.length}
                  >
                    <span />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {warnings.length > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={18} />
          <div>
            {warnings.map((w) => (
              <p key={w.text}>{w.text}</p>
            ))}
          </div>
        </div>
      )}

      <section className="card">
        <h3 className="card-title">Constancia · últimas 8 semanas</h3>
        <p className="muted small">Entrenamientos hechos por semana (encima: hechos / planificados).</p>
        <ColumnChart
          ariaLabel="Entrenamientos completados por semana en las últimas 8 semanas"
          data={stats.map((w) => ({
            key: w.start,
            label: fmtDayMonth(w.start),
            value: w.done,
            cap: `${w.done}/${w.planned}`,
            tip: `Semana del ${fmtWeekRange(w.start)}`,
            current: w.start === weekStart(today),
          }))}
        />
      </section>

      <Sheet
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        title="Planificar automático"
        footer={
          <button
            className="btn primary block"
            onClick={() => {
              mutate((st) => applyWeekPlan(st, start, suggestWeekDates(st, start, count)));
              setSuggestOpen(false);
              toast('Semana planificada');
            }}
          >
            Planificar {count} días
          </button>
        }
      >
        <p className="muted">Reparto los días con descanso entre medio y asigno los días de tu rutina en orden, siguiendo desde donde te quedaste.</p>
        <div className="field">
          <span>¿Cuántos días vas esta semana?</span>
          <Segmented label="Días" value={count} onChange={setCount} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} />
        </div>
        {isCurrent && <p className="muted small">Solo cambio los días desde hoy en adelante; lo que ya hiciste se cuenta.</p>}
      </Sheet>

      <LogDetail log={openLog} onClose={() => setOpenLog(null)} />
    </div>
  );
}
