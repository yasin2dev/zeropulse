package server

import (
	"sync"
	"time"
)

// AuditEntry represents a recorded diagnostic or self-healing event.
type AuditEntry struct {
	ID               string    `json:"id"`
	Timestamp        time.Time `json:"timestamp"`
	ContainerID      string    `json:"container_id"`
	ContainerName    string    `json:"container_name"`
	RuleName         string    `json:"rule_name"`
	MetricType       string    `json:"metric_type"`
	CurrentValue     float64   `json:"current_value"`
	Threshold        float64   `json:"threshold"`
	ConsecutiveCount int       `json:"consecutive_count"`
	Action           string    `json:"action"`
	DryRun           bool      `json:"dry_run"`
	Status           string    `json:"status"` // e.g., "TRIGGERED", "ACTION_EXECUTED", "DRY_RUN_SKIPPED", "MANUAL_RESTART"
	Message          string    `json:"message"`
}

// AuditLog manages a thread-safe circular buffer of recent events.
type AuditLog struct {
	mu       sync.RWMutex
	capacity int
	entries  []AuditEntry
}

// NewAuditLog initializes an audit log buffer with a maximum capacity (default 100).
func NewAuditLog(capacity int) *AuditLog {
	if capacity <= 0 {
		capacity = 100
	}
	return &AuditLog{
		capacity: capacity,
		entries:  make([]AuditEntry, 0, capacity),
	}
}

// Add pushes a new entry to the audit log, maintaining max capacity (FIFO).
func (a *AuditLog) Add(entry AuditEntry) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if len(a.entries) >= a.capacity {
		// Evict oldest
		a.entries = a.entries[1:]
	}
	a.entries = append(a.entries, entry)
}

// GetAll returns a copy of all audit entries in reverse chronological order (newest first).
func (a *AuditLog) GetAll(limit int) []AuditEntry {
	a.mu.RLock()
	defer a.mu.RUnlock()

	n := len(a.entries)
	if n == 0 {
		return []AuditEntry{}
	}

	count := n
	if limit > 0 && limit < count {
		count = limit
	}

	result := make([]AuditEntry, count)
	for i := 0; i < count; i++ {
		result[i] = a.entries[n-1-i]
	}
	return result
}

// CalculateStressIndex returns a normalized value [0.0 - 1.0] representing
// the stress intensity based on anomaly events triggered in the last 60 seconds.
func (a *AuditLog) CalculateStressIndex() float64 {
	a.mu.RLock()
	defer a.mu.RUnlock()

	cutoff := time.Now().UTC().Add(-60 * time.Second)
	recentAnomalies := 0

	for i := len(a.entries) - 1; i >= 0; i-- {
		e := a.entries[i]
		if e.Timestamp.Before(cutoff) {
			break
		}
		if e.Status != "MANUAL_RESTART" {
			recentAnomalies++
		}
	}

	// Scale: 5 or more anomalies in 1 minute indicates high stress (1.0)
	score := float64(recentAnomalies) / 5.0
	if score > 1.0 {
		return 1.0
	}
	return score
}
