import { createContext, useContext, useEffect, useState } from 'react';

export type Route = 'hoy' | 'semana' | 'rutina' | 'ejercicios' | 'peso' | 'ajustes' | 'entrenar';
const ROUTES: Route[] = ['hoy', 'semana', 'rutina', 'ejercicios', 'peso', 'ajustes', 'entrenar'];

function read(): Route {
  const h = window.location.hash.replace('#', '') as Route;
  return ROUTES.includes(h) ? h : 'hoy';
}

export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (r: Route) => {
    if (r === route) return;
    window.location.hash = r;
    window.scrollTo({ top: 0 });
  };
  return [route, go];
}

export const NavContext = createContext<{ route: Route; go: (r: Route) => void }>({ route: 'hoy', go: () => {} });

export function useNav() {
  return useContext(NavContext);
}

/** Día de rutina que se debe mostrar al abrir la pestaña Rutina */
let pendingDay: string | null = null;
export function setPendingDay(id: string | null) {
  pendingDay = id;
}
export function peekPendingDay(): string | null {
  return pendingDay;
}
