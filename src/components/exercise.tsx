import { useMemo, useState } from 'react';
import { BANK } from '../data/exercises';
import { EQUIPMENT, EQUIPMENT_ORDER, MUSCLE_ORDER, MUSCLES } from '../data/meta';
import { fmtDate, fromKey } from '../lib/dates';
import { alternativesFor } from '../lib/generator';
import { e1rmSeries, fmtKg, history } from '../lib/progression';
import { mutate, uid, useAppState, useExMap } from '../lib/store';
import type { Equipment, Exercise, Kind, Muscle } from '../types';
import { LineChart } from './charts';
import { Icon } from './Icon';
import { ExercisePhotos, ExerciseVideo, Thumb } from './media';
import { Chip, Segmented, Sheet, toast } from './ui';

export function exMeta(e: Exercise): string {
  if (e.unit === 'min') return `Cardio · ${EQUIPMENT[e.equipment]}`;
  return `${MUSCLES[e.primary].label.split(' ')[0]} · ${EQUIPMENT[e.equipment]} · ${e.kind === 'compuesto' ? 'Multiarticular' : 'Aislado'}`;
}

export function toggleFavorite(id: string) {
  mutate((s) => {
    s.favorites = s.favorites.includes(id) ? s.favorites.filter((x) => x !== id) : [...s.favorites, id];
  });
}

export function toggleDisliked(id: string) {
  mutate((s) => {
    s.disliked = s.disliked.includes(id) ? s.disliked.filter((x) => x !== id) : [...s.disliked, id];
  });
}

function LevelDots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="level-dots" aria-label={`Dificultad ${level} de 3`} title={['Fácil', 'Media', 'Técnica'][level - 1]}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? 'on' : ''} />
      ))}
    </span>
  );
}

export function ExerciseRow({
  ex,
  onClick,
  selected,
  reason,
  right,
}: {
  ex: Exercise;
  onClick: () => void;
  selected?: boolean;
  reason?: string;
  right?: React.ReactNode;
}) {
  const s = useAppState();
  const fav = s.favorites.includes(ex.id);
  const bad = s.disliked.includes(ex.id);
  return (
    <button type="button" className={`ex-row ${selected ? 'selected' : ''} ${bad ? 'disliked' : ''}`} onClick={onClick} aria-pressed={selected}>
      <Thumb id={ex.id} size={44} />
      <span className="ex-row-main">
        <span className="ex-row-name">
          {ex.name}
          {fav && <Icon name="star" size={14} filled className="star" />}
          {ex.custom && <span className="badge">Tuyo</span>}
        </span>
        <span className="ex-row-meta">
          {exMeta(ex)} <LevelDots level={ex.level} />
        </span>
        {reason && <span className="ex-row-reason">{reason}</span>}
      </span>
      {right ?? (selected !== undefined ? <span className={`checkbox ${selected ? 'on' : ''}`}>{selected && <Icon name="check" size={14} />}</span> : <Icon name="right" size={18} className="muted" />)}
    </button>
  );
}

// ─────────────────────────── Selector de ejercicios ───────────────────────────

export function ExercisePicker({
  open,
  onClose,
  title,
  baseId,
  focus,
  suggested,
  excludeIds = [],
  multi,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  baseId?: string;
  focus?: Muscle[];
  suggested?: Exercise[];
  excludeIds?: string[];
  multi?: boolean;
  onPick: (ids: string[], opts: { dislikeBase: boolean }) => void;
}) {
  const s = useAppState();
  const exMap = useExMap();
  const base = baseId ? exMap.get(baseId) : undefined;
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | 'todos' | 'foco'>(base ? base.primary : focus?.length ? 'foco' : 'todos');
  const [onlyMine, setOnlyMine] = useState(true);
  const [sel, setSel] = useState<string[]>([]);
  const [dislikeBase, setDislikeBase] = useState(false);
  const [creating, setCreating] = useState(false);

  const alts = useMemo(
    () => (base ? alternativesFor(base.id, exMap, s.profile, s.favorites, s.disliked, excludeIds).slice(0, 5) : []),
    [base, exMap, s.profile, s.favorites, s.disliked, excludeIds],
  );

  const list = useMemo(() => {
    const equip = new Set(s.profile.equipment);
    const excl = new Set(excludeIds);
    const needle = q
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
    return [...exMap.values()]
      .filter((e) => !excl.has(e.id) && e.id !== baseId)
      .filter((e) => (muscle === 'todos' ? true : muscle === 'foco' ? focus?.includes(e.primary) : e.primary === muscle))
      .filter((e) => !onlyMine || equip.has(e.equipment))
      .filter((e) => !needle || e.name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(needle))
      .sort((a, b) => MUSCLE_ORDER.indexOf(a.primary) - MUSCLE_ORDER.indexOf(b.primary) || Number(s.favorites.includes(b.id)) - Number(s.favorites.includes(a.id)) || a.name.localeCompare(b.name));
  }, [exMap, q, muscle, onlyMine, excludeIds, baseId, focus, s.profile.equipment, s.favorites]);

  const close = () => {
    setSel([]);
    setQ('');
    setDislikeBase(false);
    onClose();
  };
  const choose = (id: string) => {
    if (multi) setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
    else {
      onPick([id], { dislikeBase });
      close();
    }
  };

  return (
    <>
      <Sheet
        open={open && !creating}
        onClose={close}
        title={title}
        wide
        footer={
          multi ? (
            <button
              className="btn primary block"
              disabled={!sel.length}
              onClick={() => {
                onPick(sel, { dislikeBase: false });
                close();
              }}
            >
              Añadir {sel.length ? `(${sel.length})` : ''}
            </button>
          ) : undefined
        }
      >
        {base && (
          <div className="picker-base">
            <span className="muted small">Cambiar</span>
            <strong>{base.name}</strong>
            <label className="check-line">
              <input type="checkbox" checked={dislikeBase} onChange={(e) => setDislikeBase(e.target.checked)} />
              No me gusta: no volver a sugerirlo
            </label>
          </div>
        )}

        {alts.length > 0 && (
          <section className="picker-section">
            <h3 className="section-label">
              <Icon name="spark" size={16} /> Mejores reemplazos
            </h3>
            <div className="ex-list">
              {alts.map((a) => (
                <ExerciseRow key={a.ex.id} ex={a.ex} reason={a.reason} onClick={() => choose(a.ex.id)} selected={multi ? sel.includes(a.ex.id) : undefined} />
              ))}
            </div>
          </section>
        )}

        {!base && suggested && suggested.length > 0 && (
          <section className="picker-section">
            <h3 className="section-label">
              <Icon name="spark" size={16} /> Sugeridos para este día
            </h3>
            <div className="ex-list">
              {suggested.slice(0, 5).map((e) => (
                <ExerciseRow key={e.id} ex={e} onClick={() => choose(e.id)} selected={multi ? sel.includes(e.id) : undefined} />
              ))}
            </div>
          </section>
        )}

        <section className="picker-section">
          <h3 className="section-label">Banco completo</h3>
          <div className="search">
            <Icon name="search" size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ejercicio…" aria-label="Buscar ejercicio" />
          </div>
          <div className="chips scroll-x">
            {focus?.length ? (
              <Chip on={muscle === 'foco'} onClick={() => setMuscle('foco')}>
                De este día
              </Chip>
            ) : null}
            <Chip on={muscle === 'todos'} onClick={() => setMuscle('todos')}>
              Todos
            </Chip>
            {MUSCLE_ORDER.map((m) => (
              <Chip key={m} on={muscle === m} onClick={() => setMuscle(m)}>
                {MUSCLES[m].label.split(' ')[0]}
              </Chip>
            ))}
          </div>
          <div className="row-between">
            <label className="check-line">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              Solo con mi equipo
            </label>
            <button className="btn ghost sm" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} /> Crear ejercicio
            </button>
          </div>
          <div className="ex-list">
            {list.map((e) => (
              <ExerciseRow key={e.id} ex={e} onClick={() => choose(e.id)} selected={multi ? sel.includes(e.id) : undefined} />
            ))}
            {!list.length && <p className="muted center pad">No hay ejercicios con esos filtros.</p>}
          </div>
        </section>
      </Sheet>
      <CustomExerciseSheet
        open={creating}
        defaultMuscle={muscle !== 'todos' && muscle !== 'foco' ? muscle : (focus?.[0] ?? 'pecho')}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          if (multi) setSel((x) => [...x, id]);
          else {
            onPick([id], { dislikeBase });
            close();
          }
        }}
      />
    </>
  );
}

// ─────────────────────────── Crear ejercicio propio ───────────────────────────

export function CustomExerciseSheet({
  open,
  onClose,
  onCreated,
  defaultMuscle = 'pecho',
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  defaultMuscle?: Muscle;
}) {
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState<Muscle>(defaultMuscle);
  const [equipment, setEquipment] = useState<Equipment>('maquina');
  const [kind, setKind] = useState<Kind>('aislamiento');
  const [unit, setUnit] = useState<'reps' | 'seg' | 'min'>('reps');
  const [tip, setTip] = useState('');

  const save = () => {
    if (!name.trim()) return;
    const id = `custom-${uid()}`;
    const ex: Exercise = {
      id,
      name: name.trim(),
      primary: unit === 'min' ? 'cardio' : primary,
      secondary: [],
      equipment,
      kind,
      level: 1,
      pattern: `custom-${primary}`,
      tip: tip.trim() || 'Ejercicio creado por ti.',
      unit,
      custom: true,
    };
    mutate((s) => {
      s.customExercises.push(ex);
    });
    toast(`«${ex.name}» añadido al banco`);
    setName('');
    setTip('');
    onCreated?.(id);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Crear ejercicio"
      footer={
        <button className="btn primary block" disabled={!name.trim()} onClick={save}>
          Guardar ejercicio
        </button>
      }
    >
      <label className="field">
        <span>Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Press en máquina convergente" autoFocus />
      </label>
      <label className="field">
        <span>Músculo principal</span>
        <select value={primary} onChange={(e) => setPrimary(e.target.value as Muscle)}>
          {MUSCLE_ORDER.map((m) => (
            <option key={m} value={m}>
              {MUSCLES[m].label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Equipo</span>
        <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {EQUIPMENT_ORDER.map((q) => (
            <option key={q} value={q}>
              {EQUIPMENT[q]}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        <span>Tipo</span>
        <Segmented
          label="Tipo"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'compuesto', label: 'Multiarticular' },
            { value: 'aislamiento', label: 'Aislado' },
          ]}
        />
      </div>
      <div className="field">
        <span>Se mide en</span>
        <Segmented
          label="Unidad"
          value={unit}
          onChange={setUnit}
          options={[
            { value: 'reps', label: 'Repeticiones' },
            { value: 'seg', label: 'Segundos' },
            { value: 'min', label: 'Minutos (cardio)' },
          ]}
        />
      </div>
      <label className="field">
        <span>Nota de técnica (opcional)</span>
        <textarea value={tip} onChange={(e) => setTip(e.target.value)} rows={2} />
      </label>
    </Sheet>
  );
}

// ─────────────────────────── Ficha de ejercicio ───────────────────────────

export function ExerciseDetail({ id, onClose, onOpen }: { id: string | null; onClose: () => void; onOpen?: (id: string) => void }) {
  const s = useAppState();
  const exMap = useExMap();
  const ex = id ? exMap.get(id) : undefined;
  const series = useMemo(() => (ex ? e1rmSeries(s.logs, ex.id) : []), [ex, s.logs]);
  const past = useMemo(() => (ex ? history(s.logs, ex.id, 5) : []), [ex, s.logs]);
  const alts = useMemo(() => (ex ? alternativesFor(ex.id, exMap, s.profile, s.favorites, s.disliked).slice(0, 4) : []), [ex, exMap, s.profile, s.favorites, s.disliked]);
  if (!ex) return null;
  const fav = s.favorites.includes(ex.id);
  const bad = s.disliked.includes(ex.id);

  const addTo = (dayId: string) => {
    mutate((st) => {
      const d = st.routine.find((x) => x.id === dayId);
      if (!d) return;
      d.exercises.push(
        ex.unit === 'min'
          ? { uid: uid(), exerciseId: ex.id, sets: 1, repsMin: st.profile.cardioMin || 15, repsMax: st.profile.cardioMin || 15, rest: 0 }
          : { uid: uid(), exerciseId: ex.id, sets: st.profile.setsPref ?? 3, repsMin: ex.unit === 'seg' ? 30 : 8, repsMax: ex.unit === 'seg' ? 45 : 12, rest: ex.kind === 'compuesto' ? 120 : 75 },
      );
    });
    const i = s.routine.findIndex((d) => d.id === dayId);
    toast(`Añadido al día ${String.fromCharCode(65 + i)}`);
  };

  return (
    <Sheet open={Boolean(ex)} onClose={onClose} title={ex.name} wide>
      <ExercisePhotos ex={ex} />
      <ExerciseVideo ex={ex} />
      <div className="chips">
        <span className="tag strong">{MUSCLES[ex.primary].label}</span>
        {ex.secondary.map((m) => (
          <span className="tag" key={m}>
            {MUSCLES[m].label}
          </span>
        ))}
      </div>
      <p className="muted small">
        {EQUIPMENT[ex.equipment]} · {ex.kind === 'compuesto' ? 'Multiarticular' : 'Aislado'} · Dificultad <LevelDots level={ex.level} />
      </p>
      <div className="tip">
        <Icon name="info" size={18} />
        <p>{ex.tip}</p>
      </div>

      <div className="btn-row">
        <button className={`btn ${fav ? 'primary' : 'secondary'}`} onClick={() => toggleFavorite(ex.id)} aria-pressed={fav}>
          <Icon name="star" size={16} filled={fav} /> {fav ? 'Favorito' : 'Marcar favorito'}
        </button>
        <button className={`btn ${bad ? 'danger' : 'secondary'}`} onClick={() => toggleDisliked(ex.id)} aria-pressed={bad}>
          <Icon name="ban" size={16} /> {bad ? 'No me gusta' : 'No me gusta'}
        </button>
      </div>
      {bad && <p className="muted small">El generador no volverá a sugerir este ejercicio.</p>}

      {s.routine.length > 0 && (
        <section className="picker-section">
          <h3 className="section-label">Añadir a mi rutina</h3>
          <div className="chips">
            {s.routine.map((d, i) => (
              <Chip key={d.id} onClick={() => addTo(d.id)} dot={`var(--d${(i % 6) + 1})`}>
                {String.fromCharCode(65 + i)} · {d.name}
              </Chip>
            ))}
          </div>
        </section>
      )}

      <section className="picker-section">
        <h3 className="section-label">Tu progreso</h3>
        {series.length >= 2 ? (
          <>
            <p className="muted small">Fuerza estimada (1RM) por sesión: sube cuando levantas más peso o haces más repeticiones.</p>
            <LineChart
              ariaLabel={`Progreso de ${ex.name}`}
              unit="kg"
              data={series.map((p) => ({ key: p.date, label: fmtDate(p.date), value: p.value, x: fromKey(p.date).getTime(), detail: `${fmtDate(p.date)} · mejor serie ${p.best}` }))}
            />
          </>
        ) : (
          <p className="muted small">Cuando lo registres en al menos 2 entrenamientos verás aquí tu gráfico de progreso.</p>
        )}
        {past.length > 0 && (
          <ul className="history-list">
            {past.map((p) => (
              <li key={p.date}>
                <span className="muted">{fmtDate(p.date, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                <span>{p.sets.map((x) => (x.weight ? `${fmtKg(x.weight)}×${x.reps}` : `${x.reps}`)).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {alts.length > 0 && (
        <section className="picker-section">
          <h3 className="section-label">Alternativas parecidas</h3>
          <div className="ex-list">
            {alts.map((a) => (
              <ExerciseRow key={a.ex.id} ex={a.ex} reason={a.reason} onClick={() => onOpen?.(a.ex.id)} />
            ))}
          </div>
        </section>
      )}

      {ex.custom && (
        <button
          className="btn danger ghost block"
          onClick={() => {
            if (!window.confirm(`¿Eliminar «${ex.name}» del banco? También se quitará de tu rutina.`)) return;
            mutate((st) => {
              st.customExercises = st.customExercises.filter((x) => x.id !== ex.id);
              for (const d of st.routine) d.exercises = d.exercises.filter((x) => x.exerciseId !== ex.id);
            });
            onClose();
          }}
        >
          <Icon name="trash" size={16} /> Eliminar ejercicio
        </button>
      )}
    </Sheet>
  );
}

export const BANK_SIZE = BANK.length;
