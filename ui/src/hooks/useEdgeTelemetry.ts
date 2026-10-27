import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SystemOverview,
  ContainerCard,
  AuditEntry,
  ConnectionState,
  MetricsEventPayload,
} from '../types';

const INITIAL_SYSTEM: SystemOverview = {
  mode: 'docker',
  total_containers: 0,
  running_containers: 0,
  system_cpu_percent: 0,
  system_mem_used_bytes: 0,
  system_mem_total_bytes: 0,
  stress_index_1m: 0,
};

export function useEdgeTelemetry(enabled: boolean = true) {
  const [system, setSystem] = useState<SystemOverview>(INITIAL_SYSTEM);
  const [containers, setContainers] = useState<ContainerCard[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Initial data bootstrap via REST
  const fetchInitialData = useCallback(async () => {
    if (!enabled) return;
    try {
      const [statusRes, containersRes, dryRunRes, logsRes] = await Promise.allSettled([
        fetch('/api/v1/status'),
        fetch('/api/v1/containers'),
        fetch('/api/v1/config/dry-run'),
        fetch('/api/v1/audit/logs'),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        const data = await statusRes.value.json();
        if (data.system) setSystem(data.system);
        if (typeof data.dry_run === 'boolean') setDryRun(data.dry_run);
      }

      if (containersRes.status === 'fulfilled' && containersRes.value.ok) {
        const data = await containersRes.value.json();
        if (Array.isArray(data.containers)) setContainers(data.containers);
      }

      if (dryRunRes.status === 'fulfilled' && dryRunRes.value.ok) {
        const data = await dryRunRes.value.json();
        if (typeof data.dry_run === 'boolean') setDryRun(data.dry_run);
      }

      if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
        const data = await logsRes.value.json();
        const logsList = Array.isArray(data.logs)
          ? data.logs
          : Array.isArray(data.entries)
          ? data.entries
          : [];
        setAuditLogs(logsList);
      }

      setLastUpdated(new Date());
    } catch {
      // Fail silently, SSE will recover
    }
  }, [enabled]);

  // SSE streaming setup
  useEffect(() => {
    if (!enabled) {
      setConnectionState('disconnected');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    fetchInitialData();

    let es: EventSource | null = null;
    let reconnectTimeout: number | undefined;

    const setupSSE = () => {
      es = new EventSource('/api/v1/stream');
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnectionState('connected');
      };

      es.addEventListener('connected', () => {
        setConnectionState('connected');
      });

      es.addEventListener('heartbeat', () => {
        setConnectionState('connected');
      });

      es.addEventListener('metrics', (event) => {
        try {
          const payload: MetricsEventPayload = JSON.parse(event.data);
          if (payload.system) setSystem(payload.system);
          if (payload.containers) setContainers(payload.containers);
          setLastUpdated(new Date(payload.timestamp || Date.now()));
          setConnectionState('connected');
        } catch (err) {
          console.error('Failed to parse metrics event', err);
        }
      });

      es.addEventListener('anomaly', (event) => {
        try {
          const entry: AuditEntry = JSON.parse(event.data);
          setAuditLogs((prev) => [entry, ...prev.slice(0, 99)]);
        } catch (err) {
          console.error('Failed to parse anomaly event', err);
        }
      });

      es.onerror = () => {
        setConnectionState('reconnecting');
        if (es) {
          es.close();
        }
        reconnectTimeout = window.setTimeout(setupSSE, 3000);
      };
    };

    setupSSE();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [enabled, fetchInitialData]);

  // Toggle Dry-Run
  const toggleDryRun = useCallback(async (newVal: boolean): Promise<boolean> => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/config/dry-run', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: newVal }),
      });
      if (res.ok) {
        setDryRun(newVal);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update dry-run mode', err);
      return false;
    } finally {
      setActionLoading(false);
    }
  }, []);

  // Manual Container Restart
  const restartContainer = useCallback(
    async (containerId: string): Promise<{ success: boolean; message?: string }> => {
      setActionLoading(true);
      try {
        const res = await fetch(`/api/v1/containers/${encodeURIComponent(containerId)}/restart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Operator manual trigger via Edge UI' }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          return { success: true };
        }
        return { success: false, message: data.error || 'Restart failed' };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Network error';
        return { success: false, message: msg };
      } finally {
        setActionLoading(false);
      }
    },
    []
  );

  return {
    system,
    containers,
    auditLogs,
    dryRun,
    connectionState,
    lastUpdated,
    actionLoading,
    toggleDryRun,
    restartContainer,
    refresh: fetchInitialData,
  };
}
