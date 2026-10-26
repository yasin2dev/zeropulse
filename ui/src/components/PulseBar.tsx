import React, { useState } from 'react';
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

interface PulseBarProps {
  system: SystemOverview;
  dryRun: boolean;
  onToggleDryRun: (newVal: boolean) => Promise<boolean>;
  actionLoading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const PulseBar: React.FC<PulseBarProps> = ({
  system,
  dryRun,
  onToggleDryRun,
  actionLoading,
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const cpuPercent = Math.min(100, Math.max(0, system.system_cpu_percent));
  const memUsed = system.system_mem_used_bytes;
  const memTotal = system.system_mem_total_bytes;
  const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const stressIndex = system.stress_index_1m || 0;

  let cpuStatusClass = 'status-ok';
  let cpuStatusLabel = 'Kararlı / Normal';
  if (cpuPercent > 85) {
    cpuStatusClass = 'status-danger';
    cpuStatusLabel = 'Kritik Doygunluk';
  } else if (cpuPercent > 65) {
    cpuStatusClass = 'status-warn';
    cpuStatusLabel = 'Yüksek Yük';
  }

  let memStatusClass = 'status-ok';
  if (memPercent > 85) memStatusClass = 'status-danger';
  else if (memPercent > 70) memStatusClass = 'status-warn';

  let stressStatusClass = 'status-ok';
  let stressLabel = 'Düşük';
  if (stressIndex >= 0.7) {
    stressStatusClass = 'status-danger';
    stressLabel = 'Kritik';
  } else if (stressIndex >= 0.3) {
    stressStatusClass = 'status-warn';
    stressLabel = 'Yüksek';
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
                <h3 className="pulse-card-title">Sistem Çekirdek Yükü & Vital Telemetri</h3>
                <span className="pulse-card-meta">
                  {system.mode === 'docker' ? 'Docker Daemon Yönetimi' : 'Host Native İşlemleri'} &middot; Anomali Eşiği: %80.0
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
                <span>%0 Boşta</span>
                <span className="threshold-marker">Eşik: %80.0</span>
                <span>%100 Doygun</span>
              </div>
            </div>
          </div>

          <div className="pulse-hero-substrip">
            <div className="stress-strip-item">
              <FontAwesomeIcon icon={faGaugeHigh} className="stress-icon" />
              <span className="stress-label">1 Dk Anomali Stresi:</span>
              <span className={`status-pill sm ${stressStatusClass}`}>
                {stressIndex.toFixed(2)} ({stressLabel})
              </span>
            </div>
            <p className="pulse-human-note">
              {stressIndex >= 0.7
                ? 'Son 60 saniye içinde ardışık eşik aşımları kaydedildi; sistem koruma eşiğinde.'
                : cpuPercent > 65
                ? 'İşlemci yükü ortalamanın üzerinde seyrediyor; pencere motoru değişimleri izliyor.'
                : 'Çekirdek doygunluğu ve telemetri ritmi olağan sınırlarında sakin çalışıyor.'}
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
                <span>Bellek Tüketimi (RAM)</span>
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
              <span>Boş: {formatBytes(memTotal > memUsed ? memTotal - memUsed : 0)}</span>
              <span>Eşik: %85.0</span>
            </div>
          </div>

          {/* Workloads */}
          <div className="pulse-subcard">
            <div className="subcard-header">
              <span className="subcard-title">
                <FontAwesomeIcon icon={faBoxesStacked} style={{ opacity: 0.75 }} />
                <span>İş Yükleri & Konteynerler</span>
              </span>
              <span className="status-pill sm status-ok">
                {system.running_containers} Çalışıyor
              </span>
            </div>

            <div className="subcard-metric-row">
              <span className="subcard-value">{system.running_containers}</span>
              <span className="subcard-limit">/ {system.total_containers} Konteyner</span>
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
              <span>Çalışma Modu: {system.mode === 'docker' ? 'Docker Engine' : 'Host Native'}</span>
              <span>Anomali: Yok</span>
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
              <span className="safety-title">Otonom İyileştirme Politikası:</span>
              <span className={`status-pill ${dryRun ? 'status-warn' : 'status-danger'}`}>
                {dryRun ? 'Gözlem Modu (Dry-Run)' : 'Aktif Self-Healing Devrede'}
              </span>
            </div>
            <p className="safety-desc">
              {dryRun
                ? 'Kural ihlallerinde kararsız kalan iş yükleri için yalnızca teşhis logu üretilir; otomatik restart uygulanmaz.'
                : 'Dikkat: Tanımlı kaynak eşiklerini 3 ardışık periyot aşan konteynerler anında otonom olarak yeniden başlatılır.'}
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            className={`toggle-switch-btn ${dryRun ? 'active' : 'disabled-mode'}`}
            onClick={handleToggleClick}
            disabled={actionLoading}
            title={dryRun ? 'Aktif self-healing moduna geç' : 'Emniyetli dry-run moduna dön'}
          >
            <div className="toggle-switch-handle" />
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={modalOpen}
        title="Aktif Remediation Modunu Aç"
        message="Dry-Run emniyet kilidini kaldırmak üzeresiniz. Bu modda, kural eşiklerini art arda aşan konteynerler anında otomatik olarak YENİDEN BAŞLATILACAKTIR. Devam etmek istiyor musunuz?"
        confirmLabel="Emniyeti Kaldır ve Aktif Et"
        isDanger={true}
        isLoading={actionLoading}
        onConfirm={handleConfirmRemediation}
        onCancel={() => setModalOpen(false)}
      />
    </div>
  );
};
