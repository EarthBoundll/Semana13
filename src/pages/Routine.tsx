import { useEffect, useMemo, useState } from 'react';
import { VolumeBars } from '../components/charts';
import { ExerciseDetail, ExercisePicker, exMeta } from '../components/exercise';
import { Icon } from '../components/Icon';
import { Thumb } from '../components/media';
import { Chip, Empty, PageHeader, Segmented, Sheet, Stepper, toast } from '../components/ui';
import { fmtRest, MUSCLE_ORDER, MUSCLES, REST_OPTIONS, STYLES } from '../data/meta';
import { routineInsights, statusOf, targets, weeklyVolume } from '../lib/analysis';
import { bestForMuscle, dayNameFromFocus, detectStyle, estimateMinutes, exerciseMinutes, fillDay, generateRoutine, mainMuscles, scheme, suggestionsForDay, totalSets } from '../lib/generator';
import { fitRoutineDay, fmtHHMM, paceFactor, parseHHMM, planningBudget, scheduleMinutes } from '../lib/timing';
import { remapFuturePlan } from '../lib/actions';
import { isAvailable } from '../lib/equipment';
import { peekPendingDay, setPendingDay } from '../nav';
import { getState, mutate, uid, useAppState, useExMap } from '../lib/store';
import type { Muscle, RoutineDay, RoutineExercise, SplitStyle } from '../types';

function updateExercise(dayId: string, exUid: string, patch: Partial<RoutineExercise>) {
  mutate((s) => {
    const d = s.routine.find((x) => x.id === dayId);
    const e = d?.exercises.find((x) => x.uid === exUid);
    if (e) Object.assign(e, patch);
    if (e && e.repsMin > e.repsMax) e.repsMax = e.repsMin;
  });
}

function updateDay(dayId: string, fn: (d: RoutineDay) => void) {
  mutate((s) => {
    const d = s.routine.find((x) => x.id === dayId);
    if (d) fn(d);
  });
}

export function Routine() {
  const s = useAppState();
  const exMap = useExMap();
  const [sel, setSel] = useState(() => {
    const wanted = peekPendingDay();
    const i = wanted ? s.routine.findIndex((d) => d.id === wanted) : -1;
    return i >= 0 ? i : Math.max(0, s.routine.findIndex((d) => d.mine && !d.exercises.length));
  });
  const [regenOpen, setRegenOpen] = useState(false);
  const [newDayOpen, setNewDayOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [swap, setSwap] = useState<{ uid: string; exId: string } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (sel >= s.routine.length) setSel(Math.max(0, s.routine.length - 1));
  }, [s.routine.length, sel]);
  useEffect(() => setPendingDay(null), []);

  const day = s.routine[sel] as RoutineDay | undefined;
  const pace = useMemo(() => paceFactor(s.logs, exMap), [s.logs, exMap]);
  const budget = planningBudget(s.profile);
  const sched = scheduleMinutes(s.profile);
  const mins = s.routine.map((d) => estimateMinutes(d.exercises, exMap, pace)).filter(Boolean);
  const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : 0;

  const suggestions = useMemo(() => (day ? suggestionsForDay(day, exMap, s.profile, s.favorites, s.disliked) : []), [day, exMap, s.profile, s.favorites, s.disliked]);

  const addExercises = (ids: string[]) => {
    if (!day) return;
    mutate((st) => {
      const d = st.routine.find((x) => x.id === day.id);
      if (!d) return;
      for (const id of ids) {
        const ex = exMap.get(id);
        if (!ex) continue;
        const sc = scheme(st.profile.goal, ex, st.profile.level, st.profile.setsPref);
        if (ex.unit === 'min') sc.repsMin = sc.repsMax = st.profile.cardioMin || 15;
        const item = { uid: uid(), exerciseId: id, ...sc };
        // los ejercicios de fuerza van antes del cardio final
        const cardioAt = d.exercises.findIndex((e) => exMap.get(e.exerciseId)?.unit === 'min');
        if (ex.unit !== 'min' && cardioAt >= 0) d.exercises.splice(cardioAt, 0, item);
        else d.exercises.push(item);
      }
    });
    toast(ids.length === 1 ? 'Ejercicio añadido' : `${ids.length} ejercicios añadidos`);
  };

  const doSwap = (newId: string, dislikeBase: boolean) => {
    if (!day || !swap) return;
    const ex = exMap.get(newId);
    const old = exMap.get(swap.exId);
    mutate((st) => {
      const d = st.routine.find((x) => x.id === day.id);
      const e = d?.exercises.find((x) => x.uid === swap.uid);
      if (!e || !ex) return;
      e.exerciseId = newId;
      if ((ex.unit === 'seg') !== (old?.unit === 'seg')) Object.assign(e, scheme(st.profile.goal, ex, st.profile.level, e.sets));
      if (dislikeBase && !st.disliked.includes(swap.exId)) st.disliked.push(swap.exId);
    });
    toast(dislikeBase ? `Cambiado. No volveré a sugerir «${old?.name}»` : `Cambiado por «${ex?.name}»`);
  };

  const fixMuscle = (m: Muscle) => {
    const pool = s.routine.filter((d) => !d.mine).length ? s.routine.filter((d) => !d.mine) : s.routine;
    const withFocus = pool.filter((d) => d.focus.includes(m) || mainMuscles(d, exMap).includes(m));
    const target = [...(withFocus.length ? withFocus : pool)].sort((a, b) => estimateMinutes(a.exercises, exMap) - estimateMinutes(b.exercises, exMap))[0];
    if (!target) return;
    const ex = bestForMuscle(m, target, s.routine, exMap, s.profile, s.favorites, s.disliked);
    if (!ex) {
      toast('No encontré un ejercicio con tu equipo');
      return;
    }
    mutate((st) => {
      const d = st.routine.find((x) => x.id === target.id);
      if (!d) return;
      const item = { uid: uid(), exerciseId: ex.id, ...scheme(st.profile.goal, ex, st.profile.level, st.profile.setsPref) };
      const cardioAt = d.exercises.findIndex((e) => exMap.get(e.exerciseId)?.unit === 'min');
      if (cardioAt >= 0) d.exercises.splice(cardioAt, 0, item);
      else d.exercises.push(item);
      if (!d.focus.includes(m)) d.focus.push(m);
    });
    const idx = s.routine.indexOf(target);
    setSel(idx);
    toast(`Añadí «${ex.name}» al día ${String.fromCharCode(65 + idx)}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Mi rutina"
        subtitle={
          s.routine.length
            ? sched != null
              ? `${s.routine.length} días · ${fmtHHMM(parseHHMM(s.profile.gymStart) ?? 0)}–${fmtHHMM(parseHHMM(s.profile.gymEnd) ?? 0)} · sesiones de máx. ${budget} min`
              : `${s.routine.length} días · ~${avg} min por sesión`
            : 'Aún no tienes rutina'
        }
      />

      <div className="btn-row wrap">
        <button className="btn primary" onClick={() => setRegenOpen(true)}>
          <Icon name="spark" size={18} /> Generar rutina
        </button>
        <button className="btn secondary" onClick={() => setNewDayOpen(true)}>
          <Icon name="plus" size={18} /> Nuevo día
        </button>
      </div>

      {s.routine.length > 0 && (
        <div className="day-tabs scroll-x" role="tablist" aria-label="Días de la rutina">
          {s.routine.map((d, i) => (
            <button key={d.id} role="tab" aria-selected={i === sel} className={`day-tab ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)}>
              <span className="day-badge sm" style={{ background: `var(--d${(i % 6) + 1})` }}>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="day-tab-name">{d.name}</span>
              {d.mine && <Icon name="star" size={14} filled className="star" />}
              {d.locked && !d.mine && <Icon name="lock" size={14} className="muted" />}
            </button>
          ))}
        </div>
      )}

      {!day ? (
        <Empty icon="dumbbell" title="Sin días en tu rutina">
          Usa “Generar rutina inteligente” o crea un día nuevo.
        </Empty>
      ) : (
        <section className="card day-panel">
          <div className="dp-head">
            {renaming ? (
              <form
                className="rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = String(new FormData(e.currentTarget).get('name') ?? '').trim();
                  if (v) updateDay(day.id, (d) => (d.name = v));
                  setRenaming(false);
                }}
              >
                <input name="name" defaultValue={day.name} autoFocus aria-label="Nombre del día" />
                <button className="btn primary sm">Guardar</button>
              </form>
            ) : (
              <h2>
                Día {String.fromCharCode(65 + sel)} · {day.name}
                <button className="icon-btn sm" onClick={() => setRenaming(true)} aria-label="Renombrar día">
                  <Icon name="edit" size={16} />
                </button>
              </h2>
            )}
            <p className="muted small">
              {day.exercises.length} ejercicios · {totalSets(day)} series · ~{estimateMinutes(day.exercises, exMap, pace)} de {budget} min
              {day.mine && ' · Tu día propio'}
            </p>
            {estimateMinutes(day.exercises, exMap, pace) > budget && (
              <div className="callout warn">
                <Icon name="timer" size={18} />
                <p>
                  Este día dura ~{estimateMinutes(day.exercises, exMap, pace)} min y tienes {budget}
                  {sched != null ? ` (para terminar a las ${fmtHHMM(parseHHMM(s.profile.gymEnd) ?? 0)})` : ''}.
                </p>
                <button
                  className="btn sm primary"
                  onClick={() => {
                    const res = fitRoutineDay(day.exercises, exMap, budget, pace);
                    updateDay(day.id, (d) => (d.exercises = res.exercises));
                    toast(res.changes.length ? `Ajustado: ${res.changes.slice(0, 3).join(' · ')}${res.changes.length > 3 ? '…' : ''}` : 'Ya cabe en tu tiempo');
                  }}
                >
                  <Icon name="spark" size={14} /> Ajustar a mi tiempo
                </button>
              </div>
            )}
            <div className="chips">
              {mainMuscles(day, exMap).map((m) => (
                <span key={m} className="tag">
                  {MUSCLES[m].label}
                </span>
              ))}
            </div>
          </div>

          <div className="dp-tools">
            <div className="field inline">
              <span>Series para todos</span>
              <Segmented
                label="Series para todos los ejercicios"
                value={day.exercises.length && day.exercises.every((e) => e.sets === day.exercises[0].sets) ? day.exercises[0].sets : 0}
                onChange={(v) => updateDay(day.id, (d) => d.exercises.forEach((e) => (e.sets = v)))}
                options={[2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
              />
            </div>
            <div className="btn-row wrap">
              <button className={`btn sm ${day.mine ? 'primary' : 'secondary'}`} onClick={() => updateDay(day.id, (d) => ((d.mine = !d.mine), (d.locked = d.mine || d.locked)))} aria-pressed={Boolean(day.mine)}>
                <Icon name="star" size={14} filled={day.mine} /> {day.mine ? 'Es mi día' : 'Marcar como mi día'}
              </button>
              <button className={`btn sm ${day.locked ? 'primary' : 'secondary'}`} onClick={() => updateDay(day.id, (d) => (d.locked = !d.locked))} aria-pressed={Boolean(day.locked)} title="Los días mantenidos no cambian al generar de nuevo">
                <Icon name={day.locked ? 'lock' : 'unlock'} size={14} /> {day.locked ? 'Se mantiene' : 'Mantener al regenerar'}
              </button>
              <button
                className="btn sm ghost danger"
                onClick={() => {
                  if (!window.confirm(`¿Eliminar el día «${day.name}»?`)) return;
                  mutate((st) => {
                    st.routine = st.routine.filter((d) => d.id !== day.id);
                  });
                  remapFuturePlan();
                }}
              >
                <Icon name="trash" size={14} /> Eliminar día
              </button>
            </div>
          </div>

          {day.exercises.length === 0 ? (
            <div className="empty-day">
              <Icon name="dumbbell" size={28} />
              <strong>{day.mine ? 'Agrega los ejercicios que ya haces este día' : 'Este día está vacío'}</strong>
              <p className="muted small">Elige del banco (puedes marcar varios a la vez) o deja que lo arme por ti.</p>
              <div className="btn-row center-row">
                <button className="btn primary" onClick={() => setAdding(true)}>
                  <Icon name="plus" size={18} /> Elegir ejercicios
                </button>
                <button
                  className="btn secondary"
                  onClick={() => {
                    const st = getState();
                    const list = fillDay(day, st.routine.filter((d) => d.id !== day.id), exMap, st.profile, st.favorites, st.disliked, pace);
                    updateDay(day.id, (d) => (d.exercises = list));
                  }}
                >
                  <Icon name="spark" size={18} /> Armar con sugerencia
                </button>
              </div>
            </div>
          ) : (
            <ol className="rx-list">
              {day.exercises.map((re, i) => {
                const ex = exMap.get(re.exerciseId);
                const seg = ex?.unit === 'seg';
                const cardio = ex?.unit === 'min';
                return (
                  <li key={re.uid} className={`rx ${cardio ? 'rx-cardio' : ''}`}>
                    <div className="rx-head">
                      <span className="rx-num">{i + 1}</span>
                      <button className="rx-thumb" onClick={() => ex && setDetail(ex.id)} aria-label={`Ver cómo se hace ${ex?.name ?? ''}`}>
                        <Thumb id={re.exerciseId} size={52} />
                        <span className="rx-thumb-play">
                          <Icon name="play" size={12} />
                        </span>
                      </button>
                      <button className="rx-name" onClick={() => ex && setDetail(ex.id)}>
                        <strong>{ex?.name ?? 'Ejercicio eliminado'}</strong>
                        {ex && (
                          <small className="muted">
                            {exMeta(ex)} · ≈ {exerciseMinutes(re, exMap, pace)} min
                          </small>
                        )}
                        {ex && !isAvailable(ex, s.profile) && (
                          <small className="not-available">
                            <Icon name="alert" size={12} /> No está en tu gym: toca “Cambiar”
                          </small>
                        )}
                      </button>
                      <div className="rx-move">
                        <button
                          className="icon-btn sm"
                          disabled={i === 0}
                          aria-label="Subir"
                          onClick={() =>
                            updateDay(day.id, (d) => {
                              [d.exercises[i - 1], d.exercises[i]] = [d.exercises[i], d.exercises[i - 1]];
                            })
                          }
                        >
                          <Icon name="up" size={16} />
                        </button>
                        <button
                          className="icon-btn sm"
                          disabled={i === day.exercises.length - 1}
                          aria-label="Bajar"
                          onClick={() =>
                            updateDay(day.id, (d) => {
                              [d.exercises[i + 1], d.exercises[i]] = [d.exercises[i], d.exercises[i + 1]];
                            })
                          }
                        >
                          <Icon name="down" size={16} />
                        </button>
                      </div>
                    </div>
                    {cardio ? (
                    <div className="rx-controls">
                      <div className="rx-field">
                        <span>Minutos</span>
                        <Stepper small label="minutos" value={re.repsMax} min={5} max={60} step={5} onChange={(v) => updateExercise(day.id, re.uid, { repsMin: v, repsMax: v })} />
                      </div>
                    </div>
                    ) : (
                    <div className="rx-controls">
                      <div className="rx-field">
                        <span>Series</span>
                        <Stepper small label="series" value={re.sets} min={1} max={10} onChange={(v) => updateExercise(day.id, re.uid, { sets: v })} />
                      </div>
                      <div className="rx-field">
                        <span>{seg ? 'Segundos' : 'Reps'}</span>
                        <div className="range-inputs">
                          <Stepper small label={seg ? 'segundos mínimo' : 'repeticiones mínimo'} value={re.repsMin} min={1} max={seg ? 300 : 50} step={seg ? 5 : 1} onChange={(v) => updateExercise(day.id, re.uid, { repsMin: v })} />
                          <span className="muted">–</span>
                          <Stepper small label={seg ? 'segundos máximo' : 'repeticiones máximo'} value={re.repsMax} min={re.repsMin} max={seg ? 300 : 50} step={seg ? 5 : 1} onChange={(v) => updateExercise(day.id, re.uid, { repsMax: v })} />
                        </div>
                      </div>
                      <label className="rx-field">
                        <span>Descanso</span>
                        <select value={re.rest} onChange={(e) => updateExercise(day.id, re.uid, { rest: Number(e.target.value) })}>
                          {[...new Set([...REST_OPTIONS, re.rest])]
                            .sort((a, b) => a - b)
                            .map((r) => (
                              <option key={r} value={r}>
                                {fmtRest(r)}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    )}
                    <div className="rx-actions">
                      <button className="btn sm secondary" onClick={() => setSwap({ uid: re.uid, exId: re.exerciseId })}>
                        <Icon name="swap" size={14} /> Cambiar
                      </button>
                      <button className="btn sm ghost" onClick={() => updateDay(day.id, (d) => (d.exercises = d.exercises.filter((x) => x.uid !== re.uid)))}>
                        <Icon name="trash" size={14} /> Quitar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {day.exercises.length > 0 && (
            <button className="btn secondary block" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} /> Añadir ejercicios
            </button>
          )}
        </section>
      )}

      {s.routine.length > 0 && <Analysis onFix={fixMuscle} />}

      <ExercisePicker
        open={adding}
        onClose={() => setAdding(false)}
        title={day ? `Añadir al día ${String.fromCharCode(65 + sel)}` : 'Añadir'}
        focus={day?.focus}
        suggested={suggestions}
        excludeIds={day?.exercises.map((e) => e.exerciseId)}
        multi
        onPick={(ids) => addExercises(ids)}
      />
      <ExercisePicker
        key={swap?.uid ?? 'none'}
        open={Boolean(swap)}
        onClose={() => setSwap(null)}
        title="Cambiar ejercicio"
        baseId={swap?.exId}
        excludeIds={day?.exercises.map((e) => e.exerciseId)}
        onPick={([id], o) => doSwap(id, o.dislikeBase)}
      />
      <ExerciseDetail id={detail} onClose={() => setDetail(null)} onOpen={setDetail} />
      <RegenerateSheet open={regenOpen} onClose={() => setRegenOpen(false)} onDone={() => setSel(0)} />
      <NewDaySheet
        open={newDayOpen}
        onClose={() => setNewDayOpen(false)}
        onCreated={() => {
          setSel(getState().routine.length - 1);
        }}
      />
    </div>
  );
}

// ─────────────────────────── Análisis inteligente ───────────────────────────

function Analysis({ onFix }: { onFix: (m: Muscle) => void }) {
  const s = useAppState();
  const exMap = useExMap();
  const { vol, factor } = weeklyVolume(s, exMap);
  const t = targets(s.profile.level);
  const insights = routineInsights(s, exMap);
  const pending = new Set(s.routine.filter((d) => !d.exercises.length).flatMap((d) => d.focus));
  const rows = MUSCLE_ORDER.filter((m) => m !== 'antebrazos' || vol[m] > 0).map((m) => ({
    key: m,
    label: MUSCLES[m].label.split(' ')[0],
    value: vol[m],
    min: t[m][0],
    max: t[m][1],
    status: pending.has(m) && vol[m] < t[m][0] ? ('pend' as const) : statusOf(vol[m], t[m]),
  }));
  return (
    <section className="card">
      <h3 className="card-title">
        <Icon name="chart" size={18} /> Análisis de tu rutina
      </h3>
      <p className="muted small">
        Series por semana de cada músculo si entrenas {s.profile.daysPerWeek} días{factor !== 1 ? ` (tu rutina tiene ${s.routine.length} días y rota)` : ''}. Los ejercicios cuentan 1 serie para el músculo principal y ½ para los secundarios.
      </p>
      <VolumeBars rows={rows} />
      <ul className="insights">
        {insights.map((i) => (
          <li key={i.id} className={`insight ${i.tone}`}>
            <Icon name={i.tone === 'good' ? 'check' : i.tone === 'warn' ? 'alert' : 'info'} size={18} />
            <span>{i.text}</span>
            {i.action && (
              <button className="btn sm secondary" onClick={() => onFix(i.action!.muscle)}>
                <Icon name="plus" size={14} /> {i.action.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────── Generar de nuevo ───────────────────────────

function RegenerateSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const s = useAppState();
  const exMap = useExMap();
  const [days, setDays] = useState(s.profile.daysPerWeek);
  const [style, setStyle] = useState<SplitStyle>(s.profile.style);
  const [mins, setMins] = useState(s.profile.sessionMinutes);
  const [setsPref, setSetsPref] = useState(s.profile.setsPref ?? 0);

  useEffect(() => {
    if (!open) return;
    setDays(s.profile.daysPerWeek);
    setStyle(s.profile.style);
    setMins(s.profile.sessionMinutes);
    setSetsPref(s.profile.setsPref ?? 0);
  }, [open, s.profile]);

  const kept = s.routine.filter((d) => d.mine || d.locked);
  const own = kept.find((d) => d.mine) ?? kept[0];
  const detected = detectStyle(own, Math.max(days, kept.length), s.profile.level, exMap);

  const run = () => {
    const profile = { ...s.profile, daysPerWeek: days, style, sessionMinutes: mins, setsPref: setsPref || null };
    const res = generateRoutine({ days, style, current: s.routine, exMap, profile, favorites: s.favorites, disliked: s.disliked, seed: Date.now(), pace: paceFactor(s.logs, exMap) });
    mutate((st) => {
      st.profile = profile;
      st.routine = res.routine;
    });
    remapFuturePlan();
    onClose();
    onDone();
    toast(`Rutina lista: ${STYLES[res.style].label}`);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Generar rutina inteligente"
      footer={
        <button className="btn primary block" onClick={run}>
          <Icon name="spark" size={18} /> Generar
        </button>
      }
    >
      <div className="field">
        <span>Días por semana</span>
        <Segmented label="Días por semana" value={days} onChange={setDays} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} />
      </div>
      <div className="field">
        <span>Estilo</span>
        <div className="option-list">
          {(Object.keys(STYLES) as SplitStyle[]).map((k) => (
            <button key={k} type="button" className={`option row ${style === k ? 'on' : ''}`} onClick={() => setStyle(k)} aria-pressed={style === k}>
              <strong>{STYLES[k].label}</strong>
              <span>{k === 'auto' ? `Para ti: ${STYLES[detected].label}${own ? ` (según «${own.name}»)` : ''}` : STYLES[k].desc}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Duración por sesión</span>
        {scheduleMinutes(s.profile) != null ? (
          <p className="muted small">
            Según tu horario ({fmtHHMM(parseHHMM(s.profile.gymStart) ?? 0)} a {fmtHHMM(parseHHMM(s.profile.gymEnd) ?? 0)}): sesiones de máximo {planningBudget(s.profile)} min. Cámbialo en Ajustes.
          </p>
        ) : (
          <Segmented label="Duración" value={mins} onChange={setMins} options={[45, 60, 75, 90].map((n) => ({ value: n, label: `${n} min` }))} />
        )}
      </div>
      <div className="field">
        <span>Series por ejercicio</span>
        <Segmented
          label="Series por ejercicio"
          value={setsPref}
          onChange={setSetsPref}
          options={[0, 2, 3, 4, 5].map((n) => ({ value: n, label: n ? String(n) : 'Auto' }))}
        />
      </div>
      <div className="callout">
        <Icon name="info" size={18} />
        <p>
          {kept.length
            ? `Se mantienen: ${kept.map((d) => `«${d.name}»`).join(', ')}. El resto de días se arma alrededor para no repetir músculos.`
            : 'Se reemplazan todos los días. Usa “Mantener al regenerar” en un día para conservarlo.'}{' '}
          Evito los ejercicios que marcaste con “No me gusta” y priorizo tus favoritos.
        </p>
      </div>
    </Sheet>
  );
}

// ─────────────────────────── Nuevo día ───────────────────────────

function NewDaySheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const exMap = useExMap();
  const [focus, setFocus] = useState<Muscle[]>([]);
  const [name, setName] = useState('');
  const [auto, setAuto] = useState(true);
  const [mine, setMine] = useState(false);

  const create = () => {
    const st = getState();
    const day: RoutineDay = { id: uid(), name: name.trim() || dayNameFromFocus(focus), focus, exercises: [], mine, locked: mine };
    if (auto && focus.length) day.exercises = fillDay(day, st.routine, exMap, st.profile, st.favorites, st.disliked);
    mutate((s) => {
      s.routine.push(day);
    });
    setFocus([]);
    setName('');
    onClose();
    onCreated();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo día"
      footer={
        <button className="btn primary block" onClick={create} disabled={!focus.length && !name.trim()}>
          Crear día
        </button>
      }
    >
      <div className="field">
        <span>¿Qué músculos trabajas?</span>
        <div className="chips">
          {MUSCLE_ORDER.map((m) => (
            <Chip key={m} on={focus.includes(m)} onClick={() => setFocus((f) => (f.includes(m) ? f.filter((x) => x !== m) : [...f, m]))}>
              {MUSCLES[m].label}
            </Chip>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={focus.length ? dayNameFromFocus(focus) : 'Ej. Pierna'} />
      </label>
      <label className="check-line">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        Llenarlo con ejercicios sugeridos
      </label>
      <label className="check-line">
        <input
          type="checkbox"
          checked={mine}
          onChange={(e) => {
            setMine(e.target.checked);
            if (e.target.checked) setAuto(false);
          }}
        />
        Es mi día propio (lo armo yo y no cambia al regenerar)
      </label>
    </Sheet>
  );
}
