import { useEffect, useState } from 'react';
import { parseRoute, RouteId } from '../navigation';

/** Keeps the active screen in the URL hash so reload, back and new-tab all work. */
export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
