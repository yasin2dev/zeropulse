import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faAnglesLeft,
  faAnglesRight,
  faChevronRight,
  faRightFromBracket,
} from '@fortawesome/free-solid-svg-icons';
import { BrandLogo } from './BrandLogo';
import {
  findGroupOf,
  NAV_GROUPS,
  NavBadgeSource,
  NavGroup,
  NavLeaf,
  routeHref,
  RouteId,
} from '../navigation';

interface SidebarProps {
  route: RouteId;
  currentUser: { username: string; role: string };
  counts: Record<NavBadgeSource, number>;
  collapsed: boolean;
  drawerOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseDrawer: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  route,
  currentUser,
  counts,
  collapsed,
  drawerOpen,
  onToggleCollapsed,
  onCloseDrawer,
  onLogout,
}) => {
  const { t } = useTranslation();
  const isAdmin = currentUser.role === 'admin';
  const activeGroupId = findGroupOf(route)?.id;
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroupId ? [activeGroupId] : [])
  );

  // Landing on a screen (deep link, dashboard shortcut) reveals its group.
  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((prev) => (prev.has(activeGroupId) ? prev : new Set(prev).add(activeGroupId)));
  }, [activeGroupId]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleChildren = (group: NavGroup): NavLeaf[] =>
    (group.children ?? []).filter((c) => isAdmin || !c.adminOnly);

  const renderBadge = (source: NavBadgeSource | undefined) => {
    if (!source) return null;
    const value = counts[source];
    if (source === 'attention' && value === 0) return null;
    return (
      <span className={`nav-badge ${source === 'attention' ? 'attention' : ''}`}>{value}</span>
    );
  };

  const renderLeaf = (leaf: NavLeaf) => (
    <li key={leaf.route}>
      <a
        href={routeHref(leaf.route)}
        className={`nav-leaf ${route === leaf.route ? 'active' : ''}`}
        aria-current={route === leaf.route ? 'page' : undefined}
        onClick={onCloseDrawer}
      >
        <span className="nav-leaf-label">{t(leaf.labelKey)}</span>
        {renderBadge(leaf.badge)}
      </a>
    </li>
  );

  return (
    <aside
      className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`}
    >
      <a className="sidebar-brand" href={routeHref('dashboard')} onClick={onCloseDrawer}>
        <BrandLogo size={30} />
        <span className="sidebar-brand-name">Zeropulse</span>
      </a>

      <nav className="sidebar-nav" aria-label={t('nav.primary_label')}>
        <ul className="nav-group-list">
          {NAV_GROUPS.map((group) => {
            const children = visibleChildren(group);
            const isActive = group.id === activeGroupId;

            if (group.route) {
              return (
                <li key={group.id} className="nav-group">
                  <a
                    href={routeHref(group.route)}
                    className={`nav-parent ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? t(group.labelKey) : undefined}
                    onClick={onCloseDrawer}
                  >
                    <FontAwesomeIcon icon={group.icon} fixedWidth className="nav-parent-icon" />
                    <span className="nav-parent-label">{t(group.labelKey)}</span>
                  </a>
                </li>
              );
            }

            if (children.length === 0) return null;

            const isOpen = openGroups.has(group.id);
            const hasAttention = children.some((c) => c.badge === 'attention') && counts.attention > 0;

            return (
              <li key={group.id} className={`nav-group ${isActive ? 'has-active' : ''}`}>
                {collapsed ? (
                  // The icon rail has no room to expand, so the parent links to its first screen
                  // and the rest of the group is offered in a hover/focus flyout.
                  <a
                    href={routeHref(children[0].route)}
                    className={`nav-parent ${isActive ? 'active' : ''}`}
                    aria-label={t(group.labelKey)}
                  >
                    <FontAwesomeIcon icon={group.icon} fixedWidth className="nav-parent-icon" />
                    {hasAttention && <span className="nav-alert-dot" />}
                  </a>
                ) : (
                  <button
                    type="button"
                    className={`nav-parent ${isActive ? 'active-within' : ''}`}
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <FontAwesomeIcon icon={group.icon} fixedWidth className="nav-parent-icon" />
                    <span className="nav-parent-label">{t(group.labelKey)}</span>
                    {hasAttention && !isOpen && <span className="nav-alert-dot inline" />}
                    <FontAwesomeIcon
                      icon={faChevronRight}
                      className={`nav-chevron ${isOpen ? 'open' : ''}`}
                    />
                  </button>
                )}

                {collapsed ? (
                  <div className="nav-flyout">
                    <span className="nav-flyout-title">{t(group.labelKey)}</span>
                    <ul>{children.map(renderLeaf)}</ul>
                  </div>
                ) : (
                  isOpen && <ul className="nav-children">{children.map(renderLeaf)}</ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" title={currentUser.username}>
          <span className="sidebar-avatar" aria-hidden="true">
            {currentUser.username.charAt(0).toLocaleUpperCase()}
          </span>
          <span className="sidebar-user-text">
            <span className="sidebar-user-name">{currentUser.username}</span>
            <span className="sidebar-user-role">
              {currentUser.role === 'admin' ? t('navbar.role_admin') : t('navbar.role_viewer')}
            </span>
          </span>
          <button
            type="button"
            className="util-btn sidebar-logout"
            onClick={onLogout}
            title={t('navbar.logout')}
            aria-label={t('navbar.logout')}
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
          </button>
        </div>

        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapsed}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          <FontAwesomeIcon icon={collapsed ? faAnglesRight : faAnglesLeft} fixedWidth />
          <span className="sidebar-collapse-label">{t('nav.collapse')}</span>
        </button>
      </div>
    </aside>
  );
};
