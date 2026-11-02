import { useEffect, useMemo, useRef, useState } from 'react';
import { ExerciseDetail, ExercisePicker } from '../components/exercise';
import { Icon } from '../components/Icon';
import { Thumb } from '../components/media';
import { Sheet, toast, useNow } from '../components/ui';
import { fmtRest } from '../data/meta';
import { fmtDate, fmtDuration } from '../lib/dates';
import { findPRs, fmtKg, history, logSetsDone, logVolume, suggest } from '../lib/progression';
import { getState, mutate, useAppState, useExMap } from '../lib/store';
import { atTime, budgetFor, deadlineOf, exerciseElapsed, fmtClock, paceFactor, projection } from '../lib/timing';
import {
  beep,
  discardWorkout,
  finishWorkout,
  fitActiveToDeadline,
  makeLoggedExercise,
  pauseExercise,
  primeAudio,
  setDeadline,
  startExercise,
  startExerciseIn,
  stopCurrentIn,
} from '../lib/workout';
import { useNav } from '../nav';
import type { LoggedExercise, LoggedSet } from '../types';

const mmss = (ms: number) => fmtDuration(Math.abs(ms));

/** Marca el cardio como hecho con los minutos dados */
function completeCardio(uid: string, minutes: number) {
  mutate((s) => {
    const a = s.active;
    const le = a?.exercises.find((e) => e.uid === uid);
    if (!a || !le) return;
    if (a.currentUid === uid) stopCurrentIn(a, Date.now());
    le.sets = [{ weight: null, reps: Math.max(1, Math.round(minutes)), done: true }];
  });
}

function markAlert(id: string) {
  mutate((s) => {
    if (s.active) s.active.alerts = [...(s.active.alerts ?? []), id];
  });
}

const parseNum = (t: string): number | null => {
  const v = parseFloat(t.replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

function NumInput({ value, onChange, placeholder, label, decimal }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; label: string; decimal?: boolean }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    if (parseNum(text) !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className="num-input"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNum(e.target.value));
      }}
    />
  );
}

function patchActive(fn: (exs: LoggedExercise[]) => void) {
  mutate((s) => {
    if (s.active) fn(s.active.exercises);
  });
}

export function Workout() {
  const s = useAppState();
  const exMap = useExMap();
  const { go } = useNav();
  const a = s.active!;
  const now = useNow(1000);
  const [rest, setRest] = useState<{ end: number; total: number; name: string } | null>(null);
  const [restNow, setRestNow] = useState(Date.now());
  const [finishing, setFinishing] = useState(false);
  const [swapUid, setSwapUid] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [editDeadline, setEditDeadline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const beeped = useRef(false);
  const pace = useMemo(() => paceFactor(s.logs, exMap), [s.logs, exMap]);
  const proj = projection(a, exMap, now, pace);
  const current = a.exercises.find((e) => e.uid === a.currentUid);

  // Avisos de tiempo: ejercicio pasado de su tiempo, 10 min antes y a la hora límite
  useEffect(() => {
    const fired = new Set(a.alerts ?? []);
    // el cardio se completa solo al llegar a sus minutos
    if (current && exMap.get(current.exerciseId)?.unit === 'min' && exerciseElapsed(current, a, now) >= current.target.repsMax * 60000) {
      const ex = exMap.get(current.exerciseId);
      completeCardio(current.uid, current.target.repsMax);
      beep();
      setNotice(`¡Listo! ${current.target.repsMax} min de ${ex?.name.toLowerCase() ?? 'cardio'} completados.`);
      return;
    }
    if (current && current.budgetSec && !fired.has(`over-${current.uid}`) && exerciseElapsed(current, a, now) > current.budgetSec * 1000) {
      const ex = exMap.get(current.exerciseId);
      markAlert(`over-${current.uid}`);
      beep();
      setNotice(`Te pasaste del tiempo de «${ex?.name ?? 'este ejercicio'}». Termina la serie y pasa al siguiente.`);
    }
    const left = deadlineOf(a) - now;
    if (left <= 0 && !fired.has('deadline-0')) {
      markAlert('deadline-0');
      beep();
      setNotice(`Son las ${fmtClock(deadlineOf(a))}: hora de terminar e ir a ducharte.`);
    } else if (left > 0 && left <= 10 * 60000 && !fired.has('deadline-10')) {
      markAlert('deadline-10');
      beep();
      setNotice(`Quedan ${Math.ceil(left / 60000)} min para tu hora límite (${fmtClock(deadlineOf(a))}).`);
    }
  }, [now, a, current, exMap]);

  // Pantalla siempre encendida mientras entrenas
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      void lock?.release().catch(() => {});
    };
  }, []);

  // Temporizador de descanso
  useEffect(() => {
    if (!rest) return;
    beeped.current = false;
    const t = window.setInterval(() => {
      const n = Date.now();
      setRestNow(n);
      if (n >= rest.end && !beeped.current) {
        beeped.current = true;
        beep();
        window.setTimeout(() => setRest((r) => (r && Date.now() >= r.end ? null : r)), 2500);
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [rest]);

  const suggestions = useMemo(() => {
    const m = new Map<string, ReturnType<typeof suggest>>();
    for (const le of a.exercises) {
      const ex = exMap.get(le.exerciseId);
      if (ex) m.set(le.uid, suggest(ex, le.target, s.logs));
    }
    return m;
  }, [a.exercises, exMap, s.logs]);

  const total = a.exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneCount = a.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);

  const setField = (exUid: string, i: number, patch: Partial<LoggedSet>) =>
    patchActive((exs) => {
      const le = exs.find((e) => e.uid === exUid);
      if (!le) return;
      const before = le.sets[i].weight;
      Object.assign(le.sets[i], patch);
      // Cambiar el peso de una serie actualiza las siguientes que tenían el mismo peso
      if ('weight' in patch) for (let j = i + 1; j < le.sets.length; j++) if (!le.sets[j].done && le.sets[j].weight === before) le.sets[j].weight = patch.weight ?? null;
    });

  const toggleDone = (le: LoggedExercise, i: number, placeholderReps: number) => {
    primeAudio();
    const set = le.sets[i];
    const willBeDone = !set.done;
    let finishedExercise = false;
    mutate((st) => {
      const act = st.active;
      const x = act?.exercises.find((e) => e.uid === le.uid);
      if (!act || !x) return;
      const t = Date.now();
      // marcar una serie de otro ejercicio empieza su cronómetro
      if (willBeDone && act.currentUid !== x.uid) startExerciseIn(act, x.uid, t, exMap, pace);
      const row = x.sets[i];
      row.done = willBeDone;
      if (willBeDone && row.reps == null) row.reps = placeholderReps;
      if (willBeDone && row.weight == null && i > 0) row.weight = x.sets[i - 1].weight;
      // última serie: se detiene el cronómetro del ejercicio
      if (willBeDone && x.sets.every((r) => r.done) && act.currentUid === x.uid) {
        stopCurrentIn(act, t);
        finishedExercise = true;
      }
    });
    if (willBeDone) {
      const ex = exMap.get(le.exerciseId);
      setRest({ end: Date.now() + le.target.rest * 1000, total: le.target.rest, name: ex?.name ?? '' });
      setRestNow(Date.now());
    }
    if (finishedExercise) {
      const st = getState().active;
      const done = st?.exercises.find((e) => e.uid === le.uid);
      const next = st?.exercises.find((e) => e.sets.some((r) => !r.done));
      const spent = done ? done.elapsedMs ?? 0 : 0;
      const budget = (done?.budgetSec ?? 0) * 1000;
      const verdict = budget ? (spent <= budget ? `en ${mmss(spent)}, a tiempo` : `en ${mmss(spent)}, ${mmss(spent - budget)} más de lo previsto`) : `en ${mmss(spent)}`;
      toast(`Listo ${verdict}.${next ? ` Siguiente: ${exMap.get(next.exerciseId)?.name ?? ''}` : ''}`);
    }
  };

  const doSwap = (newId: string, dislikeBase: boolean) => {
    const le = a.exercises.find((e) => e.uid === swapUid);
    const ex = exMap.get(newId);
    if (!le || !ex) return;
    const oldId = le.exerciseId;
    mutate((st) => {
      const x = st.active?.exercises.find((e) => e.uid === le.uid);
      if (!x) return;
      const fresh = makeLoggedExercise(ex, x.target, st.logs);
      x.exerciseId = newId;
      x.sets = x.sets.map((old, i) => (old.done ? old : fresh.sets[i] ?? { weight: null, reps: null, done: false }));
      if (dislikeBase) {
        if (!st.disliked.includes(oldId)) st.disliked.push(oldId);
        // si no te gusta, se cambia también en tu rutina
        const day = st.routine.find((d) => d.id === st.active?.dayId);
        day?.exercises.forEach((re) => re.exerciseId === oldId && (re.exerciseId = newId));
      }
    });
    toast(dislikeBase ? 'Cambiado hoy y en tu rutina' : 'Cambiado solo por hoy');
  };

  const elapsed = now - a.startedAt;
  const restLeft = rest ? Math.max(0, rest.end - restNow) : 0;
  const late = proj.slackMs < -60000;
  const overDeadline = proj.remainingMs <= 0;
  const timeTone = overDeadline || late ? 'late' : proj.slackMs < 3 * 60000 ? 'tight' : 'ok';

  const adjust = () => {
    const res = fitActiveToDeadline();
    if (!res.changes.length) toast('Ya no hay nada que recortar sin perder el entrenamiento');
    else toast(`Ajustado: ${res.changes.slice(0, 3).join(' · ')}${res.changes.length > 3 ? '…' : ''}`);
  };

  return (
    <div className="workout">
      <div className="wk-top">
      <header className="wk-head">
        <button className="icon-btn" onClick={() => go('hoy')} aria-label="Minimizar entrenamiento">
          <Icon name="down" />
        </button>
        <div className="wk-title">
          <strong>{a.dayName}</strong>
          <small className="muted">
            <Icon name="timer" size={14} /> {fmtDuration(elapsed)} · {doneCount}/{total} series
          </small>
        </div>
        <button className="btn primary sm" onClick={() => setFinishing(true)}>
          Terminar
        </button>
      </header>
      <div className="meter thin" aria-hidden="true">
        <span style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
      </div>
      <div className={`time-strip ${timeTone} ${proj.remainingMs <= 10 * 60000 ? 'near' : ''}`}>
        <div className="ts-cell">
          <small>Ahora</small>
          <strong>{fmtClock(now)}</strong>
        </div>
        <button className="ts-cell ts-edit" onClick={() => setEditDeadline(true)} aria-label="Cambiar hora límite">
          <small>
            Límite <Icon name="edit" size={12} />
          </small>
          <strong>{fmtClock(proj.deadline)}</strong>
        </button>
        <div className="ts-cell">
          <small>{overDeadline ? 'Te pasaste' : 'Quedan'}</small>
          <strong>{overDeadline ? `${Math.ceil(-proj.remainingMs / 60000)} min` : `${Math.floor(proj.remainingMs / 60000)} min`}</strong>
        </div>
        <div className="ts-cell">
          <small>Terminas</small>
          <strong>~{fmtClock(proj.end)}</strong>
        </div>
      </div>
      </div>

      <div className="wk-body">
        {notice && (
          <div className={`callout ${overDeadline ? 'warn' : ''}`} role="alert">
            <Icon name="timer" size={18} />
            <p>{notice}</p>
            <button className="icon-btn sm" onClick={() => setNotice(null)} aria-label="Cerrar aviso">
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
        {!overDeadline && (
          <div className={`pace-line ${timeTone}`}>
            <Icon name={timeTone === 'ok' ? 'check' : 'alert'} size={16} />
            {late ? (
              <span>
                A este ritmo terminas a las <strong>{fmtClock(proj.end)}</strong>, {Math.round(-proj.slackMs / 60000)} min tarde.
              </span>
            ) : (
              <span>
                Vas bien: terminas ~{fmtClock(proj.end)}, con {Math.max(0, Math.round(proj.slackMs / 60000))} min de margen.
              </span>
            )}
            {late && (
              <button className="btn sm primary" onClick={adjust}>
                <Icon name="spark" size={14} /> Ajustar a mi tiempo
              </button>
            )}
          </div>
        )}
        {a.exercises.map((le, idx) => {
          const ex = exMap.get(le.exerciseId);
          const sug = suggestions.get(le.uid);
          const past = ex ? history(s.logs, ex.id, 1)[0] : undefined;
          const seg = ex?.unit === 'seg';
          const cardio = ex?.unit === 'min';
          const allDone = le.sets.length > 0 && le.sets.every((x) => x.done);
          const isCurrent = a.currentUid === le.uid;
          const spent = exerciseElapsed(le, a, now);
          const budgetMs = (isCurrent || allDone || spent > 0 ? le.budgetSec ?? 0 : budgetFor(le, a, exMap, now, pace)) * 1000;
          const over = budgetMs > 0 && spent > budgetMs;
          return (
            <section key={le.uid} className={`card wk-ex ${allDone ? 'complete' : ''} ${isCurrent ? 'current' : ''}`}>
              <div className="wk-ex-head">
                <span className="rx-num">{idx + 1}</span>
                <button className="rx-thumb" onClick={() => ex && setDetail(ex.id)} aria-label={`Ver cómo se hace ${ex?.name ?? ''}`}>
                  <Thumb id={le.exerciseId} size={56} />
                  <span className="rx-thumb-play">
                    <Icon name="play" size={12} />
                  </span>
                </button>
                <button className="rx-name" onClick={() => ex && setDetail(ex.id)}>
                  <strong>{ex?.name ?? 'Ejercicio'}</strong>
                  <small className="muted">
                    {cardio ? (
                      `${le.target.repsMax} min`
                    ) : (
                      <>
                        {le.target.sets} × {le.target.repsMin}–{le.target.repsMax}
                        {seg ? ' s' : ' reps'} · descanso {fmtRest(le.target.rest)}
                      </>
                    )}
                  </small>
                </button>
                <button className="icon-btn" onClick={() => setSwapUid(le.uid)} aria-label={`Cambiar ${ex?.name ?? 'ejercicio'} por otro`} title="Cambiar por otro">
                  <Icon name="swap" size={18} />
                </button>
              </div>

              {cardio ? (
                <CardioBlock
                  name={ex?.name ?? 'Cardio'}
                  minutes={le.target.repsMax}
                  spent={spent}
                  isCurrent={isCurrent}
                  done={allDone}
                  doneMinutes={le.sets[0]?.reps ?? le.target.repsMax}
                  onStart={() => {
                    primeAudio();
                    startExercise(le.uid);
                  }}
                  onFinish={() => completeCardio(le.uid, Math.max(1, Math.round(spent / 60000)) || le.target.repsMax)}
                  onUndo={() =>
                    patchActive((exs) => {
                      const x = exs.find((e) => e.uid === le.uid);
                      if (x) x.sets = [{ weight: null, reps: null, done: false }];
                    })
                  }
                />
              ) : isCurrent ? (
                <div className={`ex-timer ${over ? 'over' : ''}`} role="timer">
                  <Icon name="timer" size={18} />
                  <span className="ex-timer-text">
                    <strong>{mmss(spent)}</strong>
                    {budgetMs > 0 && <small> de {mmss(budgetMs)}</small>}
                    {over && <small className="over-text"> · +{mmss(spent - budgetMs)}</small>}
                  </span>
                  {budgetMs > 0 && (
                    <span className="meter ex-meter" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, (spent / budgetMs) * 100)}%` }} />
                    </span>
                  )}
                  <button className="btn sm ghost" onClick={pauseExercise}>
                    Pausar
                  </button>
                </div>
              ) : allDone ? (
                <p className={`ex-done-time ${over ? 'over' : ''}`}>
                  <Icon name="check" size={16} /> Hecho en {mmss(spent)}
                  {budgetMs > 0 && <span className="muted"> · tiempo previsto {mmss(budgetMs)}</span>}
                </p>
              ) : (
                <button
                  className="btn secondary block start-ex"
                  onClick={() => {
                    primeAudio();
                    startExercise(le.uid);
                  }}
                >
                  <Icon name="play" size={16} /> {spent > 0 ? `Continuar (${mmss(spent)})` : 'Empezar ejercicio'}
                  <span className="muted">· tienes {Math.max(1, Math.round(budgetMs / 60000))} min</span>
                </button>
              )}

              {!cardio && sug && (
                <p className={`suggest ${sug.tone}`}>
                  <Icon name={sug.tone === 'up' ? 'trend' : sug.tone === 'down' ? 'down' : sug.tone === 'new' ? 'info' : 'spark'} size={16} />
                  {sug.text}
                </p>
              )}
              {!cardio && past && (
                <p className="muted small">
                  Última vez ({fmtDate(past.date)}): {past.sets.map((x) => (x.weight ? `${fmtKg(x.weight)}×${x.reps}` : `${x.reps}${seg ? 's' : ''}`)).join(' · ')}
                </p>
              )}

              {!cardio && (
              <div className="set-table" role="table" aria-label={`Series de ${ex?.name}`}>
                <div className="set-row set-head" role="row">
                  <span role="columnheader">Serie</span>
                  <span role="columnheader">Kg</span>
                  <span role="columnheader">{seg ? 'Seg' : 'Reps'}</span>
                  <span role="columnheader" className="sr-only">
                    Hecha
                  </span>
                </div>
                {le.sets.map((st, i) => {
                  const ph = sug?.reps[i] ?? le.target.repsMax;
                  return (
                    <div key={i} className={`set-row ${st.done ? 'done' : ''}`} role="row">
                      <span role="cell" className="set-n">
                        {i + 1}
                      </span>
                      <span role="cell">
                        <NumInput decimal label={`Kilos serie ${i + 1}`} value={st.weight} placeholder={seg ? '—' : '0'} onChange={(v) => setField(le.uid, i, { weight: v })} />
                      </span>
                      <span role="cell">
                        <NumInput label={`${seg ? 'Segundos' : 'Repeticiones'} serie ${i + 1}`} value={st.reps} placeholder={String(ph)} onChange={(v) => setField(le.uid, i, { reps: v })} />
                      </span>
                      <span role="cell">
                        <button className={`done-btn ${st.done ? 'on' : ''}`} onClick={() => toggleDone(le, i, ph)} aria-pressed={st.done} aria-label={`Marcar serie ${i + 1} como hecha`}>
                          <Icon name="check" size={18} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
              )}
              <div className="btn-row">
                {!cardio && (
                <>
                <button
                  className="btn sm ghost"
                  onClick={() =>
                    patchActive((exs) => {
                      const x = exs.find((e) => e.uid === le.uid);
                      if (x) x.sets.push({ weight: x.sets[x.sets.length - 1]?.weight ?? null, reps: null, done: false });
                    })
                  }
                >
                  <Icon name="plus" size={14} /> Serie
                </button>
                <button
                  className="btn sm ghost"
                  disabled={le.sets.length <= 1}
                  onClick={() =>
                    patchActive((exs) => {
                      const x = exs.find((e) => e.uid === le.uid);
                      if (x && x.sets.length > 1) x.sets.pop();
                    })
                  }
                >
                  <Icon name="minus" size={14} /> Serie
                </button>
                </>
                )}
                <button
                  className="btn sm ghost danger push-right"
                  onClick={() =>
                    patchActive((exs) => {
                      const k = exs.findIndex((e) => e.uid === le.uid);
                      if (k >= 0) exs.splice(k, 1);
                    })
                  }
                >
                  <Icon name="trash" size={14} /> Quitar
                </button>
              </div>
            </section>
          );
        })}

        <button className="btn secondary block" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Añadir ejercicio
        </button>
        <button className="btn primary block" onClick={() => setFinishing(true)}>
          <Icon name="check" size={18} /> Terminar entrenamiento
        </button>
      </div>

      {rest && (
        <div className={`rest-bar ${restLeft === 0 ? 'over' : ''}`} role="timer" aria-live="off">
          <div className="rest-fill" style={{ width: `${(restLeft / (rest.total * 1000)) * 100}%` }} />
          <div className="rest-content">
            <span>
              <small>{restLeft === 0 ? '¡A darle! Siguiente serie' : 'Descanso'}</small>
              <strong>{fmtDuration(restLeft)}</strong>
            </span>
            <div className="btn-row">
              <button className="btn sm secondary" onClick={() => setRest((r) => r && { ...r, end: r.end - 15000 })}>
                −15 s
              </button>
              <button className="btn sm secondary" onClick={() => setRest((r) => r && { ...r, end: r.end + 15000, total: r.total + 15 })}>
                +15 s
              </button>
              <button className="btn sm primary" onClick={() => setRest(null)}>
                Saltar
              </button>
            </div>
          </div>
        </div>
      )}

      <ExercisePicker
        key={swapUid ?? 'none'}
        open={Boolean(swapUid)}
        onClose={() => setSwapUid(null)}
        title="Cambiar ejercicio (¿máquina ocupada?)"
        baseId={a.exercises.find((e) => e.uid === swapUid)?.exerciseId}
        excludeIds={a.exercises.map((e) => e.exerciseId)}
        onPick={([id], o) => doSwap(id, o.dislikeBase)}
      />
      <ExercisePicker
        open={adding}
        onClose={() => setAdding(false)}
        title="Añadir ejercicio a la sesión"
        excludeIds={a.exercises.map((e) => e.exerciseId)}
        onPick={([id]) => {
          const ex = exMap.get(id);
          if (!ex) return;
          mutate((st) => {
            st.active?.exercises.push(makeLoggedExercise(ex, { sets: st.profile.setsPref ?? 3, repsMin: ex.unit === 'seg' ? 30 : 8, repsMax: ex.unit === 'seg' ? 45 : 12, rest: ex.kind === 'compuesto' ? 120 : 75 }, st.logs));
          });
        }}
      />
      <ExerciseDetail id={detail} onClose={() => setDetail(null)} onOpen={setDetail} />
      <Sheet
        open={editDeadline}
        onClose={() => setEditDeadline(false)}
        title="¿Hasta qué hora tienes hoy?"
        footer={
          <button
            className="btn primary block"
            onClick={() => {
              const input = document.getElementById('deadline-input') as HTMLInputElement | null;
              if (input?.value) {
                let ms = atTime(input.value, new Date(a.startedAt));
                if (ms < a.startedAt) ms += 86400000;
                setDeadline(ms);
                toast(`Hora límite: ${fmtClock(ms)}`);
              }
              setEditDeadline(false);
            }}
          >
            Guardar
          </button>
        }
      >
        <p className="muted">Recalculo el tiempo de cada ejercicio para que termines a esa hora.</p>
        <label className="field">
          <span>Terminar a las</span>
          <input id="deadline-input" type="time" defaultValue={fmtClock(proj.deadline).padStart(5, '0')} />
        </label>
      </Sheet>
      <FinishSheet open={finishing} onClose={() => setFinishing(false)} onSaved={() => go('hoy')} />
    </div>
  );
}

function FinishSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const s = useAppState();
  const exMap = useExMap();
  if (!open || !s.active) return null;
  const a = s.active;
  const preview = { ...a, exercises: a.exercises.map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) })) };
  const prs = findPRs(preview, s.logs);
  const sets = logSetsDone(preview);
  const pending = a.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.done).length, 0);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Terminar entrenamiento"
      footer={
        <div className="btn-col">
          <button
            className="btn primary block"
            disabled={!sets}
            onClick={() => {
              finishWorkout();
              toast(prs.length ? `¡Guardado con ${prs.length} récord${prs.length > 1 ? 's' : ''} nuevo${prs.length > 1 ? 's' : ''}!` : '¡Entrenamiento guardado!');
              onSaved();
            }}
          >
            <Icon name="check" size={18} /> Guardar entrenamiento
          </button>
          <button className="btn secondary block" onClick={onClose}>
            Seguir entrenando
          </button>
          <button
            className="btn ghost danger block"
            onClick={() => {
              if (!window.confirm('¿Descartar este entrenamiento? No se guardará nada.')) return;
              discardWorkout();
              onSaved();
            }}
          >
            Descartar
          </button>
        </div>
      }
    >
      <div className="tiles three">
        <div className="tile">
          <span className="tile-label">Duración</span>
          <span className="tile-value">{Math.max(1, Math.round((Date.now() - a.startedAt) / 60000))} min</span>
        </div>
        <div className="tile">
          <span className="tile-label">Series</span>
          <span className="tile-value">{sets}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Volumen</span>
          <span className="tile-value">{logVolume(preview).toLocaleString('es')} kg</span>
        </div>
      </div>
      <p className={`pace-line ${Date.now() <= deadlineOf(a) ? 'ok' : 'late'}`}>
        <Icon name={Date.now() <= deadlineOf(a) ? 'check' : 'alert'} size={16} />
        <span>
          {Date.now() <= deadlineOf(a)
            ? `Terminas a las ${fmtClock(Date.now())}: ${Math.round((deadlineOf(a) - Date.now()) / 60000)} min antes de tu límite (${fmtClock(deadlineOf(a))}).`
            : `Terminas a las ${fmtClock(Date.now())}: ${Math.round((Date.now() - deadlineOf(a)) / 60000)} min después de tu límite (${fmtClock(deadlineOf(a))}).`}
        </span>
      </p>
      {a.exercises.some((e) => e.elapsedMs || a.currentUid === e.uid) && (
        <ul className="time-list">
          {a.exercises
            .filter((e) => e.elapsedMs || a.currentUid === e.uid)
            .map((e) => {
              const spent = exerciseElapsed(e, a, Date.now());
              const budget = (e.budgetSec ?? 0) * 1000;
              return (
                <li key={e.uid}>
                  <span>{exMap.get(e.exerciseId)?.name}</span>
                  <span className={budget && spent > budget ? 'late-text' : 'muted'}>
                    {mmss(spent)}
                    {budget ? ` / ${mmss(budget)}` : ''}
                  </span>
                </li>
              );
            })}
        </ul>
      )}
      {pending > 0 && <p className="muted small">Quedan {pending} series sin marcar; no se guardarán.</p>}
      {!sets && <p className="callout warn">Marca al menos una serie como hecha para poder guardar.</p>}
      {prs.length > 0 && (
        <div className="prs">
          <h3 className="section-label">
            <Icon name="trophy" size={18} /> Récords nuevos
          </h3>
          <ul>
            {prs.map((p) => (
              <li key={p.exerciseId}>
                <strong>{exMap.get(p.exerciseId)?.name}</strong>
                <span className="muted">{p.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="muted small">La próxima vez te sugeriré el peso según cómo te fue hoy.</p>
    </Sheet>
  );
}

function CardioBlock({
  name,
  minutes,
  spent,
  isCurrent,
  done,
  doneMinutes,
  onStart,
  onFinish,
  onUndo,
}: {
  name: string;
  minutes: number;
  spent: number;
  isCurrent: boolean;
  done: boolean;
  doneMinutes: number;
  onStart: () => void;
  onFinish: () => void;
  onUndo: () => void;
}) {
  const total = minutes * 60000;
  const left = Math.max(0, total - spent);
  if (done)
    return (
      <div className="cardio-done">
        <p className="ex-done-time">
          <Icon name="check" size={16} /> {doneMinutes} min de {name.toLowerCase()} hechos
        </p>
        <button className="btn sm ghost" onClick={onUndo}>
          Deshacer
        </button>
      </div>
    );
  if (isCurrent)
    return (
      <div className="cardio-run" role="timer">
        <span className="cardio-label">Quedan</span>
        <strong className="cardio-time">{fmtDuration(left)}</strong>
        <span className="meter" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (spent / total) * 100)}%` }} />
        </span>
        <div className="btn-row">
          <button className="btn sm ghost" onClick={pauseExercise}>
            Pausar
          </button>
          <button className="btn sm secondary" onClick={onFinish}>
            Terminar ya ({Math.max(1, Math.round(spent / 60000))} min)
          </button>
        </div>
      </div>
    );
  return (
    <button className="btn primary block start-ex" onClick={onStart}>
      <Icon name="play" size={16} /> {spent > 0 ? `Continuar (quedan ${fmtDuration(left)})` : `Empezar ${minutes} min`}
      <span className="cardio-hint">· suena al terminar</span>
    </button>
  );
}
