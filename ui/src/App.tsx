import React, { useState, useEffect, useCallback } from 'react';
import { useEdgeTelemetry } from './hooks/useEdgeTelemetry';
import { Navbar, ActiveTab } from './components/Navbar';
import { PulseBar } from './components/PulseBar';
import { ContainerGrid } from './components/ContainerGrid';
import { AuditLog } from './components/AuditLog';
import { EngineSettings } from './components/EngineSettings';
import { UserManagement } from './components/UserManagement';
import { StatusBar } from './components/StatusBar';
import { SetupWizard } from './components/SetupWizard';
import { LoginView } from './components/LoginView';
import { AuthStatus } from './types';
import './styles/dashboard.css';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('zeropulse_theme');
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    return 'dark';
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('zeropulse_theme', theme);
  }, [theme]);

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
          ZEROPULSE INITIALIZING...
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
  const unhealthyCount = containers.filter(
    (c) => c.health_status === 'warning' || c.health_status === 'critical'
  ).length;

  return (
    <div className="dashboard-container" data-theme={theme}>
      {/* Top Appliance Header with Favicon Logo, Telemetry Strip, Segmented Theme Switcher & Tabs */}
      <Navbar
        mode={system.mode}
        connectionState={connectionState}
        dryRun={dryRun}
        totalContainers={containers.length}
        unhealthyCount={unhealthyCount}
        totalLogs={auditLogs.length}
        theme={theme}
        activeTab={activeTab}
        currentUser={currentUser}
        onTabChange={setActiveTab}
        onToggleTheme={handleToggleTheme}
        onRefresh={refresh}
        onLogout={handleLogout}
        actionLoading={actionLoading}
      />

      {/* Main Appliance Content Based on Active Tab */}
      <main className="appliance-main-content">
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <PulseBar
              system={system}
              dryRun={dryRun}
              onToggleDryRun={toggleDryRun}
              actionLoading={actionLoading}
            />

            <ContainerGrid
              containers={containers}
              onRestartContainer={restartContainer}
              actionLoading={actionLoading}
            />

            <AuditLog logs={auditLogs} />
          </div>
        )}

        {activeTab === 'workloads' && (
          <ContainerGrid
            containers={containers}
            onRestartContainer={restartContainer}
            actionLoading={actionLoading}
          />
        )}

        {activeTab === 'audit' && <AuditLog logs={auditLogs} />}

        {activeTab === 'settings' && (
          <EngineSettings
            dryRun={dryRun}
            onToggleDryRun={toggleDryRun}
            actionLoading={actionLoading}
          />
        )}

        {activeTab === 'users' && (
          <UserManagement
            currentUser={currentUser}
            actionLoading={actionLoading}
          />
        )}
      </main>

      {/* Industrial Chassis Status Bar Footer */}
      <StatusBar
        mode={system.mode}
        connectionState={connectionState}
        dryRun={dryRun}
        stressIndex={system.stress_index_1m || 0}
        lastUpdated={lastUpdated}
      />
    </div>
  );
};

export default App;
