import { useState } from 'react';
import { Icon } from '../components/Icon';
import { Chip, Segmented } from '../components/ui';
import { EQUIPMENT, EQUIPMENT_ORDER, GOALS, LEVELS, MUSCLE_ORDER, MUSCLES } from '../data/meta';
import { todayKey, weekStart } from '../lib/dates';
import { dayNameFromFocus, generateRoutine } from '../lib/generator';
import { applyWeekPlan, suggestWeekDates } from '../lib/plan';
import { buildExMap, defaultProfile, mutate, uid } from '../lib/store';
import type { Equipment, Goal, Level, Muscle, Profile, RoutineDay } from '../types';

export function Onboarding({ onDone }: { onDone: (hasOwnDay: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>({ ...defaultProfile });
  const [hasDay, setHasDay] = useState<boolean | null>(null);
  const [ownFocus, setOwnFocus] = useState<Muscle[]>([]);
  const [ownName, setOwnName] = useState('');
  const [weight, setWeight] = useState('');

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => ({ ...x, [k]: v }));
  const toggleEquip = (e: Equipment) => set('equipment', p.equipment.includes(e) ? p.equipment.filter((x) => x !== e) : [...p.equipment, e]);
  const toggleFocus = (m: Muscle) => setOwnFocus((f) => (f.includes(m) ? f.filter((x) => x !== m) : [...f, m]));

  const finish = () => {
    const exMap = buildExMap([]);
    const own: RoutineDay[] =
      hasDay && ownFocus.length
        ? [{ id: uid(), name: ownName.trim() || dayNameFromFocus(ownFocus), focus: ownFocus, exercises: [], mine: true, locked: true }]
        : [];
    const { routine } = generateRoutine({
      days: p.daysPerWeek,
      style: p.style,
      current: own,
      exMap,
      profile: p,
      favorites: [],
      disliked: [],
    });
    const kg = parseFloat(weight.replace(',', '.'));
    mutate((s) => {
      s.profile = p;
      s.routine = routine;
      s.onboarded = true;
      if (kg > 20 && kg < 400) s.weights.push({ id: uid(), date: todayKey(), kg: Math.round(kg * 10) / 10 });
      const start = weekStart(todayKey());
      applyWeekPlan(s, start, suggestWeekDates(s, start, p.daysPerWeek));
    });
    onDone(Boolean(own.length));
  };

  const steps = [
    {
      title: '¡Hola! Armemos tu plan de gym',
      body: (
        <>
          <label className="field">
            <span>¿Cómo te llamas? (opcional)</span>
            <input value={p.name} onChange={(e) => set('name', e.target.value)} placeholder="Tu nombre" />
          </label>
          <div className="field">
            <span>¿Cuál es tu objetivo?</span>
            <div className="option-grid">
              {(Object.keys(GOALS) as Goal[]).map((g) => (
                <button key={g} type="button" className={`option ${p.goal === g ? 'on' : ''}`} onClick={() => set('goal', g)} aria-pressed={p.goal === g}>
                  <strong>{GOALS[g].label}</strong>
                  <span>{GOALS[g].desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Tu nivel</span>
            <div className="option-grid three">
              {(Object.keys(LEVELS) as Level[]).map((l) => (
                <button key={l} type="button" className={`option ${p.level === l ? 'on' : ''}`} onClick={() => set('level', l)} aria-pressed={p.level === l}>
                  <strong>{LEVELS[l].label}</strong>
                  <span>{LEVELS[l].desc}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      ),
      ok: true,
    },
    {
      title: 'Tu semana en el gym',
      body: (
        <>
          <div className="field">
            <span>¿Cuántos días vas normalmente por semana?</span>
            <Segmented label="Días por semana" value={p.daysPerWeek} onChange={(v) => set('daysPerWeek', v)} options={[2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} />
            <small className="muted">Cada semana podrás elegir qué días vas exactamente.</small>
          </div>
          <div className="field">
            <span>¿Cuánto dura cada sesión?</span>
            <Segmented label="Duración" value={p.sessionMinutes} onChange={(v) => set('sessionMinutes', v)} options={[45, 60, 75, 90].map((n) => ({ value: n, label: `${n} min` }))} />
          </div>
          <div className="field">
            <span>Series por ejercicio</span>
            <Segmented
              label="Series por ejercicio"
              value={p.setsPref ?? 0}
              onChange={(v) => set('setsPref', v || null)}
              options={[
                { value: 0, label: 'Auto' },
                { value: 2, label: '2' },
                { value: 3, label: '3' },
                { value: 4, label: '4' },
                { value: 5, label: '5' },
              ]}
            />
            <small className="muted">“Auto” elige según tu objetivo. Luego puedes cambiar las series de cada ejercicio.</small>
          </div>
          <div className="field">
            <span>Equipo disponible en tu gym</span>
            <div className="chips">
              {EQUIPMENT_ORDER.map((e) => (
                <Chip key={e} on={p.equipment.includes(e)} onClick={() => toggleEquip(e)}>
                  {EQUIPMENT[e]}
                </Chip>
              ))}
            </div>
          </div>
        </>
      ),
      ok: p.equipment.length > 0,
    },
    {
      title: '¿Ya tienes un día armado?',
      body: (
        <>
          <p className="muted">Si ya sabes qué haces un día, lo guardo tal cual y armo los demás días alrededor de él para que no se repitan músculos.</p>
          <div className="option-grid">
            <button type="button" className={`option ${hasDay === true ? 'on' : ''}`} onClick={() => setHasDay(true)} aria-pressed={hasDay === true}>
              <strong>Sí, ya tengo uno</strong>
              <span>Armo el resto de la semana</span>
            </button>
            <button type="button" className={`option ${hasDay === false ? 'on' : ''}`} onClick={() => setHasDay(false)} aria-pressed={hasDay === false}>
              <strong>No, hazme todo</strong>
              <span>Genero todos los días</span>
            </button>
          </div>
          {hasDay && (
            <>
              <div className="field">
                <span>¿Qué músculos trabajas ese día?</span>
                <div className="chips">
                  {MUSCLE_ORDER.map((m) => (
                    <Chip key={m} on={ownFocus.includes(m)} onClick={() => toggleFocus(m)}>
                      {MUSCLES[m].label}
                    </Chip>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Nombre del día</span>
                <input value={ownName} onChange={(e) => setOwnName(e.target.value)} placeholder={ownFocus.length ? dayNameFromFocus(ownFocus) : 'Ej. Pecho y tríceps'} />
              </label>
              <p className="muted small">Después agregas tus ejercicios exactos desde el banco.</p>
            </>
          )}
        </>
      ),
      ok: hasDay === false || (hasDay === true && ownFocus.length > 0),
    },
    {
      title: 'Tu cuerpo (opcional)',
      body: (
        <>
          <p className="muted">Sirve para el gráfico de peso, tu IMC y calcular cuándo llegas a tu meta.</p>
          <label className="field">
            <span>Peso actual (kg)</span>
            <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Ej. 72.5" />
          </label>
          <label className="field">
            <span>Estatura (cm)</span>
            <input
              inputMode="numeric"
              value={p.heightCm ?? ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                set('heightCm', Number.isFinite(v) ? v : null);
              }}
              placeholder="Ej. 170"
            />
          </label>
          <label className="field">
            <span>Peso meta (kg)</span>
            <input
              inputMode="decimal"
              value={p.goalWeight ?? ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value.replace(',', '.'));
                set('goalWeight', Number.isFinite(v) ? v : null);
              }}
              placeholder="Ej. 70"
            />
          </label>
        </>
      ),
      ok: true,
    },
  ];

  const cur = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="onboarding">
      <div className="onb-top">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="dumbbell" size={22} />
          </span>
          GymPlan
        </div>
        <div className="steps" aria-label={`Paso ${step + 1} de ${steps.length}`}>
          {steps.map((_, i) => (
            <i key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>
      </div>
      <h1>{cur.title}</h1>
      <div className="onb-body">{cur.body}</div>
      <div className="onb-actions">
        {step > 0 && (
          <button className="btn secondary" onClick={() => setStep(step - 1)}>
            Atrás
          </button>
        )}
        <button className="btn primary grow" disabled={!cur.ok} onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? (
            <>
              <Icon name="spark" size={18} /> Crear mi rutina
            </>
          ) : (
            'Siguiente'
          )}
        </button>
      </div>
    </div>
  );
}
