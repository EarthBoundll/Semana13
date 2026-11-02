import { useEffect, useMemo, useRef, useState } from 'react';
import { ExerciseDetail, ExercisePicker } from '../components/exercise';
import { Icon } from '../components/Icon';
import { Sheet, toast, useNow } from '../components/ui';
import { fmtRest } from '../data/meta';
import { fmtDate, fmtDuration } from '../lib/dates';
import { findPRs, fmtKg, history, logSetsDone, logVolume, suggest } from '../lib/progression';
import { mutate, useAppState, useExMap } from '../lib/store';
import { beep, discardWorkout, finishWorkout, makeLoggedExercise, primeAudio } from '../lib/workout';
import { useNav } from '../nav';
import type { LoggedExercise, LoggedSet } from '../types';

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
  const beeped = useRef(false);

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
    patchActive((exs) => {
      const x = exs.find((e) => e.uid === le.uid);
      if (!x) return;
      const st = x.sets[i];
      st.done = willBeDone;
      if (willBeDone && st.reps == null) st.reps = placeholderReps;
      if (willBeDone && st.weight == null && i > 0) st.weight = x.sets[i - 1].weight;
    });
    if (willBeDone) {
      const ex = exMap.get(le.exerciseId);
      setRest({ end: Date.now() + le.target.rest * 1000, total: le.target.rest, name: ex?.name ?? '' });
      setRestNow(Date.now());
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

  return (
    <div className="workout">
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

      <div className="wk-body">
        {a.exercises.map((le, idx) => {
          const ex = exMap.get(le.exerciseId);
          const sug = suggestions.get(le.uid);
          const past = ex ? history(s.logs, ex.id, 1)[0] : undefined;
          const seg = ex?.unit === 'seg';
          const allDone = le.sets.length > 0 && le.sets.every((x) => x.done);
          return (
            <section key={le.uid} className={`card wk-ex ${allDone ? 'complete' : ''}`}>
              <div className="wk-ex-head">
                <span className="rx-num">{idx + 1}</span>
                <button className="rx-name" onClick={() => ex && setDetail(ex.id)}>
                  <strong>{ex?.name ?? 'Ejercicio'}</strong>
                  <small className="muted">
                    {le.target.sets} × {le.target.repsMin}–{le.target.repsMax}
                    {seg ? ' s' : ' reps'} · descanso {fmtRest(le.target.rest)}
                  </small>
                </button>
                <button className="btn sm ghost" onClick={() => setSwapUid(le.uid)} aria-label={`Cambiar ${ex?.name}`}>
                  <Icon name="swap" size={16} /> Cambiar
                </button>
              </div>

              {sug && (
                <p className={`suggest ${sug.tone}`}>
                  <Icon name={sug.tone === 'up' ? 'trend' : sug.tone === 'down' ? 'down' : sug.tone === 'new' ? 'info' : 'spark'} size={16} />
                  {sug.text}
                </p>
              )}
              {past && (
                <p className="muted small">
                  Última vez ({fmtDate(past.date)}): {past.sets.map((x) => (x.weight ? `${fmtKg(x.weight)}×${x.reps}` : `${x.reps}${seg ? 's' : ''}`)).join(' · ')}
                </p>
              )}

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
              <div className="btn-row">
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
