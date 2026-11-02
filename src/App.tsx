import { useEffect } from 'react';
import { Icon, type IconName } from './components/Icon';
import { Toaster } from './components/ui';
import { firstRun, requestPersistentStorage } from './lib/actions';
import { autoPlanCurrentWeek, needsAutoPlan } from './lib/plan';
import { applyTheme, getState, mutate, useAppState } from './lib/store';
import { NavContext, useHashRoute, type Route } from './nav';
import { Bank } from './pages/Bank';
import { Home } from './pages/Home';
import { Routine } from './pages/Routine';
import { Settings } from './pages/Settings';
import { Week } from './pages/Week';
import { Weight } from './pages/Weight';
import { Workout } from './pages/Workout';

const TABS: { route: Route; label: string; icon: IconName }[] = [
  { route: 'hoy', label: 'Hoy', icon: 'home' },
  { route: 'semana', label: 'Semana', icon: 'calendar' },
  { route: 'rutina', label: 'Rutina', icon: 'dumbbell' },
  { route: 'ejercicios', label: 'Ejercicios', icon: 'list' },
  { route: 'peso', label: 'Peso', icon: 'scale' },
];

export default function App() {
  const s = useAppState();
  const [route, go] = useHashRoute();

  useEffect(() => applyTheme(s.profile.theme), [s.profile.theme]);

  // Sin registro ni preguntas: la primera vez se arma todo solo y los datos quedan en este celular
  useEffect(() => {
    if (!s.onboarded) firstRun();
  }, [s.onboarded]);

  // Cada semana nueva se planifica sola con tus días habituales
  useEffect(() => {
    const check = () => {
      if (getState().onboarded && needsAutoPlan(getState())) mutate(autoPlanCurrentWeek);
    };
    check();
    void requestPersistentStorage();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!s.onboarded) return null;

  const page =
    route === 'entrenar' && s.active ? (
      <Workout />
    ) : route === 'semana' ? (
      <Week />
    ) : route === 'rutina' ? (
      <Routine />
    ) : route === 'ejercicios' ? (
      <Bank />
    ) : route === 'peso' ? (
      <Weight />
    ) : route === 'ajustes' ? (
      <Settings />
    ) : (
      <Home />
    );

  const inWorkout = route === 'entrenar' && s.active;

  return (
    <NavContext.Provider value={{ route, go }}>
      <div className={`app ${inWorkout ? 'in-workout' : ''}`}>
        {!inWorkout && (
          <nav className="tabbar" aria-label="Secciones">
            <div className="tabbar-brand">
              <span className="brand-mark">
                <Icon name="dumbbell" size={20} />
              </span>
              GymPlan
            </div>
            {TABS.map((t) => (
              <button key={t.route} className={`tab ${route === t.route ? 'on' : ''}`} aria-current={route === t.route ? 'page' : undefined} onClick={() => go(t.route)}>
                <Icon name={t.icon} size={22} />
                <span>{t.label}</span>
              </button>
            ))}
            {s.active && (
              <button className="tab live" onClick={() => go('entrenar')}>
                <Icon name="timer" size={22} />
                <span>En curso</span>
              </button>
            )}
          </nav>
        )}
        <main className="main">{page}</main>
      </div>
      <Toaster />
    </NavContext.Provider>
  );
}
