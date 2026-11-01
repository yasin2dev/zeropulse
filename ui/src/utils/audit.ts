import { AuditEntry } from '../types';

export type EventView = 'all' | 'remediations' | 'anomalies';
export type EventTone = 'neutral' | 'ok' | 'warn' | 'danger';

export const TONE_STYLES: Record<EventTone, { color: string; background: string }> = {
  neutral: { color: 'var(--text-muted)', background: 'var(--surface-2)' },
  ok: { color: 'var(--status-ok-fg)', background: 'var(--status-ok-bg)' },
  warn: { color: 'var(--status-warn-fg)', background: 'var(--status-warn-bg)' },
  danger: { color: 'var(--status-danger-fg)', background: 'var(--status-danger-bg)' },
};

export function matchesEventView(log: AuditEntry, view: EventView): boolean {
  if (view === 'remediations') {
    return (
      log.action === 'RESTART' ||
      log.action === 'RESTART_SUGGESTED' ||
      log.status === 'ACTION_EXECUTED' ||
      log.status === 'MANUAL_RESTART'
    );
  }
  if (view === 'anomalies') {
    return (
      log.status === 'TRIGGERED' ||
      log.status === 'DRY_RUN_SKIPPED' ||
      log.status === 'FAILED' ||
      log.status === 'REMEDIATION_FAILED'
    );
  }
  return true;
}

export function eventTone(log: AuditEntry): EventTone {
  if (log.status === 'ACTION_EXECUTED' || log.status === 'MANUAL_RESTART') return 'ok';
  if (log.status === 'TRIGGERED' || log.status === 'DRY_RUN_SKIPPED') return 'warn';
  if (log.status === 'FAILED' || log.status === 'REMEDIATION_FAILED') return 'danger';
  return 'neutral';
}
