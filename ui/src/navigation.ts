import {
  IconDefinition,
  faCube,
  faGaugeHigh,
  faListCheck,
  faServer,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';

export type RouteId =
  | 'dashboard'
  | 'workloads/all'
  | 'workloads/attention'
  | 'workloads/healthy'
  | 'events/all'
  | 'events/remediations'
  | 'events/anomalies'
  | 'automation/policy'
  | 'automation/rules'
  | 'automation/thresholds'
  | 'system/users'
  | 'system/api';

export const DEFAULT_ROUTE: RouteId = 'dashboard';

export type NavBadgeSource = 'containers' | 'attention' | 'events';

export interface NavLeaf {
  route: RouteId;
  labelKey: string;
  adminOnly?: boolean;
  badge?: NavBadgeSource;
}

export interface NavGroup {
  id: string;
  labelKey: string;
  icon: IconDefinition;
  /** A group without children is a direct link to `route`. */
  route?: RouteId;
  children?: NavLeaf[];
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: faGaugeHigh, route: 'dashboard' },
  {
    id: 'workloads',
    labelKey: 'nav.workloads',
    icon: faCube,
    children: [
      { route: 'workloads/all', labelKey: 'nav.workloads_all', badge: 'containers' },
      { route: 'workloads/attention', labelKey: 'nav.workloads_attention', badge: 'attention' },
      { route: 'workloads/healthy', labelKey: 'nav.workloads_healthy' },
    ],
  },
  {
    id: 'events',
    labelKey: 'nav.events',
    icon: faListCheck,
    children: [
      { route: 'events/all', labelKey: 'nav.events_all', badge: 'events' },
      { route: 'events/remediations', labelKey: 'nav.events_remediations' },
      { route: 'events/anomalies', labelKey: 'nav.events_anomalies' },
    ],
  },
  {
    id: 'automation',
    labelKey: 'nav.automation',
    icon: faWandMagicSparkles,
    children: [
      { route: 'automation/policy', labelKey: 'nav.automation_policy' },
      { route: 'automation/rules', labelKey: 'nav.automation_rules' },
      { route: 'automation/thresholds', labelKey: 'nav.automation_thresholds' },
    ],
  },
  {
    id: 'system',
    labelKey: 'nav.system',
    icon: faServer,
    children: [
      { route: 'system/users', labelKey: 'nav.system_users', adminOnly: true },
      { route: 'system/api', labelKey: 'nav.system_api' },
    ],
  },
];

const ALL_ROUTES = new Set<string>(
  NAV_GROUPS.flatMap((g) => [
    ...(g.route ? [g.route] : []),
    ...(g.children ?? []).map((c) => c.route),
  ])
);

export function routeHref(route: RouteId): string {
  return `#/${route}`;
}

export function parseRoute(hash: string): RouteId {
  const candidate = hash.replace(/^#\/?/, '');
  return ALL_ROUTES.has(candidate) ? (candidate as RouteId) : DEFAULT_ROUTE;
}

export function isRouteAllowed(route: RouteId, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  return !NAV_GROUPS.some((g) => g.children?.some((c) => c.route === route && c.adminOnly));
}

export function findGroupOf(route: RouteId): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.route === route || g.children?.some((c) => c.route === route));
}

export function findLeafOf(route: RouteId): NavLeaf | undefined {
  for (const g of NAV_GROUPS) {
    const leaf = g.children?.find((c) => c.route === route);
    if (leaf) return leaf;
  }
  return undefined;
}
