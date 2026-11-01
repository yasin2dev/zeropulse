import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useEdgeTelemetry } from './hooks/useEdgeTelemetry';
import { useHashRoute } from './hooks/useHashRoute';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Dashboard } from './components/dashboard/Dashboard';
import { ContainerGrid, WorkloadView } from './components/ContainerGrid';
import { AuditLog } from './components/AuditLog';
import { RemediationPolicy } from './components/automation/RemediationPolicy';
import { CustomRules } from './components/automation/CustomRules';
import { BaselineThresholds } from './components/automation/BaselineThresholds';
import { ApiEndpoints } from './components/automation/ApiEndpoints';
import { UserManagement } from './components/UserManagement';
import { StatusBar } from './components/StatusBar';
import { SetupWizard } from './components/SetupWizard';
import { LoginView } from './components/LoginView';
import { AuthStatus } from './types';
import { DEFAULT_ROUTE, isRouteAllowed } from './navigation';
import '@fontsource-variable/plus-jakarta-sans';
import './styles/dashboard.css';
import './styles/shell.css';
import './styles/overview.css';

const SIDEBAR_STORAGE_KEY = 'zeropulse_sidebar_collapsed';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('zeropulse_theme');
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    return 'dark';
  });

  const requestedRoute = useHashRoute();
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
  );
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('zeropulse_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!drawerOpen) return;
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [drawerOpen]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/status');
      if (res.ok) {
        const data: AuthStatus = await res.json();
        setAuthStatus(data);
      } else {
        setAuthStatus({
          auth_enabled: false,
          initialized: true,
          authenticated: true,
        });
      }
    } catch {
      setAuthStatus({
        auth_enabled: false,
        initialized: true,
        authenticated: true,
      });
    } finally {
      setAuthChecking(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const handleAuthSuccess = (_token: string, user: { username: string; role: string }) => {
    setAuthStatus({
      auth_enabled: true,
      initialized: true,
      authenticated: true,
      user,
    });
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthStatus((prev) =>
      prev
        ? {
            ...prev,
            authenticated: false,
            user: undefined,
          }
        : null
    );
  };

  const isAuth = Boolean(authStatus?.authenticated);

  const {
    system,
    containers,
    auditLogs,
    dryRun,
    connectionState,
    lastUpdated,
    history,
    actionLoading,
    toggleDryRun,
    restartContainer,
    refresh,
  } = useEdgeTelemetry(isAuth);

  // If still checking initial auth status, show lightweight neutral loading screen
  if (authChecking) {
    return (
      <div className="auth-page-wrapper" data-theme={theme}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
          {t('auth.initializing')}
        </div>
      </div>
    );
  }

  // 1. First-Run Setup Wizard: Superuser Account Creation
  if (authStatus && !authStatus.initialized) {
    return (
      <SetupWizard
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onSetupSuccess={handleAuthSuccess}
      />
    );
  }

  // 2. Authentication Screen: Login Form
  if (authStatus && authStatus.auth_enabled && !authStatus.authenticated) {
    return (
      <LoginView
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onLoginSuccess={handleAuthSuccess}
      />
    );
  }

  const currentUser = authStatus?.user || { username: 'admin', role: 'admin' };
  const attentionCount = containers.filter(
    (c) => c.health_status === 'warning' || c.health_status === 'critical'
  ).length;
  const route = isRouteAllowed(requestedRoute, currentUser.role === 'admin')
    ? requestedRoute
    : DEFAULT_ROUTE;

  const workloads = (view: WorkloadView) => (
    <ContainerGrid
      view={view}
      containers={containers}
      onRestartContainer={restartContainer}
      actionLoading={actionLoading}
    />
  );

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        route={route}
        currentUser={currentUser}
        counts={{
          containers: containers.length,
          attention: attentionCount,
          events: auditLogs.length,
        }}
        collapsed={sidebarCollapsed}
        drawerOpen={drawerOpen}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        onCloseDrawer={() => setDrawerOpen(false)}
        onLogout={handleLogout}
      />
      {drawerOpen && <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} />}

      <div className="app-main">
        <Topbar
          route={route}
          connectionState={connectionState}
          theme={theme}
          actionLoading={actionLoading}
          onOpenDrawer={() => setDrawerOpen(true)}
          onToggleTheme={handleToggleTheme}
          onRefresh={refresh}
        />

        <main className="app-content">
          {route === 'dashboard' && (
            <Dashboard
              system={system}
              containers={containers}
              auditLogs={auditLogs}
              history={history}
              dryRun={dryRun}
              connectionState={connectionState}
              lastUpdated={lastUpdated}
              actionLoading={actionLoading}
              onToggleDryRun={toggleDryRun}
            />
          )}

          {route === 'workloads/all' && workloads('all')}
          {route === 'workloads/attention' && workloads('attention')}
          {route === 'workloads/healthy' && workloads('healthy')}

          {route === 'events/all' && <AuditLog logs={auditLogs} view="all" />}
          {route === 'events/remediations' && <AuditLog logs={auditLogs} view="remediations" />}
          {route === 'events/anomalies' && <AuditLog logs={auditLogs} view="anomalies" />}

          {route === 'automation/policy' && (
            <RemediationPolicy
              dryRun={dryRun}
              onToggleDryRun={toggleDryRun}
              actionLoading={actionLoading}
            />
          )}
          {route === 'automation/rules' && <CustomRules currentUser={currentUser} />}
          {route === 'automation/thresholds' && <BaselineThresholds />}

          {route === 'system/users' && (
            <UserManagement currentUser={currentUser} actionLoading={actionLoading} />
          )}
          {route === 'system/api' && <ApiEndpoints />}
        </main>

        <StatusBar
          mode={system.mode}
          connectionState={connectionState}
          dryRun={dryRun}
          stressIndex={system.stress_index_1m || 0}
          lastUpdated={lastUpdated}
        />
      </div>
    </div>
  );
};

export default App;
