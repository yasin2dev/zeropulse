package engine

import (
	"testing"
	"time"

	"zeropulse-agent/internal/collector"
)

func TestCPUSaturationRequiresThreeConsecutivePeriods(t *testing.T) {
	eng := NewDefault()
	baseTime := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	eng.now = func() time.Time { return baseTime }

	snap := func(cpu float64, throttled uint64) Snapshot {
		return Snapshot{
			CollectedAt: baseTime,
			Environment: collector.EnvDocker,
			Containers: []collector.ContainerMetrics{
				{
					ContainerID:         "c1",
					Name:                "api-service",
					CPUPercent:          cpu,
					CPUThrottledPeriods: throttled,
					MemPercent:          40.0,
				},
			},
		}
	}

	// Period 1: CPU 85% -> window has 1/3 samples -> no event
	if evts := eng.Evaluate(snap(85.0, 0)); len(evts) != 0 {
		t.Fatalf("period 1: expected 0 events, got %d", len(evts))
	}

	// Period 2: CPU 90% -> window has 2/3 samples -> no event
	baseTime = baseTime.Add(5 * time.Second)
	if evts := eng.Evaluate(snap(90.0, 0)); len(evts) != 0 {
		t.Fatalf("period 2: expected 0 events, got %d", len(evts))
	}

	// Period 3: CPU 82% -> window has 3/3 samples > 80% -> CPU_SATURATION
	baseTime = baseTime.Add(5 * time.Second)
	evts := eng.Evaluate(snap(82.0, 0))
	if len(evts) != 1 {
		t.Fatalf("period 3: expected 1 event, got %d", len(evts))
	}
	if evts[0].Status != StatusCPUSaturation {
		t.Errorf("expected status %q, got %q", StatusCPUSaturation, evts[0].Status)
	}
	if evts[0].Level != LevelWarn {
		t.Errorf("expected level %q, got %q", LevelWarn, evts[0].Level)
	}
	if evts[0].ContainerID != "c1" || evts[0].ContainerName != "api-service" {
		t.Errorf("unexpected container metadata: %+v", evts[0])
	}
}

func TestCPUSaturationViaThrottledPeriods(t *testing.T) {
	eng := NewDefault()
	baseTime := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	eng.now = func() time.Time { return baseTime }

	// Mix of cpu_percent > 80.0 and cpu_throttled_periods > 0 across 3 consecutive periods
	samples := []struct {
		cpu       float64
		throttled uint64
	}{
		{cpu: 50.0, throttled: 2},
		{cpu: 85.0, throttled: 0},
		{cpu: 30.0, throttled: 5},
	}

	for i, s := range samples {
		evts := eng.Evaluate(Snapshot{
			Containers: []collector.ContainerMetrics{
				{
					ContainerID:         "c-throttle",
					Name:                "worker",
					CPUPercent:          s.cpu,
					CPUThrottledPeriods: s.throttled,
					MemPercent:          20.0,
				},
			},
		})
		if i < 2 && len(evts) != 0 {
			t.Fatalf("period %d: expected no event, got %d", i+1, len(evts))
		}
		if i == 2 {
			if len(evts) != 1 || evts[0].Status != StatusCPUSaturation {
				t.Fatalf("period 3: expected CPU_SATURATION event, got %+v", evts)
			}
		}
		baseTime = baseTime.Add(5 * time.Second)
	}
}

func TestCPUSpikeResetByNormalMeasurement(t *testing.T) {
	eng := NewDefault()
	baseTime := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	eng.now = func() time.Time { return baseTime }

	evalCPU := func(cpu float64) []AnomalyEvent {
		baseTime = baseTime.Add(5 * time.Second)
		return eng.Evaluate(Snapshot{
			Containers: []collector.ContainerMetrics{
				{
					ContainerID: "c1",
					Name:        "api",
					CPUPercent:  cpu,
					MemPercent:  30.0,
				},
			},
		})
	}

	// 2 high periods followed by 1 normal period -> should NOT trigger
	if evts := evalCPU(90.0); len(evts) != 0 {
		t.Fatalf("expected 0 events, got %d", len(evts))
	}
	if evts := evalCPU(92.0); len(evts) != 0 {
		t.Fatalf("expected 0 events, got %d", len(evts))
	}
	if evts := evalCPU(40.0); len(evts) != 0 {
		t.Fatalf("expected 0 events when 3rd period drops below threshold, got %d", len(evts))
	}
	// Next 2 high periods still have the 40.0 in the 3-period window -> no event until 3 consecutive highs
	if evts := evalCPU(88.0); len(evts) != 0 {
		t.Fatalf("expected 0 events (window: [92, 40, 88]), got %d", len(evts))
	}
	if evts := evalCPU(89.0); len(evts) != 0 {
		t.Fatalf("expected 0 events (window: [40, 88, 89]), got %d", len(evts))
	}
	if evts := evalCPU(91.0); len(evts) != 1 {
		t.Fatalf("expected 1 event (window: [88, 89, 91]), got %d", len(evts))
	}
}

func TestMemoryCriticalImmediateTrigger(t *testing.T) {
	eng := NewDefault()

	evts := eng.Evaluate(Snapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "mem-c1",
				Name:        "redis-cache",
				CPUPercent:  10.0,
				MemPercent:  86.5, // > 85.0
			},
		},
	})

	if len(evts) != 1 {
		t.Fatalf("expected 1 MEMORY_CRITICAL event, got %d", len(evts))
	}
	evt := evts[0]
	if evt.Status != StatusMemoryCritical {
		t.Errorf("expected status %q, got %q", StatusMemoryCritical, evt.Status)
	}
	if evt.Action != ActionRestartSuggested {
		t.Errorf("expected action %q, got %q", ActionRestartSuggested, evt.Action)
	}
	if evt.Level != LevelAlert {
		t.Errorf("expected level %q, got %q", LevelAlert, evt.Level)
	}
}

func TestCooldownSuppressesSubsequentEventsFor60Seconds(t *testing.T) {
	eng := NewDefault()
	now := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)
	eng.now = func() time.Time { return now }

	snap := Snapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "c1",
				Name:        "leaky-app",
				CPUPercent:  20.0,
				MemPercent:  90.0, // breaches > 85.0
			},
		},
	}

	// First evaluation triggers MEMORY_CRITICAL at t=0s
	evts := eng.Evaluate(snap)
	if len(evts) != 1 {
		t.Fatalf("t=0s: expected 1 event, got %d", len(evts))
	}

	// Evaluations at t=5s, t=30s, t=59s must be suppressed by 60s cooldown
	for _, delta := range []time.Duration{5 * time.Second, 30 * time.Second, 59 * time.Second} {
		now = time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC).Add(delta)
		if suppressed := eng.Evaluate(snap); len(suppressed) != 0 {
			t.Fatalf("t=%v: expected cooldown to suppress event, got %d", delta, len(suppressed))
		}
	}

	// At t=60s cooldown expires -> new anomaly event is emitted
	now = time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC).Add(60 * time.Second)
	evtsAfter := eng.Evaluate(snap)
	if len(evtsAfter) != 1 {
		t.Fatalf("t=60s: expected 1 event after cooldown expiry, got %d", len(evtsAfter))
	}
}

func TestConfigurableLowThreshold(t *testing.T) {
	eng := New(Config{
		CPUThreshold: 0.5,
		MemThreshold: 85.0,
		Cooldown:     60 * time.Second,
	})

	snap := Snapshot{
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "idle-c1",
				Name:        "nginx",
				CPUPercent:  0.8, // > 0.5 custom threshold
				MemPercent:  12.0,
			},
		},
	}

	eng.Evaluate(snap)
	eng.Evaluate(snap)
	evts := eng.Evaluate(snap)
	if len(evts) != 1 || evts[0].Status != StatusCPUSaturation {
		t.Fatalf("expected CPU_SATURATION with 0.5%% threshold, got %+v", evts)
	}
}

func TestStaleContainerEviction(t *testing.T) {
	eng := NewDefault()

	eng.Evaluate(Snapshot{
		Containers: []collector.ContainerMetrics{
			{ContainerID: "c1", Name: "app1", CPUPercent: 10},
			{ContainerID: "c2", Name: "app2", CPUPercent: 10},
		},
	})
	if len(eng.states) != 2 {
		t.Fatalf("expected 2 tracked containers, got %d", len(eng.states))
	}

	// Next snapshot only has c1; c2 should be evicted automatically
	eng.Evaluate(Snapshot{
		Containers: []collector.ContainerMetrics{
			{ContainerID: "c1", Name: "app1", CPUPercent: 15},
		},
	})
	if len(eng.states) != 1 {
		t.Fatalf("expected 1 tracked container after c2 stopped, got %d", len(eng.states))
	}
	if _, exists := eng.states["c2"]; exists {
		t.Errorf("expected container c2 state to be evicted")
	}
}

func BenchmarkEvaluateSteadyStateZeroAlloc(b *testing.B) {
	eng := NewDefault()
	snap := Snapshot{
		CollectedAt: time.Now().UTC(),
		Environment: collector.EnvDocker,
		Containers: []collector.ContainerMetrics{
			{ContainerID: "c1", Name: "web", CPUPercent: 12.5, MemPercent: 45.0},
			{ContainerID: "c2", Name: "db", CPUPercent: 34.1, MemPercent: 62.3},
			{ContainerID: "c3", Name: "cache", CPUPercent: 5.2, MemPercent: 28.9},
			{ContainerID: "c4", Name: "worker", CPUPercent: 55.0, MemPercent: 51.2},
		},
	}

	// Warm up map entries
	eng.Evaluate(snap)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = eng.Evaluate(snap)
	}
}
