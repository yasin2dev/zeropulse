package ruleengine

import (
	"fmt"

	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
)

// ExtractDockerMetricValue extracts the float64 metric value corresponding to the
// given MetricType from a ContainerMetrics snapshot.
// Returns an error if the MetricType is unrecognized.
func ExtractDockerMetricValue(m collector.ContainerMetrics, mt config.MetricType) (float64, error) {
	switch mt {
	case config.MetricCPUPercent:
		return m.CPUPercent, nil
	case config.MetricMemPercent:
		return m.MemPercent, nil
	case config.MetricCPUThrottledPeriods:
		return float64(m.CPUThrottledPeriods), nil
	case config.MetricNetRxBytes:
		return float64(m.NetRxBytes), nil
	case config.MetricNetTxBytes:
		return float64(m.NetTxBytes), nil
	default:
		return 0, fmt.Errorf("unknown metric type: %q", mt)
	}
}

// ExtractStandaloneMetricValue extracts the float64 metric value corresponding to
// the given MetricType from a StandaloneSnapshot.
// In standalone mode, only CPU_PERCENT and MEM_PERCENT are supported.
// Returns an error if the MetricType is unsupported or unrecognized.
func ExtractStandaloneMetricValue(snap *collector.StandaloneSnapshot, mt config.MetricType) (float64, error) {
	if snap == nil {
		return 0, fmt.Errorf("nil snapshot")
	}

	switch mt {
	case config.MetricCPUPercent:
		if len(snap.CPU.UsagePercent) == 0 {
			return 0, nil
		}
		var total float64
		for _, u := range snap.CPU.UsagePercent {
			total += u
		}
		return total / float64(len(snap.CPU.UsagePercent)), nil
	case config.MetricMemPercent:
		return snap.Memory.UsagePercent, nil
	default:
		return 0, fmt.Errorf("metric type %q is unsupported in standalone mode", mt)
	}
}
