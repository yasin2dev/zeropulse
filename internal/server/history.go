package server

import (
	"sync"
	"time"
)

// metricsHistoryCapacity keeps one hour of samples at the 5s collection interval.
const metricsHistoryCapacity = 720

// MetricsSample is one point of the dashboard's time-series charts.
type MetricsSample struct {
	Timestamp  time.Time `json:"timestamp"`
	CPUPercent float64   `json:"cpu_percent"`
	MemPercent float64   `json:"mem_percent"`
	// Network rates across all containers; null when there is no earlier frame to compare with.
	NetRxBytesPerSec *float64 `json:"net_rx_bytes_per_sec"`
	NetTxBytesPerSec *float64 `json:"net_tx_bytes_per_sec"`
}

type netCounters struct {
	rx uint64
	tx uint64
}

// MetricsHistory is a fixed-size, thread-safe ring buffer of metric samples.
// It lives in memory only, so history restarts with the agent.
type MetricsHistory struct {
	mu       sync.RWMutex
	samples  []MetricsSample
	next     int
	full     bool
	prevTime time.Time
	prevNet  map[string]netCounters
}

// NewMetricsHistory allocates the buffer up front so its footprint stays constant.
func NewMetricsHistory(capacity int) *MetricsHistory {
	if capacity <= 0 {
		capacity = metricsHistoryCapacity
	}
	return &MetricsHistory{samples: make([]MetricsSample, capacity)}
}

// Record derives a sample from a collector frame, stores it and returns it.
func (h *MetricsHistory) Record(payload MetricsEventPayload) MetricsSample {
	h.mu.Lock()
	defer h.mu.Unlock()

	sample := MetricsSample{
		Timestamp:  payload.Timestamp,
		CPUPercent: clampPercent(payload.System.SystemCPUPercent),
	}
	if total := payload.System.SystemMemTotalBytes; total > 0 {
		sample.MemPercent = clampPercent(float64(payload.System.SystemMemUsedBytes) / float64(total) * 100)
	}
	sample.NetRxBytesPerSec, sample.NetTxBytesPerSec = h.networkRates(payload)

	h.samples[h.next] = sample
	h.next = (h.next + 1) % len(h.samples)
	if h.next == 0 {
		h.full = true
	}
	return sample
}

// networkRates turns Docker's per-container running totals into rates. Working per container
// means a container appearing (its whole total) or restarting (counter reset) can't fake a spike.
func (h *MetricsHistory) networkRates(payload MetricsEventPayload) (rx, tx *float64) {
	current := make(map[string]netCounters, len(payload.Containers))
	for _, c := range payload.Containers {
		current[c.ID] = netCounters{rx: c.NetRxBytes, tx: c.NetTxBytes}
	}

	elapsed := payload.Timestamp.Sub(h.prevTime).Seconds()
	if len(h.prevNet) > 0 && elapsed > 0 {
		var rxDelta, txDelta uint64
		for id, cur := range current {
			prev, known := h.prevNet[id]
			if !known {
				continue
			}
			if cur.rx > prev.rx {
				rxDelta += cur.rx - prev.rx
			}
			if cur.tx > prev.tx {
				txDelta += cur.tx - prev.tx
			}
		}
		rxRate := float64(rxDelta) / elapsed
		txRate := float64(txDelta) / elapsed
		rx, tx = &rxRate, &txRate
	}

	h.prevTime = payload.Timestamp
	h.prevNet = current
	return rx, tx
}

// Snapshot returns a copy of the stored samples, oldest first.
func (h *MetricsHistory) Snapshot() []MetricsSample {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if !h.full {
		return append([]MetricsSample{}, h.samples[:h.next]...)
	}
	result := make([]MetricsSample, 0, len(h.samples))
	result = append(result, h.samples[h.next:]...)
	return append(result, h.samples[:h.next]...)
}

func clampPercent(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}
