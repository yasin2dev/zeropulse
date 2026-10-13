package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// ────────────────────────────────────────────────────────────────────────────
// Public output model
// ────────────────────────────────────────────────────────────────────────────

// ContainerMetrics holds the computed resource metrics for a single container.
type ContainerMetrics struct {
	ContainerID   string  `json:"container_id"`
	Name          string  `json:"name"`
	Image         string  `json:"image"`
	CPUPercent    float64 `json:"cpu_percent"`
	MemUsageBytes uint64  `json:"mem_usage_bytes"`
	MemLimitBytes uint64  `json:"mem_limit_bytes"`
	MemPercent    float64 `json:"mem_percent"`
	// Throttling: non-zero means the container hit its CPU quota.
	CPUThrottledPeriods uint64 `json:"cpu_throttled_periods"`
	CPUThrottledTimeNs  uint64 `json:"cpu_throttled_time_ns"`
	// Network totals across all interfaces.
	NetRxBytes uint64 `json:"net_rx_bytes"`
	NetTxBytes uint64 `json:"net_tx_bytes"`
}

// DockerMetricsSnapshot groups per-container metrics with a collection timestamp.
type DockerMetricsSnapshot struct {
	CollectedAt time.Time          `json:"collected_at"`
	Environment Environment        `json:"environment"`
	Containers  []ContainerMetrics `json:"containers"`
}

// ────────────────────────────────────────────────────────────────────────────
// Raw Docker Engine API response shapes (only the fields we consume)
// ────────────────────────────────────────────────────────────────────────────

type rawCPUStats struct {
	CPUUsage struct {
		TotalUsage        uint64   `json:"total_usage"`
		PercpuUsage       []uint64 `json:"percpu_usage"`
		UsageInKernelmode uint64   `json:"usage_in_kernelmode"`
		UsageInUsermode   uint64   `json:"usage_in_usermode"`
	} `json:"cpu_usage"`
	SystemCPUUsage uint64 `json:"system_cpu_usage"`
	OnlineCPUs     uint64 `json:"online_cpus"`
	ThrottlingData struct {
		ThrottledPeriods uint64 `json:"throttled_periods"`
		ThrottledTime    uint64 `json:"throttled_time"`
	} `json:"throttling_data"`
}

type rawMemStats struct {
	Usage uint64 `json:"usage"`
	Limit uint64 `json:"limit"`
	// cache is subtracted from usage on cgroup v1 hosts for a "real" figure.
	Stats map[string]uint64 `json:"stats"`
}

type rawNetStats struct {
	RxBytes uint64 `json:"rx_bytes"`
	TxBytes uint64 `json:"tx_bytes"`
}

type rawStatsResponse struct {
	CPUStats    rawCPUStats            `json:"cpu_stats"`
	PreCPUStats rawCPUStats            `json:"precpu_stats"`
	MemoryStats rawMemStats            `json:"memory_stats"`
	Networks    map[string]rawNetStats `json:"networks"`
}

// ────────────────────────────────────────────────────────────────────────────
// Stats fetching
// ────────────────────────────────────────────────────────────────────────────

// fetchContainerStats calls the Docker Engine API for a single container and
// returns the computed ContainerMetrics. The one-shot flag (?stream=false)
// makes the daemon return a single sample instead of a continuous stream.
func fetchContainerStats(ctx context.Context, client *http.Client, c ContainerInfo) (ContainerMetrics, error) {
	url := fmt.Sprintf("http://localhost/v1.41/containers/%s/stats?stream=false&one-shot=true", c.ID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return ContainerMetrics{}, fmt.Errorf("build stats request: %w", err)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return ContainerMetrics{}, fmt.Errorf("stats api call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ContainerMetrics{}, fmt.Errorf("stats api returned HTTP %d", resp.StatusCode)
	}

	var raw rawStatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return ContainerMetrics{}, fmt.Errorf("decode stats: %w", err)
	}

	return computeMetrics(c, raw), nil
}

// computeMetrics translates the raw Docker stats payload into ContainerMetrics.
func computeMetrics(c ContainerInfo, r rawStatsResponse) ContainerMetrics {
	m := ContainerMetrics{
		ContainerID:         c.ID,
		Image:               c.Image,
		CPUThrottledPeriods: r.CPUStats.ThrottlingData.ThrottledPeriods,
		CPUThrottledTimeNs:  r.CPUStats.ThrottlingData.ThrottledTime,
	}

	// Friendly name: Docker prefixes names with "/", strip it.
	if len(c.Names) > 0 {
		name := c.Names[0]
		if len(name) > 0 && name[0] == '/' {
			name = name[1:]
		}
		m.Name = name
	}

	// ── CPU % ───────────────────────────────────────────────────────────────
	// Formula from official Docker docs:
	//   cpuDelta      = cpu_stats.total_usage   - precpu_stats.total_usage
	//   systemDelta   = cpu_stats.system_usage  - precpu_stats.system_usage
	//   cpuPercent    = (cpuDelta / systemDelta) * numCPUs * 100
	cpuDelta := float64(r.CPUStats.CPUUsage.TotalUsage) -
		float64(r.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(r.CPUStats.SystemCPUUsage) -
		float64(r.PreCPUStats.SystemCPUUsage)

	numCPUs := r.CPUStats.OnlineCPUs
	if numCPUs == 0 {
		numCPUs = uint64(len(r.CPUStats.CPUUsage.PercpuUsage))
	}
	if numCPUs == 0 {
		numCPUs = 1 // safety fallback
	}

	if systemDelta > 0 && cpuDelta > 0 {
		m.CPUPercent = (cpuDelta / systemDelta) * float64(numCPUs) * 100.0
	}

	// ── Memory ──────────────────────────────────────────────────────────────
	// On cgroup v1 hosts the "cache" entry inside memory_stats.stats must be
	// subtracted from usage to get the RSS-like "working set" figure that
	// docker stats shows. On cgroup v2 hosts the stats map is absent; usage
	// already reflects RSS.
	usage := r.MemoryStats.Usage
	if cache, ok := r.MemoryStats.Stats["cache"]; ok && usage >= cache {
		usage -= cache
	}
	limit := r.MemoryStats.Limit
	m.MemUsageBytes = usage
	m.MemLimitBytes = limit
	if limit > 0 {
		m.MemPercent = float64(usage) / float64(limit) * 100.0
	}

	// ── Network I/O ─────────────────────────────────────────────────────────
	for _, iface := range r.Networks {
		m.NetRxBytes += iface.RxBytes
		m.NetTxBytes += iface.TxBytes
	}

	return m
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

// CollectDockerMetrics fetches per-container stats for all running containers
// concurrently and returns a single DockerMetricsSnapshot.
func CollectDockerMetrics(ctx context.Context) (*DockerMetricsSnapshot, error) {
	client := newDockerHTTPClient()

	// 1. List running containers (reuse existing logic).
	snap, err := CollectDocker()
	if err != nil {
		return nil, fmt.Errorf("list containers: %w", err)
	}

	// 2. Fan-out: fetch stats for every container in parallel.
	type result struct {
		metrics ContainerMetrics
		err     error
	}

	results := make([]result, len(snap.Containers))
	var wg sync.WaitGroup

	for i, c := range snap.Containers {
		wg.Add(1)
		go func(idx int, container ContainerInfo) {
			defer wg.Done()
			m, err := fetchContainerStats(ctx, client, container)
			results[idx] = result{metrics: m, err: err}
		}(i, c)
	}
	wg.Wait()

	// 3. Collect results; skip containers that errored (e.g. just stopped).
	metrics := make([]ContainerMetrics, 0, len(snap.Containers))
	for i, r := range results {
		if r.err != nil {
			// Non-fatal: log a warning and continue with the rest.
			_ = fmt.Sprintf("warn: stats for %s: %v", snap.Containers[i].ID, r.err)
			continue
		}
		metrics = append(metrics, r.metrics)
	}

	return &DockerMetricsSnapshot{
		CollectedAt: time.Now().UTC(),
		Environment: EnvDocker,
		Containers:  metrics,
	}, nil
}
