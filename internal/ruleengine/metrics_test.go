package ruleengine

import (
	"math"
	"testing"

	"pgregory.net/rapid"
	"zeropulse-agent/internal/collector"
	"zeropulse-agent/internal/config"
)

// Feature: rule-engine-and-anomaly-detection, Property 13: For any ContainerMetrics and any known MetricType, ExtractDockerMetricValue SHALL return the value of exactly the field that corresponds to that MetricType (CPU_PERCENT → CPUPercent, MEM_PERCENT → MemPercent, CPU_THROTTLED_PERIODS → CPUThrottledPeriods, NET_RX_BYTES → NetRxBytes, NET_TX_BYTES → NetTxBytes).
//
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
func TestMetricTypeMapping(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := collector.ContainerMetrics{
			ContainerID:         rapid.StringN(1, 32, -1).Draw(t, "containerID"),
			Name:                rapid.StringN(1, 32, -1).Draw(t, "name"),
			Image:               rapid.StringN(1, 32, -1).Draw(t, "image"),
			CPUPercent:          rapid.Float64Range(0, 1000).Draw(t, "cpuPercent"),
			MemUsageBytes:       rapid.Uint64().Draw(t, "memUsageBytes"),
			MemLimitBytes:       rapid.Uint64().Draw(t, "memLimitBytes"),
			MemPercent:          rapid.Float64Range(0, 100).Draw(t, "memPercent"),
			CPUThrottledPeriods: rapid.Uint64().Draw(t, "cpuThrottledPeriods"),
			CPUThrottledTimeNs:  rapid.Uint64().Draw(t, "cpuThrottledTimeNs"),
			NetRxBytes:          rapid.Uint64().Draw(t, "netRxBytes"),
			NetTxBytes:          rapid.Uint64().Draw(t, "netTxBytes"),
		}

		knownTypes := []config.MetricType{
			config.MetricCPUPercent,
			config.MetricMemPercent,
			config.MetricCPUThrottledPeriods,
			config.MetricNetRxBytes,
			config.MetricNetTxBytes,
		}

		mt := rapid.SampledFrom(knownTypes).Draw(t, "metricType")

		val, err := ExtractDockerMetricValue(m, mt)
		if err != nil {
			t.Fatalf("unexpected error for known metric type %s: %v", mt, err)
		}

		switch mt {
		case config.MetricCPUPercent:
			if val != m.CPUPercent {
				t.Fatalf("expected CPUPercent %f, got %f", m.CPUPercent, val)
			}
		case config.MetricMemPercent:
			if val != m.MemPercent {
				t.Fatalf("expected MemPercent %f, got %f", m.MemPercent, val)
			}
		case config.MetricCPUThrottledPeriods:
			if val != float64(m.CPUThrottledPeriods) {
				t.Fatalf("expected CPUThrottledPeriods %f, got %f", float64(m.CPUThrottledPeriods), val)
			}
		case config.MetricNetRxBytes:
			if val != float64(m.NetRxBytes) {
				t.Fatalf("expected NetRxBytes %f, got %f", float64(m.NetRxBytes), val)
			}
		case config.MetricNetTxBytes:
			if val != float64(m.NetTxBytes) {
				t.Fatalf("expected NetTxBytes %f, got %f", float64(m.NetTxBytes), val)
			}
		}
	})
}

func TestExtractDockerMetricValueUnknown(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		unknown := config.MetricType(rapid.StringMatching(`UNKNOWN_[A-Z0-9]+`).Draw(t, "unknownType"))
		_, err := ExtractDockerMetricValue(collector.ContainerMetrics{}, unknown)
		if err == nil {
			t.Fatalf("expected error for unknown metric type %s, got nil", unknown)
		}
	})
}

func TestExtractStandaloneMetricValue(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		memPct := rapid.Float64Range(0, 100).Draw(t, "memPct")
		cpuCoreCount := rapid.IntRange(1, 16).Draw(t, "cpuCoreCount")
		var cpuPercents []float64
		var sum float64
		for i := 0; i < cpuCoreCount; i++ {
			p := rapid.Float64Range(0, 100).Draw(t, "corePct")
			cpuPercents = append(cpuPercents, p)
			sum += p
		}
		expectedAvgCPU := sum / float64(cpuCoreCount)

		snap := &collector.StandaloneSnapshot{
			CPU: collector.CPUStats{
				LogicalCores: cpuCoreCount,
				UsagePercent: cpuPercents,
			},
			Memory: collector.MemStats{
				UsagePercent: memPct,
			},
		}

		// CPU_PERCENT
		cpuVal, err := ExtractStandaloneMetricValue(snap, config.MetricCPUPercent)
		if err != nil {
			t.Fatalf("unexpected error for CPU_PERCENT: %v", err)
		}
		if math.Abs(cpuVal-expectedAvgCPU) > 1e-9 {
			t.Fatalf("expected avg CPU %f, got %f", expectedAvgCPU, cpuVal)
		}

		// MEM_PERCENT
		memVal, err := ExtractStandaloneMetricValue(snap, config.MetricMemPercent)
		if err != nil {
			t.Fatalf("unexpected error for MEM_PERCENT: %v", err)
		}
		if memVal != memPct {
			t.Fatalf("expected MemPercent %f, got %f", memPct, memVal)
		}

		// Unsupported metric types in standalone mode
		unsupported := []config.MetricType{
			config.MetricCPUThrottledPeriods,
			config.MetricNetRxBytes,
			config.MetricNetTxBytes,
		}
		unsupType := rapid.SampledFrom(unsupported).Draw(t, "unsupported")
		_, err = ExtractStandaloneMetricValue(snap, unsupType)
		if err == nil {
			t.Fatalf("expected error for unsupported standalone metric %s, got nil", unsupType)
		}
	})
}
