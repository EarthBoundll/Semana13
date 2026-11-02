import { useMemo, useState } from 'react';
import { CustomExerciseSheet, ExerciseDetail, ExerciseRow } from '../components/exercise';
import { Icon } from '../components/Icon';
import { Chip, PageHeader } from '../components/ui';
import { EQUIPMENT, EQUIPMENT_ORDER, MUSCLE_ORDER, MUSCLES } from '../data/meta';
import { useAppState, useExMap } from '../lib/store';
import type { Equipment, Muscle } from '../types';

const norm = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

export function Bank() {
  const s = useAppState();
  const exMap = useExMap();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | 'todos'>('todos');
  const [equip, setEquip] = useState<Equipment | 'todos'>('todos');
  const [filter, setFilter] = useState<'todos' | 'fav' | 'no' | 'mios'>('todos');
  const [detail, setDetail] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const inRoutine = useMemo(() => new Set(s.routine.flatMap((d) => d.exercises.map((e) => e.exerciseId))), [s.routine]);

  const list = useMemo(() => {
    const needle = norm(q.trim());
    return [...exMap.values()].filter(
      (e) =>
        (muscle === 'todos' || e.primary === muscle) &&
        (equip === 'todos' || e.equipment === equip) &&
        (filter === 'todos' || (filter === 'fav' && s.favorites.includes(e.id)) || (filter === 'no' && s.disliked.includes(e.id)) || (filter === 'mios' && e.custom)) &&
        (!needle || norm(e.name).includes(needle)),
    );
  }, [exMap, q, muscle, equip, filter, s.favorites, s.disliked]);

  const groups = MUSCLE_ORDER.map((m) => ({ m, items: list.filter((e) => e.primary === m).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.items.length);

  return (
    <div className="page">
      <PageHeader title="Banco de ejercicios" subtitle={`${exMap.size} ejercicios · toca uno para ver técnica, alternativas y tu progreso`} />

      <div className="search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: press, sentadilla, polea…" aria-label="Buscar ejercicio" />
      </div>

      <div className="chips scroll-x">
        <Chip on={muscle === 'todos'} onClick={() => setMuscle('todos')}>
          Todos
        </Chip>
        {MUSCLE_ORDER.map((m) => (
          <Chip key={m} on={muscle === m} onClick={() => setMuscle(m)}>
            {MUSCLES[m].label.split(' ')[0]}
          </Chip>
        ))}
      </div>

      <div className="filters">
        <label className="field inline">
          <span>Equipo</span>
          <select value={equip} onChange={(e) => setEquip(e.target.value as Equipment | 'todos')}>
            <option value="todos">Todos</option>
            {EQUIPMENT_ORDER.map((q) => (
              <option key={q} value={q}>
                {EQUIPMENT[q]}
              </option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span>Mostrar</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="todos">Todos</option>
            <option value="fav">Favoritos ({s.favorites.length})</option>
            <option value="no">No me gustan ({s.disliked.length})</option>
            <option value="mios">Creados por mí ({s.customExercises.length})</option>
          </select>
        </label>
        <button className="btn secondary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={18} /> Crear ejercicio
        </button>
      </div>

      {groups.map((g) => (
        <section key={g.m} className="bank-group">
          <h3 className="section-label">
            {MUSCLES[g.m].label} <span className="muted">{g.items.length}</span>
          </h3>
          <div className="ex-list card flush">
            {g.items.map((e) => (
              <ExerciseRow key={e.id} ex={e} onClick={() => setDetail(e.id)} reason={inRoutine.has(e.id) ? 'En tu rutina' : undefined} />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <p className="muted center pad">No encontré ejercicios con esos filtros.</p>}

      <ExerciseDetail id={detail} onClose={() => setDetail(null)} onOpen={setDetail} />
      <CustomExerciseSheet open={creating} onClose={() => setCreating(false)} onCreated={(id) => (setCreating(false), setDetail(id))} defaultMuscle={muscle === 'todos' ? 'pecho' : muscle} />
    </div>
  );
}
