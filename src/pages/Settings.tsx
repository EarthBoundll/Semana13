import { useRef } from 'react';
import { Icon } from '../components/Icon';
import { Chip, PageHeader, Segmented, toast } from '../components/ui';
import { EQUIPMENT, EQUIPMENT_ORDER, GOALS, LEVELS } from '../data/meta';
import { todayKey } from '../lib/dates';
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

  return (
    <div className="page">
      <PageHeader title="Ajustes" subtitle="Tu perfil y tus datos" />

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
        <div className="field">
          <span>Días por semana (habitual)</span>
          <Segmented label="Días por semana" value={p.daysPerWeek} onChange={(v) => set('daysPerWeek', v)} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} />
        </div>
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
        <div className="field">
          <span>Equipo disponible</span>
          <div className="chips">
            {EQUIPMENT_ORDER.map((q) => (
              <Chip key={q} on={p.equipment.includes(q)} onClick={() => set('equipment', p.equipment.includes(q) ? p.equipment.filter((x) => x !== q) : [...p.equipment, q])}>
                {EQUIPMENT[q]}
              </Chip>
            ))}
          </div>
        </div>
        <p className="muted small">Los cambios de objetivo, nivel, series o equipo se aplican la próxima vez que generes la rutina.</p>
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
          Todo se guarda en este dispositivo y navegador ({s.logs.length} entrenamientos, {s.weights.length} registros de peso). Descarga un respaldo de vez en cuando o para pasarlo a otro
          celular.
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
    </div>
  );
}
