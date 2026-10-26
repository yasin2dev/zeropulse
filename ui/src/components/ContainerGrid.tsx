import React, { useState, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCube,
  faMagnifyingGlass,
  faRotateRight,
  faCircleCheck,
  faTriangleExclamation,
  faCircleExclamation,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import { ContainerCard } from '../types';
import { ConfirmationModal } from './ConfirmationModal';

interface ContainerGridProps {
  containers: ContainerCard[];
  onRestartContainer: (id: string) => Promise<{ success: boolean; message?: string }>;
  actionLoading: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const ContainerGrid: React.FC<ContainerGridProps> = ({
  containers,
  onRestartContainer,
  actionLoading,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unhealthy' | 'healthy'>('all');
  const [selectedForRestart, setSelectedForRestart] = useState<ContainerCard | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const filteredContainers = useMemo(() => {
    return containers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.image.toLowerCase().includes(search.toLowerCase()) ||
        c.id.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (filter === 'unhealthy') {
        return c.health_status === 'warning' || c.health_status === 'critical';
      }
      if (filter === 'healthy') {
        return c.health_status === 'ok' || c.health_status === 'cooldown';
      }
      return true;
    });
  }, [containers, search, filter]);

  const handleConfirmRestart = async () => {
    if (!selectedForRestart) return;
    const target = selectedForRestart;
    const res = await onRestartContainer(target.id);
    setSelectedForRestart(null);

    if (res.success) {
      setFeedbackMsg({
        text: `Konteyner ${target.name} başarıyla yeniden başlatıldı.`,
        isError: false,
      });
    } else {
      setFeedbackMsg({
        text: `Yeniden başlatma başarısız: ${res.message}`,
        isError: true,
      });
    }

    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">
          <FontAwesomeIcon icon={faCube} style={{ opacity: 0.8 }} />
          <span>Konteyner İş Yükleri</span>
          <span className="section-count">({containers.length} Toplam)</span>
        </h2>

        <div className="controls-group">
          <div className="search-wrapper">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="İsim, ID veya İmaj ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Tümü ({containers.length})
          </button>
          <button
            className={`filter-btn ${filter === 'unhealthy' ? 'active' : ''}`}
            onClick={() => setFilter('unhealthy')}
          >
            Uyarı/Kritik (
            {containers.filter((c) => c.health_status === 'warning' || c.health_status === 'critical').length}
            )
          </button>
          <button
            className={`filter-btn ${filter === 'healthy' ? 'active' : ''}`}
            onClick={() => setFilter('healthy')}
          >
            Normal (
            {containers.filter((c) => c.health_status === 'ok' || c.health_status === 'cooldown').length}
            )
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.825rem',
            fontWeight: 600,
            background: feedbackMsg.isError ? 'var(--status-danger-bg)' : 'var(--status-ok-bg)',
            border: `1px solid ${feedbackMsg.isError ? 'var(--status-danger-border)' : 'var(--status-ok-border)'}`,
            color: feedbackMsg.isError ? 'var(--crimson)' : 'var(--status-ok)',
          }}
        >
          {feedbackMsg.text}
        </div>
      )}

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>KONTEYNER / İMAJ</th>
              <th>CPU KULLANIMI</th>
              <th>BELLEK (RAM)</th>
              <th>CFS THROTTLING</th>
              <th>DURUM</th>
              <th>AKSİYON</th>
            </tr>
          </thead>
          <tbody>
            {filteredContainers.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  Filtreye uygun konteyner bulunamadı.
                </td>
              </tr>
            ) : (
              filteredContainers.map((c) => {
                const cpuVal = Math.min(100, Math.max(0, c.cpu_percent));
                const memVal = Math.min(100, Math.max(0, c.mem_percent));

                let cpuClass = 'status-ok';
                if (cpuVal > 80) cpuClass = 'status-danger';
                else if (cpuVal > 60) cpuClass = 'status-warn';

                let memClass = 'status-ok';
                if (memVal > 85) memClass = 'status-danger';
                else if (memVal > 70) memClass = 'status-warn';

                const shortId = c.id.length > 12 ? c.id.substring(0, 12) : c.id;
                const throttledMs = (c.cpu_throttled_time_ns / 1_000_000).toFixed(0);

                let statusIcon = faCircleCheck;
                if (c.health_status === 'warning') statusIcon = faTriangleExclamation;
                else if (c.health_status === 'critical') statusIcon = faCircleExclamation;
                else if (c.health_status === 'cooldown') statusIcon = faClock;

                return (
                  <tr key={c.id}>
                    <td>
                      <div className="container-name-cell">
                        <span className="container-name">{c.name || shortId}</span>
                        <span className="container-meta">
                          {shortId} &bull; {c.image}
                        </span>
                      </div>
                    </td>

                    <td className="usage-bar-cell">
                      <div className="usage-text">
                        <span style={{ color: `var(--${cpuClass})` }}>{cpuVal.toFixed(1)}%</span>
                      </div>
                      <div className="progress-track">
                        <div
                          className={`progress-fill ${cpuClass}`}
                          style={{ width: `${cpuVal}%` }}
                        />
                      </div>
                    </td>

                    <td className="usage-bar-cell">
                      <div className="usage-text">
                        <span style={{ color: `var(--${memClass})` }}>{memVal.toFixed(1)}%</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {formatBytes(c.mem_usage_bytes)}
                          {c.mem_limit_bytes > 0 && ` / ${formatBytes(c.mem_limit_bytes)}`}
                        </span>
                      </div>
                      <div className="progress-track">
                        <div
                          className={`progress-fill ${memClass}`}
                          style={{ width: `${memVal}%` }}
                        />
                      </div>
                    </td>

                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        {c.cpu_throttled_periods > 0 ? (
                          <span style={{ color: 'var(--status-warn)' }}>
                            {c.cpu_throttled_periods} p ({throttledMs}ms)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>0 periyot</span>
                        )}
                      </div>
                    </td>

                    <td>
                      <span className={`badge ${c.health_status}`}>
                        <FontAwesomeIcon icon={statusIcon} />
                        <span>{c.health_status.toUpperCase()}</span>
                      </span>
                    </td>

                    <td>
                      <button
                        className="action-btn"
                        onClick={() => setSelectedForRestart(c)}
                        disabled={actionLoading}
                        title="Konteyneri manuel olarak yeniden başlat"
                      >
                        <FontAwesomeIcon icon={faRotateRight} />
                        <span>Yeniden Başlat</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmationModal
        isOpen={Boolean(selectedForRestart)}
        title="Konteyneri Yeniden Başlat"
        message={`${selectedForRestart?.name} (${selectedForRestart?.id.slice(
          0,
          12
        )}) konteynerini derhal yeniden başlatmak istediğinizden emin misiniz? Çalışan işlemler geçici olarak kesintiye uğrayacaktır.`}
        confirmLabel="Evet, Yeniden Başlat"
        isDanger={true}
        isLoading={actionLoading}
        onConfirm={handleConfirmRestart}
        onCancel={() => setSelectedForRestart(null)}
      />
    </div>
  );
};
