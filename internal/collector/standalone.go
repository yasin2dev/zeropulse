package collector

import (
	"fmt"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/process"
)

// CPUStats holds per-logical-core usage percentages.
type CPUStats struct {
	LogicalCores int       `json:"logical_cores"`
	UsagePercent []float64 `json:"usage_percent"` // one entry per core
}

// MemStats holds memory figures in bytes.
type MemStats struct {
	TotalBytes     uint64  `json:"total_bytes"`
	UsedBytes      uint64  `json:"used_bytes"`
	FreeBytes      uint64  `json:"free_bytes"`
	UsagePercent   float64 `json:"usage_percent"`
}

// ProcessInfo holds basic data for a single OS process.
type ProcessInfo struct {
	PID        int32  `json:"pid"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	CPUPercent float64 `json:"cpu_percent"`
	MemPercent float32 `json:"mem_percent"`
}

// StandaloneSnapshot is the structured payload emitted when the agent
// runs on a bare-metal or VM host without Docker.
type StandaloneSnapshot struct {
	CollectedAt time.Time     `json:"collected_at"`
	Environment Environment   `json:"environment"`
	CPU         CPUStats      `json:"cpu"`
	Memory      MemStats      `json:"memory"`
	Processes   []ProcessInfo `json:"processes"`
}

// CollectStandalone gathers CPU, memory and process data from the host
// using gopsutil (reads /proc on Linux, sysctl on FreeBSD).
func CollectStandalone() (*StandaloneSnapshot, error) {
	// --- CPU ---
	percents, err := cpu.Percent(0, true) // per-core, non-blocking
	if err != nil {
		return nil, fmt.Errorf("cpu percent: %w", err)
	}
	cpuInfo, err := cpu.Info()
	if err != nil {
		return nil, fmt.Errorf("cpu info: %w", err)
	}
	logicalCores := len(percents)
	_ = cpuInfo // available for future enrichment (model name, MHz, etc.)

	// --- Memory ---
	vmStat, err := mem.VirtualMemory()
	if err != nil {
		return nil, fmt.Errorf("virtual memory: %w", err)
	}

	// --- Processes ---
	procs, err := process.Processes()
	if err != nil {
		return nil, fmt.Errorf("process list: %w", err)
	}

	procInfos := make([]ProcessInfo, 0, len(procs))
	for _, p := range procs {
		name, _ := p.Name()
		statuses, _ := p.Status()

		// Status() returns []string on some platforms; join to a single string.
		status := "unknown"
		if len(statuses) > 0 {
			status = statuses[0]
		}

		cpuPct, _ := p.CPUPercent()
		memPct, _ := p.MemoryPercent()

		procInfos = append(procInfos, ProcessInfo{
			PID:        p.Pid,
			Name:       name,
			Status:     status,
			CPUPercent: cpuPct,
			MemPercent: memPct,
		})
	}

	return &StandaloneSnapshot{
		CollectedAt: time.Now().UTC(),
		Environment: EnvStandalone,
		CPU: CPUStats{
			LogicalCores: logicalCores,
			UsagePercent: percents,
		},
		Memory: MemStats{
			TotalBytes:   vmStat.Total,
			UsedBytes:    vmStat.Used,
			FreeBytes:    vmStat.Free,
			UsagePercent: vmStat.UsedPercent,
		},
		Processes: procInfos,
	}, nil
}
