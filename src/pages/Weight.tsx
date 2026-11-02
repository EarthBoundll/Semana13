import { useMemo, useState } from 'react';
import { LineChart } from '../components/charts';
import { Icon } from '../components/Icon';
import { Empty, PageHeader, Segmented, Tile, toast } from '../components/ui';
import { addDays, fmtDate, fmtLong, fmtMonth, fmtMonthTick, fmtMonthYear, fromKey, monthKey, todayKey } from '../lib/dates';
import { fmtKg } from '../lib/progression';
import { mutate, uid, useAppState } from '../lib/store';

const r1 = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmtKg(Math.abs(r1(n)))} kg`;

function bmiCategory(b: number): string {
  if (b < 18.5) return 'Bajo peso';
  if (b < 25) return 'Normal';
  if (b < 30) return 'Sobrepeso';
  return 'Obesidad';
}

export function Weight() {
  const s = useAppState();
  const [date, setDate] = useState(todayKey());
  const [kg, setKg] = useState('');
  const [mode, setMode] = useState<'mes' | 'todos'>('mes');
  const [goalText, setGoalText] = useState(s.profile.goalWeight != null ? String(s.profile.goalWeight) : '');
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => [...s.weights].sort((a, b) => a.date.localeCompare(b.date)), [s.weights]);
  const monthly = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const w of sorted) {
      const k = monthKey(w.date);
      m.set(k, [...(m.get(k) ?? []), w.kg]);
    }
    return [...m.entries()].map(([month, list]) => ({
      month,
      avg: r1(list.reduce((a, b) => a + b, 0) / list.length),
      min: Math.min(...list),
      max: Math.max(...list),
      count: list.length,
    }));
  }, [sorted]);

  const save = () => {
    const v = parseFloat(kg.replace(',', '.'));
    if (!Number.isFinite(v) || v < 20 || v > 400) {
      toast('Escribe un peso válido en kg');
      return;
    }
    mutate((st) => {
      st.weights = st.weights.filter((w) => w.date !== date);
      st.weights.push({ id: uid(), date, kg: r1(v) });
    });
    setKg('');
    setDate(todayKey());
    toast(`Guardado: ${fmtKg(r1(v))} kg`);
  };

  const saveGoal = () => {
    const v = parseFloat(goalText.replace(',', '.'));
    mutate((st) => {
      st.profile.goalWeight = Number.isFinite(v) && v > 20 ? r1(v) : null;
    });
    toast(Number.isFinite(v) ? 'Meta actualizada' : 'Meta eliminada');
  };

  const last = sorted[sorted.length - 1];
  const first = sorted[0];
  const goal = s.profile.goalWeight;
  const prevMonth = monthly.length >= 2 ? monthly[monthly.length - 2] : null;
  const curMonth = monthly[monthly.length - 1];

  // ¿subir es bueno? depende de la meta
  const upIsGood = goal != null && last ? goal > last.kg : s.profile.goal === 'hipertrofia' || s.profile.goal === 'fuerza';
  const tone = (d: number) => (Math.abs(d) < 0.05 ? 'neutral' : d > 0 === upIsGood ? 'good' : 'bad');

  // Tendencia (regresión lineal de los últimos 120 días)
  const trend = useMemo(() => {
    const since = addDays(todayKey(), -120);
    const pts = sorted.filter((w) => w.date >= since);
    if (pts.length < 2) return null;
    const t0 = fromKey(pts[0].date).getTime();
    const xs = pts.map((p) => (fromKey(p.date).getTime() - t0) / 86400000);
    const ys = pts.map((p) => p.kg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0;
    let den = 0;
    xs.forEach((x, i) => {
      num += (x - mx) * (ys[i] - my);
      den += (x - mx) ** 2;
    });
    if (!den || xs[xs.length - 1] < 10) return null;
    return { perMonth: (num / den) * 30.4 };
  }, [sorted]);

  let projection: string | null = null;
  if (trend && last) {
    const pm = trend.perMonth;
    if (Math.abs(pm) < 0.15) projection = 'Tu peso está estable (cambia menos de 0,15 kg al mes).';
    else projection = `Tendencia: ${signed(pm)} por mes.`;
    if (goal != null && Math.abs(goal - last.kg) >= 0.3) {
      const months = (goal - last.kg) / pm;
      if (months > 0 && months < 36) {
        const eta = new Date();
        eta.setDate(eta.getDate() + Math.round(months * 30.4));
        projection += ` A este ritmo llegarías a tu meta de ${fmtKg(goal)} kg en ~${months < 1.5 ? Math.max(1, Math.round(months * 4.3)) + ' semanas' : Math.round(months) + ' meses'} (${new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(eta)}).`;
      } else if (months <= 0) projection += ' Vas en dirección contraria a tu meta: revisa tu alimentación y constancia.';
    } else if (goal != null) projection += ' ¡Estás en tu meta!';
  }

  const bmi = last && s.profile.heightCm ? last.kg / (s.profile.heightCm / 100) ** 2 : null;

  const chartData =
    mode === 'mes'
      ? monthly.map((m) => ({ key: m.month, label: fmtMonthTick(m.month), value: m.avg, detail: `${fmtMonth(m.month, true)} · promedio de ${m.count} registro${m.count > 1 ? 's' : ''}` }))
      : sorted.map((w) => ({ key: w.id, label: fmtDate(w.date), value: w.kg, x: fromKey(w.date).getTime(), detail: fmtLong(w.date) }));

  const list = [...sorted].reverse();

  return (
    <div className="page">
      <PageHeader title="Mi peso" subtitle="Registra tu peso y mira cómo cambia mes a mes" />

      <section className="card">
        <h3 className="card-title">Nuevo registro</h3>
        <form
          className="weight-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="field">
            <span>Fecha</span>
            <input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value || todayKey())} />
          </label>
          <label className="field">
            <span>Peso (kg)</span>
            <input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder={last ? fmtKg(last.kg) : 'Ej. 72.5'} />
          </label>
          <button className="btn primary" type="submit">
            Guardar
          </button>
        </form>
        <p className="muted small">Consejo: pésate a la misma hora (mejor en ayunas). Si te pesas varias veces en un mes, uso el promedio.</p>
      </section>

      {!sorted.length ? (
        <Empty icon="scale" title="Aún no hay registros">
          Agrega tu peso para ver el gráfico mensual.
        </Empty>
      ) : (
        <>
          <div className="tiles">
            <Tile
              label="Peso actual"
              value={`${fmtKg(last.kg)} kg`}
              delta={prevMonth && curMonth ? `${signed(curMonth.avg - prevMonth.avg)} vs mes anterior` : undefined}
              deltaTone={prevMonth && curMonth ? tone(curMonth.avg - prevMonth.avg) : undefined}
              hint={fmtDate(last.date, { day: 'numeric', month: 'long' })}
            />
            <Tile label="Cambio total" value={signed(last.kg - first.kg)} deltaTone={tone(last.kg - first.kg)} hint={`desde ${fmtMonth(monthKey(first.date), true).toLowerCase()}`} />
            <Tile label="IMC" value={bmi ? r1(bmi).toFixed(1) : '—'} hint={bmi ? bmiCategory(bmi) : 'agrega tu estatura en Ajustes'} />
            <Tile label="Meta" value={goal != null ? `${fmtKg(goal)} kg` : '—'} hint={goal != null ? (Math.abs(goal - last.kg) < 0.3 ? '¡Lograda!' : `faltan ${fmtKg(Math.abs(r1(goal - last.kg)))} kg`) : 'sin meta'} />
          </div>

          <section className="card">
            <div className="row-between">
              <h3 className="card-title">{mode === 'mes' ? 'Peso promedio por mes' : 'Todos los registros'}</h3>
              <Segmented
                label="Vista del gráfico"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'mes', label: 'Por mes' },
                  { value: 'todos', label: 'Registros' },
                ]}
              />
            </div>
            {chartData.length >= 1 && (
              <LineChart
                ariaLabel={mode === 'mes' ? 'Gráfico de peso promedio por mes' : 'Gráfico de todos los registros de peso'}
                unit="kg"
                data={chartData}
                refLine={goal != null ? { value: goal, label: `Meta ${fmtKg(goal)} kg` } : null}
              />
            )}
            {projection && (
              <p className="projection">
                <Icon name="trend" size={18} /> {projection}
              </p>
            )}
          </section>

          <section className="card">
            <h3 className="card-title">Resumen por mes</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th className="num">Promedio</th>
                    <th className="num">Cambio</th>
                    <th className="num">Mín – Máx</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthly].reverse().map((m, i, arr) => {
                    const prev = arr[i + 1];
                    const d = prev ? m.avg - prev.avg : null;
                    return (
                      <tr key={m.month}>
                        <td>{fmtMonthYear(m.month)}</td>
                        <td className="num">{fmtKg(m.avg)} kg</td>
                        <td className={`num ${d != null ? `delta-${tone(d)}` : ''}`}>{d != null ? signed(d) : '—'}</td>
                        <td className="num muted">
                          {fmtKg(m.min)} – {fmtKg(m.max)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3 className="card-title">Registros</h3>
            <ul className="weight-list">
              {(showAll ? list : list.slice(0, 8)).map((w) => (
                <li key={w.id}>
                  <span>{fmtDate(w.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <strong>{fmtKg(w.kg)} kg</strong>
                  <button
                    className="icon-btn sm"
                    aria-label={`Borrar registro del ${fmtDate(w.date)}`}
                    onClick={() =>
                      mutate((st) => {
                        st.weights = st.weights.filter((x) => x.id !== w.id);
                      })
                    }
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
            {list.length > 8 && (
              <button className="btn ghost block" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Ver menos' : `Ver los ${list.length} registros`}
              </button>
            )}
          </section>
        </>
      )}

      <section className="card">
        <h3 className="card-title">Peso meta</h3>
        <form
          className="weight-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveGoal();
          }}
        >
          <label className="field">
            <span>Meta (kg)</span>
            <input inputMode="decimal" value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="Ej. 70" />
          </label>
          <button className="btn secondary" type="submit">
            Guardar meta
          </button>
        </form>
      </section>
    </div>
  );
}
