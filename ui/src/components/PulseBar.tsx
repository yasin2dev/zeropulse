import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMicrochip,
  faMemory,
  faBoxesStacked,
  faGaugeHigh,
  faShieldHalved,
  faBolt,
} from '@fortawesome/free-solid-svg-icons';
import { SystemOverview } from '../types';
import { ConfirmationModal } from './ConfirmationModal';
import { formatBytes } from '../i18n';

interface PulseBarProps {
  system: SystemOverview;
  dryRun: boolean;
  onToggleDryRun: (newVal: boolean) => Promise<boolean>;
  actionLoading: boolean;
}

export const PulseBar: React.FC<PulseBarProps> = ({
  system,
  dryRun,
  onToggleDryRun,
  actionLoading,
}) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);

  const cpuPercent = Math.min(100, Math.max(0, system.system_cpu_percent));
  const memUsed = system.system_mem_used_bytes;
  const memTotal = system.system_mem_total_bytes;
  const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const stressIndex = system.stress_index_1m || 0;

  let cpuStatusClass = 'status-ok';
  let cpuStatusLabel = t('pulse.status_nominal');
  if (cpuPercent > 85) {
    cpuStatusClass = 'status-danger';
    cpuStatusLabel = t('pulse.status_critical');
  } else if (cpuPercent > 65) {
    cpuStatusClass = 'status-warn';
    cpuStatusLabel = t('pulse.status_high_load');
  }

  let memStatusClass = 'status-ok';
  if (memPercent > 85) memStatusClass = 'status-danger';
  else if (memPercent > 70) memStatusClass = 'status-warn';

  let stressStatusClass = 'status-ok';
  let stressLabel = t('pulse.stress_level_low');
  if (stressIndex >= 0.7) {
    stressStatusClass = 'status-danger';
    stressLabel = t('pulse.stress_level_critical');
  } else if (stressIndex >= 0.3) {
    stressStatusClass = 'status-warn';
    stressLabel = t('pulse.stress_level_high');
  }

  const handleToggleClick = () => {
    if (dryRun) {
      setModalOpen(true);
    } else {
      onToggleDryRun(true);
    }
  };

  const handleConfirmRemediation = async () => {
    const success = await onToggleDryRun(false);
    if (success) {
      setModalOpen(false);
    }
  };

  return (
    <div className="pulse-panel">
      {/* Asymmetric Layout: Dominant Vital Health Card (2/3) + Secondary Stack (1/3) */}
      <div className="pulse-layout">
        {/* Dominant Primary Focal Area: Host Processor & Core Saturation */}
        <div className="pulse-hero-card">
          <div className="pulse-card-header">
            <div className="pulse-card-title-group">
              <span className="pulse-card-icon">
                <FontAwesomeIcon icon={faMicrochip} />
              </span>
              <div>
                <h3 className="pulse-card-title">{t('pulse.cpu_title')}</h3>
                <span className="pulse-card-meta">
                  {system.mode === 'docker' ? t('pulse.docker_management') : t('pulse.host_operations')} &middot; {t('pulse.anomaly_threshold')}
                </span>
              </div>
            </div>

            <span className={`status-pill ${cpuStatusClass}`}>
              {cpuStatusLabel}
            </span>
          </div>

          <div className="pulse-hero-body">
            <div className="pulse-hero-metric">
              <span className="pulse-hero-value">{cpuPercent.toFixed(1)}</span>
              <span className="pulse-hero-unit">%</span>
            </div>

            <div className="pulse-hero-meter-block">
              <div className="progress-track hero-track">
                <div
                  className={`progress-fill ${cpuStatusClass}`}
                  style={{ width: `${Math.min(100, Math.max(2, cpuPercent))}%` }}
                />
              </div>
              <div className="pulse-hero-scale">
                <span>{t('pulse.scale_idle')}</span>
                <span className="threshold-marker">{t('pulse.scale_threshold')}</span>
                <span>{t('pulse.scale_saturated')}</span>
              </div>
            </div>
          </div>

          <div className="pulse-hero-substrip">
            <div className="stress-strip-item">
              <FontAwesomeIcon icon={faGaugeHigh} className="stress-icon" />
              <span className="stress-label">{t('pulse.stress_label')}</span>
              <span className={`status-pill sm ${stressStatusClass}`}>
                {stressIndex.toFixed(2)} ({stressLabel})
              </span>
            </div>
            <p className="pulse-human-note">
              {stressIndex >= 0.7
                ? t('pulse.note_critical')
                : cpuPercent > 65
                ? t('pulse.note_high')
                : t('pulse.note_nominal')}
            </p>
          </div>
        </div>

        {/* Secondary Ancillary Stack */}
        <div className="pulse-secondary-stack">
          {/* Host Memory */}
          <div className="pulse-subcard">
            <div className="subcard-header">
              <span className="subcard-title">
                <FontAwesomeIcon icon={faMemory} style={{ opacity: 0.75 }} />
                <span>{t('pulse.memory_title')}</span>
              </span>
              <span className={`status-pill sm ${memStatusClass}`}>
                {memPercent.toFixed(1)}%
              </span>
            </div>

            <div className="subcard-metric-row">
              <span className="subcard-value">{formatBytes(memUsed)}</span>
              <span className="subcard-limit">/ {formatBytes(memTotal)}</span>
            </div>

            <div className="progress-track sm">
              <div
                className={`progress-fill ${memStatusClass}`}
                style={{ width: `${Math.min(100, memPercent)}%` }}
              />
            </div>

            <div className="subcard-footer">
              <span>{t('pulse.free', { amount: formatBytes(memTotal > memUsed ? memTotal - memUsed : 0) })}</span>
              <span>{t('pulse.threshold', { percent: '85.0' })}</span>
            </div>
          </div>

          {/* Workloads */}
          <div className="pulse-subcard">
            <div className="subcard-header">
              <span className="subcard-title">
                <FontAwesomeIcon icon={faBoxesStacked} style={{ opacity: 0.75 }} />
                <span>{t('pulse.workloads_title')}</span>
              </span>
              <span className="status-pill sm status-ok">
                {t('pulse.containers_running', { count: system.running_containers })}
              </span>
            </div>

            <div className="subcard-metric-row">
              <span className="subcard-value">{system.running_containers}</span>
              <span className="subcard-limit">
                {t('pulse.containers_total', { count: system.total_containers })}
              </span>
            </div>

            <div className="progress-track sm">
              <div
                className="progress-fill status-ok"
                style={{
                  width: `${
                    system.total_containers > 0
                      ? (system.running_containers / system.total_containers) * 100
                      : 100
                  }%`,
                }}
              />
            </div>

            <div className="subcard-footer">
              <span>
                {t('pulse.runtime_mode', {
                  mode: system.mode === 'docker' ? t('navbar.docker_engine') : t('navbar.host_native'),
                })}
              </span>
              <span>
                {t('pulse.anomaly_label')}{' '}
                {stressIndex >= 0.7 ? t('pulse.anomaly_detected') : t('pulse.anomaly_none')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tactile Autonomous Remediation / Safety Switch */}
      <div className="safety-bar">
        <div className="safety-info">
          <div className={`safety-icon-wrapper ${dryRun ? 'dry' : 'remediation'}`}>
            <FontAwesomeIcon icon={dryRun ? faShieldHalved : faBolt} />
          </div>
          <div className="safety-text-group">
            <div className="safety-title-row">
              <span className="safety-title">{t('pulse.safety_title')}</span>
              <span className={`status-pill ${dryRun ? 'status-warn' : 'status-danger'}`}>
                {dryRun ? t('pulse.policy_dry_run') : t('pulse.policy_active')}
              </span>
            </div>
            <p className="safety-desc">
              {dryRun ? t('pulse.desc_dry_run') : t('pulse.desc_active')}
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            className={`toggle-switch-btn ${dryRun ? 'active' : 'disabled-mode'}`}
            onClick={handleToggleClick}
            disabled={actionLoading}
            title={dryRun ? t('pulse.switch_to_active') : t('pulse.switch_to_dry_run')}
          >
            <div className="toggle-switch-handle" />
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={modalOpen}
        title={t('pulse.modal_title')}
        message={t('pulse.modal_message')}
        confirmLabel={t('pulse.modal_confirm')}
        isDanger={true}
        isLoading={actionLoading}
        onConfirm={handleConfirmRemediation}
        onCancel={() => setModalOpen(false)}
      />
    </div>
  );
};
