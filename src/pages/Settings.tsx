import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Chip, PageHeader, Segmented, toast } from '../components/ui';
import { CARDIO } from '../data/exercises';
import { EQUIPMENT, EQUIPMENT_ORDER, GOALS, LEVELS, MACHINES, STYLES } from '../data/meta';
import { applyCardioToRoutine, regenerate, replaceUnavailable } from '../lib/actions';
import { isAvailable } from '../lib/equipment';
import { Thumb } from '../components/media';
import { DOW_LONG, DOW_SHORT, todayKey, weekStart } from '../lib/dates';
import { applyHabitualWeek, habitualDays } from '../lib/plan';
import { applyTheme, buildExMap, getState, initialState, mutate, normalize, setState, useAppState } from '../lib/store';
import { fitRoutineDay, fmtHHMM, paceFactor, parseHHMM, planningBudget, scheduleMinutes } from '../lib/timing';
import type { Goal, Level, Profile, Theme } from '../types';

export function Settings() {
  const s = useAppState();
  const p = s.profile;
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    mutate((st) => {
      st.profile[k] = v;
    });

  const exportData = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gymplan-respaldo-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Respaldo descargado');
  };

  const importData = async (file: File) => {
    try {
      const data = normalize(JSON.parse(await file.text()));
      if (!window.confirm('¿Reemplazar todos tus datos actuales con este respaldo?')) return;
      setState({ ...data, onboarded: true });
      applyTheme(data.profile.theme);
      toast('Respaldo restaurado');
    } catch {
      toast('Ese archivo no es un respaldo válido');
    }
  };

  const sched = scheduleMinutes(p);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(false));
  }, []);
  const pace = paceFactor(s.logs, buildExMap(s.customExercises));

  const fitAll = () => {
    const st = getState();
    const exMap = buildExMap(st.customExercises);
    const budget = planningBudget(st.profile);
    let changed = 0;
    mutate((d) => {
      for (const day of d.routine) {
        const res = fitRoutineDay(day.exercises, exMap, budget, pace);
        if (res.changes.length) {
          day.exercises = res.exercises;
          changed++;
        }
      }
    });
    toast(changed ? `Ajusté ${changed} día${changed > 1 ? 's' : ''} para que quepan en ${budget} min` : `Tu rutina ya cabe en ${budget} min`);
  };

  const days = habitualDays(p);
  const exMap = buildExMap(s.customExercises);
  const available = [...exMap.values()].filter((e) => isAvailable(e, p)).length;
  const unavailable = s.routine.reduce((n, d) => n + d.exercises.filter((re) => { const e = exMap.get(re.exerciseId); return e && !isAvailable(e, p); }).length, 0);
  const cardioOptions = [...CARDIO, ...s.customExercises.filter((e) => e.unit === 'min')].filter((c) => isAvailable(c, p) || c.id === p.cardioId);

  const toggleDay = (i: number) => {
    const next = days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort((a, b) => a - b);
    if (!next.length) return;
    mutate((st) => {
      st.profile.weekDays = next;
      st.profile.daysPerWeek = next.length;
      applyHabitualWeek(st, weekStart(todayKey()));
    });
  };

  return (
    <div className="page">
      <PageHeader title="Ajustes" subtitle="Tu plan, tu horario y tus datos" />

      <section className="card form-card">
        <h3 className="card-title">
          <Icon name="calendar" size={18} /> Mi plan
        </h3>
        <div className="field">
          <span>Días que voy al gym</span>
          <div className="chips weekday-chips">
            {DOW_SHORT.map((d, i) => (
              <Chip key={d} on={days.includes(i)} onClick={() => toggleDay(i)}>
                {d}
              </Chip>
            ))}
          </div>
          <small className="muted">
            {days.map((i) => DOW_LONG[i]).join(', ')}. Cada semana se planifica sola con estos días (esta semana ya se actualizó). Puedes cambiar cualquier día en “Semana”.
          </small>
        </div>
        <div className="field">
          <span>Ejercicios por día (sin contar el cardio)</span>
          <Segmented
            label="Ejercicios por día"
            value={p.exercisesPerDay ?? 0}
            onChange={(v) => set('exercisesPerDay', v || null)}
            options={[0, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: n ? String(n) : 'Auto' }))}
          />
        </div>
        <div className="field-stack">
          <label className="field">
            <span>Cardio al final</span>
            <select
              value={p.cardioId ?? ''}
              onChange={(e) => {
                const v = e.target.value || null;
                mutate((st) => {
                  st.profile.cardioId = v;
                  if (v && !st.profile.cardioMin) st.profile.cardioMin = 15;
                });
                applyCardioToRoutine();
              }}
            >
              <option value="">Sin cardio</option>
              {cardioOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {p.cardioId && (
            <div className="field">
              <span>Minutos</span>
              <Segmented
                label="Minutos de cardio"
                value={p.cardioMin}
                onChange={(v) => {
                  set('cardioMin', v);
                  applyCardioToRoutine();
                }}
                options={[10, 15, 20, 30].map((n) => ({ value: n, label: String(n) }))}
              />
            </div>
          )}
        </div>
        <p className="muted small">
          Tu rutina tiene {s.routine.length} día{s.routine.length === 1 ? '' : 's'} ({STYLES[p.style].label.toLowerCase()}) y vas {days.length} día{days.length === 1 ? '' : 's'} por semana
          {s.routine.length !== days.length ? ': se van turnando en orden.' : '.'}
        </p>
        <button
          className="btn primary"
          onClick={() => {
            if (!window.confirm(`¿Rehacer tu rutina para ${days.length} días con ${p.exercisesPerDay ?? 'los'} ejercicios? Se conservan tu día propio y los días que marcaste para mantener.`)) return;
            const style = regenerate({ daysPerWeek: days.length });
            toast(`Rutina rehecha: ${STYLES[style].label}`);
          }}
        >
          <Icon name="spark" size={18} /> Rehacer mi rutina con estos ajustes
        </button>
      </section>

      <section className="card form-card">
        <h3 className="card-title">
          <Icon name="timer" size={18} /> Horario de gym
        </h3>
        <p className="muted small">Si tienes una hora límite, armo rutinas que quepan en ese tiempo y, al entrenar, te mido el tiempo de cada ejercicio y te aviso si te pasas.</p>
        <div className="grid-2">
          <label className="field">
            <span>Llego a las</span>
            <input type="time" value={p.gymStart ?? ''} onChange={(e) => set('gymStart', e.target.value || null)} />
          </label>
          <label className="field">
            <span>Debo terminar a las</span>
            <input type="time" value={p.gymEnd ?? ''} onChange={(e) => set('gymEnd', e.target.value || null)} />
          </label>
        </div>
        {sched != null ? (
          <>
            <div className="callout">
              <Icon name="info" size={18} />
              <p>
                De {fmtHHMM(parseHHMM(p.gymStart) ?? 0)} a {fmtHHMM(parseHHMM(p.gymEnd) ?? 0)} tienes <strong>{sched} min</strong>. Armo sesiones de máximo{' '}
                <strong>{planningBudget(p)} min</strong> (calentamiento incluido y 5 min de margen)
                {pace !== 1 ? `, según tu ritmo real (${pace > 1 ? 'tardas' : 'vas'} un ${Math.abs(Math.round((pace - 1) * 100))} % ${pace > 1 ? 'más' : 'más rápido'} de lo estimado)` : ''}.
              </p>
            </div>
            <div className="btn-row wrap">
              <button className="btn primary" onClick={fitAll}>
                <Icon name="spark" size={18} /> Ajustar mi rutina a este horario
              </button>
              <button
                className="btn ghost"
                onClick={() =>
                  mutate((st) => {
                    st.profile.gymStart = null;
                    st.profile.gymEnd = null;
                  })
                }
              >
                Quitar horario
              </button>
            </div>
          </>
        ) : (
          (p.gymStart || p.gymEnd) && <p className="muted small">Completa las dos horas (al menos 15 min de diferencia).</p>
        )}
      </section>

      <section className="card form-card">
        <h3 className="card-title">
          <Icon name="user" size={18} /> Perfil
        </h3>
        <label className="field">
          <span>Nombre</span>
          <input value={p.name} onChange={(e) => set('name', e.target.value)} placeholder="Tu nombre" />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Estatura (cm)</span>
            <input
              inputMode="numeric"
              value={p.heightCm ?? ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                set('heightCm', Number.isFinite(v) ? v : null);
              }}
              placeholder="170"
            />
          </label>
          <label className="field">
            <span>Peso meta (kg)</span>
            <input
              inputMode="decimal"
              defaultValue={p.goalWeight ?? ''}
              onBlur={(e) => {
                const v = parseFloat(e.target.value.replace(',', '.'));
                set('goalWeight', Number.isFinite(v) ? v : null);
              }}
              placeholder="70"
            />
          </label>
        </div>
        <label className="field">
          <span>Objetivo</span>
          <select value={p.goal} onChange={(e) => set('goal', e.target.value as Goal)}>
            {(Object.keys(GOALS) as Goal[]).map((g) => (
              <option key={g} value={g}>
                {GOALS[g].label} — {GOALS[g].desc}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Nivel</span>
          <select value={p.level} onChange={(e) => set('level', e.target.value as Level)}>
            {(Object.keys(LEVELS) as Level[]).map((l) => (
              <option key={l} value={l}>
                {LEVELS[l].label} — {LEVELS[l].desc}
              </option>
            ))}
          </select>
        </label>
        {sched == null && (
          <div className="field">
            <span>Duración de cada sesión</span>
            <Segmented label="Duración" value={p.sessionMinutes} onChange={(v) => set('sessionMinutes', v)} options={[45, 60, 75, 90].map((n) => ({ value: n, label: `${n} min` }))} />
          </div>
        )}
        <div className="field">
          <span>Series por ejercicio al generar</span>
          <Segmented label="Series" value={p.setsPref ?? 0} onChange={(v) => set('setsPref', v || null)} options={[0, 2, 3, 4, 5].map((n) => ({ value: n, label: n ? String(n) : 'Auto' }))} />
        </div>
        <p className="muted small">Los cambios de objetivo, nivel o series se aplican la próxima vez que rehagas la rutina.</p>
      </section>

      <section className="card form-card" id="equipo">
        <h3 className="card-title">
          <Icon name="dumbbell" size={18} /> Equipo de mi gym
        </h3>
        <div className="field">
          <span>Lo que uso</span>
          <div className="chips">
            {EQUIPMENT_ORDER.map((q) => (
              <Chip key={q} on={p.equipment.includes(q)} onClick={() => set('equipment', p.equipment.includes(q) ? p.equipment.filter((x) => x !== q) : [...p.equipment, q])}>
                {EQUIPMENT[q]}
              </Chip>
            ))}
          </div>
        </div>
        {p.equipment.includes('maquina') && (
          <div className="field">
            <span>¿Qué máquinas hay? Mira las fotos y marca las que veas en tu gym</span>
            {(['Pierna', 'Torso', 'Cardio'] as const).map((g) => (
              <div key={g} className="machine-group">
                <small className="section-label">{g}</small>
                <div className="machine-grid">
                  {MACHINES.filter((m) => m.group === g).map((m) => {
                    const on = !p.machines || p.machines.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`machine ${on ? 'on' : ''}`}
                        aria-pressed={on}
                        onClick={() => {
                          const cur = p.machines ?? MACHINES.map((x) => x.id);
                          set('machines', on ? cur.filter((x) => x !== m.id) : [...cur, m.id]);
                        }}
                      >
                        <Thumb id={m.photo} size={56} />
                        <span>{m.label}</span>
                        <span className={`checkbox ${on ? 'on' : ''}`}>{on && <Icon name="check" size={14} />}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="muted small">
          Con tu equipo puedes hacer <strong>{available}</strong> de {exMap.size} ejercicios del banco. Nunca te sugeriré algo que no puedas hacer.
        </p>
        {unavailable > 0 && (
          <div className="btn-row wrap">
            <button
              className="btn primary"
              onClick={() => {
                const n = replaceUnavailable();
                toast(n ? `Cambié ${n} ejercicio${n > 1 ? 's' : ''} por otros con tu equipo` : 'Tu rutina ya usa solo tu equipo');
              }}
            >
              <Icon name="swap" size={18} /> Cambiar los {unavailable} ejercicios de mi rutina que no puedo hacer
            </button>
          </div>
        )}
      </section>

      <section className="card form-card">
        <h3 className="card-title">Apariencia</h3>
        <Segmented<Theme>
          label="Tema"
          value={p.theme}
          onChange={(v) => {
            set('theme', v);
            applyTheme(v);
          }}
          options={[
            { value: 'system', label: 'Automático' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
        />
      </section>

      <section className="card form-card">
        <h3 className="card-title">Tus datos</h3>
        <p className="muted small">
          No hay cuentas ni contraseñas: la app es solo tuya y todo se guarda en este celular ({s.logs.length} entrenamientos, {s.weights.length} registros de peso). Si cambias de
          celular, descarga un respaldo y restáuralo en el nuevo.
        </p>
        <p className={`pace-line ${persisted ? 'ok' : 'tight'}`}>
          <Icon name={persisted ? 'lock' : 'info'} size={16} />
          <span>
            {persisted
              ? 'Almacenamiento protegido: el navegador no borrará tus datos.'
              : 'Para que el celular nunca borre tus datos, instala la app (Agregar a pantalla de inicio) y ábrela desde ahí.'}
          </span>
        </p>
        <div className="btn-row wrap">
          <button className="btn secondary" onClick={exportData}>
            <Icon name="download" size={18} /> Descargar respaldo
          </button>
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Restaurar respaldo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importData(f);
              e.target.value = '';
            }}
          />
        </div>
        <button
          className="btn danger ghost"
          onClick={() => {
            if (!window.confirm('¿Borrar TODO (rutina, historial y peso) y empezar de cero?')) return;
            setState(initialState());
            window.location.hash = '';
          }}
        >
          <Icon name="trash" size={18} /> Borrar todo y empezar de cero
        </button>
      </section>
      <p className="muted small center">
        Fotos de los ejercicios: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener noreferrer">Free Exercise DB</a> (dominio público).
      </p>
    </div>
  );
}
