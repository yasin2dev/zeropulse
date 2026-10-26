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
  if (cpuPercent > 85) cpuStatusClass = 'status-danger';
  else if (cpuPercent > 65) cpuStatusClass = 'status-warn';

  let memStatusClass = 'status-ok';
  if (memPercent > 85) memStatusClass = 'status-danger';
  else if (memPercent > 70) memStatusClass = 'status-warn';

  let stressStatusClass = 'status-ok';
  let stressLabel = 'DÜŞÜK';
  if (stressIndex >= 0.7) {
    stressStatusClass = 'status-danger';
    stressLabel = 'KRİTİK';
  } else if (stressIndex >= 0.3) {
    stressStatusClass = 'status-warn';
    stressLabel = 'YÜKSEK';
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
      {/* 4-Metric Grid */}
      <div className="pulse-grid">
        {/* Host CPU */}
        <div className="metric-gauge">
          <div className="metric-gauge-header">
            <span className="metric-header-left">
              <FontAwesomeIcon icon={faMicrochip} style={{ opacity: 0.8 }} />
              <span>SİSTEM CPU YÜKÜ</span>
            </span>
            <span style={{ color: `var(--${cpuStatusClass})` }}>{cpuPercent.toFixed(1)}%</span>
          </div>
          <div className="metric-gauge-value">
            {cpuPercent.toFixed(1)}
            <span className="metric-gauge-unit">%</span>
          </div>
          <div className="progress-track">
            <div
              className={`progress-fill ${cpuStatusClass}`}
              style={{ width: `${cpuPercent}%` }}
            />
          </div>
          <div className="metric-gauge-subtext">
            <span>Çekirdek Doygunluğu</span>
            <span>Eşik: %80.0</span>
          </div>
        </div>

        {/* Host Memory */}
        <div className="metric-gauge">
          <div className="metric-gauge-header">
            <span className="metric-header-left">
              <FontAwesomeIcon icon={faMemory} style={{ opacity: 0.8 }} />
              <span>BELLEK KULLANIMI</span>
            </span>
            <span style={{ color: `var(--${memStatusClass})` }}>{memPercent.toFixed(1)}%</span>
          </div>
          <div className="metric-gauge-value">
            {formatBytes(memUsed)}
            <span className="metric-gauge-unit">/ {formatBytes(memTotal)}</span>
          </div>
          <div className="progress-track">
            <div
              className={`progress-fill ${memStatusClass}`}
              style={{ width: `${Math.min(100, memPercent)}%` }}
            />
          </div>
          <div className="metric-gauge-subtext">
            <span>Boş: {formatBytes(memTotal > memUsed ? memTotal - memUsed : 0)}</span>
            <span>Eşik: %85.0</span>
          </div>
        </div>

        {/* Workloads */}
        <div className="metric-gauge">
          <div className="metric-gauge-header">
            <span className="metric-header-left">
              <FontAwesomeIcon icon={faBoxesStacked} style={{ opacity: 0.8 }} />
              <span>AKTİF İŞ YÜKLERİ</span>
            </span>
            <span className="badge ok">
              {system.running_containers}/{system.total_containers} ÇALIŞIYOR
            </span>
          </div>
          <div className="metric-gauge-value">
            {system.running_containers}
            <span className="metric-gauge-unit">/ {system.total_containers} Konteyner</span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill status-info"
              style={{
                width: `${
                  system.total_containers > 0
                    ? (system.running_containers / system.total_containers) * 100
                    : 100
                }%`,
              }}
            />
          </div>
          <div className="metric-gauge-subtext">
            <span>Daemon: {system.mode === 'docker' ? 'Docker Engine' : 'Host Native'}</span>
          </div>
        </div>

        {/* 1m Stress Index */}
        <div className="metric-gauge">
          <div className="metric-gauge-header">
            <span className="metric-header-left">
              <FontAwesomeIcon icon={faGaugeHigh} style={{ opacity: 0.8 }} />
              <span>1 DK STRES İNDEKSİ</span>
            </span>
            <span style={{ color: `var(--${stressStatusClass})` }}>{stressLabel}</span>
          </div>
          <div className="metric-gauge-value">
            {stressIndex.toFixed(2)}
            <span className="metric-gauge-unit">/ 1.00</span>
          </div>
          <div className="progress-track">
            <div
              className={`progress-fill ${stressStatusClass}`}
              style={{ width: `${Math.min(100, stressIndex * 100)}%` }}
            />
          </div>
          <div className="metric-gauge-subtext">
            <span>Anomali Yoğunluğu</span>
            <span>Son 60 saniye</span>
          </div>
        </div>
      </div>

      {/* Dry-Run Safety Switch */}
      <div className="safety-bar">
        <div className="safety-info">
          <div className={`safety-icon-wrapper ${dryRun ? 'dry' : 'remediation'}`}>
            <FontAwesomeIcon icon={dryRun ? faShieldHalved : faBolt} />
          </div>
          <div>
            <div className="safety-title">
              <span>DRY-RUN EMNİYET KİLİDİ:</span>
              <span style={{ color: dryRun ? 'var(--status-warn)' : 'var(--crimson)' }}>
                {dryRun ? 'DEVREDE (GÖZLEMLEME MODU)' : 'DEVRE DIŞI (AKTİF REMEDIATION)'}
              </span>
            </div>
            <div className="safety-desc">
              {dryRun
                ? 'Kural ihlallerinde aksiyonlar sadece simüle edilir ve kaydedilir; sistem müdahalesi yapılmaz.'
                : 'DİKKAT: Kural ihlali durumunda kararsız kalan konteynerler kural motoru tarafından otomatik yeniden başlatılır.'}
            </div>
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
