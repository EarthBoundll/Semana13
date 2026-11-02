import { useEffect } from 'react';
import { Icon, type IconName } from './components/Icon';
import { Toaster, toast } from './components/ui';
import { applyTheme, useAppState } from './lib/store';
import { NavContext, useHashRoute, type Route } from './nav';
import { Bank } from './pages/Bank';
import { Home } from './pages/Home';
import { Onboarding } from './pages/Onboarding';
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

  if (!s.onboarded) {
    return (
      <NavContext.Provider value={{ route, go }}>
        <Onboarding
          onDone={(own) => {
            go('rutina');
            toast(own ? 'Rutina lista. Ahora agrega los ejercicios de tu día' : '¡Tu rutina está lista!');
          }}
        />
        <Toaster />
      </NavContext.Provider>
    );
  }

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
