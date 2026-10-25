package engine

import (
	"sync"
	"time"

	"zeropulse-agent/internal/collector"
)

// windowSize defines the fixed number of consecutive measurements kept per container.
const windowSize = 3

// Default rule thresholds and cooldown duration.
const (
	DefaultCPUThreshold = 80.0
	DefaultMemThreshold = 85.0
	DefaultCooldown     = 60 * time.Second
)

// Status constants emitted by the rule engine.
const (
	StatusCPUSaturation  = "CPU_SATURATION"
	StatusMemoryCritical = "MEMORY_CRITICAL"
)

// Action constants associated with anomaly statuses.
const (
	ActionMonitor          = "MONITOR"
	ActionRestartSuggested = "RESTART_SUGGESTED"
)

// Log level constants for structured anomaly output.
const (
	LevelWarn  = "WARN"
	LevelAlert = "ALERT"
)

// Snapshot aliases collector.DockerMetricsSnapshot to match the Evaluate(snapshot Snapshot) signature
// without copying or converting container slices.
type Snapshot = collector.DockerMetricsSnapshot

// Sample stores only the raw numeric primitives required for rule evaluation.
// Keeping strings out of the ring buffer avoids GC pointer scanning overhead
// and keeps each sample to 24 bytes (3 samples = 72 bytes per container).
type Sample struct {
	CPUPercent          float64
	MemPercent          float64
	CPUThrottledPeriods uint64
}

// containerState holds the fixed-size 3-measurement circular buffer and cooldown state
// for a single container. Using a value-type ring buffer avoids per-tick heap allocations.
type containerState struct {
	samples       [windowSize]Sample
	head          uint8  // next write index [0..2]
	count         uint8  // number of valid samples collected so far [0..3]
	lastSeenGen   uint32 // generation counter for zero-alloc stale container cleanup
	cooldownUntil int64  // UnixNano timestamp until which new anomaly events are suppressed
}

// push inserts a new measurement into the fixed-size ring buffer in O(1) time and 0 allocations.
func (cs *containerState) push(s Sample) {
	cs.samples[cs.head] = s
	cs.head++
	if cs.head >= windowSize {
		cs.head = 0
	}
	if cs.count < windowSize {
		cs.count++
	}
}

// isCPUSaturated returns true if the window has accumulated 3 measurements and
// all 3 measurements breach the CPU threshold or have throttled CPU periods.
func (cs *containerState) isCPUSaturated(cpuThreshold float64) bool {
	if cs.count < windowSize {
		return false
	}
	for i := uint8(0); i < windowSize; i++ {
		s := cs.samples[i]
		if s.CPUPercent <= cpuThreshold && s.CPUThrottledPeriods == 0 {
			return false
		}
	}
	return true
}

// Config holds configurable thresholds for the rule engine.
type Config struct {
	CPUThreshold float64
	MemThreshold float64
	Cooldown     time.Duration
}

// DefaultConfig returns the production rule thresholds specified by the architecture:
//   - CPUThreshold: 80.0%
//   - MemThreshold: 85.0%
//   - Cooldown:     60s
func DefaultConfig() Config {
	return Config{
		CPUThreshold: DefaultCPUThreshold,
		MemThreshold: DefaultMemThreshold,
		Cooldown:     DefaultCooldown,
	}
}

// AnomalyEvent represents a structured diagnostic event emitted when a container
// breaches a stability rule.
type AnomalyEvent struct {
	Timestamp           time.Time `json:"timestamp"`
	Level               string    `json:"level"`      // "WARN" | "ALERT"
	EventType           string    `json:"event_type"` // "ANOMALY"
	Status              string    `json:"status"`     // "CPU_SATURATION" | "MEMORY_CRITICAL"
	Action              string    `json:"action"`     // "MONITOR" | "RESTART_SUGGESTED"
	ContainerID         string    `json:"container_id"`
	ContainerName       string    `json:"container_name"`
	CPUPercent          float64   `json:"cpu_percent"`
	CPUThrottledPeriods uint64    `json:"cpu_throttled_periods"`
	MemPercent          float64   `json:"mem_percent"`
	Threshold           float64   `json:"threshold"`
	WindowSize          int       `json:"window_size"`
	CooldownSeconds     int       `json:"cooldown_seconds"`
}

// Engine maintains ultra-lightweight in-memory sliding windows per container
// and evaluates incoming metric snapshots against CPU and Memory rules.
type Engine struct {
	mu     sync.Mutex
	cfg    Config
	states map[string]*containerState
	gen    uint32
	now    func() time.Time
}

// New creates a new Engine with the provided Config.
// Negative thresholds fall back to defaults; zero cooldown disables suppression only if explicitly < 0.
func New(cfg Config) *Engine {
	if cfg.CPUThreshold < 0 {
		cfg.CPUThreshold = DefaultCPUThreshold
	}
	if cfg.MemThreshold < 0 {
		cfg.MemThreshold = DefaultMemThreshold
	}
	if cfg.Cooldown < 0 {
		cfg.Cooldown = DefaultCooldown
	}
	return &Engine{
		cfg:    cfg,
		states: make(map[string]*containerState, 16),
		now:    time.Now,
	}
}

// NewDefault creates a new Engine with DefaultConfig().
func NewDefault() *Engine {
	return New(DefaultConfig())
}

// Config returns the active engine configuration.
func (e *Engine) Config() Config {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.cfg
}

// Evaluate updates the 3-period sliding window for each container in the snapshot
// and returns any triggered AnomalyEvents that are not currently in cooldown.
//
// Rules evaluated per container:
//  1. CPU Stress: All last 3 periods have cpu_percent > CPUThreshold OR cpu_throttled_periods > 0
//     -> Status: CPU_SATURATION
//  2. Memory Risk: Current period has mem_percent > MemThreshold
//     -> Status: MEMORY_CRITICAL (Action: RESTART_SUGGESTED)
//
// Cooldown: Once an anomaly is emitted for a container, subsequent anomalies for the
// same container are suppressed for Cooldown duration (default 60s).
func (e *Engine) Evaluate(snapshot Snapshot) []AnomalyEvent {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.gen++
	currentGen := e.gen
	now := e.now().UTC()
	nowNano := now.UnixNano()
	cooldownSecs := int(e.cfg.Cooldown / time.Second)

	var events []AnomalyEvent

	for i := range snapshot.Containers {
		c := &snapshot.Containers[i]
		if c.ContainerID == "" {
			continue
		}

		st, exists := e.states[c.ContainerID]
		if !exists {
			st = &containerState{}
			e.states[c.ContainerID] = st
		}

		st.lastSeenGen = currentGen
		st.push(Sample{
			CPUPercent:          c.CPUPercent,
			MemPercent:          c.MemPercent,
			CPUThrottledPeriods: c.CPUThrottledPeriods,
		})

		// If the container is within its cooldown window, keep updating the sliding
		// window above but suppress emitting new anomaly events.
		if nowNano < st.cooldownUntil {
			continue
		}

		triggered := false

		// Rule 1 (CPU Stress): Last 3 consecutive periods have cpu_percent > CPUThreshold OR cpu_throttled_periods > 0
		if st.isCPUSaturated(e.cfg.CPUThreshold) {
			events = append(events, AnomalyEvent{
				Timestamp:           now,
				Level:               LevelWarn,
				EventType:           "ANOMALY",
				Status:              StatusCPUSaturation,
				Action:              ActionMonitor,
				ContainerID:         c.ContainerID,
				ContainerName:       c.Name,
				CPUPercent:          c.CPUPercent,
				CPUThrottledPeriods: c.CPUThrottledPeriods,
				MemPercent:          c.MemPercent,
				Threshold:           e.cfg.CPUThreshold,
				WindowSize:          int(st.count),
				CooldownSeconds:     cooldownSecs,
			})
			triggered = true
		}

		// Rule 2 (Memory Risk): mem_percent > MemThreshold -> MEMORY_CRITICAL (RESTART_SUGGESTED)
		if c.MemPercent > e.cfg.MemThreshold {
			events = append(events, AnomalyEvent{
				Timestamp:           now,
				Level:               LevelAlert,
				EventType:           "ANOMALY",
				Status:              StatusMemoryCritical,
				Action:              ActionRestartSuggested,
				ContainerID:         c.ContainerID,
				ContainerName:       c.Name,
				CPUPercent:          c.CPUPercent,
				CPUThrottledPeriods: c.CPUThrottledPeriods,
				MemPercent:          c.MemPercent,
				Threshold:           e.cfg.MemThreshold,
				WindowSize:          int(st.count),
				CooldownSeconds:     cooldownSecs,
			})
			triggered = true
		}

		if triggered && e.cfg.Cooldown > 0 {
			st.cooldownUntil = nowNano + int64(e.cfg.Cooldown)
		}
	}

	// Evict containers that were not present in this snapshot using the generation counter
	// (avoids allocating an active-set map on every evaluation tick).
	for id, st := range e.states {
		if st.lastSeenGen != currentGen {
			delete(e.states, id)
		}
	}

	return events
}

// EvaluateStandalone adapts a host-level StandaloneSnapshot into the engine's
// windowing evaluator so standalone environments benefit from identical CPU and memory diagnostics.
func (e *Engine) EvaluateStandalone(snap *collector.StandaloneSnapshot) []AnomalyEvent {
	if snap == nil {
		return nil
	}

	var avgCPU float64
	if n := len(snap.CPU.UsagePercent); n > 0 {
		var sum float64
		for _, p := range snap.CPU.UsagePercent {
			sum += p
		}
		avgCPU = sum / float64(n)
	}

	return e.Evaluate(Snapshot{
		CollectedAt: snap.CollectedAt,
		Environment: snap.Environment,
		Containers: []collector.ContainerMetrics{
			{
				ContainerID: "host",
				Name:        "host",
				CPUPercent:  avgCPU,
				MemPercent:  snap.Memory.UsagePercent,
			},
		},
	})
}

